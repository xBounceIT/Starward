use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::{DateTime, Duration, Utc};
use serde::Deserialize;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::{
    auth::AuthenticatedUser,
    crypto::generate_service_account_api_key,
    error::{AppError, AppResult},
    models::{
        CreateServiceAccountKeyRequest, CreateServiceAccountRequest, CreatedServiceAccountDto,
        CreatedServiceAccountKeyDto, ServiceAccountDto, ServiceAccountKeyDto,
        ServiceAccountResourcesDto, ServiceAccountScopedCredentialDto,
        ServiceAccountScopedVaultDto, UpdateServiceAccountRequest,
    },
    routes::record_system_audit,
    AppState,
};

#[derive(Debug, Deserialize)]
pub struct ListServiceAccountsQuery {
    pub q: Option<String>,
}

#[derive(Debug, FromRow)]
struct ServiceAccountRow {
    id: String,
    name: String,
    email: String,
    description: String,
    permission: String,
    is_active: bool,
    vault_ids: Vec<String>,
    credential_ids: Vec<String>,
    created_by: Option<String>,
    created_by_name: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    last_used_at: Option<DateTime<Utc>>,
}

#[derive(Debug, FromRow)]
struct ServiceAccountKeyRow {
    id: String,
    name: String,
    key_prefix: String,
    expires_at: Option<DateTime<Utc>>,
    last_used_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
}

fn require_admin_session(user: &AuthenticatedUser) -> AppResult<()> {
    user.require_admin()?;
    user.require_session_auth()?;
    Ok(())
}

fn key_row_to_dto(row: ServiceAccountKeyRow, now: DateTime<Utc>) -> ServiceAccountKeyDto {
    let is_expired = row.expires_at.is_some_and(|exp| exp <= now);
    ServiceAccountKeyDto {
        id: row.id,
        name: row.name,
        key_prefix: row.key_prefix,
        expires_at: row.expires_at,
        last_used_at: row.last_used_at,
        is_expired,
        created_at: row.created_at,
    }
}

fn parse_expiration(
    expires_at: Option<DateTime<Utc>>,
    expires_in_days: Option<i64>,
    now: DateTime<Utc>,
) -> AppResult<Option<DateTime<Utc>>> {
    if let Some(explicit_exp) = expires_at {
        if explicit_exp <= now {
            return Err(AppError::BadRequest(
                "La data di scadenza della chiave API deve essere nel futuro".to_string(),
            ));
        }
        Ok(Some(explicit_exp))
    } else if let Some(days) = expires_in_days {
        if !(1..=3650).contains(&days) {
            return Err(AppError::BadRequest(
                "La scadenza in giorni deve essere compresa tra 1 e 3650".to_string(),
            ));
        }
        Ok(Some(now + Duration::days(days)))
    } else {
        Ok(None)
    }
}

fn generate_service_account_email(name: &str, sa_id: &str) -> String {
    let mut slug = String::new();
    let mut prev_dash = false;
    for ch in name.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
            prev_dash = false;
        } else if !slug.is_empty() && !prev_dash {
            slug.push('-');
            prev_dash = true;
        }
        if slug.len() >= 24 {
            break;
        }
    }
    let slug = slug.trim_matches('-');
    let slug = if slug.is_empty() { "bot" } else { slug };
    let suffix: String = sa_id
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .rev()
        .take(8)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    format!("sa-{slug}-{suffix}@service.starward.local")
}

async fn validate_selectable_vault_ids(
    db: &PgPool,
    admin: &AuthenticatedUser,
    raw_vault_ids: &[String],
) -> AppResult<Vec<String>> {
    let mut clean: Vec<String> = Vec::new();
    for raw_id in raw_vault_ids {
        let vid = raw_id.trim();
        if vid.is_empty() || clean.iter().any(|existing| existing == vid) {
            continue;
        }

        let allowed: Option<(String,)> = sqlx::query_as(
            r#"
            SELECT v.id
            FROM vaults v
            WHERE v.id = $1
              AND (
                v.is_personal = FALSE
                OR v.owner_id = $2
                OR EXISTS (
                    SELECT 1
                    FROM vault_members vm
                    WHERE vm.vault_id = v.id
                      AND (vm.user_id = $2 OR LOWER(vm.member_email) = LOWER($3))
                )
              )
            LIMIT 1
            "#,
        )
        .bind(vid)
        .bind(&admin.id)
        .bind(&admin.email)
        .fetch_optional(db)
        .await?;

        if allowed.is_none() {
            return Err(AppError::NotFound(format!(
                "Cartella '{vid}' non trovata o non selezionabile per un Service Account"
            )));
        }
        clean.push(vid.to_string());
    }
    Ok(clean)
}

