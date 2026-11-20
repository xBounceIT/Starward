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
pub struct ServiceAccountAuthContext {
    pub permission: String,
    pub vault_ids: Vec<String>,
    pub credential_ids: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct AuthenticatedUser {
    pub id: String,
    pub email: String,
    pub name: String,
    pub image: Option<String>,
    pub role: String,
    pub is_service_account: bool,
    pub api_key: Option<ApiKeyAuthContext>,
    pub service_account: Option<ServiceAccountAuthContext>,
}

impl AuthenticatedUser {
    pub fn is_admin(&self) -> bool {
        !self.is_service_account && self.role == "admin"
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
        if self.api_key.is_some() || self.service_account.is_some() || self.is_service_account {
            return Err(AppError::Forbidden(
                "Questa operazione richiede una sessione utente interattiva e non può essere eseguita tramite API Key o Service Account"
                    .to_string(),
            ));
        }
        Ok(())
    }

    pub fn require_non_service_account(&self) -> Result<(), AppError> {
        if self.is_service_account || self.service_account.is_some() {
            return Err(AppError::Forbidden(
                "Questa operazione non è consentita per un Service Account".to_string(),
            ));
        }
        Ok(())
    }

    pub fn require_write_permission(&self) -> Result<(), AppError> {
        if let Some(ref sa) = self.service_account {
            if sa.permission != "read_write" {
                return Err(AppError::Forbidden(
                    "Questo Service Account ha permessi di sola lettura".to_string(),
                ));
            }
            return Ok(());
        }
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
        if let Some(ref sa) = self.service_account {
            return sa.vault_ids.iter().any(|allowed| allowed == vault_id);
        }
        match &self.api_key {
            Some(key) if !key.vault_ids.is_empty() => {
                key.vault_ids.iter().any(|allowed| allowed == vault_id)
            }
            _ => true,
        }
    }

    pub fn ensure_vault_allowed(&self, vault_id: &str) -> Result<(), AppError> {
        if !self.can_access_vault(vault_id) {
            let msg = if self.service_account.is_some() {
                "Questo Service Account non è autorizzato ad accedere a questa cartella"
            } else {
                "Questa API Key non è autorizzata ad accedere a questa cartella"
            };
            return Err(AppError::Forbidden(msg.to_string()));
        }
        Ok(())
    }

    pub fn can_access_credential(&self, credential_id: &str, vault_id: &str) -> bool {
        if let Some(ref sa) = self.service_account {
            return sa.vault_ids.iter().any(|allowed| allowed == vault_id)
                || sa
                    .credential_ids
                    .iter()
                    .any(|allowed| allowed == credential_id);
        }
        self.can_access_vault(vault_id)
    }

    pub fn ensure_credential_allowed(
        &self,
        credential_id: &str,
        vault_id: &str,
    ) -> Result<(), AppError> {
        if !self.can_access_credential(credential_id, vault_id) {
            let msg = if self.service_account.is_some() {
                "Questo Service Account non è autorizzato ad accedere a questa credenziale"
            } else {
                "Questa API Key non è autorizzata ad accedere a questa credenziale"
            };
            return Err(AppError::Forbidden(msg.to_string()));
        }
        Ok(())
    }

    pub fn service_account_vault_role(&self) -> Option<&'static str> {
        self.service_account.as_ref().map(|sa| {
            if sa.permission == "read_write" {
                "editor"
            } else {
                "viewer"
            }
        })
    }

    pub fn is_vault_restricted_api_key(&self) -> bool {
        if self.service_account.is_some() {
            return true;
        }
        self.api_key
            .as_ref()
            .is_some_and(|key| !key.vault_ids.is_empty())
    }
}

#[derive(Debug, FromRow)]
struct ApiKeyAuthRow {
    api_key_id: String,
    api_key_name: String,
    key_prefix: String,
    permission: String,
    vault_ids: Vec<String>,
    expires_at: Option<DateTime<Utc>>,
    last_used_at: Option<DateTime<Utc>>,
    user_id: String,
    email: String,
    name: String,
    image: Option<String>,
    role: String,
}

#[derive(Debug, FromRow)]
struct ServiceAccountKeyAuthRow {
    key_id: String,
    key_name: String,
    key_prefix: String,
    expires_at: Option<DateTime<Utc>>,
    last_used_at: Option<DateTime<Utc>>,
    service_account_id: String,
    permission: String,
    vault_ids: Vec<String>,
    credential_ids: Vec<String>,
    is_active: bool,
    email: String,
    name: String,
    image: Option<String>,
}

