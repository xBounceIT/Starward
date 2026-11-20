use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;

use crate::{
    auth::AuthenticatedUser,
    error::{AppError, AppResult},
    models::{AdminUserDto, SystemAuditEventDto, UpdateUserRoleRequest},
    AppState,
};

#[derive(Debug, Deserialize)]
pub struct ListAdminUsersQuery {
    pub q: Option<String>,
    pub role: Option<String>,
}

async fn fetch_admin_user_dto(
    state: &AppState,
    user_id: &str,
) -> AppResult<Option<AdminUserDto>> {
    let row: Option<AdminUserDto> = sqlx::query_as(
        r#"
        SELECT
            u.id,
            u.email,
            u.name,
            u.image,
            u.role,
            (SELECT COUNT(*) FROM vaults v WHERE v.owner_id = u.id) AS vault_count,
            (
                SELECT COUNT(*)
                FROM credentials c
                INNER JOIN vaults v ON v.id = c.vault_id
                WHERE v.owner_id = u.id
            ) AS credential_count,
            u.created_at,
            u.last_seen_at
        FROM users u
        WHERE u.id = $1
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?;

    Ok(row)
}

pub async fn list_admin_users(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Query(query): Query<ListAdminUsersQuery>,
) -> AppResult<Json<Vec<AdminUserDto>>> {
    user.require_admin()?;

    let search = query.q.unwrap_or_default().trim().to_lowercase();
    let search_pattern = format!("%{}%", search);
    let role_filter = query.role.unwrap_or_default().trim().to_lowercase();

    let users: Vec<AdminUserDto> = sqlx::query_as(
        r#"
        SELECT
            u.id,
            u.email,
            u.name,
            u.image,
            u.role,
            (SELECT COUNT(*) FROM vaults v WHERE v.owner_id = u.id) AS vault_count,
            (
                SELECT COUNT(*)
                FROM credentials c
                INNER JOIN vaults v ON v.id = c.vault_id
                WHERE v.owner_id = u.id
            ) AS credential_count,
            u.created_at,
            u.last_seen_at
        FROM users u
        WHERE ($1 = '%%' OR u.email ILIKE $1 OR u.name ILIKE $1)
          AND ($2 = '' OR LOWER(u.role) = $2)
        ORDER BY
            CASE u.role WHEN 'admin' THEN 0 ELSE 1 END,
            u.created_at ASC
        "#,
    )
    .bind(&search_pattern)
    .bind(&role_filter)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(users))
}

pub async fn update_user_role(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(target_user_id): Path<String>,
    Json(payload): Json<UpdateUserRoleRequest>,
) -> AppResult<Json<AdminUserDto>> {
    user.require_admin()?;

    let new_role = payload.role.trim().to_lowercase();
    if new_role != "admin" && new_role != "user" {
        return Err(AppError::BadRequest(
            "Il ruolo deve essere 'admin' o 'user'".to_string(),
        ));
    }

    if target_user_id == user.id && new_role != "admin" {
        return Err(AppError::BadRequest(
            "Non puoi rimuovere il ruolo Admin dal tuo stesso account".to_string(),
        ));
    }

    let existing = fetch_admin_user_dto(&state, &target_user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Utente non trovato".to_string()))?;

    if existing.role == "admin" && new_role == "user" {
        let (admin_count,): (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM users WHERE role = 'admin'")
                .fetch_one(&state.db)
                .await?;
        if admin_count <= 1 {
            return Err(AppError::BadRequest(
                "Deve rimanere almeno un amministratore nel sistema".to_string(),
            ));
        }
    }

    sqlx::query("UPDATE users SET role = $1 WHERE id = $2")
        .bind(&new_role)
        .bind(&target_user_id)
        .execute(&state.db)
        .await?;

    let updated = fetch_admin_user_dto(&state, &target_user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Utente non trovato".to_string()))?;

    Ok(Json(updated))
}

pub async fn delete_user(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(target_user_id): Path<String>,
) -> AppResult<StatusCode> {
    user.require_admin()?;

    if target_user_id == user.id {
        return Err(AppError::BadRequest(
            "Non puoi eliminare il tuo stesso account".to_string(),
        ));
    }

    let existing: Option<(String, String)> =
        sqlx::query_as("SELECT email, role FROM users WHERE id = $1")
            .bind(&target_user_id)
            .fetch_optional(&state.db)
            .await?;

    let (target_email, target_role) =
        existing.ok_or_else(|| AppError::NotFound("Utente non trovato".to_string()))?;

    if target_role == "admin" {
        let (admin_count,): (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM users WHERE role = 'admin'")
                .fetch_one(&state.db)
                .await?;
        if admin_count <= 1 {
            return Err(AppError::BadRequest(
                "Non è possibile eliminare l'ultimo amministratore del sistema".to_string(),
            ));
        }
    }

    let mut tx = state.db.begin().await?;

    // Preserve credentials created or edited by this user inside shared vaults owned by others
    sqlx::query(
        r#"
        UPDATE credentials c
        SET created_by = v.owner_id
        FROM vaults v
        WHERE c.vault_id = v.id
          AND c.created_by = $1
          AND v.owner_id != $1
        "#,
    )
    .bind(&target_user_id)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        UPDATE credentials c
        SET updated_by = v.owner_id
        FROM vaults v
        WHERE c.vault_id = v.id
          AND c.updated_by = $1
          AND v.owner_id != $1
        "#,
    )
    .bind(&target_user_id)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        UPDATE vault_members vm
        SET shared_by = v.owner_id
        FROM vaults v
        WHERE vm.vault_id = v.id
          AND vm.shared_by = $1
          AND v.owner_id != $1
        "#,
    )
    .bind(&target_user_id)
    .execute(&mut *tx)
    .await?;

    sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(&target_user_id)
        .execute(&mut *tx)
        .await?;

    // If Better Auth table `public."user"` exists in the same database, remove the account there too
    let better_auth_table: Option<(Option<String>,)> =
        sqlx::query_as("SELECT to_regclass('public.\"user\"')::TEXT")
            .fetch_optional(&mut *tx)
            .await?;

    if matches!(better_auth_table, Some((Some(_),))) {
        sqlx::query("DELETE FROM \"user\" WHERE id = $1 OR LOWER(email) = LOWER($2)")
            .bind(&target_user_id)
            .bind(&target_email)
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;

    Ok(StatusCode::NO_CONTENT)
}

/// Endpoint predisposto per gli audit di sistema (chi ha fatto cosa e quando).
/// Attualmente non implementato come da specifiche: restituisce una lista vuota riservata agli Admin.
pub async fn list_system_audit(
    user: AuthenticatedUser,
) -> AppResult<Json<Vec<SystemAuditEventDto>>> {
    user.require_admin()?;
    Ok(Json(Vec::new()))
}
