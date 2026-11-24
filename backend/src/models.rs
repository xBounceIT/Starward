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
pub struct McpKeyDto {
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
pub struct CreatedMcpKeyDto {
    pub mcp_key: McpKeyDto,
    pub secret_key: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateMcpKeyRequest {
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
    pub member_ids: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateGroupRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AddGroupMemberRequest {
    pub user_id: String,
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
    #[serde(default)]
    pub allowed_ip_cidrs: Vec<String>,
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
    /// Optional IP allowlist (plain IPs or CIDRs) for this Service Account.
    /// Empty = reachable from any IP.
    #[serde(default)]
    pub allowed_ip_cidrs: Vec<String>,
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
    /// `Some(list)` replaces the allowlist (empty list = no restriction),
    /// `None` leaves it unchanged.
    pub allowed_ip_cidrs: Option<Vec<String>>,
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

/// Tipo di campo personalizzato (compatibile con Bitwarden: 0=text, 1=hidden, 2=checkbox, 3=linked).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CustomFieldType {
    Text,
    Hidden,
    Checkbox,
    Linked,
}

/// ID di collegamento per i campi personalizzati di tipo "linked"
/// (compatibili con Bitwarden LinkedIdType).
pub const LINKED_ID_USERNAME: u32 = 100;
pub const LINKED_ID_PASSWORD: u32 = 101;
pub const LINKED_ID_URI: u32 = 102;

pub fn is_valid_linked_id(linked_id: u32) -> bool {
    matches!(
        linked_id,
        LINKED_ID_USERNAME | LINKED_ID_PASSWORD | LINKED_ID_URI
    )
}

/// Accetta stringhe, booleani e numeri (in Bitwarden i campi checkbox hanno valore booleano).
fn stringify_scalar_value<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = serde_json::Value::deserialize(deserializer)?;
    Ok(match value {
        serde_json::Value::String(s) => s,
        serde_json::Value::Bool(b) => b.to_string(),
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::Null => String::new(),
        other => other.to_string(),
    })
}

/// Placeholder printed instead of secret values in the manual `Debug` impls
/// below: no code path (tracing, panic messages, assert_eq! in tests) can then
/// ever write a plaintext password/notes/field value to the logs.
const REDACTED: &str = "[REDACTED]";

// NOTE: CustomField, CredentialDto and the credential request structs
// intentionally do NOT derive Debug; see the manual redacting impls below.
/// Campo personalizzato tipizzato di una credenziale (stile Bitwarden).
#[derive(Clone, Serialize, Deserialize)]
pub struct CustomField {
    pub field_type: CustomFieldType,
    pub label: String,
    #[serde(default, deserialize_with = "stringify_scalar_value")]
    pub value: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub linked_id: Option<u32>,
}

impl std::fmt::Debug for CustomField {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // `value` can hold a secret (hidden/checkbox/linked fields): redact it.
        f.debug_struct("CustomField")
            .field("field_type", &self.field_type)
            .field("label", &self.label)
            .field("value", &REDACTED)
            .field("linked_id", &self.linked_id)
            .finish()
    }
}

#[derive(Clone, Serialize, Deserialize)]
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
    #[serde(default)]
    pub custom_fields: Vec<CustomField>,
    pub favorite: bool,
    pub created_by: String,
    pub created_by_name: String,
    pub updated_by: String,
    pub updated_by_name: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl std::fmt::Debug for CredentialDto {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CredentialDto")
            .field("id", &self.id)
            .field("vault_id", &self.vault_id)
            .field("vault_name", &self.vault_name)
            .field("vault_color", &self.vault_color)
            .field("vault_role", &self.vault_role)
            .field("title", &self.title)
            .field("username", &self.username)
            .field("password", &REDACTED)
            .field("url", &self.url)
            .field("category", &self.category)
            .field("notes", &REDACTED)
            .field("fields", &REDACTED)
            .field(
                "custom_fields",
                &format!("[REDACTED: {} field(s)]", self.custom_fields.len()),
            )
            .field("favorite", &self.favorite)
            .field("created_by", &self.created_by)
            .field("created_by_name", &self.created_by_name)
            .field("updated_by", &self.updated_by)
            .field("updated_by_name", &self.updated_by_name)
            .field("created_at", &self.created_at)
            .field("updated_at", &self.updated_at)
            .finish()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct CredentialMetadataDto {
    pub id: String,
    pub vault_id: String,
    pub vault_name: String,
    pub vault_color: String,
    pub vault_role: String,
    pub title: String,
    pub username: String,
    pub url: String,
    pub category: String,
    pub favorite: bool,
    pub created_by: String,
    pub created_by_name: String,
    pub updated_by: String,
    pub updated_by_name: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct TotpCodeDto {
    pub credential_id: String,
    pub code: String,
    pub remaining_seconds: u64,
    pub period: u64,
    pub digits: u32,
    pub algorithm: String,
    pub expires_at: DateTime<Utc>,
}

impl std::fmt::Debug for TotpCodeDto {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TotpCodeDto")
            .field("credential_id", &self.credential_id)
            .field("code", &REDACTED)
            .field("remaining_seconds", &self.remaining_seconds)
            .field("period", &self.period)
            .field("digits", &self.digits)
            .field("algorithm", &self.algorithm)
            .field("expires_at", &self.expires_at)
            .finish()
    }
}

#[derive(Clone, Deserialize)]
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
    pub custom_fields: Vec<CustomField>,
    #[serde(default)]
    pub favorite: bool,
}

impl std::fmt::Debug for CreateCredentialRequest {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CreateCredentialRequest")
            .field("vault_id", &self.vault_id)
            .field("title", &self.title)
            .field("username", &self.username)
            .field("password", &REDACTED)
            .field("url", &self.url)
            .field("category", &self.category)
            .field("notes", &REDACTED)
            .field("fields", &REDACTED)
            .field(
                "custom_fields",
                &format!("[REDACTED: {} field(s)]", self.custom_fields.len()),
            )
            .field("favorite", &self.favorite)
            .finish()
    }
}