async fn validate_selectable_credential_ids(
    db: &PgPool,
    admin: &AuthenticatedUser,
    raw_credential_ids: &[String],
) -> AppResult<Vec<String>> {
    let mut clean: Vec<String> = Vec::new();
    for raw_id in raw_credential_ids {
        let cid = raw_id.trim();
        if cid.is_empty() || clean.iter().any(|existing| existing == cid) {
            continue;
        }

        let allowed: Option<(String,)> = sqlx::query_as(
            r#"
            SELECT c.id
            FROM credentials c
            INNER JOIN vaults v ON v.id = c.vault_id
            WHERE c.id = $1
              AND (
                v.is_personal = FALSE
                OR v.owner_id = $2
                OR EXISTS (
                    SELECT 1
                    FROM vault_members vm
                    WHERE vm.vault_id = v.id
                      AND (vm.user_id = $2 OR LOWER(vm.member_email) = LOWER($3))
                )
              )
            LIMIT 1
            "#,
        )
        .bind(cid)
        .bind(&admin.id)
        .bind(&admin.email)
        .fetch_optional(db)
        .await?;

        if allowed.is_none() {
            return Err(AppError::NotFound(format!(
                "Credenziale '{cid}' non trovata o non selezionabile per un Service Account"
            )));
        }
        clean.push(cid.to_string());
    }
    Ok(clean)
}

async fn hydrate_service_account(
    db: &PgPool,
    row: ServiceAccountRow,
    now: DateTime<Utc>,
) -> AppResult<ServiceAccountDto> {
    let vaults: Vec<ServiceAccountScopedVaultDto> = if row.vault_ids.is_empty() {
        Vec::new()
    } else {
        sqlx::query_as(
            r#"
            SELECT
                v.id,
                v.name,
                v.description,
                v.icon,
                v.color,
                v.owner_id,
                owner.name AS owner_name,
                owner.email AS owner_email,
                v.is_personal,
                (SELECT COUNT(*) FROM credentials c WHERE c.vault_id = v.id) AS credential_count
            FROM vaults v
            INNER JOIN users owner ON owner.id = v.owner_id
            WHERE v.id = ANY($1)
            ORDER BY LOWER(v.name) ASC
            "#,
        )
        .bind(&row.vault_ids)
        .fetch_all(db)
        .await?
    };

    let credentials: Vec<ServiceAccountScopedCredentialDto> = if row.credential_ids.is_empty() {
        Vec::new()
    } else {
        sqlx::query_as(
            r#"
            SELECT
                c.id,
                c.vault_id,
                v.name AS vault_name,
                v.color AS vault_color,
                c.title,
                c.username,
                c.url,
                c.category
            FROM credentials c
            INNER JOIN vaults v ON v.id = c.vault_id
            WHERE c.id = ANY($1)
            ORDER BY LOWER(v.name) ASC, LOWER(c.title) ASC
            "#,
        )
        .bind(&row.credential_ids)
        .fetch_all(db)
        .await?
    };

    let key_rows: Vec<ServiceAccountKeyRow> = sqlx::query_as(
        r#"
        SELECT
            id,
            name,
            key_prefix,
            expires_at,
            last_used_at,
            created_at
        FROM service_account_keys
        WHERE service_account_id = $1
        ORDER BY created_at DESC
        "#,
    )
    .bind(&row.id)
    .fetch_all(db)
    .await?;

    let keys = key_rows
        .into_iter()
        .map(|k| key_row_to_dto(k, now))
        .collect();

    Ok(ServiceAccountDto {
        id: row.id,
        name: row.name,
        email: row.email,
        description: row.description,
        permission: row.permission,
        is_active: row.is_active,
        vault_ids: row.vault_ids,
        credential_ids: row.credential_ids,
        vaults,
        credentials,
        keys,
        created_by: row.created_by,
        created_by_name: row.created_by_name,
        created_at: row.created_at,
        updated_at: row.updated_at,
        last_used_at: row.last_used_at,
    })
}

