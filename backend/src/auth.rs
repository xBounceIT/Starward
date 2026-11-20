use axum::{
    extract::FromRequestParts,
    http::{header::AUTHORIZATION, request::Parts},
};
use chrono::{DateTime, Utc};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use crate::{crypto::hash_api_key, error::AppError, AppState};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthClaims {
    pub sub: String,
    pub email: String,
    pub name: String,
    pub image: Option<String>,
    pub exp: usize,
}

#[derive(Debug, Clone)]
pub struct ApiKeyAuthContext {
    pub permission: String,
    pub vault_ids: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct AuthenticatedUser {
    pub id: String,
    pub email: String,
    pub name: String,
    pub image: Option<String>,
    pub role: String,
    pub api_key: Option<ApiKeyAuthContext>,
}

impl AuthenticatedUser {
    pub fn is_admin(&self) -> bool {
        self.role == "admin"
    }

    pub fn require_admin(&self) -> Result<(), AppError> {
        if self.is_admin() {
            Ok(())
        } else {
            Err(AppError::Forbidden(
                "Accesso riservato agli amministratori".to_string(),
            ))
        }
    }

    pub fn require_session_auth(&self) -> Result<(), AppError> {
        if self.api_key.is_some() {
            return Err(AppError::Forbidden(
                "Questa operazione richiede una sessione utente interattiva e non può essere eseguita tramite API Key"
                    .to_string(),
            ));
        }
        Ok(())
    }

    pub fn require_write_permission(&self) -> Result<(), AppError> {
        if let Some(ref key) = self.api_key {
            if key.permission != "read_write" {
                return Err(AppError::Forbidden(
                    "Questa API Key ha permessi di sola lettura".to_string(),
                ));
            }
        }
        Ok(())
    }

    pub fn can_access_vault(&self, vault_id: &str) -> bool {
        match &self.api_key {
            Some(key) if !key.vault_ids.is_empty() => {
                key.vault_ids.iter().any(|allowed| allowed == vault_id)
            }
            _ => true,
        }
    }

    pub fn ensure_vault_allowed(&self, vault_id: &str) -> Result<(), AppError> {
        if !self.can_access_vault(vault_id) {
            return Err(AppError::Forbidden(
                "Questa API Key non è autorizzata ad accedere a questa cartella".to_string(),
            ));
        }
        Ok(())
    }

