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
    #[serde(default)]
    pub is_service_account: bool,
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

/// Modello evento di Audit di Sistema ("chi ha fatto cosa e quando").
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
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

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateProfileRequest {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct UserSettingsDto {
    pub theme: String,
    pub password_generator_length: i32,
    pub password_generator_uppercase: bool,
    pub password_generator_lowercase: bool,
    pub password_generator_numbers: bool,
    pub password_generator_symbols: bool,
    pub default_vault_id: Option<String>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateUserSettingsRequest {
    pub theme: Option<String>,
    pub password_generator_length: Option<i32>,
    pub password_generator_uppercase: Option<bool>,
    pub password_generator_lowercase: Option<bool>,
    pub password_generator_numbers: Option<bool>,
    pub password_generator_symbols: Option<bool>,
    pub default_vault_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiKeyDto {
    pub id: String,
    pub name: String,
    pub key_prefix: String,
    pub permission: String,
    pub vault_ids: Vec<String>,
    pub expires_at: Option<DateTime<Utc>>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub is_expired: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatedApiKeyDto {
    pub api_key: ApiKeyDto,
    pub secret_key: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateApiKeyRequest {
    pub name: String,
    #[serde(default = "default_api_key_permission")]
    pub permission: String,
    #[serde(default)]
    pub vault_ids: Vec<String>,
    pub expires_in_days: Option<i64>,
    pub expires_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupMemberDto {
    pub id: String,
    pub group_id: String,
    pub user_id: Option<String>,
    pub email: String,
    pub name: Option<String>,
    pub image: Option<String>,
    pub role: String,
    pub is_pending: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupSummaryDto {
    pub id: String,
    pub name: String,
    pub description: String,
    pub color: String,
    pub member_count: i64,
    pub vault_count: i64,
    pub my_role: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupDto {
    pub id: String,
    pub name: String,
    pub description: String,
    pub color: String,
    pub created_by: String,
    pub created_by_name: String,
    pub my_role: Option<String>,
    pub can_manage: bool,
    pub member_count: i64,
    pub vault_count: i64,
    pub members: Vec<GroupMemberDto>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateGroupRequest {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_color")]
    pub color: String,
    #[serde(default)]
    pub member_emails: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateGroupRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AddGroupMemberRequest {
    pub email: String,
    #[serde(default = "default_group_member_role")]
    pub role: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateGroupMemberRoleRequest {
    pub role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultGroupShareDto {
    pub id: String,
    pub vault_id: String,
    pub group_id: String,
    pub group_name: String,
    pub group_color: String,
    pub member_count: i64,
    pub role: String,
    pub is_owner_group: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ShareVaultGroupRequest {
    pub group_id: String,
    #[serde(default = "default_share_role")]
    pub role: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateVaultGroupRoleRequest {
    pub role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceAccountKeyDto {
    pub id: String,
    pub name: String,
    pub key_prefix: String,
    pub expires_at: Option<DateTime<Utc>>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub is_expired: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatedServiceAccountKeyDto {
    pub key: ServiceAccountKeyDto,
    pub secret_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ServiceAccountScopedVaultDto {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub color: String,
    pub owner_id: String,
    pub owner_name: String,
    pub owner_email: String,
    pub is_personal: bool,
    pub credential_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ServiceAccountScopedCredentialDto {
    pub id: String,
    pub vault_id: String,
    pub vault_name: String,
    pub vault_color: String,
    pub title: String,
    pub username: String,
    pub url: String,
    pub category: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceAccountResourcesDto {
    pub vaults: Vec<ServiceAccountScopedVaultDto>,
    pub credentials: Vec<ServiceAccountScopedCredentialDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceAccountDto {
    pub id: String,
    pub name: String,
    pub email: String,
    pub description: String,
    pub permission: String,
    pub is_active: bool,
    pub vault_ids: Vec<String>,
    pub credential_ids: Vec<String>,
    pub vaults: Vec<ServiceAccountScopedVaultDto>,
    pub credentials: Vec<ServiceAccountScopedCredentialDto>,
    pub keys: Vec<ServiceAccountKeyDto>,
    pub created_by: Option<String>,
    pub created_by_name: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_used_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatedServiceAccountDto {
    pub service_account: ServiceAccountDto,
    pub initial_key: Option<CreatedServiceAccountKeyDto>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateServiceAccountRequest {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_api_key_permission")]
    pub permission: String,
    #[serde(default)]
    pub vault_ids: Vec<String>,
    #[serde(default)]
    pub credential_ids: Vec<String>,
    #[serde(default = "default_true")]
    pub generate_initial_key: bool,
    pub initial_key_name: Option<String>,
    pub initial_key_expires_in_days: Option<i64>,
    pub initial_key_expires_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateServiceAccountRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub permission: Option<String>,
    pub is_active: Option<bool>,
    pub vault_ids: Option<Vec<String>>,
    pub credential_ids: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateServiceAccountKeyRequest {
    pub name: String,
    pub expires_in_days: Option<i64>,
    pub expires_at: Option<DateTime<Utc>>,
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
    pub owner_group_id: Option<String>,
    pub owner_group_name: Option<String>,
    pub owner_group_color: Option<String>,
    pub is_personal: bool,
    pub role: String,
    pub is_shared: bool,
    pub is_shared_with_me: bool,
    pub member_count: i64,
    pub group_count: i64,
    pub credential_count: i64,
    pub members: Vec<VaultMemberDto>,
    pub shared_groups: Vec<VaultGroupShareDto>,
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
    pub owner_group_id: Option<String>,
    pub group_role: Option<String>,
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
    #[serde(default)]
    pub user_id: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
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

fn default_api_key_permission() -> String {
    "read".to_string()
}

fn default_group_member_role() -> String {
    "member".to_string()
}

fn default_true() -> bool {
    true
}
