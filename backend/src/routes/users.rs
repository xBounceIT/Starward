use axum::{
    extract::{Query, State},
    Json,
};
use chrono::Utc;
use serde::Deserialize;
use sqlx::PgPool;

use crate::{
    auth::AuthenticatedUser,
    error::{AppError, AppResult},
    models::{
        UpdateProfileRequest, UpdateUserSettingsRequest, UserRecord, UserSettingsDto, UserSummary,
    },
    routes::require_vault_role,
    AppState,
};

#[derive(Debug, Deserialize)]
pub struct SearchUsersQuery {
    pub q: Option<String>,
}

pub async fn get_me(user: AuthenticatedUser) -> Json<UserSummary> {
    Json(UserSummary {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
    })
}

pub async fn update_me(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Json(payload): Json<UpdateProfileRequest>,
) -> AppResult<Json<UserSummary>> {
    user.require_session_auth()?;

    let name = payload.name.trim();
    if name.is_empty() || name.len() > 80 {
        return Err(AppError::BadRequest(
            "Il nome visualizzato deve essere tra 1 e 80 caratteri".to_string(),
        ));
    }

    sqlx::query(
        r#"
        UPDATE users
        SET name = $1, name_customized = TRUE
        WHERE id = $2
        "#,
    )
    .bind(name)
    .bind(&user.id)
    .execute(&state.db)
    .await?;

    Ok(Json(UserSummary {
        id: user.id,
        email: user.email,
        name: name.to_string(),
        image: user.image,
    }))
}

async fn ensure_user_settings(db: &PgPool, user_id: &str) -> AppResult<UserSettingsDto> {
    let now = Utc::now();
    sqlx::query(
        r#"
        INSERT INTO user_settings (user_id, updated_at)
        VALUES ($1, $2)
        ON CONFLICT (user_id) DO NOTHING
        "#,
    )
    .bind(user_id)
    .bind(now)
    .execute(db)
    .await?;

    let settings: UserSettingsDto = sqlx::query_as(
        r#"
        SELECT
            theme,
            password_generator_length,
            password_generator_uppercase,
            password_generator_lowercase,
            password_generator_numbers,
            password_generator_symbols,
            default_vault_id,
            updated_at
        FROM user_settings
        WHERE user_id = $1
        "#,
    )
    .bind(user_id)
    .fetch_one(db)
    .await?;

    Ok(settings)
}

pub async fn get_settings(
    State(state): State<AppState>,
    user: AuthenticatedUser,
) -> AppResult<Json<UserSettingsDto>> {
    let settings = ensure_user_settings(&state.db, &user.id).await?;
    Ok(Json(settings))
}

pub async fn update_settings(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Json(payload): Json<UpdateUserSettingsRequest>,
) -> AppResult<Json<UserSettingsDto>> {
    user.require_session_auth()?;

    let current = ensure_user_settings(&state.db, &user.id).await?;

    let theme = match payload.theme.as_deref().map(str::trim) {
        Some(t) => {
            let normalized = t.to_lowercase();
            if normalized != "dark" && normalized != "light" {
                return Err(AppError::BadRequest(
                    "Il tema deve essere 'dark' o 'light'".to_string(),
                ));
            }
            normalized
        }
        None => current.theme,
    };

    let length = payload
        .password_generator_length
        .unwrap_or(current.password_generator_length);
    if !(8..=64).contains(&length) {
        return Err(AppError::BadRequest(
            "La lunghezza del generatore password deve essere tra 8 e 64 caratteri".to_string(),
        ));
    }

    let uppercase = payload
        .password_generator_uppercase
        .unwrap_or(current.password_generator_uppercase);
    let lowercase = payload
        .password_generator_lowercase
        .unwrap_or(current.password_generator_lowercase);
    let numbers = payload
        .password_generator_numbers
        .unwrap_or(current.password_generator_numbers);
    let symbols = payload
        .password_generator_symbols
        .unwrap_or(current.password_generator_symbols);

    if !uppercase && !lowercase && !numbers && !symbols {
        return Err(AppError::BadRequest(
            "Seleziona almeno un set di caratteri per il generatore di password".to_string(),
        ));
    }

    let default_vault_id = match payload.default_vault_id {
        Some(raw) => {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                None
            } else {
                require_vault_role(&state.db, trimmed, &user, &["owner", "editor"]).await?;
                Some(trimmed.to_string())
            }
        }
        None => current.default_vault_id,
    };

    let now = Utc::now();

    let updated: UserSettingsDto = sqlx::query_as(
        r#"
        UPDATE user_settings
        SET theme = $1,
            password_generator_length = $2,
            password_generator_uppercase = $3,
            password_generator_lowercase = $4,
            password_generator_numbers = $5,
            password_generator_symbols = $6,
            default_vault_id = $7,
            updated_at = $8
        WHERE user_id = $9
        RETURNING
            theme,
            password_generator_length,
            password_generator_uppercase,
            password_generator_lowercase,
            password_generator_numbers,
            password_generator_symbols,
            default_vault_id,
            updated_at
        "#,
    )
    .bind(&theme)
    .bind(length)
    .bind(uppercase)
    .bind(lowercase)
    .bind(numbers)
    .bind(symbols)
    .bind(&default_vault_id)
    .bind(now)
    .bind(&user.id)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(updated))
}

pub async fn list_users(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Query(query): Query<SearchUsersQuery>,
) -> AppResult<Json<Vec<UserSummary>>> {
    let pattern = format!("%{}%", query.q.unwrap_or_default().trim());

    let users: Vec<UserRecord> = sqlx::query_as(
        r#"
        SELECT id, email, name, image, created_at, last_seen_at
        FROM users
        WHERE id != $1
          AND (email ILIKE $2 OR name ILIKE $2)
        ORDER BY LOWER(name) ASC
        LIMIT 25
        "#,
    )
    .bind(&user.id)
    .bind(&pattern)
    .fetch_all(&state.db)
    .await?;

    let result = users
        .into_iter()
        .map(|u| UserSummary {
            id: u.id,
            email: u.email,
            name: u.name,
            image: u.image,
        })
        .collect();

    Ok(Json(result))
}