async fn fetch_service_account_dto(db: &PgPool, sa_id: &str) -> AppResult<Option<ServiceAccountDto>> {
    let row: Option<ServiceAccountRow> = sqlx::query_as(
        r#"
        SELECT
            sa.id,
            u.name,
            u.email,
            sa.description,
            sa.permission,
            sa.is_active,
            sa.vault_ids,
            sa.credential_ids,
            sa.created_by,
            creator.name AS created_by_name,
            sa.created_at,
            sa.updated_at,
            sa.last_used_at
        FROM service_accounts sa
        INNER JOIN users u ON u.id = sa.id
        LEFT JOIN users creator ON creator.id = sa.created_by
        WHERE sa.id = $1
          AND u.is_service_account = TRUE
        LIMIT 1
        "#,
    )
    .bind(sa_id)
    .fetch_optional(db)
    .await?;

    let Some(row) = row else {
        return Ok(None);
    };

    let dto = hydrate_service_account(db, row, Utc::now()).await?;
    Ok(Some(dto))
}

pub async fn list_selectable_resources(
    State(state): State<AppState>,
    user: AuthenticatedUser,
) -> AppResult<Json<ServiceAccountResourcesDto>> {
    require_admin_session(&user)?;

    let vaults: Vec<ServiceAccountScopedVaultDto> = sqlx::query_as(
        r#"
        SELECT
            v.id,
            v.name,
            v.description,
            v.icon,
            v.color,
            v.owner_id,
            owner.name AS owner_name,
            owner.email AS owner_email,
            v.is_personal,
            (SELECT COUNT(*) FROM credentials c WHERE c.vault_id = v.id) AS credential_count
        FROM vaults v
        INNER JOIN users owner ON owner.id = v.owner_id
        WHERE v.is_personal = FALSE
           OR v.owner_id = $1
           OR EXISTS (
                SELECT 1
                FROM vault_members vm
                WHERE vm.vault_id = v.id
                  AND (vm.user_id = $1 OR LOWER(vm.member_email) = LOWER($2))
           )
        ORDER BY v.is_personal ASC, LOWER(v.name) ASC
        "#,
    )
    .bind(&user.id)
    .bind(&user.email)
    .fetch_all(&state.db)
    .await?;

    let credentials: Vec<ServiceAccountScopedCredentialDto> = sqlx::query_as(
        r#"
        SELECT
            c.id,
            c.vault_id,
            v.name AS vault_name,
            v.color AS vault_color,
            c.title,
            c.username,
            c.url,
            c.category
        FROM credentials c
        INNER JOIN vaults v ON v.id = c.vault_id
        WHERE v.is_personal = FALSE
           OR v.owner_id = $1
           OR EXISTS (
                SELECT 1
                FROM vault_members vm
                WHERE vm.vault_id = v.id
                  AND (vm.user_id = $1 OR LOWER(vm.member_email) = LOWER($2))
           )
        ORDER BY LOWER(v.name) ASC, LOWER(c.title) ASC
        "#,
    )
    .bind(&user.id)
    .bind(&user.email)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(ServiceAccountResourcesDto {
        vaults,
        credentials,
    }))
}

pub async fn list_service_accounts(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Query(query): Query<ListServiceAccountsQuery>,
) -> AppResult<Json<Vec<ServiceAccountDto>>> {
    require_admin_session(&user)?;

    let search = query.q.unwrap_or_default().trim().to_lowercase();
    let search_pattern = format!("%{}%", search);

    let rows: Vec<ServiceAccountRow> = sqlx::query_as(
        r#"
        SELECT
            sa.id,
            u.name,
            u.email,
            sa.description,
            sa.permission,
            sa.is_active,
            sa.vault_ids,
            sa.credential_ids,
            sa.created_by,
            creator.name AS created_by_name,
            sa.created_at,
            sa.updated_at,
            sa.last_used_at
        FROM service_accounts sa
        INNER JOIN users u ON u.id = sa.id
        LEFT JOIN users creator ON creator.id = sa.created_by
        WHERE u.is_service_account = TRUE
          AND (
            $1 = '%%'
            OR u.name ILIKE $1
            OR u.email ILIKE $1
            OR sa.description ILIKE $1
          )
        ORDER BY sa.created_at DESC
        "#,
    )
    .bind(&search_pattern)
    .fetch_all(&state.db)
    .await?;

    let now = Utc::now();
    let mut items = Vec::with_capacity(rows.len());
    for row in rows {
        items.push(hydrate_service_account(&state.db, row, now).await?);
    }

    Ok(Json(items))
}

