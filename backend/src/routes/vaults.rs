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
        AuditLogDto, CreateVaultRequest, ShareVaultGroupRequest, ShareVaultRequest,
        UpdateMemberRoleRequest, UpdateVaultGroupRoleRequest, UpdateVaultRequest, VaultDto,
        VaultGroupShareDto, VaultMemberDto,
    },
    routes::{groups::get_user_group_role, record_audit, record_system_audit, require_vault_role},
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
    owner_group_id: Option<String>,
    owner_group_name: Option<String>,
    owner_group_color: Option<String>,
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

#[derive(Debug, FromRow)]
struct VaultGroupRow {
    id: String,
    vault_id: String,
    group_id: String,
    group_name: String,
    group_color: String,
    member_count: i64,
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

async fn load_vault_groups(
    db: &PgPool,
    vault_id: &str,
    owner_group_id: Option<&str>,
) -> AppResult<Vec<VaultGroupShareDto>> {
    let rows: Vec<VaultGroupRow> = sqlx::query_as(
        r#"
        SELECT
            vg.id,
            vg.vault_id,
            vg.group_id,
            g.name AS group_name,
            g.color AS group_color,
            (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) AS member_count,
            vg.role,
            vg.created_at
        FROM vault_groups vg
        INNER JOIN groups g ON g.id = vg.group_id
        WHERE vg.vault_id = $1
        ORDER BY
            CASE WHEN vg.group_id = $2 THEN 0 ELSE 1 END,
            LOWER(g.name) ASC
        "#,
    )
    .bind(vault_id)
    .bind(owner_group_id)
    .fetch_all(db)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| VaultGroupShareDto {
            is_owner_group: owner_group_id == Some(r.group_id.as_str()),
            id: r.id,
            vault_id: r.vault_id,
            group_id: r.group_id,
            group_name: r.group_name,
            group_color: r.group_color,
            member_count: r.member_count,
            role: r.role,
            created_at: r.created_at,
        })
        .collect())
}

async fn count_effective_vault_members(
    db: &PgPool,
    vault_id: &str,
    owner_group_id: Option<&str>,
) -> AppResult<i64> {
    let (count,): (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(DISTINCT email_lower)
        FROM (
            SELECT LOWER(vm.member_email) AS email_lower
            FROM vault_members vm
            WHERE vm.vault_id = $1

            UNION

            SELECT LOWER(gm.member_email) AS email_lower
            FROM vault_groups vg
            INNER JOIN group_members gm ON gm.group_id = vg.group_id
            WHERE vg.vault_id = $1

            UNION

            SELECT LOWER(gm.member_email) AS email_lower
            FROM group_members gm
            WHERE $2::TEXT IS NOT NULL AND gm.group_id = $2
        ) AS all_people
        "#,
    )
    .bind(vault_id)
    .bind(owner_group_id)
    .fetch_one(db)
    .await?;

    Ok(count)
}