async fn authenticate_service_account_key(
    raw_key: &str,
    state: &AppState,
) -> Result<AuthenticatedUser, AppError> {
    let key_hash = hash_api_key(raw_key);
    let row: Option<ServiceAccountKeyAuthRow> = sqlx::query_as(
        r#"
        SELECT
            sak.id AS key_id,
            sak.name AS key_name,
            sak.key_prefix,
            sak.expires_at,
            sak.last_used_at,
            sa.id AS service_account_id,
            sa.permission,
            sa.vault_ids,
            sa.credential_ids,
            sa.is_active,
            u.email,
            u.name,
            u.image
        FROM service_account_keys sak
        INNER JOIN service_accounts sa ON sa.id = sak.service_account_id
        INNER JOIN users u ON u.id = sa.id
        WHERE sak.key_hash = $1
          AND u.is_service_account = TRUE
        LIMIT 1
        "#,
    )
    .bind(&key_hash)
    .fetch_optional(&state.db)
    .await?;

    let row = row.ok_or_else(|| {
        AppError::Unauthorized("API Key del Service Account non valida o revocata".to_string())
    })?;

    if !row.is_active {
        return Err(AppError::Forbidden(
            "Questo Service Account è stato disabilitato da un amministratore".to_string(),
        ));
    }

    let now = Utc::now();
    if let Some(expires_at) = row.expires_at {
        if expires_at <= now {
            return Err(AppError::Unauthorized(
                "API Key del Service Account scaduta".to_string(),
            ));
        }
    }

    let is_first_use = row.last_used_at.is_none();

    sqlx::query("UPDATE service_account_keys SET last_used_at = $1 WHERE id = $2")
        .bind(now)
        .bind(&row.key_id)
        .execute(&state.db)
        .await?;

    sqlx::query("UPDATE service_accounts SET last_used_at = $1 WHERE id = $2")
        .bind(now)
        .bind(&row.service_account_id)
        .execute(&state.db)
        .await?;

    sqlx::query("UPDATE users SET last_seen_at = $1 WHERE id = $2")
        .bind(now)
        .bind(&row.service_account_id)
        .execute(&state.db)
        .await?;

    let auth_user = AuthenticatedUser {
        id: row.service_account_id,
        email: row.email,
        name: row.name,
        image: row.image,
        role: "user".to_string(),
        is_service_account: true,
        api_key: None,
        service_account: Some(ServiceAccountAuthContext {
            permission: row.permission,
            vault_ids: row.vault_ids,
            credential_ids: row.credential_ids,
        }),
    };

    if is_first_use {
        let _ = crate::routes::record_system_audit(
            &state.db,
            &auth_user,
            "auth.service_account_key_used",
            "service_account",
            Some(&row.key_id),
            &format!(
                "Primo accesso programmatico effettuato tramite chiave '{}' ({}...)",
                row.key_name, row.key_prefix
            ),
        )
        .await;
    }

    Ok(auth_user)
}