pub async fn create_service_account(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Json(payload): Json<CreateServiceAccountRequest>,
) -> AppResult<(StatusCode, Json<CreatedServiceAccountDto>)> {
    require_admin_session(&user)?;

    let name = payload.name.trim();
    if name.is_empty() || name.len() > 80 {
        return Err(AppError::BadRequest(
            "Il nome del Service Account deve essere tra 1 e 80 caratteri".to_string(),
        ));
    }

    let description = payload.description.trim();
    if description.len() > 300 {
        return Err(AppError::BadRequest(
            "La descrizione non può superare 300 caratteri".to_string(),
        ));
    }

    let permission = payload.permission.trim().to_lowercase();
    if permission != "read" && permission != "read_write" {
        return Err(AppError::BadRequest(
            "Il permesso del Service Account deve essere 'read' o 'read_write'".to_string(),
        ));
    }

    let clean_vault_ids =
        validate_selectable_vault_ids(&state.db, &user, &payload.vault_ids).await?;
    let clean_credential_ids =
        validate_selectable_credential_ids(&state.db, &user, &payload.credential_ids).await?;

    let now = Utc::now();

    let initial_key_spec = if payload.generate_initial_key {
        let key_name = payload
            .initial_key_name
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("Chiave primaria")
            .to_string();
        if key_name.len() > 80 {
            return Err(AppError::BadRequest(
                "Il nome della chiave API non può superare 80 caratteri".to_string(),
            ));
        }
        let expires_at = parse_expiration(
            payload.initial_key_expires_at,
            payload.initial_key_expires_in_days,
            now,
        )?;
        Some((key_name, expires_at))
    } else {
        None
    };

    let sa_id = format!("sa_{}", Uuid::new_v4());
    let sa_email = generate_service_account_email(name, &sa_id);

    let mut tx = state.db.begin().await?;

    sqlx::query(
        r#"
        INSERT INTO users (id, email, name, name_customized, image, role, is_service_account, created_at, last_seen_at)
        VALUES ($1, $2, $3, TRUE, NULL, 'user', TRUE, $4, $4)
        "#,
    )
    .bind(&sa_id)
    .bind(&sa_email)
    .bind(name)
    .bind(now)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO service_accounts (
            id, description, permission, vault_ids, credential_ids, is_active, created_by, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, TRUE, $6, $7, $7)
        "#,
    )
    .bind(&sa_id)
    .bind(description)
    .bind(&permission)
    .bind(&clean_vault_ids)
    .bind(&clean_credential_ids)
    .bind(&user.id)
    .bind(now)
    .execute(&mut *tx)
    .await?;

    let initial_key = if let Some((key_name, expires_at)) = initial_key_spec {
        let key_id = Uuid::new_v4().to_string();
        let (secret_key, key_prefix, key_hash) = generate_service_account_api_key();

        let key_row: ServiceAccountKeyRow = sqlx::query_as(
            r#"
            INSERT INTO service_account_keys (
                id, service_account_id, name, key_prefix, key_hash, expires_at, created_by, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id, name, key_prefix, expires_at, last_used_at, created_at
            "#,
        )
        .bind(&key_id)
        .bind(&sa_id)
        .bind(&key_name)
        .bind(&key_prefix)
        .bind(&key_hash)
        .bind(expires_at)
        .bind(&user.id)
        .bind(now)
        .fetch_one(&mut *tx)
        .await?;

        Some(CreatedServiceAccountKeyDto {
            key: key_row_to_dto(key_row, now),
            secret_key,
        })
    } else {
        None
    };

    tx.commit().await?;

    let dto = fetch_service_account_dto(&state.db, &sa_id)
        .await?
        .ok_or_else(|| AppError::Internal("Impossibile caricare il Service Account creato".to_string()))?;

    record_system_audit(
        &state.db,
        &user,
        "service_account.created",
        "service_account",
        Some(&sa_id),
        &format!(
            "Service Account '{}' creato (permessi: {}, {} cartelle, {} credenziali specifiche)",
            dto.name,
            dto.permission,
            dto.vault_ids.len(),
            dto.credential_ids.len()
        ),
    )
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(CreatedServiceAccountDto {
            service_account: dto,
            initial_key,
        }),
    ))
}