async fn build_vault_dto(
    db: &PgPool,
    row: VaultRow,
    current_user_id: &str,
) -> AppResult<VaultDto> {
    let members = load_vault_members(db, &row.id).await?;
    let shared_groups = load_vault_groups(db, &row.id, row.owner_group_id.as_deref()).await?;
    let member_count =
        count_effective_vault_members(db, &row.id, row.owner_group_id.as_deref()).await?;
    let group_count = shared_groups.len() as i64;
    let is_shared = member_count > 1 || group_count > 0 || row.owner_group_id.is_some();
    let is_shared_with_me = row.owner_group_id.is_none() && row.owner_id != current_user_id;

    Ok(VaultDto {
        id: row.id,
        name: row.name,
        description: row.description,
        icon: row.icon,
        color: row.color,
        owner_id: row.owner_id,
        owner_name: row.owner_name,
        owner_email: row.owner_email,
        owner_group_id: row.owner_group_id,
        owner_group_name: row.owner_group_name,
        owner_group_color: row.owner_group_color,
        is_personal: row.is_personal,
        role: row.role,
        is_shared,
        is_shared_with_me,
        member_count,
        group_count,
        credential_count: row.credential_count,
        members,
        shared_groups,
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
                WHERE vm.vault_id = $1
                  AND (vm.user_id = $2 OR LOWER(vm.member_email) = LOWER($3))

                UNION ALL

                SELECT
                    vg.vault_id,
                    CASE vg.role WHEN 'editor' THEN 2 ELSE 1 END AS role_rank
                FROM vault_groups vg
                INNER JOIN group_members gm ON gm.group_id = vg.group_id
                WHERE vg.vault_id = $1
                  AND (gm.user_id = $2 OR LOWER(gm.member_email) = LOWER($3))

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
                WHERE v.id = $1
                  AND v.owner_group_id IS NOT NULL
                  AND (gm.user_id = $2 OR LOWER(gm.member_email) = LOWER($3))
            ) AS raw_roles
            GROUP BY vault_id
        )
        SELECT
            v.id,
            v.name,
            v.description,
            v.icon,
            v.color,
            v.owner_id,
            owner.name AS owner_name,
            owner.email AS owner_email,
            v.owner_group_id,
            og.name AS owner_group_name,
            og.color AS owner_group_color,
            v.is_personal,
            uvr.role,
            (SELECT COUNT(*) FROM credentials c WHERE c.vault_id = v.id) AS credential_count,
            v.created_at,
            v.updated_at
        FROM vaults v
        INNER JOIN user_vault_roles uvr ON uvr.vault_id = v.id
        INNER JOIN users owner ON owner.id = v.owner_id
        LEFT JOIN groups og ON og.id = v.owner_group_id
        WHERE v.id = $1
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
    let vaults = list_vaults_for_user(&state, &user).await?;
    Ok(Json(vaults))
}

pub(crate) async fn list_vaults_for_user(
    state: &AppState,
    user: &AuthenticatedUser,
) -> AppResult<Vec<VaultDto>> {
    if let Some(ref sa) = user.service_account {
        if sa.vault_ids.is_empty() {
            return Ok(Vec::new());
        }

        let sa_role = user.service_account_vault_role().unwrap_or("viewer");
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
                v.owner_group_id,
                og.name AS owner_group_name,
                og.color AS owner_group_color,
                v.is_personal,
                $2::TEXT AS role,
                (SELECT COUNT(*) FROM credentials c WHERE c.vault_id = v.id) AS credential_count,
                v.created_at,
                v.updated_at
            FROM vaults v
            INNER JOIN users owner ON owner.id = v.owner_id
            LEFT JOIN groups og ON og.id = v.owner_group_id
            WHERE v.id = ANY($1)
            ORDER BY LOWER(v.name) ASC
            "#,
        )
        .bind(&sa.vault_ids)
        .bind(sa_role)
        .fetch_all(&state.db)
        .await?;

        let vaults = rows
            .into_iter()
            .map(|row| VaultDto {
                id: row.id,
                name: row.name,
                description: row.description,
                icon: row.icon,
                color: row.color,
                owner_id: row.owner_id,
                owner_name: row.owner_name,
                owner_email: row.owner_email,
                owner_group_id: row.owner_group_id,
                owner_group_name: row.owner_group_name,
                owner_group_color: row.owner_group_color,
                is_personal: row.is_personal,
                role: row.role,
                is_shared: false,
                is_shared_with_me: true,
                member_count: 0,
                group_count: 0,
                credential_count: row.credential_count,
                members: Vec::new(),
                shared_groups: Vec::new(),
                created_at: row.created_at,
                updated_at: row.updated_at,
            })
            .collect();

        return Ok(vaults);
    }

    let rows: Vec<VaultRow> = sqlx::query_as(
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
            v.id,
            v.name,
            v.description,
            v.icon,
            v.color,
            v.owner_id,
            owner.name AS owner_name,
            owner.email AS owner_email,
            v.owner_group_id,
            og.name AS owner_group_name,
            og.color AS owner_group_color,
            v.is_personal,
            uvr.role,
            (SELECT COUNT(*) FROM credentials c WHERE c.vault_id = v.id) AS credential_count,
            v.created_at,
            v.updated_at
        FROM vaults v
        INNER JOIN user_vault_roles uvr ON uvr.vault_id = v.id
        INNER JOIN users owner ON owner.id = v.owner_id
        LEFT JOIN groups og ON og.id = v.owner_group_id
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

    Ok(vaults)
}

pub async fn create_vault(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Json(payload): Json<CreateVaultRequest>,
) -> AppResult<(StatusCode, Json<VaultDto>)> {
    let dto = create_vault_for_user(&state, &user, payload, None).await?;
    Ok((StatusCode::CREATED, Json(dto)))
}