async fn authenticate_api_key(
    raw_key: &str,
    state: &AppState,
) -> Result<AuthenticatedUser, AppError> {
    if raw_key.starts_with("sw_sa_") {
        return authenticate_service_account_key(raw_key, state).await;
    }

    let key_hash = hash_api_key(raw_key);
    let row: Option<ApiKeyAuthRow> = sqlx::query_as(
        r#"
        SELECT
            ak.id AS api_key_id,
            ak.name AS api_key_name,
            ak.key_prefix,
            ak.permission,
            ak.vault_ids,
            ak.expires_at,
            ak.last_used_at,
            u.id AS user_id,
            u.email,
            u.name,
            u.image,
            u.role
        FROM api_keys ak
        INNER JOIN users u ON u.id = ak.user_id
        WHERE ak.key_hash = $1
          AND u.is_service_account = FALSE
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

    let is_first_use = row.last_used_at.is_none();

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

    let auth_user = AuthenticatedUser {
        id: row.user_id,
        email: row.email,
        name: row.name,
        image: row.image,
        role: row.role,
        is_service_account: false,
        api_key: Some(ApiKeyAuthContext {
            permission: row.permission,
            vault_ids: row.vault_ids,
        }),
        service_account: None,
    };

    if is_first_use {
        let _ = crate::routes::record_system_audit(
            &state.db,
            &auth_user,
            "auth.api_key_used",
            "api_key",
            Some(&row.api_key_id),
            &format!(
                "Primo accesso programmatico effettuato tramite API Key '{}' ({}...)",
                row.api_key_name, row.key_prefix
            ),
        )
        .await;
    }

    Ok(auth_user)
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
        let synced_user: (String, Option<String>, String, bool) = sqlx::query_as(
            r#"
            INSERT INTO users (id, email, name, image, role, is_service_account, created_at, last_seen_at)
            VALUES (
                $1,
                $2,
                $3,
                $4,
                CASE
                    WHEN $6 OR NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin' AND is_service_account = FALSE) THEN 'admin'
                    ELSE 'user'
                END,
                FALSE,
                $5,
                $5
            )
            ON CONFLICT (id) DO UPDATE SET
                email = EXCLUDED.email,
                name = CASE WHEN users.name_customized THEN users.name ELSE EXCLUDED.name END,
                image = COALESCE(EXCLUDED.image, users.image),
                role = CASE
                    WHEN users.is_service_account THEN users.role
                    WHEN $6 THEN 'admin'
                    WHEN NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin' AND is_service_account = FALSE) THEN 'admin'
                    ELSE users.role
                END,
                last_seen_at = EXCLUDED.last_seen_at
            RETURNING name, image, role, is_service_account
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

        if synced_user.3 {
            return Err(AppError::Forbidden(
                "I Service Account non possono effettuare login interattivi".to_string(),
            ));
        }

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

        // Automatically attach any pending group memberships invited by email before first login
        sqlx::query(
            r#"
            UPDATE group_members
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

        let mut is_first_login = false;
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
                is_first_login = true;
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

        let auth_user = AuthenticatedUser {
            id: claims.sub,
            email: email_normalized,
            name: synced_user.0,
            image: synced_user.1,
            role: synced_user.2,
            is_service_account: false,
            api_key: None,
            service_account: None,
        };

        if is_first_login {
            let _ = crate::routes::record_system_audit(
                &state.db,
                &auth_user,
                "auth.login",
                "auth",
                Some(&auth_user.id),
                &format!(
                    "Accesso utente registrato e vault Personale inizializzato (ruolo assegnato: {})",
                    auth_user.role
                ),
            )
            .await;
        }

        Ok(auth_user)
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
            is_service_account: false,
            api_key,
            service_account: None,
        }
    }

    fn sample_service_account(
        permission: &str,
        vault_ids: Vec<&str>,
        credential_ids: Vec<&str>,
    ) -> AuthenticatedUser {
        AuthenticatedUser {
            id: "sa_1".to_string(),
            email: "sa-deploy-1234@service.starward.local".to_string(),
            name: "Deploy Bot".to_string(),
            image: None,
            role: "user".to_string(),
            is_service_account: true,
            api_key: None,
            service_account: Some(ServiceAccountAuthContext {
                permission: permission.to_string(),
                vault_ids: vault_ids.into_iter().map(String::from).collect(),
                credential_ids: credential_ids.into_iter().map(String::from).collect(),
            }),
        }
    }

    #[test]
    fn session_user_has_full_interactive_and_vault_access() {
        let user = sample_user(None);
        assert!(user.require_session_auth().is_ok());
        assert!(user.require_non_service_account().is_ok());
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

    #[test]
    fn service_account_enforces_vault_and_specific_credential_scope() {
        let sa = sample_service_account("read", vec!["vault-prod"], vec!["cred-stripe"]);
        assert!(!sa.is_admin());
        assert!(sa.require_admin().is_err());
        assert!(sa.require_session_auth().is_err());
        assert!(sa.require_non_service_account().is_err());
        assert!(sa.require_write_permission().is_err());
        assert_eq!(sa.service_account_vault_role(), Some("viewer"));

        assert!(sa.can_access_vault("vault-prod"));
        assert!(!sa.can_access_vault("vault-billing"));

        // Any credential inside allowed vault is accessible
        assert!(sa.can_access_credential("cred-any-in-prod", "vault-prod"));
        // Specific credential in a non-allowed vault is accessible
        assert!(sa.can_access_credential("cred-stripe", "vault-billing"));
        // Another credential in that same non-allowed vault is NOT accessible
        assert!(!sa.can_access_credential("cred-other", "vault-billing"));
        assert!(sa.ensure_credential_allowed("cred-other", "vault-billing").is_err());
    }

    #[test]
    fn empty_scope_service_account_has_zero_access_by_default() {
        let sa = sample_service_account("read_write", vec![], vec![]);
        assert!(sa.require_write_permission().is_ok());
        assert_eq!(sa.service_account_vault_role(), Some("editor"));
        assert!(!sa.can_access_vault("any-vault"));
        assert!(!sa.can_access_credential("any-cred", "any-vault"));
    }
}