pub async fn update_service_account(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(sa_id): Path<String>,
    Json(payload): Json<UpdateServiceAccountRequest>,
) -> AppResult<Json<ServiceAccountDto>> {
    require_admin_session(&user)?;

    let existing = fetch_service_account_dto(&state.db, &sa_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Service Account non trovato".to_string()))?;

    let new_name = match payload.name.as_deref().map(str::trim) {
        Some(n) => {
            if n.is_empty() || n.len() > 80 {
                return Err(AppError::BadRequest(
                    "Il nome del Service Account deve essere tra 1 e 80 caratteri".to_string(),
                ));
            }
            n.to_string()
        }
        None => existing.name,
    };

    let new_description = match payload.description.as_deref().map(str::trim) {
        Some(d) => {
            if d.len() > 300 {
                return Err(AppError::BadRequest(
                    "La descrizione non può superare 300 caratteri".to_string(),
                ));
            }
            d.to_string()
        }
        None => existing.description,
    };

    let new_permission = match payload.permission.as_deref().map(|p| p.trim().to_lowercase()) {
        Some(p) => {
            if p != "read" && p != "read_write" {
                return Err(AppError::BadRequest(
                    "Il permesso del Service Account deve essere 'read' o 'read_write'".to_string(),
                ));
            }
            p
        }
        None => existing.permission,
    };

    let new_is_active = payload.is_active.unwrap_or(existing.is_active);

    let new_vault_ids = match payload.vault_ids {
        Some(ids) => validate_selectable_vault_ids(&state.db, &user, &ids).await?,
        None => existing.vault_ids,
    };

    let new_credential_ids = match payload.credential_ids {
        Some(ids) => validate_selectable_credential_ids(&state.db, &user, &ids).await?,
        None => existing.credential_ids,
    };

    let now = Utc::now();
    let mut tx = state.db.begin().await?;

    sqlx::query("UPDATE users SET name = $1 WHERE id = $2 AND is_service_account = TRUE")
        .bind(&new_name)
        .bind(&sa_id)
        .execute(&mut *tx)
        .await?;

    sqlx::query(
        r#"
        UPDATE service_accounts
        SET description = $1,
            permission = $2,
            is_active = $3,
            vault_ids = $4,
            credential_ids = $5,
            updated_at = $6
        WHERE id = $7
        "#,
    )
    .bind(&new_description)
    .bind(&new_permission)
    .bind(new_is_active)
    .bind(&new_vault_ids)
    .bind(&new_credential_ids)
    .bind(now)
    .bind(&sa_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    let updated = fetch_service_account_dto(&state.db, &sa_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Service Account non trovato".to_string()))?;

    record_system_audit(
        &state.db,
        &user,
        "service_account.updated",
        "service_account",
        Some(&sa_id),
        &format!(
            "Service Account '{}' aggiornato (stato: {}, permessi: {}, {} cartelle, {} credenziali specifiche)",
            updated.name,
            if updated.is_active { "attivo" } else { "disabilitato" },
            updated.permission,
            updated.vault_ids.len(),
            updated.credential_ids.len()
        ),
    )
    .await?;

    Ok(Json(updated))
}

pub async fn delete_service_account(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(sa_id): Path<String>,
) -> AppResult<StatusCode> {
    require_admin_session(&user)?;

    let exists: Option<(String, String)> = sqlx::query_as(
        "SELECT id, name FROM users WHERE id = $1 AND is_service_account = TRUE LIMIT 1",
    )
    .bind(&sa_id)
    .fetch_optional(&state.db)
    .await?;

    let (_, sa_name) =
        exists.ok_or_else(|| AppError::NotFound("Service Account non trovato".to_string()))?;

    let mut tx = state.db.begin().await?;

    // Preserve any credentials created or updated by this Service Account
    sqlx::query(
        r#"
        UPDATE credentials c
        SET created_by = v.owner_id
        FROM vaults v
        WHERE c.vault_id = v.id
          AND c.created_by = $1
        "#,
    )
    .bind(&sa_id)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        UPDATE credentials c
        SET updated_by = v.owner_id
        FROM vaults v
        WHERE c.vault_id = v.id
          AND c.updated_by = $1
        "#,
    )
    .bind(&sa_id)
    .execute(&mut *tx)
    .await?;

    sqlx::query("DELETE FROM users WHERE id = $1 AND is_service_account = TRUE")
        .bind(&sa_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    record_system_audit(
        &state.db,
        &user,
        "service_account.deleted",
        "service_account",
        Some(&sa_id),
        &format!("Service Account '{}' eliminato", sa_name),
    )
    .await?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn create_service_account_key(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(sa_id): Path<String>,
    Json(payload): Json<CreateServiceAccountKeyRequest>,
) -> AppResult<(StatusCode, Json<CreatedServiceAccountKeyDto>)> {
    require_admin_session(&user)?;

    let exists: Option<(String,)> =
        sqlx::query_as("SELECT u.name FROM service_accounts sa INNER JOIN users u ON u.id = sa.id WHERE sa.id = $1 LIMIT 1")
            .bind(&sa_id)
            .fetch_optional(&state.db)
            .await?;

    let (sa_name,) =
        exists.ok_or_else(|| AppError::NotFound("Service Account non trovato".to_string()))?;

    let name = payload.name.trim();
    if name.is_empty() || name.len() > 80 {
        return Err(AppError::BadRequest(
            "Il nome della chiave API deve essere tra 1 e 80 caratteri".to_string(),
        ));
    }

    let now = Utc::now();
    let expires_at = parse_expiration(payload.expires_at, payload.expires_in_days, now)?;

    let key_id = Uuid::new_v4().to_string();
    let (secret_key, key_prefix, key_hash) = generate_service_account_api_key();

    let row: ServiceAccountKeyRow = sqlx::query_as(
        r#"
        INSERT INTO service_account_keys (
            id, service_account_id, name, key_prefix, key_hash, expires_at, created_by, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, name, key_prefix, expires_at, last_used_at, created_at
        "#,
    )
    .bind(&key_id)
    .bind(&sa_id)
    .bind(name)
    .bind(&key_prefix)
    .bind(&key_hash)
    .bind(expires_at)
    .bind(&user.id)
    .bind(now)
    .fetch_one(&state.db)
    .await?;

    record_system_audit(
        &state.db,
        &user,
        "service_account.key_created",
        "service_account",
        Some(&key_id),
        &format!(
            "Chiave API '{}' ({}...) generata per Service Account '{}'",
            name, key_prefix, sa_name
        ),
    )
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(CreatedServiceAccountKeyDto {
            key: key_row_to_dto(row, now),
            secret_key,
        }),
    ))
}

pub async fn delete_service_account_key(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path((sa_id, key_id)): Path<(String, String)>,
) -> AppResult<StatusCode> {
    require_admin_session(&user)?;

    let deleted: Option<(String, String)> = sqlx::query_as(
        "DELETE FROM service_account_keys WHERE id = $1 AND service_account_id = $2 RETURNING name, key_prefix",
    )
    .bind(&key_id)
    .bind(&sa_id)
    .fetch_optional(&state.db)
    .await?;

    let (key_name, key_prefix) = deleted.ok_or_else(|| {
        AppError::NotFound("Chiave API del Service Account non trovata".to_string())
    })?;

    record_system_audit(
        &state.db,
        &user,
        "service_account.key_revoked",
        "service_account",
        Some(&key_id),
        &format!(
            "Chiave API '{}' ({}...) del Service Account revocata",
            key_name, key_prefix
        ),
    )
    .await?;

    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generates_clean_service_account_email() {
        let email = generate_service_account_email("CI/CD GitHub Prod!", "sa_12345678-90ab-cdef");
        assert!(email.starts_with("sa-ci-cd-github-prod-"));
        assert!(email.ends_with("@service.starward.local"));
        assert!(!email.contains(' '));
        assert!(!email.contains('!'));
    }

    #[test]
    fn generates_fallback_slug_when_name_has_only_symbols() {
        let email = generate_service_account_email("!!!", "sa_abcdef12345678");
        assert!(email.starts_with("sa-bot-"));
        assert!(email.ends_with("@service.starward.local"));
    }
}
