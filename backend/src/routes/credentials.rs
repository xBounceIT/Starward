use std::collections::BTreeMap;

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
    crypto::VaultCrypto,
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
    extra_fields_ciphertext: String,
    extra_fields_nonce: String,
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
    let fields: BTreeMap<String, String> =
        if row.extra_fields_ciphertext.is_empty() || row.extra_fields_nonce.is_empty() {
            BTreeMap::new()
        } else {
            let json_str = state
                .crypto
                .decrypt(&row.extra_fields_ciphertext, &row.extra_fields_nonce)?;
            serde_json::from_str(&json_str).unwrap_or_default()
        };

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
        fields,
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
    if let Some(sa_role) = user.service_account_vault_role() {
        let row: Option<CredentialRow> = sqlx::query_as(
            r#"
            SELECT
                c.id,
                c.vault_id,
                v.name AS vault_name,
                v.color AS vault_color,
                $2::TEXT AS vault_role,
                c.title,
                c.username,
                c.url,
                c.category,
                c.password_ciphertext,
                c.password_nonce,
                c.notes_ciphertext,
                c.notes_nonce,
                c.extra_fields_ciphertext,
                c.extra_fields_nonce,
                c.favorite,
                c.created_by,
                cb.name AS created_by_name,
                c.updated_by,
                ub.name AS updated_by_name,
                c.created_at,
                c.updated_at
            FROM credentials c
            INNER JOIN vaults v ON v.id = c.vault_id
            INNER JOIN users cb ON cb.id = c.created_by
            INNER JOIN users ub ON ub.id = c.updated_by
            WHERE c.id = $1
            LIMIT 1
            "#,
        )
        .bind(credential_id)
        .bind(sa_role)
        .fetch_optional(&state.db)
        .await?;

        let row = row.ok_or_else(|| AppError::NotFound("Credenziale non trovata".to_string()))?;
        user.ensure_credential_allowed(&row.id, &row.vault_id)?;
        return decrypt_credential_row(state, row);
    }

    let row: Option<CredentialRow> = sqlx::query_as(
        r#"
        WITH user_vault_roles AS (
            SELECT
                vault_id,
                CASE MAX(role_rank)
                    WHEN 3 THEN 'owner'
                    WHEN 2 THEN 'editor'
                    ELSE 'viewer'
                END AS role
            FROM (
                SELECT
                    vm.vault_id,
                    CASE vm.role WHEN 'owner' THEN 3 WHEN 'editor' THEN 2 ELSE 1 END AS role_rank
                FROM vault_members vm
                WHERE vm.user_id = $2 OR LOWER(vm.member_email) = LOWER($3)

                UNION ALL

                SELECT
                    vg.vault_id,
                    CASE vg.role WHEN 'editor' THEN 2 ELSE 1 END AS role_rank
                FROM vault_groups vg
                INNER JOIN group_members gm ON gm.group_id = vg.group_id
                WHERE gm.user_id = $2 OR LOWER(gm.member_email) = LOWER($3)

                UNION ALL

                SELECT
                    v.id AS vault_id,
                    CASE
                        WHEN gm.role = 'owner' OR v.owner_id = $2 THEN 3
                        ELSE COALESCE(
                            (
                                SELECT CASE vg.role WHEN 'editor' THEN 2 ELSE 1 END
                                FROM vault_groups vg
                                WHERE vg.vault_id = v.id AND vg.group_id = v.owner_group_id
                                LIMIT 1
                            ),
                            2
                        )
                    END AS role_rank
                FROM vaults v
                INNER JOIN group_members gm ON gm.group_id = v.owner_group_id
                WHERE v.owner_group_id IS NOT NULL
                  AND (gm.user_id = $2 OR LOWER(gm.member_email) = LOWER($3))
            ) AS raw_roles
            GROUP BY vault_id
        )
        SELECT
            c.id,
            c.vault_id,
            v.name AS vault_name,
            v.color AS vault_color,
            uvr.role AS vault_role,
            c.title,
            c.username,
            c.url,
            c.category,
            c.password_ciphertext,
            c.password_nonce,
            c.notes_ciphertext,
            c.notes_nonce,
            c.extra_fields_ciphertext,
            c.extra_fields_nonce,
            c.favorite,
            c.created_by,
            cb.name AS created_by_name,
            c.updated_by,
            ub.name AS updated_by_name,
            c.created_at,
            c.updated_at
        FROM credentials c
        INNER JOIN vaults v ON v.id = c.vault_id
        INNER JOIN user_vault_roles uvr ON uvr.vault_id = v.id
        INNER JOIN users cb ON cb.id = c.created_by
        INNER JOIN users ub ON ub.id = c.updated_by
        WHERE c.id = $1
        LIMIT 1
        "#,
    )
    .bind(credential_id)
    .bind(&user.id)
    .bind(&user.email)
    .fetch_optional(&state.db)
    .await?;

    let row = row.ok_or_else(|| AppError::NotFound("Credenziale non trovata".to_string()))?;
    user.ensure_vault_allowed(&row.vault_id)?;
    decrypt_credential_row(state, row)
}

