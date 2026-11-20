pub mod admin;
pub mod api_keys;
pub mod credentials;
pub mod health;
pub mod users;
pub mod vaults;

use chrono::Utc;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    auth::AuthenticatedUser,
    error::{AppError, AppResult},
};

pub async fn get_user_vault_role(
    db: &PgPool,
    vault_id: &str,
    user: &AuthenticatedUser,
) -> AppResult<Option<String>> {
    let row: Option<(String,)> = sqlx::query_as(
        r#"
        SELECT role
        FROM vault_members
        WHERE vault_id = $1
          AND (user_id = $2 OR LOWER(member_email) = LOWER($3))
        LIMIT 1
        "#,
    )
    .bind(vault_id)
    .bind(&user.id)
    .bind(&user.email)
    .fetch_optional(db)
    .await?;

    Ok(row.map(|(role,)| role))
}

pub async fn require_vault_role(
    db: &PgPool,
    vault_id: &str,
    user: &AuthenticatedUser,
    allowed_roles: &[&str],
) -> AppResult<String> {
    let role = get_user_vault_role(db, vault_id, user)
        .await?
        .ok_or_else(|| AppError::NotFound("Cartella non trovata o accesso negato".to_string()))?;

    user.ensure_vault_allowed(vault_id)?;

    if !allowed_roles.contains(&"viewer") {
        user.require_write_permission()?;
    }

    if !allowed_roles.contains(&role.as_str()) {
        return Err(AppError::Forbidden(
            "Non hai i permessi necessari per questa operazione".to_string(),
        ));
    }

    Ok(role)
}

pub async fn record_audit(
    db: &PgPool,
    vault_id: &str,
    credential_id: Option<&str>,
    actor: &AuthenticatedUser,
    action: &str,
    details: &str,
) -> AppResult<()> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now();
    sqlx::query(
        r#"
        INSERT INTO audit_logs (id, vault_id, credential_id, actor_id, actor_email, actor_name, action, details, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        "#,
    )
    .bind(id)
    .bind(vault_id)
    .bind(credential_id)
    .bind(&actor.id)
    .bind(&actor.email)
    .bind(&actor.name)
    .bind(action)
    .bind(details)
    .bind(now)
    .execute(db)
    .await?;

    Ok(())
}