#[derive(Clone, Deserialize)]
pub struct UpdateCredentialRequest {
    pub vault_id: Option<String>,
    pub title: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub url: Option<String>,
    pub category: Option<String>,
    pub notes: Option<String>,
    pub fields: Option<BTreeMap<String, String>>,
    pub custom_fields: Option<Vec<CustomField>>,
    pub favorite: Option<bool>,
}

impl std::fmt::Debug for UpdateCredentialRequest {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("UpdateCredentialRequest")
            .field("vault_id", &self.vault_id)
            .field("title", &self.title)
            .field("username", &self.username)
            .field(
                "password",
                &self.password.as_ref().map(|_| "[REDACTED]".to_string()),
            )
            .field("url", &self.url)
            .field("category", &self.category)
            .field(
                "notes",
                &self.notes.as_ref().map(|_| "[REDACTED]".to_string()),
            )
            .field("fields", &self.fields.as_ref().map(|_| "[REDACTED]".to_string()))
            .field(
                "custom_fields",
                &self
                    .custom_fields
                    .as_ref()
                    .map(|cf| format!("[REDACTED: {} field(s)]", cf.len())),
            )
            .field("favorite", &self.favorite)
            .finish()
    }
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportProviderDto {
    pub id: String,
    pub name: String,
    pub description: String,
    pub formats: Vec<String>,
    pub extensions: Vec<String>,
    pub featured: bool,
    pub supports_folders: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ImportVaultRequest {
    pub provider: String,
    pub content: String,
    #[serde(default)]
    pub filename: Option<String>,
    #[serde(default = "default_duplicate_strategy")]
    pub duplicate_strategy: String,
    #[serde(default = "default_true")]
    pub folder_as_tag: bool,
    #[serde(default)]
    pub include_source_folders: Option<Vec<String>>,
    #[serde(default)]
    pub selected_indices: Option<Vec<usize>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportPreviewItemDto {
    pub index: usize,
    pub title: String,
    pub username: String,
    pub url: String,
    pub category: String,
    pub source_folder: Option<String>,
    pub favorite: bool,
    pub tags: Vec<String>,
    pub has_password: bool,
    pub has_notes: bool,
    pub extra_field_count: usize,
    pub status: String,
    pub is_duplicate: bool,
    pub warning: Option<String>,
    pub skip_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportPreviewResponseDto {
    pub provider: String,
    pub provider_label: String,
    pub detected_format: String,
    pub total_parsed: usize,
    pub ready_count: usize,
    pub warning_count: usize,
    pub duplicate_count: usize,
    pub skipped_count: usize,
    pub source_folders: Vec<String>,
    pub has_items_without_folder: bool,
    pub items: Vec<ImportPreviewItemDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportSkippedItemDto {
    pub index: usize,
    pub title: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResultDto {
    pub provider: String,
    pub provider_label: String,
    pub detected_format: String,
    pub vault_id: String,
    pub total_parsed: usize,
    pub imported_count: usize,
    pub duplicate_skipped_count: usize,
    pub invalid_skipped_count: usize,
    pub skipped_items: Vec<ImportSkippedItemDto>,
}

fn default_duplicate_strategy() -> String {
    "skip".to_string()
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

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_credential_dto() -> CredentialDto {
        let now = Utc::now();
        CredentialDto {
            id: "cred-1".to_string(),
            vault_id: "vault-1".to_string(),
            vault_name: "Produzione".to_string(),
            vault_color: "red".to_string(),
            vault_role: "editor".to_string(),
            title: "DB admin".to_string(),
            username: "admin".to_string(),
            password: "SUPER-SECRET-PASSWORD".to_string(),
            url: "https://db.example.com".to_string(),
            category: "login".to_string(),
            notes: "NOTA-SEGRETA".to_string(),
            fields: BTreeMap::from([("pin".to_string(), "SECRETO-CAMPO".to_string())]),
            custom_fields: vec![CustomField {
                field_type: CustomFieldType::Hidden,
                label: "API key".to_string(),
                value: "VALORE-SEGRETO".to_string(),
                linked_id: None,
            }],
            favorite: false,
            created_by: "u1".to_string(),
            created_by_name: "Alice".to_string(),
            updated_by: "u1".to_string(),
            updated_by_name: "Alice".to_string(),
            created_at: now,
            updated_at: now,
        }
    }

    #[test]
    fn credential_dto_debug_never_contains_secrets() {
        let dto = sample_credential_dto();
        let dbg = format!("{dto:?}");
        for secret in ["SUPER-SECRET-PASSWORD", "NOTA-SEGRETA", "SECRETO-CAMPO", "VALORE-SEGRETO"] {
            assert!(!dbg.contains(secret), "Debug leak: {dbg}");
        }
        assert!(dbg.contains("[REDACTED]"));
        // Non-secret metadata is still visible for debugging.
        assert!(dbg.contains("DB admin"));
    }

    #[test]
    fn credential_request_debug_never_contains_secrets() {
        let create = CreateCredentialRequest {
            vault_id: "vault-1".to_string(),
            title: "t".to_string(),
            username: "u".to_string(),
            password: "SUPER-SECRET-PASSWORD".to_string(),
            url: String::new(),
            category: "login".to_string(),
            notes: "NOTA-SEGRETA".to_string(),
            fields: BTreeMap::from([("k".to_string(), "SECRETO-CAMPO".to_string())]),
            custom_fields: vec![],
            favorite: false,
        };
        let dbg = format!("{create:?}");
        assert!(!dbg.contains("SUPER-SECRET-PASSWORD"));
        assert!(!dbg.contains("NOTA-SEGRETA"));
        assert!(!dbg.contains("SECRETO-CAMPO"));

        let update = UpdateCredentialRequest {
            vault_id: None,
            title: None,
            username: None,
            password: Some("SUPER-SECRET-PASSWORD".to_string()),
            url: None,
            category: None,
            notes: Some("NOTA-SEGRETA".to_string()),
            fields: None,
            custom_fields: None,
            favorite: None,
        };
        let dbg = format!("{update:?}");
        assert!(!dbg.contains("SUPER-SECRET-PASSWORD"));
        assert!(!dbg.contains("NOTA-SEGRETA"));
    }

    #[test]
    fn totp_code_debug_is_redacted() {
        let dto = TotpCodeDto {
            credential_id: "cred-1".to_string(),
            code: "123456".to_string(),
            remaining_seconds: 20,
            period: 30,
            digits: 6,
            algorithm: "SHA1".to_string(),
            expires_at: Utc::now(),
        };
        let dbg = format!("{dto:?}");
        assert!(!dbg.contains("123456"));
        assert!(dbg.contains("[REDACTED]"));
    }
}