    pub fn is_vault_restricted_api_key(&self) -> bool {
        self.api_key
            .as_ref()
            .is_some_and(|key| !key.vault_ids.is_empty())
    }
}

#[derive(Debug, FromRow)]
struct ApiKeyAuthRow {
    api_key_id: String,
    permission: String,
    vault_ids: Vec<String>,
    expires_at: Option<DateTime<Utc>>,
    user_id: String,
    email: String,
    name: String,
    image: Option<String>,
    role: String,
}

async fn authenticate_api_key(
    raw_key: &str,
    state: &AppState,
) -> Result<AuthenticatedUser, AppError> {
    let key_hash = hash_api_key(raw_key);
    let row: Option<ApiKeyAuthRow> = sqlx::query_as(
        r#"
        SELECT
            ak.id AS api_key_id,
            ak.permission,
            ak.vault_ids,
            ak.expires_at,
            u.id AS user_id,
            u.email,
            u.name,
            u.image,
            u.role
        FROM api_keys ak
        INNER JOIN users u ON u.id = ak.user_id
        WHERE ak.key_hash = $1
        LIMIT 1
        "#,
    )
    .bind(&key_hash)
    .fetch_optional(&state.db)
    .await?;

    let row =
        row.ok_or_else(|| AppError::Unauthorized("API Key non valida o revocata".to_string()))?;
    let now = Utc::now();

    if let Some(expires_at) = row.expires_at {
        if expires_at <= now {
            return Err(AppError::Unauthorized("API Key scaduta".to_string()));
        }
    }

    sqlx::query("UPDATE api_keys SET last_used_at = $1 WHERE id = $2")
        .bind(now)
        .bind(&row.api_key_id)
        .execute(&state.db)
        .await?;

    sqlx::query("UPDATE users SET last_seen_at = $1 WHERE id = $2")
        .bind(now)
        .bind(&row.user_id)
        .execute(&state.db)
        .await?;

    Ok(AuthenticatedUser {
        id: row.user_id,
        email: row.email,
        name: row.name,
        image: row.image,
        role: row.role,
        api_key: Some(ApiKeyAuthContext {
            permission: row.permission,
            vault_ids: row.vault_ids,
        }),
    })
}

impl FromRequestParts<AppState> for AuthenticatedUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        if let Some(raw_api_key) = parts
            .headers
            .get("x-api-key")
            .and_then(|v| v.to_str().ok())
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            return authenticate_api_key(raw_api_key, state).await;
        }

        let auth_header = parts
            .headers
            .get(AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| AppError::Unauthorized("Header Authorization mancante".to_string()))?;

        let token = auth_header
            .strip_prefix("Bearer ")
            .or_else(|| auth_header.strip_prefix("bearer "))
            .map(str::trim)
            .ok_or_else(|| AppError::Unauthorized("Schema Bearer non valido".to_string()))?;

        if token.starts_with("sw_") {
            return authenticate_api_key(token, state).await;
        }

        let mut validation = Validation::new(Algorithm::HS256);
        validation.validate_exp = true;

        let decoding_key = DecodingKey::from_secret(state.config.auth_secret.as_bytes())
            .map_err(|e| AppError::Internal(format!("Configurazione JWT non valida: {e}")))?;

        let token_data = decode::<AuthClaims>(token, &decoding_key, &validation)
            .map_err(|e| AppError::Unauthorized(format!("Token non valido: {e}")))?;

        let claims = token_data.claims;
        let email_normalized = claims.email.trim().to_lowercase();
        if claims.sub.trim().is_empty() || email_normalized.is_empty() {
            return Err(AppError::Unauthorized(
                "Claims utente incompleti".to_string(),
            ));
        }

        let fallback_name = if claims.name.trim().is_empty() {
            email_normalized
                .split('@')
                .next()
                .unwrap_or("Utente")
                .to_string()
        } else {
            claims.name.trim().to_string()
        };

        let now = Utc::now();
        let is_env_admin = state.config.is_admin_email(&email_normalized);

        // Sync user into the centralized vault directory, preserving custom user display names and resolving RBAC role
        let synced_user: (String, Option<String>, String) = sqlx::query_as(
            r#"
            INSERT INTO users (id, email, name, image, role, created_at, last_seen_at)
            VALUES (
                $1,
                $2,
                $3,
                $4,
                CASE
                    WHEN $6 OR NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin') THEN 'admin'
                    ELSE 'user'
                END,
                $5,
                $5
            )
            ON CONFLICT (id) DO UPDATE SET
                email = EXCLUDED.email,
                name = CASE WHEN users.name_customized THEN users.name ELSE EXCLUDED.name END,
                image = COALESCE(EXCLUDED.image, users.image),
                role = CASE
                    WHEN $6 THEN 'admin'
                    WHEN NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin') THEN 'admin'
                    ELSE users.role
                END,
                last_seen_at = EXCLUDED.last_seen_at
            RETURNING name, image, role
            "#,
        )
        .bind(&claims.sub)
        .bind(&email_normalized)
        .bind(&fallback_name)
        .bind(&claims.image)
        .bind(now)
        .bind(is_env_admin)
        .fetch_one(&state.db)
        .await?;

        // Automatically attach any pending shared folders invited by email before first login
        sqlx::query(
            r#"
            UPDATE vault_members
            SET user_id = $1
            WHERE LOWER(member_email) = LOWER($2) AND user_id IS NULL
            "#,
        )
        .bind(&claims.sub)
        .bind(&email_normalized)
        .execute(&state.db)
        .await?;

        // Ensure the user has a default Personal vault on first login
        let personal_exists: Option<(String,)> = sqlx::query_as(
            "SELECT id FROM vaults WHERE owner_id = $1 AND is_personal = TRUE LIMIT 1",
        )
        .bind(&claims.sub)
        .fetch_optional(&state.db)
        .await?;

        if personal_exists.is_none() {
            let vault_id = Uuid::new_v4().to_string();
            let member_id = Uuid::new_v4().to_string();
            let mut tx = state.db.begin().await?;

            let inserted_vault: Option<(String,)> = sqlx::query_as(
                r#"
                INSERT INTO vaults (id, name, description, icon, color, owner_id, is_personal, created_at, updated_at)
                VALUES ($1, 'Personale', 'Le tue credenziali private', 'lock', 'indigo', $2, TRUE, $3, $3)
                ON CONFLICT (owner_id) WHERE is_personal = TRUE DO NOTHING
                RETURNING id
                "#,
            )
            .bind(&vault_id)
            .bind(&claims.sub)
            .bind(now)
            .fetch_optional(&mut *tx)
            .await?;

            if let Some((created_vault_id,)) = inserted_vault {
                sqlx::query(
                    r#"
                    INSERT INTO vault_members (id, vault_id, user_id, member_email, role, shared_by, created_at)
                    VALUES ($1, $2, $3, $4, 'owner', $3, $5)
                    ON CONFLICT (vault_id, LOWER(member_email)) DO NOTHING
                    "#,
                )
                .bind(&member_id)
                .bind(&created_vault_id)
                .bind(&claims.sub)
                .bind(&email_normalized)
                .bind(now)
                .execute(&mut *tx)
                .await?;
            }

            tx.commit().await?;
        }

        Ok(AuthenticatedUser {
            id: claims.sub,
            email: email_normalized,
            name: synced_user.0,
            image: synced_user.1,
            role: synced_user.2,
            api_key: None,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_user(api_key: Option<ApiKeyAuthContext>) -> AuthenticatedUser {
        AuthenticatedUser {
            id: "user-1".to_string(),
            email: "alice@starward.io".to_string(),
            name: "Alice".to_string(),
            image: None,
            role: "user".to_string(),
            api_key,
        }
    }

    #[test]
    fn session_user_has_full_interactive_and_vault_access() {
        let user = sample_user(None);
        assert!(user.require_session_auth().is_ok());
        assert!(user.require_write_permission().is_ok());
        assert!(user.can_access_vault("vault-a"));
        assert!(user.ensure_vault_allowed("vault-b").is_ok());
        assert!(!user.is_vault_restricted_api_key());
    }

    #[test]
    fn read_only_api_key_forbids_session_and_write_actions() {
        let user = sample_user(Some(ApiKeyAuthContext {
            permission: "read".to_string(),
            vault_ids: vec![],
        }));
        assert!(user.require_session_auth().is_err());
        assert!(user.require_write_permission().is_err());
        assert!(user.can_access_vault("any-vault"));
        assert!(!user.is_vault_restricted_api_key());
    }

    #[test]
    fn scoped_read_write_api_key_enforces_allowed_vault_ids() {
        let user = sample_user(Some(ApiKeyAuthContext {
            permission: "read_write".to_string(),
            vault_ids: vec!["vault-prod".to_string(), "vault-shared".to_string()],
        }));
        assert!(user.require_session_auth().is_err());
        assert!(user.require_write_permission().is_ok());
        assert!(user.is_vault_restricted_api_key());
        assert!(user.can_access_vault("vault-prod"));
        assert!(user.ensure_vault_allowed("vault-shared").is_ok());
        assert!(!user.can_access_vault("vault-personal"));
        assert!(user.ensure_vault_allowed("vault-personal").is_err());
    }
}
