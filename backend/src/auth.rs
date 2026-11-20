use axum::{
    extract::FromRequestParts,
    http::{header::AUTHORIZATION, request::Parts},
};
use chrono::Utc;
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{error::AppError, AppState};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthClaims {
    pub sub: String,
    pub email: String,
    pub name: String,
    pub image: Option<String>,
    pub exp: usize,
}

#[derive(Debug, Clone)]
pub struct AuthenticatedUser {
    pub id: String,
    pub email: String,
    pub name: String,
    pub image: Option<String>,
    pub role: String,
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
}

impl FromRequestParts<AppState> for AuthenticatedUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let auth_header = parts
            .headers
            .get(AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| AppError::Unauthorized("Header Authorization mancante".to_string()))?;

        let token = auth_header
            .strip_prefix("Bearer ")
            .ok_or_else(|| AppError::Unauthorized("Schema Bearer non valido".to_string()))?;

        let mut validation = Validation::new(Algorithm::HS256);
        validation.validate_exp = true;

        let decoding_key = DecodingKey::from_secret(state.config.auth_secret.as_bytes())
            .map_err(|e| AppError::Internal(format!("Configurazione JWT non valida: {e}")))?;

        let token_data = decode::<AuthClaims>(token, &decoding_key, &validation)
            .map_err(|e| AppError::Unauthorized(format!("Token non valido: {e}")))?;

        let claims = token_data.claims;
        let email_normalized = claims.email.trim().to_lowercase();
        if claims.sub.trim().is_empty() || email_normalized.is_empty() {
            return Err(AppError::Unauthorized("Claims utente incompleti".to_string()));
        }

        let name = if claims.name.trim().is_empty() {
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

        // Sync user into the centralized vault directory and resolve RBAC role
        let (role,): (String,) = sqlx::query_as(
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
                name = EXCLUDED.name,
                image = EXCLUDED.image,
                role = CASE
                    WHEN $6 THEN 'admin'
                    WHEN NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin') THEN 'admin'
                    ELSE users.role
                END,
                last_seen_at = EXCLUDED.last_seen_at
            RETURNING role
            "#,
        )
        .bind(&claims.sub)
        .bind(&email_normalized)
        .bind(&name)
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
            name,
            image: claims.image,
            role,
        })
    }
}
