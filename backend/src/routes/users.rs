use axum::{
    extract::{Query, State},
    Json,
};
use serde::Deserialize;

use crate::{
    auth::AuthenticatedUser,
    error::AppResult,
    models::{UserRecord, UserSummary},
    AppState,
};

#[derive(Debug, Deserialize)]
pub struct SearchUsersQuery {
    pub q: Option<String>,
}

pub async fn get_me(user: AuthenticatedUser) -> Json<UserSummary> {
    Json(UserSummary {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        role: user.role,
    })
}

pub async fn list_users(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Query(query): Query<SearchUsersQuery>,
) -> AppResult<Json<Vec<UserSummary>>> {
    let pattern = format!("%{}%", query.q.unwrap_or_default().trim());

    let users: Vec<UserRecord> = sqlx::query_as(
        r#"
        SELECT id, email, name, image, role, created_at, last_seen_at
        FROM users
        WHERE id != $1
          AND (email ILIKE $2 OR name ILIKE $2)
        ORDER BY LOWER(name) ASC
        LIMIT 25
        "#,
    )
    .bind(&user.id)
    .bind(&pattern)
    .fetch_all(&state.db)
    .await?;

    let result = users
        .into_iter()
        .map(|u| UserSummary {
            id: u.id,
            email: u.email,
            name: u.name,
            image: u.image,
            role: u.role,
        })
        .collect();

    Ok(Json(result))
}
