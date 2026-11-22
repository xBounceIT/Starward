use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::{
    auth::AuthenticatedUser,
    error::{AppError, AppResult},
    models::{
        AddGroupMemberRequest, CreateGroupRequest, GroupDto, GroupMemberDto, GroupSummaryDto,
        UpdateGroupMemberRoleRequest, UpdateGroupRequest,
    },
    routes::record_system_audit,
    AppState,
};

#[derive(Debug, Deserialize)]
pub struct SearchGroupsQuery {
    pub q: Option<String>,
}

#[derive(Debug, FromRow)]
struct GroupRow {
    id: String,
    name: String,
    description: String,
    color: String,
    created_by: String,
    created_by_name: String,
    my_role: Option<String>,
    vault_count: i64,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(Debug, FromRow)]
struct GroupSummaryRow {
    id: String,
    name: String,
    description: String,
    color: String,
    member_count: i64,
    vault_count: i64,
    my_role: Option<String>,
}

#[derive(Debug, FromRow)]
struct GroupMemberRow {
    id: String,
    group_id: String,
    user_id: Option<String>,
    member_email: String,
    user_name: Option<String>,
    user_image: Option<String>,
    role: String,
    created_at: DateTime<Utc>,
}

async fn load_group_members(db: &PgPool, group_id: &str) -> AppResult<Vec<GroupMemberDto>> {
    let rows: Vec<GroupMemberRow> = sqlx::query_as(
        r#"
        SELECT
            gm.id,
            gm.group_id,
            gm.user_id,
            gm.member_email,
            u.name AS user_name,
            u.image AS user_image,
            gm.role,
            gm.created_at
        FROM group_members gm
        LEFT JOIN users u ON u.id = gm.user_id
        WHERE gm.group_id = $1
        ORDER BY
            CASE gm.role WHEN 'owner' THEN 0 ELSE 1 END,
            LOWER(COALESCE(u.name, gm.member_email)) ASC
        "#,
    )
    .bind(group_id)
    .fetch_all(db)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| GroupMemberDto {
            id: r.id,
            group_id: r.group_id,
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

async fn build_group_dto(
    db: &PgPool,
    row: GroupRow,
    user: &AuthenticatedUser,
) -> AppResult<GroupDto> {
    let members = load_group_members(db, &row.id).await?;
    let member_count = members.len() as i64;
    let can_manage = user.is_admin() || row.my_role.as_deref() == Some("owner");

    Ok(GroupDto {
        id: row.id,
        name: row.name,
        description: row.description,
        color: row.color,
        created_by: row.created_by,
        created_by_name: row.created_by_name,
        my_role: row.my_role,
        can_manage,
        member_count,
        vault_count: row.vault_count,
        members,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

pub async fn get_user_group_role(
    db: &PgPool,
    group_id: &str,
    user: &AuthenticatedUser,
) -> AppResult<Option<String>> {
    let row: Option<(String,)> = sqlx::query_as(
        r#"
        SELECT role
        FROM group_members
        WHERE group_id = $1
          AND (user_id = $2 OR LOWER(member_email) = LOWER($3))
        LIMIT 1
        "#,
    )
    .bind(group_id)
    .bind(&user.id)
    .bind(&user.email)
    .fetch_optional(db)
    .await?;

    Ok(row.map(|(role,)| role))
}

async fn require_group_manager(
    db: &PgPool,
    group_id: &str,
    user: &AuthenticatedUser,
) -> AppResult<()> {
    user.require_write_permission()?;
    if user.is_vault_restricted_api_key() {
        return Err(AppError::Forbidden(
            "Questa API Key è limitata a cartelle specifiche e non può gestire i gruppi"
                .to_string(),
        ));
    }

    let exists: Option<(String,)> = sqlx::query_as("SELECT id FROM groups WHERE id = $1")
        .bind(group_id)
        .fetch_optional(db)
        .await?;
    if exists.is_none() {
        return Err(AppError::NotFound("Gruppo non trovato".to_string()));
    }

    if user.is_admin() {
        return Ok(());
    }

    let role = get_user_group_role(db, group_id, user).await?;
    if role.as_deref() != Some("owner") {
        return Err(AppError::Forbidden(
            "Solo i gestori del gruppo o un amministratore possono eseguire questa operazione"
                .to_string(),
        ));
    }

    Ok(())
}

async fn fetch_single_group(
    db: &PgPool,
    group_id: &str,
    user: &AuthenticatedUser,
) -> AppResult<GroupDto> {
    let row: Option<GroupRow> = sqlx::query_as(
        r#"
        SELECT
            g.id,
            g.name,
            g.description,
            g.color,
            g.created_by,
            creator.name AS created_by_name,
            (
                SELECT gm.role
                FROM group_members gm
                WHERE gm.group_id = g.id
                  AND (gm.user_id = $2 OR LOWER(gm.member_email) = LOWER($3))
                LIMIT 1
            ) AS my_role,
            (
                SELECT COUNT(DISTINCT vid)
                FROM (
                    SELECT v.id AS vid FROM vaults v WHERE v.owner_group_id = g.id
                    UNION
                    SELECT vg.vault_id AS vid FROM vault_groups vg WHERE vg.group_id = g.id
                ) AS gv
            ) AS vault_count,
            g.created_at,
            g.updated_at
        FROM groups g
        INNER JOIN users creator ON creator.id = g.created_by
        WHERE g.id = $1
        LIMIT 1
        "#,
    )
    .bind(group_id)
    .bind(&user.id)
    .bind(&user.email)
    .fetch_optional(db)
    .await?;

    let row = row.ok_or_else(|| AppError::NotFound("Gruppo non trovato".to_string()))?;

    if !user.is_admin() && row.my_role.is_none() {
        return Err(AppError::NotFound("Gruppo non trovato".to_string()));
    }

    build_group_dto(db, row, user).await
}

pub async fn list_groups(
    State(state): State<AppState>,
    user: AuthenticatedUser,
) -> AppResult<Json<Vec<GroupDto>>> {
    user.require_non_service_account()?;
    let rows: Vec<GroupRow> = sqlx::query_as(
        r#"
        SELECT
            g.id,
            g.name,
            g.description,
            g.color,
            g.created_by,
            creator.name AS created_by_name,
            gm.role AS my_role,
            (
                SELECT COUNT(DISTINCT vid)
                FROM (
                    SELECT v.id AS vid FROM vaults v WHERE v.owner_group_id = g.id
                    UNION
                    SELECT vg.vault_id AS vid FROM vault_groups vg WHERE vg.group_id = g.id
                ) AS gv
            ) AS vault_count,
            g.created_at,
            g.updated_at
        FROM groups g
        INNER JOIN group_members gm ON gm.group_id = g.id
        INNER JOIN users creator ON creator.id = g.created_by
        WHERE gm.user_id = $1 OR LOWER(gm.member_email) = LOWER($2)
        ORDER BY LOWER(g.name) ASC
        "#,
    )
    .bind(&user.id)
    .bind(&user.email)
    .fetch_all(&state.db)
    .await?;

    let mut groups = Vec::with_capacity(rows.len());
    for row in rows {
        groups.push(build_group_dto(&state.db, row, &user).await?);
    }

    Ok(Json(groups))
}

pub async fn search_groups_directory(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Query(query): Query<SearchGroupsQuery>,
) -> AppResult<Json<Vec<GroupSummaryDto>>> {
    user.require_non_service_account()?;
    let search = query.q.unwrap_or_default().trim().to_lowercase();
    let pattern = format!("%{}%", search);

    let rows: Vec<GroupSummaryRow> = sqlx::query_as(
        r#"
        SELECT
            g.id,
            g.name,
            g.description,
            g.color,
            (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) AS member_count,
            (
                SELECT COUNT(DISTINCT vid)
                FROM (
                    SELECT v.id AS vid FROM vaults v WHERE v.owner_group_id = g.id
                    UNION
                    SELECT vg.vault_id AS vid FROM vault_groups vg WHERE vg.group_id = g.id
                ) AS gv
            ) AS vault_count,
            (
                SELECT gm.role
                FROM group_members gm
                WHERE gm.group_id = g.id
                  AND (gm.user_id = $1 OR LOWER(gm.member_email) = LOWER($2))
                LIMIT 1
            ) AS my_role
        FROM groups g
        WHERE $3 = '%%' OR g.name ILIKE $3 OR g.description ILIKE $3
        ORDER BY LOWER(g.name) ASC
        LIMIT 50
        "#,
    )
    .bind(&user.id)
    .bind(&user.email)
    .bind(&pattern)
    .fetch_all(&state.db)
    .await?;

    let result = rows
        .into_iter()
        .map(|r| GroupSummaryDto {
            id: r.id,
            name: r.name,
            description: r.description,
            color: r.color,
            member_count: r.member_count,
            vault_count: r.vault_count,
            my_role: r.my_role,
        })
        .collect();

    Ok(Json(result))
}

pub async fn list_admin_groups(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Query(query): Query<SearchGroupsQuery>,
) -> AppResult<Json<Vec<GroupDto>>> {
    user.require_admin()?;

    let search = query.q.unwrap_or_default().trim().to_lowercase();
    let pattern = format!("%{}%", search);

    let rows: Vec<GroupRow> = sqlx::query_as(
        r#"
        SELECT
            g.id,
            g.name,
            g.description,
            g.color,
            g.created_by,
            creator.name AS created_by_name,
            (
                SELECT gm.role
                FROM group_members gm
                WHERE gm.group_id = g.id
                  AND (gm.user_id = $1 OR LOWER(gm.member_email) = LOWER($2))
                LIMIT 1
            ) AS my_role,
            (
                SELECT COUNT(DISTINCT vid)
                FROM (
                    SELECT v.id AS vid FROM vaults v WHERE v.owner_group_id = g.id
                    UNION
                    SELECT vg.vault_id AS vid FROM vault_groups vg WHERE vg.group_id = g.id
                ) AS gv
            ) AS vault_count,
            g.created_at,
            g.updated_at
        FROM groups g
        INNER JOIN users creator ON creator.id = g.created_by
        WHERE $3 = '%%' OR g.name ILIKE $3 OR g.description ILIKE $3
        ORDER BY LOWER(g.name) ASC
        "#,
    )
    .bind(&user.id)
    .bind(&user.email)
    .bind(&pattern)
    .fetch_all(&state.db)
    .await?;

    let mut groups = Vec::with_capacity(rows.len());
    for row in rows {
        groups.push(build_group_dto(&state.db, row, &user).await?);
    }

    Ok(Json(groups))
}

pub async fn get_group(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(group_id): Path<String>,
) -> AppResult<Json<GroupDto>> {
    user.require_non_service_account()?;
    let dto = fetch_single_group(&state.db, &group_id, &user).await?;
    Ok(Json(dto))
}

pub async fn create_group(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Json(payload): Json<CreateGroupRequest>,
) -> AppResult<(StatusCode, Json<GroupDto>)> {
    user.require_non_service_account()?;
    user.require_write_permission()?;
    if user.is_vault_restricted_api_key() {
        return Err(AppError::Forbidden(
            "Questa API Key è limitata a cartelle specifiche e non può creare nuovi gruppi"
                .to_string(),
        ));
    }

    let name = payload.name.trim();
    if name.is_empty() || name.len() > 80 {
        return Err(AppError::BadRequest(
            "Il nome del gruppo deve essere tra 1 e 80 caratteri".to_string(),
        ));
    }

    let color = normalize_color(&payload.color);

    let existing: Option<(String,)> =
        sqlx::query_as("SELECT id FROM groups WHERE LOWER(name) = LOWER($1)")
            .bind(name)
            .fetch_optional(&state.db)
            .await?;

    if existing.is_some() {
        return Err(AppError::Conflict(
            "Esiste già un gruppo con questo nome".to_string(),
        ));
    }

    let group_id = Uuid::new_v4().to_string();
    let owner_member_id = Uuid::new_v4().to_string();
    let now = Utc::now();

    let mut tx = state.db.begin().await?;

    sqlx::query(
        r#"
        INSERT INTO groups (id, name, description, color, created_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $6)
        "#,
    )
    .bind(&group_id)
    .bind(name)
    .bind(payload.description.trim())
    .bind(&color)
    .bind(&user.id)
    .bind(now)
    .execute(&mut *tx)
    .await?;

    // Creator is automatically added as group owner
    sqlx::query(
        r#"
        INSERT INTO group_members (id, group_id, user_id, member_email, role, added_by, created_at)
        VALUES ($1, $2, $3, $4, 'owner', $3, $5)
        "#,
    )
    .bind(&owner_member_id)
    .bind(&group_id)
    .bind(&user.id)
    .bind(user.email.to_lowercase())
    .bind(now)
    .execute(&mut *tx)
    .await?;

    // Optionally add initial members by platform user id
    let mut seen_user_ids = std::collections::HashSet::new();
    seen_user_ids.insert(user.id.clone());

    for raw_id in &payload.member_ids {
        let target_id = raw_id.trim();
        if target_id.is_empty() || !seen_user_ids.insert(target_id.to_string()) {
            continue;
        }

        let existing_user: Option<(String, String)> = sqlx::query_as(
            "SELECT id, LOWER(email) FROM users WHERE id = $1 AND is_service_account = FALSE",
        )
        .bind(target_id)
        .fetch_optional(&mut *tx)
        .await?;

        let Some((target_user_id, target_email)) = existing_user else {
            return Err(AppError::BadRequest(format!(
                "Utente '{}' non trovato sulla piattaforma",
                target_id
            )));
        };

        let member_id = Uuid::new_v4().to_string();
        sqlx::query(
            r#"
            INSERT INTO group_members (id, group_id, user_id, member_email, role, added_by, created_at)
            VALUES ($1, $2, $3, $4, 'member', $5, $6)
            ON CONFLICT (group_id, LOWER(member_email)) DO NOTHING
            "#,
        )
        .bind(&member_id)
        .bind(&group_id)
        .bind(&target_user_id)
        .bind(&target_email)
        .bind(&user.id)
        .bind(now)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    record_system_audit(
        &state.db,
        &user,
        "group.created",
        "group",
        Some(&group_id),
        &format!("Gruppo '{}' creato", name),
    )
    .await?;

    let dto = fetch_single_group(&state.db, &group_id, &user).await?;
    Ok((StatusCode::CREATED, Json(dto)))
}

pub async fn update_group(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(group_id): Path<String>,
    Json(payload): Json<UpdateGroupRequest>,
) -> AppResult<Json<GroupDto>> {
    require_group_manager(&state.db, &group_id, &user).await?;

    let existing: Option<(String, String, String)> =
        sqlx::query_as("SELECT name, description, color FROM groups WHERE id = $1")
            .bind(&group_id)
            .fetch_optional(&state.db)
            .await?;

    let (curr_name, curr_desc, curr_color) =
        existing.ok_or_else(|| AppError::NotFound("Gruppo non trovato".to_string()))?;

    let new_name = payload
        .name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(&curr_name);

    if new_name.len() > 80 {
        return Err(AppError::BadRequest(
            "Il nome del gruppo non può superare 80 caratteri".to_string(),
        ));
    }

    if !new_name.eq_ignore_ascii_case(&curr_name) {
        let duplicate: Option<(String,)> =
            sqlx::query_as("SELECT id FROM groups WHERE LOWER(name) = LOWER($1) AND id != $2")
                .bind(new_name)
                .bind(&group_id)
                .fetch_optional(&state.db)
                .await?;
        if duplicate.is_some() {
            return Err(AppError::Conflict(
                "Esiste già un gruppo con questo nome".to_string(),
            ));
        }
    }

    let new_desc = payload
        .description
        .as_deref()
        .map(str::trim)
        .unwrap_or(&curr_desc);
    let new_color = payload
        .color
        .as_deref()
        .map(normalize_color)
        .unwrap_or(curr_color);

    let now = Utc::now();

    sqlx::query(
        r#"
        UPDATE groups
        SET name = $1, description = $2, color = $3, updated_at = $4
        WHERE id = $5
        "#,
    )
    .bind(new_name)
    .bind(new_desc)
    .bind(&new_color)
    .bind(now)
    .bind(&group_id)
    .execute(&state.db)
    .await?;

    record_system_audit(
        &state.db,
        &user,
        "group.updated",
        "group",
        Some(&group_id),
        &format!("Gruppo '{}' aggiornato", new_name),
    )
    .await?;

    let dto = fetch_single_group(&state.db, &group_id, &user).await?;
    Ok(Json(dto))
}

pub async fn delete_group(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(group_id): Path<String>,
) -> AppResult<StatusCode> {
    require_group_manager(&state.db, &group_id, &user).await?;

    let group_name: String = sqlx::query_scalar("SELECT name FROM groups WHERE id = $1")
        .bind(&group_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Gruppo non trovato".to_string()))?;

    let mut tx = state.db.begin().await?;

    // Preserve any vaults created on behalf of this group by ensuring their creator retains direct owner access
    let owned_vaults: Vec<(String, String, String)> = sqlx::query_as(
        r#"
        SELECT v.id, v.owner_id, u.email
        FROM vaults v
        INNER JOIN users u ON u.id = v.owner_id
        WHERE v.owner_group_id = $1
        "#,
    )
    .bind(&group_id)
    .fetch_all(&mut *tx)
    .await?;

    let now = Utc::now();
    for (vault_id, owner_id, owner_email) in owned_vaults {
        let member_id = Uuid::new_v4().to_string();
        sqlx::query(
            r#"
            INSERT INTO vault_members (id, vault_id, user_id, member_email, role, shared_by, created_at)
            VALUES ($1, $2, $3, $4, 'owner', $3, $5)
            ON CONFLICT (vault_id, LOWER(member_email)) DO UPDATE
                SET role = 'owner', user_id = EXCLUDED.user_id
            "#,
        )
        .bind(&member_id)
        .bind(&vault_id)
        .bind(&owner_id)
        .bind(owner_email.to_lowercase())
        .bind(now)
        .execute(&mut *tx)
        .await?;
    }

    sqlx::query("DELETE FROM groups WHERE id = $1")
        .bind(&group_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    record_system_audit(
        &state.db,
        &user,
        "group.deleted",
        "group",
        Some(&group_id),
        &format!("Gruppo '{}' eliminato", group_name),
    )
    .await?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn add_group_member(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(group_id): Path<String>,
    Json(payload): Json<AddGroupMemberRequest>,
) -> AppResult<(StatusCode, Json<GroupDto>)> {
    require_group_manager(&state.db, &group_id, &user).await?;

    let target_user_id = payload.user_id.trim();
    if target_user_id.is_empty() {
        return Err(AppError::BadRequest(
            "Seleziona un utente della piattaforma".to_string(),
        ));
    }

    let role = payload.role.trim().to_lowercase();
    if role != "owner" && role != "member" {
        return Err(AppError::BadRequest(
            "Il ruolo nel gruppo deve essere 'owner' o 'member'".to_string(),
        ));
    }

    let target_user: Option<(String, String)> = sqlx::query_as(
        "SELECT id, LOWER(email) FROM users WHERE id = $1 AND is_service_account = FALSE",
    )
    .bind(target_user_id)
    .fetch_optional(&state.db)
    .await?;

    let Some((target_user_id, target_email)) = target_user else {
        return Err(AppError::BadRequest(
            "Utente non trovato sulla piattaforma".to_string(),
        ));
    };

    let existing: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM group_members WHERE group_id = $1 AND (user_id = $2 OR LOWER(member_email) = LOWER($3))",
    )
    .bind(&group_id)
    .bind(&target_user_id)
    .bind(&target_email)
    .fetch_optional(&state.db)
    .await?;

    if existing.is_some() {
        return Err(AppError::Conflict(
            "Questo utente fa già parte del gruppo".to_string(),
        ));
    }

    let member_id = Uuid::new_v4().to_string();
    let now = Utc::now();

    sqlx::query(
        r#"
        INSERT INTO group_members (id, group_id, user_id, member_email, role, added_by, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        "#,
    )
    .bind(&member_id)
    .bind(&group_id)
    .bind(&target_user_id)
    .bind(&target_email)
    .bind(&role)
    .bind(&user.id)
    .bind(now)
    .execute(&state.db)
    .await?;

    sqlx::query("UPDATE groups SET updated_at = $1 WHERE id = $2")
        .bind(now)
        .bind(&group_id)
        .execute(&state.db)
        .await?;

    record_system_audit(
        &state.db,
        &user,
        "group.member_added",
        "group",
        Some(&group_id),
        &format!("Utente {} aggiunto al gruppo (ruolo: {})", target_email, role),
    )
    .await?;

    let dto = fetch_single_group(&state.db, &group_id, &user).await?;
    Ok((StatusCode::CREATED, Json(dto)))
}

pub async fn update_group_member_role(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path((group_id, member_id)): Path<(String, String)>,
    Json(payload): Json<UpdateGroupMemberRoleRequest>,
) -> AppResult<Json<GroupDto>> {
    require_group_manager(&state.db, &group_id, &user).await?;

    let new_role = payload.role.trim().to_lowercase();
    if new_role != "owner" && new_role != "member" {
        return Err(AppError::BadRequest(
            "Il ruolo nel gruppo deve essere 'owner' o 'member'".to_string(),
        ));
    }

    let member: Option<(String,)> =
        sqlx::query_as("SELECT role FROM group_members WHERE id = $1 AND group_id = $2")
            .bind(&member_id)
            .bind(&group_id)
            .fetch_optional(&state.db)
            .await?;

    let (curr_role,) =
        member.ok_or_else(|| AppError::NotFound("Membro del gruppo non trovato".to_string()))?;

    if curr_role == "owner" && new_role == "member" {
        let (owner_count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM group_members WHERE group_id = $1 AND role = 'owner'",
        )
        .bind(&group_id)
        .fetch_one(&state.db)
        .await?;
        if owner_count <= 1 {
            return Err(AppError::BadRequest(
                "Il gruppo deve avere almeno un gestore".to_string(),
            ));
        }
    }

    sqlx::query("UPDATE group_members SET role = $1 WHERE id = $2 AND group_id = $3")
        .bind(&new_role)
        .bind(&member_id)
        .bind(&group_id)
        .execute(&state.db)
        .await?;

    record_system_audit(
        &state.db,
        &user,
        "group.member_updated",
        "group",
        Some(&group_id),
        &format!("Ruolo membro {} nel gruppo aggiornato a {}", member_id, new_role),
    )
    .await?;

    let dto = fetch_single_group(&state.db, &group_id, &user).await?;
    Ok(Json(dto))
}

pub async fn remove_group_member(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path((group_id, member_id)): Path<(String, String)>,
) -> AppResult<StatusCode> {
    user.require_write_permission()?;

    let target: Option<(Option<String>, String, String)> = sqlx::query_as(
        "SELECT user_id, member_email, role FROM group_members WHERE id = $1 AND group_id = $2",
    )
    .bind(&member_id)
    .bind(&group_id)
    .fetch_optional(&state.db)
    .await?;

    let (target_user_id, target_email, target_role) =
        target.ok_or_else(|| AppError::NotFound("Membro del gruppo non trovato".to_string()))?;

    let is_self = target_user_id.as_deref() == Some(user.id.as_str())
        || target_email.eq_ignore_ascii_case(&user.email);

    let caller_group_role = get_user_group_role(&state.db, &group_id, &user).await?;
    let can_manage = user.is_admin() || caller_group_role.as_deref() == Some("owner");

    if !can_manage && !is_self {
        return Err(AppError::Forbidden(
            "Solo i gestori del gruppo possono rimuovere altri membri".to_string(),
        ));
    }

    if target_role == "owner" {
        let (owner_count, total_count): (i64, i64) = sqlx::query_as(
            r#"
            SELECT
                COUNT(*) FILTER (WHERE role = 'owner'),
                COUNT(*)
            FROM group_members
            WHERE group_id = $1
            "#,
        )
        .bind(&group_id)
        .fetch_one(&state.db)
        .await?;

        if owner_count <= 1 && total_count > 1 {
            return Err(AppError::BadRequest(
                "Promuovi un altro membro a gestore prima di rimuovere l'ultimo gestore del gruppo"
                    .to_string(),
            ));
        }

        if owner_count <= 1 && total_count <= 1 && !user.is_admin() {
            return Err(AppError::BadRequest(
                "Sei l'ultimo membro del gruppo: elimina il gruppo invece di lasciarlo".to_string(),
            ));
        }
    }

    sqlx::query("DELETE FROM group_members WHERE id = $1 AND group_id = $2")
        .bind(&member_id)
        .bind(&group_id)
        .execute(&state.db)
        .await?;

    record_system_audit(
        &state.db,
        &user,
        "group.member_removed",
        "group",
        Some(&group_id),
        &format!("Utente {} rimosso dal gruppo", target_email),
    )
    .await?;

    Ok(StatusCode::NO_CONTENT)
}

fn is_hex_color(value: &str) -> bool {
    let Some(hex) = value.strip_prefix('#') else {
        return false;
    };
    (hex.len() == 3 || hex.len() == 6) && hex.chars().all(|c| c.is_ascii_hexdigit())
}

fn normalize_color(input: &str) -> String {
    let value = input.trim().to_lowercase();
    match value.as_str() {
        "indigo" | "emerald" | "amber" | "rose" | "sky" | "violet" | "orange" | "lime" => {
            value
        }
        _ if is_hex_color(&value) => value,
        _ => "indigo".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_color_accepts_known_and_falls_back_to_indigo() {
        assert_eq!(normalize_color("emerald"), "emerald");
        assert_eq!(normalize_color(" SKY "), "sky");
        assert_eq!(normalize_color("violet"), "violet");
        assert_eq!(normalize_color("orange"), "orange");
        assert_eq!(normalize_color("lime"), "lime");
        assert_eq!(normalize_color("neon-pink"), "indigo");
    }

    #[test]
    fn normalize_color_accepts_hex_colors() {
        assert_eq!(normalize_color("#FF8800"), "#ff8800");
        assert_eq!(normalize_color(" #0af "), "#0af");
        assert_eq!(normalize_color("#12345"), "indigo");
        assert_eq!(normalize_color("#gggggg"), "indigo");
        assert_eq!(normalize_color("ff8800"), "indigo");
    }
}
