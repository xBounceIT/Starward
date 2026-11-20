use std::collections::BTreeMap;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct UserRecord {
    pub id: String,
    pub email: String,
    pub name: String,
    pub image: Option<String>,
    pub role: String,
    pub created_at: DateTime<Utc>,
    pub last_seen_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSummary {
    pub id: String,
    pub email: String,
    pub name: String,
    pub image: Option<String>,
    pub role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AdminUserDto {
    pub id: String,
    pub email: String,
    pub name: String,
    pub image: Option<String>,
    pub role: String,
    pub vault_count: i64,
    pub credential_count: i64,
    pub created_at: DateTime<Utc>,
    pub last_seen_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateUserRoleRequest {
    pub role: String,
}

/// Predisposizione modello evento di Audit di Sistema ("chi ha fatto cosa e quando").
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemAuditEventDto {
    pub id: String,
    pub actor_id: String,
    pub actor_email: String,
    pub actor_name: String,
    pub actor_role: String,
    pub action: String,
    pub target_type: String,
    pub target_id: Option<String>,
    pub details: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultMemberDto {
    pub id: String,
    pub vault_id: String,
    pub user_id: Option<String>,
    pub email: String,
    pub name: Option<String>,
    pub image: Option<String>,
    pub role: String,
    pub is_pending: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultDto {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub color: String,
    pub owner_id: String,
    pub owner_name: String,
    pub owner_email: String,
    pub is_personal: bool,
    pub role: String,
    pub is_shared: bool,
    pub is_shared_with_me: bool,
    pub member_count: i64,
    pub credential_count: i64,
    pub members: Vec<VaultMemberDto>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateVaultRequest {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_icon")]
    pub icon: String,
    #[serde(default = "default_color")]
    pub color: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateVaultRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ShareVaultRequest {
    pub email: String,
    #[serde(default = "default_share_role")]
    pub role: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateMemberRoleRequest {
    pub role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialDto {
    pub id: String,
    pub vault_id: String,
    pub vault_name: String,
    pub vault_color: String,
    pub vault_role: String,
    pub title: String,
    pub username: String,
    pub password: String,
    pub url: String,
    pub category: String,
    pub notes: String,
    pub fields: BTreeMap<String, String>,
    pub favorite: bool,
    pub created_by: String,
    pub created_by_name: String,
    pub updated_by: String,
    pub updated_by_name: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateCredentialRequest {
    pub vault_id: String,
    pub title: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub url: String,
    #[serde(default = "default_category")]
    pub category: String,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub fields: BTreeMap<String, String>,
    #[serde(default)]
    pub favorite: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateCredentialRequest {
    pub vault_id: Option<String>,
    pub title: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub url: Option<String>,
    pub category: Option<String>,
    pub notes: Option<String>,
    pub fields: Option<BTreeMap<String, String>>,
    pub favorite: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AuditLogDto {
    pub id: String,
    pub vault_id: String,
    pub credential_id: Option<String>,
    pub actor_id: String,
    pub actor_email: String,
    pub actor_name: String,
    pub action: String,
    pub details: String,
    pub created_at: DateTime<Utc>,
}

fn default_icon() -> String {
    "folder".to_string()
}

fn default_color() -> String {
    "indigo".to_string()
}

fn default_share_role() -> String {
    "viewer".to_string()
}

fn default_category() -> String {
    "login".to_string()
}