pub(crate) async fn create_vault_for_user(
    state: &AppState,
    user: &AuthenticatedUser,
    payload: CreateVaultRequest,
    audit_suffix: Option<&str>,
) -> AppResult<VaultDto> {
    user.require_non_service_account()?;
    user.require_write_permission()?;
    if user.is_vault_restricted_api_key() {
        let msg = if user.mcp_key.is_some() {
            "Questa chiave MCP è limitata a cartelle specifiche e non può creare nuove cartelle"
        } else {
            "Questa API Key è limitata a cartelle specifiche e non può creare nuove cartelle"
        };
        return Err(AppError::Forbidden(msg.to_string()));
    }

    let name = payload.name.trim();
    if name.is_empty() || name.len() > 80 {
        return Err(AppError::BadRequest(
            "Il nome della cartella deve essere tra 1 e 80 caratteri".to_string(),
        ));
    }

    let owner_group_id = payload
        .owner_group_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned);

    let mut owner_group_name: Option<String> = None;
    let group_role = match payload.group_role.as_deref().map(str::trim) {
        Some(r) if !r.is_empty() => {
            let normalized = r.to_lowercase();
            if normalized != "editor" && normalized != "viewer" {
                return Err(AppError::BadRequest(
                    "Il ruolo del gruppo deve essere 'editor' o 'viewer'".to_string(),
                ));
            }
            normalized
        }
        _ => "editor".to_string(),
    };

    if let Some(ref gid) = owner_group_id {
        let group_row: Option<(String,)> =
            sqlx::query_as("SELECT name FROM groups WHERE id = $1")
                .bind(gid)
                .fetch_optional(&state.db)
                .await?;
        let (gname,) =
            group_row.ok_or_else(|| AppError::NotFound("Gruppo non trovato".to_string()))?;

        let membership = get_user_group_role(&state.db, gid, user).await?;
        if membership.is_none() {
            return Err(AppError::Forbidden(
                "Devi essere membro del gruppo per creare una cartella a nome del gruppo"
                    .to_string(),
            ));
        }

        owner_group_name = Some(gname);
    }

    let vault_id = Uuid::new_v4().to_string();
    let now = Utc::now();

    let mut tx = state.db.begin().await?;

    sqlx::query(
        r#"
        INSERT INTO vaults (
            id, name, description, icon, color, owner_id, owner_group_id, is_personal, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, $8, $8)
        "#,
    )
    .bind(&vault_id)
    .bind(name)
    .bind(payload.description.trim())
    .bind(payload.icon.trim())
    .bind(payload.color.trim())
    .bind(&user.id)
    .bind(&owner_group_id)
    .bind(now)
    .execute(&mut *tx)
    .await?;

    if let Some(ref gid) = owner_group_id {
        let share_id = Uuid::new_v4().to_string();
        sqlx::query(
            r#"
            INSERT INTO vault_groups (id, vault_id, group_id, role, shared_by, created_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            "#,
        )
        .bind(&share_id)
        .bind(&vault_id)
        .bind(gid)
        .bind(&group_role)
        .bind(&user.id)
        .bind(now)
        .execute(&mut *tx)
        .await?;
    } else {
        let member_id = Uuid::new_v4().to_string();
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
    }

    tx.commit().await?;

    let mut audit_details = if let Some(ref gname) = owner_group_name {
        format!(
            "Cartella '{}' creata a nome del gruppo '{}' (permessi membri: {})",
            name, gname, group_role
        )
    } else {
        format!("Cartella '{}' creata", name)
    };
    if let Some(tag) = audit_suffix {
        audit_details.push_str(&format!(" [{tag}]"));
    }

    record_audit(
        &state.db,
        &vault_id,
        None,
        user,
        "vault.created",
        &audit_details,
    )
    .await?;

    fetch_single_vault(&state.db, &vault_id, user).await
}