pub async fn list_credentials(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Query(query): Query<ListCredentialsQuery>,
) -> AppResult<Json<Vec<CredentialDto>>> {
    let search = query.q.unwrap_or_default().trim().to_lowercase();
    let search_pattern = format!("%{}%", search);
    let fav_only = query.favorite.unwrap_or(false);
    let category = query.category.unwrap_or_default().trim().to_lowercase();

    if let Some(ref sa) = user.service_account {
        if let Some(ref req_vault_id) = query.vault_id {
            let has_vault_scope = sa.vault_ids.iter().any(|vid| vid == req_vault_id);
            let has_cred_in_vault = if !has_vault_scope && !sa.credential_ids.is_empty() {
                let found: Option<(String,)> = sqlx::query_as(
                    "SELECT id FROM credentials WHERE vault_id = $1 AND id = ANY($2) LIMIT 1",
                )
                .bind(req_vault_id)
                .bind(&sa.credential_ids)
                .fetch_optional(&state.db)
                .await?;
                found.is_some()
            } else {
                false
            };

            if !has_vault_scope && !has_cred_in_vault {
                return Err(AppError::Forbidden(
                    "Questo Service Account non è autorizzato ad accedere a questa cartella"
                        .to_string(),
                ));
            }
        }

        if sa.vault_ids.is_empty() && sa.credential_ids.is_empty() {
            return Ok(Json(Vec::new()));
        }

        let sa_role = user.service_account_vault_role().unwrap_or("viewer");
        let rows: Vec<CredentialRow> = sqlx::query_as(
            r#"
            SELECT
                c.id,
                c.vault_id,
                v.name AS vault_name,
                v.color AS vault_color,
                $3::TEXT AS vault_role,
                c.title,
                c.username,
                c.url,
                c.category,
                c.password_ciphertext,
                c.password_nonce,
                c.notes_ciphertext,
                c.notes_nonce,
                c.extra_fields_ciphertext,
                c.extra_fields_nonce,
                c.favorite,
                c.created_by,
                cb.name AS created_by_name,
                c.updated_by,
                ub.name AS updated_by_name,
                c.created_at,
                c.updated_at
            FROM credentials c
            INNER JOIN vaults v ON v.id = c.vault_id
            INNER JOIN users cb ON cb.id = c.created_by
            INNER JOIN users ub ON ub.id = c.updated_by
            WHERE (c.vault_id = ANY($1) OR c.id = ANY($2))
              AND ($4::TEXT IS NULL OR c.vault_id = $4)
              AND (NOT $5 OR c.favorite = TRUE)
              AND ($6 = '' OR LOWER(c.category) = $6)
              AND (
                $7 = '%%'
                OR c.title ILIKE $7
                OR c.username ILIKE $7
                OR c.url ILIKE $7
                OR v.name ILIKE $7
              )
            ORDER BY c.favorite DESC, c.updated_at DESC
            "#,
        )
        .bind(&sa.vault_ids)
        .bind(&sa.credential_ids)
        .bind(sa_role)
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
        return Ok(Json(credentials));
    }

    if let Some(ref vault_id) = query.vault_id {
        require_vault_role(&state.db, vault_id, &user, &["owner", "editor", "viewer"]).await?;
    }

    let rows: Vec<CredentialRow> = sqlx::query_as(
        r#"
        WITH user_vault_roles AS (
            SELECT
                vault_id,
                CASE MAX(role_rank)
                    WHEN 3 THEN 'owner'
                    WHEN 2 THEN 'editor'
                    ELSE 'viewer'
                END AS role
            FROM (
                SELECT
                    vm.vault_id,
                    CASE vm.role WHEN 'owner' THEN 3 WHEN 'editor' THEN 2 ELSE 1 END AS role_rank
                FROM vault_members vm
                WHERE vm.user_id = $1 OR LOWER(vm.member_email) = LOWER($2)

                UNION ALL

                SELECT
                    vg.vault_id,
                    CASE vg.role WHEN 'editor' THEN 2 ELSE 1 END AS role_rank
                FROM vault_groups vg
                INNER JOIN group_members gm ON gm.group_id = vg.group_id
                WHERE gm.user_id = $1 OR LOWER(gm.member_email) = LOWER($2)

                UNION ALL

                SELECT
                    v.id AS vault_id,
                    CASE
                        WHEN gm.role = 'owner' OR v.owner_id = $1 THEN 3
                        ELSE COALESCE(
                            (
                                SELECT CASE vg.role WHEN 'editor' THEN 2 ELSE 1 END
                                FROM vault_groups vg
                                WHERE vg.vault_id = v.id AND vg.group_id = v.owner_group_id
                                LIMIT 1
                            ),
                            2
                        )
                    END AS role_rank
                FROM vaults v
                INNER JOIN group_members gm ON gm.group_id = v.owner_group_id
                WHERE v.owner_group_id IS NOT NULL
                  AND (gm.user_id = $1 OR LOWER(gm.member_email) = LOWER($2))
            ) AS raw_roles
            GROUP BY vault_id
        )
        SELECT
            c.id,
            c.vault_id,
            v.name AS vault_name,
            v.color AS vault_color,
            uvr.role AS vault_role,
            c.title,
            c.username,
            c.url,
            c.category,
            c.password_ciphertext,
            c.password_nonce,
            c.notes_ciphertext,
            c.notes_nonce,
            c.extra_fields_ciphertext,
            c.extra_fields_nonce,
            c.favorite,
            c.created_by,
            cb.name AS created_by_name,
            c.updated_by,
            ub.name AS updated_by_name,
            c.created_at,
            c.updated_at
        FROM credentials c
        INNER JOIN vaults v ON v.id = c.vault_id
        INNER JOIN user_vault_roles uvr ON uvr.vault_id = v.id
        INNER JOIN users cb ON cb.id = c.created_by
        INNER JOIN users ub ON ub.id = c.updated_by
        WHERE ($3::TEXT IS NULL OR c.vault_id = $3)
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
        if !user.can_access_vault(&row.vault_id) {
            continue;
        }
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

    record_audit(
        &state.db,
        &dto.vault_id,
        Some(&dto.id),
        &user,
        "credential.accessed",
        &format!(
            "Credenziale '{}' consultata nella cartella '{}'",
            dto.title, dto.vault_name
        ),
    )
    .await?;

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

    let category = normalize_category(&payload.category);
    let fields = clean_extra_fields(&payload.fields);
    validate_credential_fields(&category, &payload.password, &payload.notes, &fields)?;

    let enc_password = state.crypto.encrypt(&payload.password)?;
    let enc_notes = state.crypto.encrypt(payload.notes.trim())?;
    let (extra_fields_ciphertext, extra_fields_nonce) =
        encrypt_extra_fields(&state.crypto, &fields)?;

    let id = Uuid::new_v4().to_string();
    let now = Utc::now();

    sqlx::query(
        r#"
        INSERT INTO credentials (
            id, vault_id, title, username, url, category,
            password_ciphertext, password_nonce,
            notes_ciphertext, notes_nonce,
            extra_fields_ciphertext, extra_fields_nonce,
            favorite, created_by, updated_by, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14, $15, $15)
        "#,
    )
    .bind(&id)
    .bind(&payload.vault_id)
    .bind(title)
    .bind(payload.username.trim())
    .bind(payload.url.trim())
    .bind(&category)
    .bind(&enc_password.ciphertext)
    .bind(&enc_password.nonce)
    .bind(&enc_notes.ciphertext)
    .bind(&enc_notes.nonce)
    .bind(&extra_fields_ciphertext)
    .bind(&extra_fields_nonce)
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
    if user.service_account.is_some() {
        user.require_write_permission()?;
    } else {
        require_vault_role(&state.db, &existing.vault_id, &user, &["owner", "editor"]).await?;
    }

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
    let fields = payload
        .fields
        .as_ref()
        .map(clean_extra_fields)
        .unwrap_or_else(|| existing.fields.clone());
    let favorite = payload.favorite.unwrap_or(existing.favorite);

    validate_credential_fields(&category, password, notes, &fields)?;

    let enc_password = state.crypto.encrypt(password)?;
    let enc_notes = state.crypto.encrypt(notes)?;
    let (extra_fields_ciphertext, extra_fields_nonce) =
        encrypt_extra_fields(&state.crypto, &fields)?;
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
            extra_fields_ciphertext = $10,
            extra_fields_nonce = $11,
            favorite = $12,
            updated_by = $13,
            updated_at = $14
        WHERE id = $15
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
    .bind(&extra_fields_ciphertext)
    .bind(&extra_fields_nonce)
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
    if user.service_account.is_some() {
        user.require_write_permission()?;
    } else {
        require_vault_role(&state.db, &existing.vault_id, &user, &["owner", "editor"]).await?;
    }

    let mut tx = state.db.begin().await?;

    sqlx::query(
        r#"
        UPDATE service_accounts
        SET credential_ids = array_remove(credential_ids, $1)
        WHERE $1 = ANY(credential_ids)
        "#,
    )
    .bind(&credential_id)
    .execute(&mut *tx)
    .await?;

    sqlx::query("DELETE FROM credentials WHERE id = $1")
        .bind(&credential_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

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

fn clean_extra_fields(fields: &BTreeMap<String, String>) -> BTreeMap<String, String> {
    fields
        .iter()
        .filter_map(|(k, v)| {
            let clean_key = k.trim();
            let clean_val = v.trim();
            if clean_key.is_empty() || clean_val.is_empty() {
                None
            } else {
                Some((clean_key.to_string(), clean_val.to_string()))
            }
        })
        .collect()
}

fn encrypt_extra_fields(
    crypto: &VaultCrypto,
    fields: &BTreeMap<String, String>,
) -> AppResult<(String, String)> {
    if fields.is_empty() {
        return Ok((String::new(), String::new()));
    }
    let json = serde_json::to_string(fields)
        .map_err(|e| AppError::Internal(format!("Errore serializzazione campi extra: {e}")))?;
    let encrypted = crypto.encrypt(&json)?;
    Ok((encrypted.ciphertext, encrypted.nonce))
}

fn validate_credential_fields(
    category: &str,
    password: &str,
    notes: &str,
    fields: &BTreeMap<String, String>,
) -> AppResult<()> {
    match category {
        "note" => {
            if notes.trim().is_empty() && password.is_empty() {
                return Err(AppError::BadRequest(
                    "Inserisci il contenuto della nota sicura".to_string(),
                ));
            }
        }
        "ssh" => {
            let has_private_key = fields
                .get("private_key")
                .map(|v| !v.trim().is_empty())
                .unwrap_or(false);
            if password.is_empty() && !has_private_key {
                return Err(AppError::BadRequest(
                    "Inserisci una password o una chiave privata SSH".to_string(),
                ));
            }
        }
        "api_key" => {
            if password.is_empty() {
                return Err(AppError::BadRequest(
                    "La chiave API / token non può essere vuota".to_string(),
                ));
            }
        }
        "card" => {
            if password.is_empty() {
                return Err(AppError::BadRequest(
                    "Il numero della carta non può essere vuoto".to_string(),
                ));
            }
        }
        "license" => {
            if password.is_empty() {
                return Err(AppError::BadRequest(
                    "La chiave di licenza non può essere vuota".to_string(),
                ));
            }
        }
        _ => {
            if password.is_empty() {
                return Err(AppError::BadRequest(
                    "La password non può essere vuota".to_string(),
                ));
            }
        }
    }
    Ok(())
}

fn normalize_category(input: &str) -> String {
    match input.trim().to_lowercase().as_str() {
        "login" | "api_key" | "database" | "ssh" | "card" | "license" | "note" => {
            input.trim().to_lowercase()
        }
        _ => "login".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_category_supports_all_known_and_defaults_unknown() {
        assert_eq!(normalize_category("LOGIN"), "login");
        assert_eq!(normalize_category(" api_key "), "api_key");
        assert_eq!(normalize_category("database"), "database");
        assert_eq!(normalize_category("ssh"), "ssh");
        assert_eq!(normalize_category("card"), "card");
        assert_eq!(normalize_category("license"), "license");
        assert_eq!(normalize_category("note"), "note");
        assert_eq!(normalize_category("unknown"), "login");
    }

    #[test]
    fn clean_extra_fields_drops_empty_and_preserves_multiline() {
        let mut raw = BTreeMap::new();
        raw.insert(" port ".to_string(), " 5432 ".to_string());
        raw.insert("empty_val".to_string(), "   ".to_string());
        raw.insert("  ".to_string(), "ignored".to_string());
        raw.insert(
            "private_key".to_string(),
            "  -----BEGIN KEY-----\nline1\nline2\n-----END KEY-----  ".to_string(),
        );

        let cleaned = clean_extra_fields(&raw);
        assert_eq!(cleaned.len(), 2);
        assert_eq!(cleaned.get("port").map(String::as_str), Some("5432"));
        assert_eq!(
            cleaned.get("private_key").map(String::as_str),
            Some("-----BEGIN KEY-----\nline1\nline2\n-----END KEY-----")
        );
    }

    #[test]
    fn validate_credential_fields_enforces_category_rules() {
        let empty_fields = BTreeMap::new();

        // login & database require password
        assert!(validate_credential_fields("login", "", "n", &empty_fields).is_err());
        assert!(validate_credential_fields("login", "pw", "", &empty_fields).is_ok());
        assert!(validate_credential_fields("database", "", "", &empty_fields).is_err());
        assert!(validate_credential_fields("database", "dbpw", "", &empty_fields).is_ok());

        // api_key, card, license require secret
        assert!(validate_credential_fields("api_key", "", "", &empty_fields).is_err());
        assert!(validate_credential_fields("api_key", "sk_live_123", "", &empty_fields).is_ok());
        assert!(validate_credential_fields("card", "", "", &empty_fields).is_err());
        assert!(validate_credential_fields("card", "4242", "", &empty_fields).is_ok());
        assert!(validate_credential_fields("license", "", "", &empty_fields).is_err());
        assert!(validate_credential_fields("license", "XXXX-YYYY", "", &empty_fields).is_ok());

        // note allows empty password when notes is non-empty
        assert!(validate_credential_fields("note", "", "   ", &empty_fields).is_err());
        assert!(validate_credential_fields("note", "", "Codice Wi-Fi: 1234", &empty_fields).is_ok());
        assert!(validate_credential_fields("note", "legacy-pw", "", &empty_fields).is_ok());

        // ssh allows empty password if private_key is provided
        assert!(validate_credential_fields("ssh", "", "", &empty_fields).is_err());
        let mut ssh_fields = BTreeMap::new();
        ssh_fields.insert("private_key".to_string(), "-----BEGIN OPENSSH PRIVATE KEY-----".to_string());
        assert!(validate_credential_fields("ssh", "", "", &ssh_fields).is_ok());
        assert!(validate_credential_fields("ssh", "passphrase", "", &empty_fields).is_ok());
    }

    #[test]
    fn encrypt_extra_fields_roundtrips_json() {
        let crypto = VaultCrypto::from_master_key("test-master-key-for-extra-fields");
        let empty = BTreeMap::new();
        assert_eq!(encrypt_extra_fields(&crypto, &empty).unwrap(), (String::new(), String::new()));

        let mut fields = BTreeMap::new();
        fields.insert("db_type".to_string(), "postgresql".to_string());
        fields.insert("port".to_string(), "5432".to_string());

        let (cipher, nonce) = encrypt_extra_fields(&crypto, &fields).unwrap();
        assert!(!cipher.contains("postgresql"));
        let decrypted = crypto.decrypt(&cipher, &nonce).unwrap();
        let parsed: BTreeMap<String, String> = serde_json::from_str(&decrypted).unwrap();
        assert_eq!(parsed, fields);
    }
}
