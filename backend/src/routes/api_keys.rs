use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::{DateTime, Duration, Utc};
use sqlx::FromRow;
use uuid::Uuid;

use crate::{
    auth::AuthenticatedUser,
    crypto::generate_api_key,
    error::{AppError, AppResult},
    models::{ApiKeyDto, CreateApiKeyRequest, CreatedApiKeyDto},
    routes::get_user_vault_role,
    AppState,
};

#[derive(Debug, FromRow)]
struct ApiKeyRow {
    id: String,
    name: String,
    key_prefix: String,
    permission: String,
    vault_ids: Vec<String>,
    expires_at: Option<DateTime<Utc>>,
    last_used_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
}

fn row_to_dto(row: ApiKeyRow, now: DateTime<Utc>) -> ApiKeyDto {
    let is_expired = row.expires_at.is_some_and(|exp| exp <= now);
    ApiKeyDto {
        id: row.id,
        name: row.name,
        key_prefix: row.key_prefix,
        permission: row.permission,
        vault_ids: row.vault_ids,
        expires_at: row.expires_at,
        last_used_at: row.last_used_at,
        is_expired,
        created_at: row.created_at,
    }
}

pub async fn list_api_keys(
    State(state): State<AppState>,
    user: AuthenticatedUser,
) -> AppResult<Json<Vec<ApiKeyDto>>> {
    user.require_session_auth()?;

    let rows: Vec<ApiKeyRow> = sqlx::query_as(
        r#"
        SELECT
            id,
            name,
            key_prefix,
            permission,
            vault_ids,
            expires_at,
            last_used_at,
            created_at
        FROM api_keys
        WHERE user_id = $1
        ORDER BY created_at DESC
        "#,
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await?;

    let now = Utc::now();
    let keys = rows.into_iter().map(|r| row_to_dto(r, now)).collect();
    Ok(Json(keys))
}

pub async fn create_api_key(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Json(payload): Json<CreateApiKeyRequest>,
) -> AppResult<(StatusCode, Json<CreatedApiKeyDto>)> {
    user.require_session_auth()?;

    let name = payload.name.trim();
    if name.is_empty() || name.len() > 80 {
        return Err(AppError::BadRequest(
            "Il nome della API Key deve essere tra 1 e 80 caratteri".to_string(),
        ));
    }

    let permission = payload.permission.trim().to_lowercase();
    if permission != "read" && permission != "read_write" {
        return Err(AppError::BadRequest(
            "Il permesso della API Key deve essere 'read' o 'read_write'".to_string(),
        ));
    }

    let mut clean_vault_ids: Vec<String> = Vec::new();
    for raw_id in &payload.vault_ids {
        let vid = raw_id.trim();
        if !vid.is_empty() && !clean_vault_ids.iter().any(|existing| existing == vid) {
            let role = get_user_vault_role(&state.db, vid, &user).await?;
            if role.is_none() {
                return Err(AppError::NotFound(format!(
                    "Cartella '{vid}' non trovata o accesso negato"
                )));
            }
            clean_vault_ids.push(vid.to_string());
        }
    }

    let now = Utc::now();
    let expires_at = if let Some(explicit_exp) = payload.expires_at {
        if explicit_exp <= now {
            return Err(AppError::BadRequest(
                "La data di scadenza della API Key deve essere nel futuro".to_string(),
            ));
        }
        Some(explicit_exp)
    } else if let Some(days) = payload.expires_in_days {
        if !(1..=3650).contains(&days) {
            return Err(AppError::BadRequest(
                "La scadenza in giorni deve essere compresa tra 1 e 3650".to_string(),
            ));
        }
        Some(now + Duration::days(days))
    } else {
        None
    };

    let (secret_key, key_prefix, key_hash) = generate_api_key();
    let id = Uuid::new_v4().to_string();

    let row: ApiKeyRow = sqlx::query_as(
        r#"
        INSERT INTO api_keys (
            id, user_id, name, key_prefix, key_hash, permission, vault_ids, expires_at, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING
            id,
            name,
            key_prefix,
            permission,
            vault_ids,
            expires_at,
            last_used_at,
            created_at
        "#,
    )
    .bind(&id)
    .bind(&user.id)
    .bind(name)
    .bind(&key_prefix)
    .bind(&key_hash)
    .bind(&permission)
    .bind(&clean_vault_ids)
    .bind(expires_at)
    .bind(now)
    .fetch_one(&state.db)
    .await?;

    let api_key = row_to_dto(row, now);
    Ok((
        StatusCode::CREATED,
        Json(CreatedApiKeyDto {
            api_key,
            secret_key,
        }),
    ))
}

pub async fn delete_api_key(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(key_id): Path<String>,
) -> AppResult<StatusCode> {
    user.require_session_auth()?;

    let res = sqlx::query("DELETE FROM api_keys WHERE id = $1 AND user_id = $2")
        .bind(&key_id)
        .bind(&user.id)
        .execute(&state.db)
        .await?;

    if res.rows_affected() == 0 {
        return Err(AppError::NotFound("API Key non trovata".to_string()));
    }

    Ok(StatusCode::NO_CONTENT)
}
