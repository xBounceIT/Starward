use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::{
    auth::AuthenticatedUser,
    error::{AppError, AppResult},
    models::{
        AuditLogDto, CreateVaultRequest, ShareVaultRequest, UpdateMemberRoleRequest,
        UpdateVaultRequest, VaultDto, VaultMemberDto,
    },
    routes::{record_audit, record_system_audit, require_vault_role},
    AppState,
};

#[derive(Debug, FromRow)]
struct VaultRow {
    id: String,
    name: String,
    description: String,
    icon: String,
    color: String,
    owner_id: String,
    owner_name: String,
    owner_email: String,
    is_personal: bool,
    role: String,
    credential_count: i64,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(Debug, FromRow)]
struct MemberRow {
    id: String,
    vault_id: String,
    user_id: Option<String>,
    member_email: String,
    user_name: Option<String>,
    user_image: Option<String>,
    role: String,
    created_at: DateTime<Utc>,
}

async fn load_vault_members(db: &PgPool, vault_id: &str) -> AppResult<Vec<VaultMemberDto>> {
    let rows: Vec<MemberRow> = sqlx::query_as(
        r#"
        SELECT
            vm.id,
            vm.vault_id,
            vm.user_id,
            vm.member_email,
            u.name AS user_name,
            u.image AS user_image,
            vm.role,
            vm.created_at
        FROM vault_members vm
        LEFT JOIN users u ON u.id = vm.user_id
        WHERE vm.vault_id = $1
        ORDER BY
            CASE vm.role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END,
            vm.created_at ASC
        "#,
    )
    .bind(vault_id)
    .fetch_all(db)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| VaultMemberDto {
            id: r.id,
            vault_id: r.vault_id,
            is_pending: r.user_id.is_none(),
            user_id: r.user_id,
            email: r.member_email,
            name: r.user_name,
            image: r.user_image,
            role: r.role,
            created_at: r.created_at,
        })
        .collect())
}

