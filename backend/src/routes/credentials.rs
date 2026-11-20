use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use sqlx::FromRow;
use uuid::Uuid;

use crate::{
    auth::AuthenticatedUser,
    error::{AppError, AppResult},
    models::{CreateCredentialRequest, CredentialDto, UpdateCredentialRequest},
    routes::{record_audit, require_vault_role},
    AppState,
};

#[derive(Debug, Deserialize)]
pub struct ListCredentialsQuery {
    pub vault_id: Option<String>,
    pub q: Option<String>,
    pub favorite: Option<bool>,
    pub category: Option<String>,
}

#[derive(Debug, FromRow)]
struct CredentialRow {
    id: String,
    vault_id: String,
    vault_name: String,
    vault_color: String,
    vault_role: String,
    title: String,
    username: String,
    url: String,
    category: String,
    password_ciphertext: String,
    password_nonce: String,
    notes_ciphertext: String,
    notes_nonce: String,
    favorite: bool,
    created_by: String,
    created_by_name: String,
    updated_by: String,
    updated_by_name: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

fn decrypt_credential_row(state: &AppState, row: CredentialRow) -> AppResult<CredentialDto> {
    let password = state
        .crypto
        .decrypt(&row.password_ciphertext, &row.password_nonce)?;
    let notes = state
        .crypto
        .decrypt(&row.notes_ciphertext, &row.notes_nonce)?;

    Ok(CredentialDto {
        id: row.id,
        vault_id: row.vault_id,
        vault_name: row.vault_name,
        vault_color: row.vault_color,
        vault_role: row.vault_role,
        title: row.title,
        username: row.username,
        password,
        url: row.url,
        category: row.category,
        notes,
        favorite: row.favorite,
        created_by: row.created_by,
        created_by_name: row.created_by_name,
        updated_by: row.updated_by,
        updated_by_name: row.updated_by_name,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

async fn fetch_credential_dto(
    state: &AppState,
    credential_id: &str,
    user: &AuthenticatedUser,
) -> AppResult<CredentialDto> {
    let row: Option<CredentialRow> = sqlx::query_as(
        r#"
        SELECT
            c.id,
            c.vault_id,
            v.name AS vault_name,
            v.color AS vault_color,
            vm.role AS vault_role,
            c.title,
            c.username,
            c.url,
            c.category,
            c.password_ciphertext,
            c.password_nonce,
            c.notes_ciphertext,
            c.notes_nonce,
            c.favorite,
            c.created_by,
            cb.name AS created_by_name,
            c.updated_by,
            ub.name AS updated_by_name,
            c.created_at,
            c.updated_at
        FROM credentials c
        INNER JOIN vaults v ON v.id = c.vault_id
        INNER JOIN vault_members vm ON vm.vault_id = v.id
        INNER JOIN users cb ON cb.id = c.created_by
        INNER JOIN users ub ON ub.id = c.updated_by
        WHERE c.id = $1
          AND (vm.user_id = $2 OR LOWER(vm.member_email) = LOWER($3))
        LIMIT 1
        "#,
    )
    .bind(credential_id)
    .bind(&user.id)
    .bind(&user.email)
    .fetch_optional(&state.db)
    .await?;

    let row = row.ok_or_else(|| AppError::NotFound("Credenziale non trovata".to_string()))?;
    decrypt_credential_row(state, row)
}

pub async fn list_credentials(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Query(query): Query<ListCredentialsQuery>,
) -> AppResult<Json<Vec<CredentialDto>>> {
    if let Some(ref vault_id) = query.vault_id {
        require_vault_role(&state.db, vault_id, &user, &["owner", "editor", "viewer"]).await?;
    }

    let search = query.q.unwrap_or_default().trim().to_lowercase();
    let search_pattern = format!("%{}%", search);
    let fav_only = query.favorite.unwrap_or(false);
    let category = query.category.unwrap_or_default().trim().to_lowercase();

    let rows: Vec<CredentialRow> = sqlx::query_as(
        r#"
        SELECT
            c.id,
            c.vault_id,
            v.name AS vault_name,
            v.color AS vault_color,
            vm.role AS vault_role,
            c.title,
            c.username,
            c.url,
            c.category,
            c.password_ciphertext,
            c.password_nonce,
            c.notes_ciphertext,
            c.notes_nonce,
            c.favorite,
            c.created_by,
            cb.name AS created_by_name,
            c.updated_by,
            ub.name AS updated_by_name,
            c.created_at,
            c.updated_at
        FROM credentials c
        INNER JOIN vaults v ON v.id = c.vault_id
        INNER JOIN vault_members vm ON vm.vault_id = v.id
        INNER JOIN users cb ON cb.id = c.created_by
        INNER JOIN users ub ON ub.id = c.updated_by
        WHERE (vm.user_id = $1 OR LOWER(vm.member_email) = LOWER($2))
          AND ($3::TEXT IS NULL OR c.vault_id = $3)
          AND (NOT $4 OR c.favorite = TRUE)
          AND ($5 = '' OR LOWER(c.category) = $5)
          AND (
            $6 = '%%'
            OR c.title ILIKE $6
            OR c.username ILIKE $6
            OR c.url ILIKE $6
            OR v.name ILIKE $6
          )
        ORDER BY c.favorite DESC, c.updated_at DESC
        "#,
    )
    .bind(&user.id)
    .bind(&user.email)
    .bind(&query.vault_id)
    .bind(fav_only)
    .bind(&category)
    .bind(&search_pattern)
    .fetch_all(&state.db)
    .await?;

    let mut credentials = Vec::with_capacity(rows.len());
    for row in rows {
        credentials.push(decrypt_credential_row(&state, row)?);
    }

    Ok(Json(credentials))
}

pub async fn get_credential(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(credential_id): Path<String>,
) -> AppResult<Json<CredentialDto>> {
    let dto = fetch_credential_dto(&state, &credential_id, &user).await?;
    Ok(Json(dto))
}

pub async fn create_credential(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Json(payload): Json<CreateCredentialRequest>,
) -> AppResult<(StatusCode, Json<CredentialDto>)> {
    require_vault_role(&state.db, &payload.vault_id, &user, &["owner", "editor"]).await?;

    let title = payload.title.trim();
    if title.is_empty() || title.len() > 140 {
        return Err(AppError::BadRequest(
            "Il titolo della credenziale deve essere tra 1 e 140 caratteri".to_string(),
        ));
    }

    if payload.password.is_empty() {
        return Err(AppError::BadRequest(
            "La password non può essere vuota".to_string(),
        ));
    }

    let enc_password = state.crypto.encrypt(&payload.password)?;
    let enc_notes = state.crypto.encrypt(payload.notes.trim())?;

    let id = Uuid::new_v4().to_string();
    let now = Utc::now();
    let category = normalize_category(&payload.category);

    sqlx::query(
        r#"
        INSERT INTO credentials (
            id, vault_id, title, username, url, category,
            password_ciphertext, password_nonce,
            notes_ciphertext, notes_nonce,
            favorite, created_by, updated_by, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12, $13, $13)
        "#,
    )
    .bind(&id)
    .bind(&payload.vault_id)
    .bind(title)
    .bind(payload.username.trim())
    .bind(payload.url.trim())
    .bind(category)
    .bind(&enc_password.ciphertext)
    .bind(&enc_password.nonce)
    .bind(&enc_notes.ciphertext)
    .bind(&enc_notes.nonce)
    .bind(payload.favorite)
    .bind(&user.id)
    .bind(now)
    .execute(&state.db)
    .await?;

    record_audit(
        &state.db,
        &payload.vault_id,
        Some(&id),
        &user,
        "credential.created",
        &format!("Credenziale '{}' creata", title),
    )
    .await?;

    let dto = fetch_credential_dto(&state, &id, &user).await?;
    Ok((StatusCode::CREATED, Json(dto)))
}

pub async fn update_credential(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(credential_id): Path<String>,
    Json(payload): Json<UpdateCredentialRequest>,
) -> AppResult<Json<CredentialDto>> {
    let existing = fetch_credential_dto(&state, &credential_id, &user).await?;
    require_vault_role(&state.db, &existing.vault_id, &user, &["owner", "editor"]).await?;

    let target_vault_id = payload
        .vault_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(&existing.vault_id);

    if target_vault_id != existing.vault_id {
        require_vault_role(&state.db, target_vault_id, &user, &["owner", "editor"]).await?;
    }

    let title = payload
        .title
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(&existing.title);
    if title.len() > 140 {
        return Err(AppError::BadRequest(
            "Il titolo non può superare 140 caratteri".to_string(),
        ));
    }

    let username = payload
        .username
        .as_deref()
        .map(str::trim)
        .unwrap_or(&existing.username);
    let url = payload
        .url
        .as_deref()
        .map(str::trim)
        .unwrap_or(&existing.url);
    let password = payload.password.as_deref().unwrap_or(&existing.password);
    if password.is_empty() {
        return Err(AppError::BadRequest(
            "La password non può essere vuota".to_string(),
        ));
    }
    let notes = payload
        .notes
        .as_deref()
        .map(str::trim)
        .unwrap_or(&existing.notes);
    let category = payload
        .category
        .as_deref()
        .map(normalize_category)
        .unwrap_or_else(|| existing.category.clone());
    let favorite = payload.favorite.unwrap_or(existing.favorite);

    let enc_password = state.crypto.encrypt(password)?;
    let enc_notes = state.crypto.encrypt(notes)?;
    let now = Utc::now();

    sqlx::query(
        r#"
        UPDATE credentials
        SET vault_id = $1,
            title = $2,
            username = $3,
            url = $4,
            category = $5,
            password_ciphertext = $6,
            password_nonce = $7,
            notes_ciphertext = $8,
            notes_nonce = $9,
            favorite = $10,
            updated_by = $11,
            updated_at = $12
        WHERE id = $13
        "#,
    )
    .bind(target_vault_id)
    .bind(title)
    .bind(username)
    .bind(url)
    .bind(&category)
    .bind(&enc_password.ciphertext)
    .bind(&enc_password.nonce)
    .bind(&enc_notes.ciphertext)
    .bind(&enc_notes.nonce)
    .bind(favorite)
    .bind(&user.id)
    .bind(now)
    .bind(&credential_id)
    .execute(&state.db)
    .await?;

    record_audit(
        &state.db,
        target_vault_id,
        Some(&credential_id),
        &user,
        "credential.updated",
        &format!("Credenziale '{}' aggiornata", title),
    )
    .await?;

    let dto = fetch_credential_dto(&state, &credential_id, &user).await?;
    Ok(Json(dto))
}

pub async fn delete_credential(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(credential_id): Path<String>,
) -> AppResult<StatusCode> {
    let existing = fetch_credential_dto(&state, &credential_id, &user).await?;
    require_vault_role(&state.db, &existing.vault_id, &user, &["owner", "editor"]).await?;

    sqlx::query("DELETE FROM credentials WHERE id = $1")
        .bind(&credential_id)
        .execute(&state.db)
        .await?;

    record_audit(
        &state.db,
        &existing.vault_id,
        Some(&credential_id),
        &user,
        "credential.deleted",
        &format!("Credenziale '{}' eliminata", existing.title),
    )
    .await?;

    Ok(StatusCode::NO_CONTENT)
}

fn normalize_category(input: &str) -> String {
    match input.trim().to_lowercase().as_str() {
        "login" | "api_key" | "database" | "ssh" | "card" | "note" => {
            input.trim().to_lowercase()
        }
        _ => "login".to_string(),
    }
}
