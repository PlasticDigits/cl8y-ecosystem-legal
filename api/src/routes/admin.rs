use axum::{
    extract::{Path, State},
    http::HeaderMap,
    routing::{delete, get},
    Json, Router,
};
use serde::Serialize;

use crate::{
    auth::require_admin,
    error::{AppError, AppResult},
    property::{normalize_property, PropertyKind},
    AppState,
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/properties", get(list_properties))
        .route("/properties/{kind}/{identifier}", delete(delete_property))
}

#[derive(Debug, Serialize)]
pub struct PropertyListItem {
    pub kind: String,
    pub identifier: String,
    pub display_name: Option<String>,
    pub created_at: String,
}

async fn list_properties(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Json<Vec<PropertyListItem>>> {
    require_admin(&headers, &state.config.admin_token)?;
    let rows = sqlx::query_as::<_, (PropertyKind, String, Option<String>, chrono::DateTime<chrono::Utc>)>(
        "SELECT kind, identifier, display_name, created_at FROM properties ORDER BY created_at DESC",
    )
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(
        rows.into_iter()
            .map(
                |(kind, identifier, display_name, created_at)| PropertyListItem {
                    kind: match kind {
                        PropertyKind::Website => "website".to_string(),
                        PropertyKind::TelegramChannel => "telegram_channel".to_string(),
                    },
                    identifier,
                    display_name,
                    created_at: created_at.to_rfc3339(),
                },
            )
            .collect(),
    ))
}

async fn delete_property(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((kind, identifier)): Path<(String, String)>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&headers, &state.config.admin_token)?;
    let kind = match kind.as_str() {
        "website" => PropertyKind::Website,
        "telegram_channel" => PropertyKind::TelegramChannel,
        _ => return Err(AppError::BadRequest("invalid kind".into())),
    };
    let (_, id) = normalize_property(&identifier, state.config.allow_localhost_property)?;

    let result = sqlx::query("DELETE FROM properties WHERE kind = $1 AND identifier = $2")
        .bind(kind)
        .bind(&id)
        .execute(&state.pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("property not found".into()));
    }
    Ok(Json(serde_json::json!({ "deleted": true })))
}