async fn build_vault_dto(
    db: &PgPool,
    row: VaultRow,
    current_user_id: &str,
) -> AppResult<VaultDto> {
    let members = load_vault_members(db, &row.id).await?;
    let member_count = members.len() as i64;
    let is_shared = member_count > 1;
    let is_shared_with_me = row.owner_id != current_user_id;

    Ok(VaultDto {
        id: row.id,
        name: row.name,
        description: row.description,
        icon: row.icon,
        color: row.color,
        owner_id: row.owner_id,
        owner_name: row.owner_name,
        owner_email: row.owner_email,
        is_personal: row.is_personal,
        role: row.role,
        is_shared,
        is_shared_with_me,
        member_count,
        credential_count: row.credential_count,
        members,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

async fn fetch_single_vault(
    db: &PgPool,
    vault_id: &str,
    user: &AuthenticatedUser,
) -> AppResult<VaultDto> {
    let row: Option<VaultRow> = sqlx::query_as(
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
            vm.role,
            (SELECT COUNT(*) FROM credentials c WHERE c.vault_id = v.id) AS credential_count,
            v.created_at,
            v.updated_at
        FROM vaults v
        INNER JOIN vault_members vm ON vm.vault_id = v.id
        INNER JOIN users owner ON owner.id = v.owner_id
        WHERE v.id = $1
          AND (vm.user_id = $2 OR LOWER(vm.member_email) = LOWER($3))
        LIMIT 1
        "#,
    )
    .bind(vault_id)
    .bind(&user.id)
    .bind(&user.email)
    .fetch_optional(db)
    .await?;

    let row = row.ok_or_else(|| AppError::NotFound("Cartella non trovata".to_string()))?;
    build_vault_dto(db, row, &user.id).await
}

pub async fn list_vaults(
    State(state): State<AppState>,
    user: AuthenticatedUser,
) -> AppResult<Json<Vec<VaultDto>>> {
    let rows: Vec<VaultRow> = sqlx::query_as(
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
            vm.role,
            (SELECT COUNT(*) FROM credentials c WHERE c.vault_id = v.id) AS credential_count,
            v.created_at,
            v.updated_at
        FROM vaults v
        INNER JOIN vault_members vm ON vm.vault_id = v.id
        INNER JOIN users owner ON owner.id = v.owner_id
        WHERE vm.user_id = $1 OR LOWER(vm.member_email) = LOWER($2)
        ORDER BY v.is_personal DESC, LOWER(v.name) ASC
        "#,
    )
    .bind(&user.id)
    .bind(&user.email)
    .fetch_all(&state.db)
    .await?;

    let mut vaults = Vec::with_capacity(rows.len());
    for row in rows {
        if !user.can_access_vault(&row.id) {
            continue;
        }
        vaults.push(build_vault_dto(&state.db, row, &user.id).await?);
    }

    Ok(Json(vaults))
}

pub async fn create_vault(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Json(payload): Json<CreateVaultRequest>,
) -> AppResult<(StatusCode, Json<VaultDto>)> {
    user.require_write_permission()?;
    if user.is_vault_restricted_api_key() {
        return Err(AppError::Forbidden(
            "Questa API Key è limitata a cartelle specifiche e non può creare nuove cartelle"
                .to_string(),
        ));
    }

    let name = payload.name.trim();
    if name.is_empty() || name.len() > 80 {
        return Err(AppError::BadRequest(
            "Il nome della cartella deve essere tra 1 e 80 caratteri".to_string(),
        ));
    }

    let vault_id = Uuid::new_v4().to_string();
    let member_id = Uuid::new_v4().to_string();
    let now = Utc::now();

    let mut tx = state.db.begin().await?;

    sqlx::query(
        r#"
        INSERT INTO vaults (id, name, description, icon, color, owner_id, is_personal, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7, $7)
        "#,
    )
    .bind(&vault_id)
    .bind(name)
    .bind(payload.description.trim())
    .bind(payload.icon.trim())
    .bind(payload.color.trim())
    .bind(&user.id)
    .bind(now)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO vault_members (id, vault_id, user_id, member_email, role, shared_by, created_at)
        VALUES ($1, $2, $3, $4, 'owner', $3, $5)
        "#,
    )
    .bind(&member_id)
    .bind(&vault_id)
    .bind(&user.id)
    .bind(&user.email)
    .bind(now)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    record_audit(
        &state.db,
        &vault_id,
        None,
        &user,
        "vault.created",
        &format!("Cartella '{}' creata", name),
    )
    .await?;

    let dto = fetch_single_vault(&state.db, &vault_id, &user).await?;
    Ok((StatusCode::CREATED, Json(dto)))
}

pub async fn update_vault(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(vault_id): Path<String>,
    Json(payload): Json<UpdateVaultRequest>,
) -> AppResult<Json<VaultDto>> {
    require_vault_role(&state.db, &vault_id, &user, &["owner"]).await?;

    let existing: Option<(String, String, String, String)> = sqlx::query_as(
        "SELECT name, description, icon, color FROM vaults WHERE id = $1",
    )
    .bind(&vault_id)
    .fetch_optional(&state.db)
    .await?;

    let (curr_name, curr_desc, curr_icon, curr_color) =
        existing.ok_or_else(|| AppError::NotFound("Cartella non trovata".to_string()))?;

    let new_name = payload
        .name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(&curr_name);
    if new_name.len() > 80 {
        return Err(AppError::BadRequest(
            "Il nome della cartella non può superare 80 caratteri".to_string(),
        ));
    }

    let new_desc = payload
        .description
        .as_deref()
        .map(str::trim)
        .unwrap_or(&curr_desc);
    let new_icon = payload
        .icon
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(&curr_icon);
    let new_color = payload
        .color
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(&curr_color);

    let now = Utc::now();

    sqlx::query(
        r#"
        UPDATE vaults
        SET name = $1, description = $2, icon = $3, color = $4, updated_at = $5
        WHERE id = $6
        "#,
    )
    .bind(new_name)
    .bind(new_desc)
    .bind(new_icon)
    .bind(new_color)
    .bind(now)
    .bind(&vault_id)
    .execute(&state.db)
    .await?;

    record_audit(
        &state.db,
        &vault_id,
        None,
        &user,
        "vault.updated",
        &format!("Cartella '{}' aggiornata", new_name),
    )
    .await?;

    let dto = fetch_single_vault(&state.db, &vault_id, &user).await?;
    Ok(Json(dto))
}

pub async fn delete_vault(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(vault_id): Path<String>,
) -> AppResult<StatusCode> {
    require_vault_role(&state.db, &vault_id, &user, &["owner"]).await?;

    let row: Option<(String, bool)> =
        sqlx::query_as("SELECT name, is_personal FROM vaults WHERE id = $1")
            .bind(&vault_id)
            .fetch_optional(&state.db)
            .await?;

    let (vault_name, is_personal) =
        row.ok_or_else(|| AppError::NotFound("Cartella non trovata".to_string()))?;

    if is_personal {
        return Err(AppError::BadRequest(
            "Non è possibile eliminare la cartella Personale predefinita".to_string(),
        ));
    }

    sqlx::query("DELETE FROM vaults WHERE id = $1")
        .bind(&vault_id)
        .execute(&state.db)
        .await?;

    record_system_audit(
        &state.db,
        &user,
        "vault.deleted",
        "vault",
        Some(&vault_id),
        &format!("Cartella '{}' eliminata", vault_name),
    )
    .await?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn share_vault(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(vault_id): Path<String>,
    Json(payload): Json<ShareVaultRequest>,
) -> AppResult<(StatusCode, Json<VaultDto>)> {
    require_vault_role(&state.db, &vault_id, &user, &["owner"]).await?;

    let target_email = payload.email.trim().to_lowercase();
    if target_email.is_empty() || !target_email.contains('@') {
        return Err(AppError::BadRequest(
            "Inserisci un indirizzo email valido".to_string(),
        ));
    }

    if target_email == user.email.to_lowercase() {
        return Err(AppError::BadRequest(
            "Sei già il proprietario di questa cartella".to_string(),
        ));
    }

    let role = payload.role.trim().to_lowercase();
    if role != "editor" && role != "viewer" {
        return Err(AppError::BadRequest(
            "Il ruolo deve essere 'editor' o 'viewer'".to_string(),
        ));
    }

    let existing: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM vault_members WHERE vault_id = $1 AND LOWER(member_email) = LOWER($2)",
    )
    .bind(&vault_id)
    .bind(&target_email)
    .fetch_optional(&state.db)
    .await?;

    if existing.is_some() {
        return Err(AppError::Conflict(
            "Questo utente ha già accesso alla cartella".to_string(),
        ));
    }

    let existing_user: Option<(String,)> =
        sqlx::query_as("SELECT id FROM users WHERE LOWER(email) = LOWER($1)")
            .bind(&target_email)
            .fetch_optional(&state.db)
            .await?;

    let member_id = Uuid::new_v4().to_string();
    let now = Utc::now();

    sqlx::query(
        r#"
        INSERT INTO vault_members (id, vault_id, user_id, member_email, role, shared_by, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        "#,
    )
    .bind(&member_id)
    .bind(&vault_id)
    .bind(existing_user.map(|(id,)| id))
    .bind(&target_email)
    .bind(&role)
    .bind(&user.id)
    .bind(now)
    .execute(&state.db)
    .await?;

    record_audit(
        &state.db,
        &vault_id,
        None,
        &user,
        "vault.shared",
        &format!("Cartella condivisa con {} (ruolo: {})", target_email, role),
    )
    .await?;

    let dto = fetch_single_vault(&state.db, &vault_id, &user).await?;
    Ok((StatusCode::CREATED, Json(dto)))
}

pub async fn update_member_role(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path((vault_id, member_id)): Path<(String, String)>,
    Json(payload): Json<UpdateMemberRoleRequest>,
) -> AppResult<Json<VaultDto>> {
    require_vault_role(&state.db, &vault_id, &user, &["owner"]).await?;

    let new_role = payload.role.trim().to_lowercase();
    if new_role != "editor" && new_role != "viewer" {
        return Err(AppError::BadRequest(
            "Il ruolo deve essere 'editor' o 'viewer'".to_string(),
        ));
    }

    let member: Option<(String, String)> = sqlx::query_as(
        "SELECT role, member_email FROM vault_members WHERE id = $1 AND vault_id = $2",
    )
    .bind(&member_id)
    .bind(&vault_id)
    .fetch_optional(&state.db)
    .await?;

    let (curr_role, member_email) =
        member.ok_or_else(|| AppError::NotFound("Membro non trovato".to_string()))?;

    if curr_role == "owner" {
        return Err(AppError::BadRequest(
            "Non è possibile modificare il ruolo del proprietario".to_string(),
        ));
    }

    sqlx::query("UPDATE vault_members SET role = $1 WHERE id = $2 AND vault_id = $3")
        .bind(&new_role)
        .bind(&member_id)
        .bind(&vault_id)
        .execute(&state.db)
        .await?;

    record_audit(
        &state.db,
        &vault_id,
        None,
        &user,
        "vault.member_updated",
        &format!("Ruolo di {} aggiornato a {}", member_email, new_role),
    )
    .await?;

    let dto = fetch_single_vault(&state.db, &vault_id, &user).await?;
    Ok(Json(dto))
}

pub async fn remove_member(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path((vault_id, member_id)): Path<(String, String)>,
) -> AppResult<StatusCode> {
    user.require_write_permission()?;
    let caller_role =
        require_vault_role(&state.db, &vault_id, &user, &["owner", "editor", "viewer"]).await?;

    let target: Option<(Option<String>, String, String)> = sqlx::query_as(
        "SELECT user_id, member_email, role FROM vault_members WHERE id = $1 AND vault_id = $2",
    )
    .bind(&member_id)
    .bind(&vault_id)
    .fetch_optional(&state.db)
    .await?;

    let (target_user_id, target_email, target_role) =
        target.ok_or_else(|| AppError::NotFound("Membro non trovato".to_string()))?;

    if target_role == "owner" {
        return Err(AppError::BadRequest(
            "Il proprietario non può essere rimosso dalla cartella".to_string(),
        ));
    }

    let is_self = target_user_id.as_deref() == Some(user.id.as_str())
        || target_email.eq_ignore_ascii_case(&user.email);

    if caller_role != "owner" && !is_self {
        return Err(AppError::Forbidden(
            "Solo il proprietario può rimuovere altri membri".to_string(),
        ));
    }

    sqlx::query("DELETE FROM vault_members WHERE id = $1 AND vault_id = $2")
        .bind(&member_id)
        .bind(&vault_id)
        .execute(&state.db)
        .await?;

    record_audit(
        &state.db,
        &vault_id,
        None,
        &user,
        "vault.member_removed",
        &format!("Accesso revocato per {}", target_email),
    )
    .await?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn get_vault_audit(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(vault_id): Path<String>,
) -> AppResult<Json<Vec<AuditLogDto>>> {
    require_vault_role(&state.db, &vault_id, &user, &["owner", "editor", "viewer"]).await?;

    let logs: Vec<AuditLogDto> = sqlx::query_as(
        r#"
        SELECT id, vault_id, credential_id, actor_id, actor_email, actor_name, action, details, created_at
        FROM audit_logs
        WHERE vault_id = $1
        ORDER BY created_at DESC
        LIMIT 50
        "#,
    )
    .bind(&vault_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(logs))
}