pub async fn update_vault(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(vault_id): Path<String>,
    Json(payload): Json<UpdateVaultRequest>,
) -> AppResult<Json<VaultDto>> {
    user.require_non_service_account()?;
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
    user.require_non_service_account()?;
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

    let mut tx = state.db.begin().await?;

    sqlx::query(
        r#"
        UPDATE service_accounts
        SET vault_ids = array_remove(vault_ids, $1),
            credential_ids = ARRAY(
                SELECT cid
                FROM unnest(credential_ids) AS cid
                WHERE cid NOT IN (SELECT id FROM credentials WHERE vault_id = $1)
            )
        WHERE $1 = ANY(vault_ids)
           OR EXISTS (
                SELECT 1
                FROM credentials c
                WHERE c.vault_id = $1
                  AND c.id = ANY(service_accounts.credential_ids)
           )
        "#,
    )
    .bind(&vault_id)
    .execute(&mut *tx)
    .await?;

    sqlx::query("DELETE FROM vaults WHERE id = $1")
        .bind(&vault_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

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
    user.require_non_service_account()?;
    require_vault_role(&state.db, &vault_id, &user, &["owner"]).await?;

    let role = payload.role.trim().to_lowercase();
    if role != "editor" && role != "viewer" {
        return Err(AppError::BadRequest(
            "Il ruolo deve essere 'editor' o 'viewer'".to_string(),
        ));
    }

    let requested_user_id = payload
        .user_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());

    let (target_user_id, target_email) = if let Some(uid) = requested_user_id {
        if uid == user.id {
            return Err(AppError::BadRequest(
                "Sei già il proprietario di questa cartella".to_string(),
            ));
        }

        let target_user: Option<(String, String)> = sqlx::query_as(
            "SELECT id, email FROM users WHERE id = $1 AND is_service_account = FALSE",
        )
        .bind(uid)
        .fetch_optional(&state.db)
        .await?;

        let (found_id, found_email) = target_user
            .ok_or_else(|| AppError::NotFound("Utente selezionato non trovato".to_string()))?;

        let normalized_email = found_email.trim().to_lowercase();
        if normalized_email == user.email.to_lowercase() {
            return Err(AppError::BadRequest(
                "Sei già il proprietario di questa cartella".to_string(),
            ));
        }

        (Some(found_id), normalized_email)
    } else {
        let target_email = payload
            .email
            .as_deref()
            .unwrap_or_default()
            .trim()
            .to_lowercase();
        if target_email.is_empty() || !target_email.contains('@') {
            return Err(AppError::BadRequest(
                "Seleziona un utente valido".to_string(),
            ));
        }

        if target_email == user.email.to_lowercase() {
            return Err(AppError::BadRequest(
                "Sei già il proprietario di questa cartella".to_string(),
            ));
        }

        let existing_user: Option<(String,)> = sqlx::query_as(
            "SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND is_service_account = FALSE",
        )
        .bind(&target_email)
        .fetch_optional(&state.db)
        .await?;

        (existing_user.map(|(id,)| id), target_email)
    };

    let existing: Option<(String,)> = sqlx::query_as(
        r#"
        SELECT id
        FROM vault_members
        WHERE vault_id = $1
          AND (LOWER(member_email) = LOWER($2) OR ($3::TEXT IS NOT NULL AND user_id = $3))
        "#,
    )
    .bind(&vault_id)
    .bind(&target_email)
    .bind(&target_user_id)
    .fetch_optional(&state.db)
    .await?;

    if existing.is_some() {
        return Err(AppError::Conflict(
            "Questo utente ha già accesso alla cartella".to_string(),
        ));
    }

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
    .bind(&target_user_id)
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
    user.require_non_service_account()?;
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
    user.require_non_service_account()?;
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

pub async fn share_vault_with_group(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(vault_id): Path<String>,
    Json(payload): Json<ShareVaultGroupRequest>,
) -> AppResult<(StatusCode, Json<VaultDto>)> {
    require_vault_role(&state.db, &vault_id, &user, &["owner"]).await?;

    let group_id = payload.group_id.trim();
    if group_id.is_empty() {
        return Err(AppError::BadRequest("Seleziona un gruppo valido".to_string()));
    }

    let role = payload.role.trim().to_lowercase();
    if role != "editor" && role != "viewer" {
        return Err(AppError::BadRequest(
            "Il ruolo deve essere 'editor' o 'viewer'".to_string(),
        ));
    }

    let group: Option<(String,)> = sqlx::query_as("SELECT name FROM groups WHERE id = $1")
        .bind(group_id)
        .fetch_optional(&state.db)
        .await?;
    let (group_name,) =
        group.ok_or_else(|| AppError::NotFound("Gruppo non trovato".to_string()))?;

    let existing: Option<(String,)> =
        sqlx::query_as("SELECT id FROM vault_groups WHERE vault_id = $1 AND group_id = $2")
            .bind(&vault_id)
            .bind(group_id)
            .fetch_optional(&state.db)
            .await?;

    if existing.is_some() {
        return Err(AppError::Conflict(
            "Questa cartella è già condivisa con questo gruppo".to_string(),
        ));
    }

    let share_id = Uuid::new_v4().to_string();
    let now = Utc::now();

    sqlx::query(
        r#"
        INSERT INTO vault_groups (id, vault_id, group_id, role, shared_by, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        "#,
    )
    .bind(&share_id)
    .bind(&vault_id)
    .bind(group_id)
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
        "vault.group_shared",
        &format!(
            "Cartella condivisa con il gruppo '{}' (ruolo: {})",
            group_name, role
        ),
    )
    .await?;

    let dto = fetch_single_vault(&state.db, &vault_id, &user).await?;
    Ok((StatusCode::CREATED, Json(dto)))
}

pub async fn update_vault_group_role(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path((vault_id, group_id)): Path<(String, String)>,
    Json(payload): Json<UpdateVaultGroupRoleRequest>,
) -> AppResult<Json<VaultDto>> {
    require_vault_role(&state.db, &vault_id, &user, &["owner"]).await?;

    let new_role = payload.role.trim().to_lowercase();
    if new_role != "editor" && new_role != "viewer" {
        return Err(AppError::BadRequest(
            "Il ruolo deve essere 'editor' o 'viewer'".to_string(),
        ));
    }

    let existing: Option<(String,)> = sqlx::query_as(
        r#"
        SELECT g.name
        FROM vault_groups vg
        INNER JOIN groups g ON g.id = vg.group_id
        WHERE vg.vault_id = $1 AND vg.group_id = $2
        "#,
    )
    .bind(&vault_id)
    .bind(&group_id)
    .fetch_optional(&state.db)
    .await?;

    let (group_name,) =
        existing.ok_or_else(|| AppError::NotFound("Condivisione gruppo non trovata".to_string()))?;

    sqlx::query("UPDATE vault_groups SET role = $1 WHERE vault_id = $2 AND group_id = $3")
        .bind(&new_role)
        .bind(&vault_id)
        .bind(&group_id)
        .execute(&state.db)
        .await?;

    record_audit(
        &state.db,
        &vault_id,
        None,
        &user,
        "vault.group_updated",
        &format!(
            "Ruolo del gruppo '{}' aggiornato a {}",
            group_name, new_role
        ),
    )
    .await?;

    let dto = fetch_single_vault(&state.db, &vault_id, &user).await?;
    Ok(Json(dto))
}

pub async fn remove_vault_group(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path((vault_id, group_id)): Path<(String, String)>,
) -> AppResult<StatusCode> {
    require_vault_role(&state.db, &vault_id, &user, &["owner"]).await?;

    let vault_owner_group: Option<(Option<String>,)> =
        sqlx::query_as("SELECT owner_group_id FROM vaults WHERE id = $1")
            .bind(&vault_id)
            .fetch_optional(&state.db)
            .await?;

    if let Some((Some(ref og_id),)) = vault_owner_group {
        if og_id == &group_id {
            return Err(AppError::BadRequest(
                "Non è possibile rimuovere il gruppo proprietario della cartella".to_string(),
            ));
        }
    }

    let existing: Option<(String,)> = sqlx::query_as(
        r#"
        SELECT g.name
        FROM vault_groups vg
        INNER JOIN groups g ON g.id = vg.group_id
        WHERE vg.vault_id = $1 AND vg.group_id = $2
        "#,
    )
    .bind(&vault_id)
    .bind(&group_id)
    .fetch_optional(&state.db)
    .await?;

    let (group_name,) =
        existing.ok_or_else(|| AppError::NotFound("Condivisione gruppo non trovata".to_string()))?;

    sqlx::query("DELETE FROM vault_groups WHERE vault_id = $1 AND group_id = $2")
        .bind(&vault_id)
        .bind(&group_id)
        .execute(&state.db)
        .await?;

    record_audit(
        &state.db,
        &vault_id,
        None,
        &user,
        "vault.group_removed",
        &format!("Accesso revocato per il gruppo '{}'", group_name),
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
