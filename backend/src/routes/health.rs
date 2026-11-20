use axum::{extract::State, Json};
use serde_json::{json, Value};

use crate::{error::AppResult, AppState};

pub async fn health_check(State(state): State<AppState>) -> AppResult<Json<Value>> {
    sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(&state.db)
        .await?;

    Ok(Json(json!({
        "status": "ok",
        "service": "starward-backend",
        "database": "postgresql",
        "encryption": "AES-256-GCM"
    })))
}
