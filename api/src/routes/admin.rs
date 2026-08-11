use axum::{
    extract::{Path, State},
    http::HeaderMap,
    routing::{delete, get},
    Json, Router,
};
use serde::{Deserialize, Serialize};

use crate::{
    auth::require_admin,
    error::{AppError, AppResult},
    property::{normalize_property, PropertyKind},
    AppState,
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/properties", get(list_properties).post(register_property))
        .route("/properties/{kind}/{identifier}", delete(delete_property))
}

#[derive(Debug, Serialize)]
pub struct PropertyListItem {
    pub kind: String,
    pub identifier: String,
    pub display_name: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct RegisterPropertyBody {
    /// Website hostname (e.g. `dex.cl8y.com`) or Telegram channel chat_id (negative).
    pub property: String,
    pub display_name: Option<String>,
}

fn kind_label(kind: PropertyKind) -> String {
    match kind {
        PropertyKind::Website => "website".to_string(),
        PropertyKind::TelegramChannel => "telegram_channel".to_string(),
    }
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
                    kind: kind_label(kind),
                    identifier,
                    display_name,
                    created_at: created_at.to_rfc3339(),
                },
            )
            .collect(),
    ))
}

/// Upsert a property (website hostname or Telegram chat_id). Requires admin Bearer.
async fn register_property(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<RegisterPropertyBody>,
) -> AppResult<Json<PropertyListItem>> {
    require_admin(&headers, &state.config.admin_token)?;
    let (kind, identifier) =
        normalize_property(&body.property, state.config.allow_localhost_property)?;
    let display_name = body
        .display_name
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let (kind, identifier, display_name, created_at) = sqlx::query_as::<
        _,
        (
            PropertyKind,
            String,
            Option<String>,
            chrono::DateTime<chrono::Utc>,
        ),
    >(
        r#"
        INSERT INTO properties (kind, identifier, display_name)
        VALUES ($1, $2, $3)
        ON CONFLICT (kind, identifier) DO UPDATE SET
            display_name = COALESCE(EXCLUDED.display_name, properties.display_name)
        RETURNING kind, identifier, display_name, created_at
        "#,
    )
    .bind(kind)
    .bind(&identifier)
    .bind(&display_name)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(PropertyListItem {
        kind: kind_label(kind),
        identifier,
        display_name,
        created_at: created_at.to_rfc3339(),
    }))
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
