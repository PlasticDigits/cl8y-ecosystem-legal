use axum::{
    extract::{Query, State},
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::{
    account::normalize_account,
    error::{AppError, AppResult},
    message::build_telegram_acceptance_message,
    property::resolve_property,
    signatures::{get_signature_for_account, submit_telegram, submit_wallet},
    telegram::{verify_telegram_login, TelegramAuthPayload},
    terms::get_latest_terms,
    AppState,
};

#[derive(Debug, Deserialize)]
pub struct StatusQuery {
    pub property: String,
    pub network: String,
    pub account: String,
}

#[derive(Debug, Serialize)]
pub struct StatusResponse {
    pub property: String,
    pub latest_version: Option<String>,
    pub signed_latest: bool,
    pub signed_version: Option<String>,
    pub signed_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct WalletSubmitBody {
    pub property: String,
    pub network: String,
    pub account_id: String,
    pub message: String,
    pub signature: String,
    #[serde(default)]
    pub pubkey: Option<String>,
    pub client_timestamp: DateTime<Utc>,
    pub version_label: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TelegramSubmitBody {
    pub property: String,
    pub id: i64,
    pub first_name: String,
    #[serde(default)]
    pub last_name: Option<String>,
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub photo_url: Option<String>,
    pub auth_date: i64,
    pub hash: String,
    pub version_label: Option<String>,
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/signatures/status", get(status))
        .route("/signatures/wallet", post(wallet))
        .route("/signatures/telegram", post(telegram))
}

async fn status(State(state): State<AppState>, Query(q): Query<StatusQuery>) -> AppResult<Json<StatusResponse>> {
    let prop = resolve_property(&state.pool, &q.property, state.config.allow_localhost_property).await?;
    let network = q.network.trim().to_uppercase();
    let account = normalize_account(&network, &q.account)?;

    let latest = get_latest_terms(&state.pool).await?;

    let sig = get_signature_for_account(&state.pool, prop.id, &network, &account).await?;

    let (signed_latest, signed_version, signed_at) = match (&latest, &sig) {
        (Some(latest_terms), Some(row)) => (
            row.terms_version_id == latest_terms.id,
            Some(row.version_label.clone()),
            Some(row.signed_at.to_rfc3339()),
        ),
        (None, Some(row)) => (
            false,
            Some(row.version_label.clone()),
            Some(row.signed_at.to_rfc3339()),
        ),
        _ => (false, None, None),
    };

    Ok(Json(StatusResponse {
        property: prop.identifier,
        latest_version: latest.map(|t| t.version_label),
        signed_latest,
        signed_version,
        signed_at,
    }))
}

async fn wallet(State(state): State<AppState>, Json(body): Json<WalletSubmitBody>) -> AppResult<Json<serde_json::Value>> {
    let proof = serde_json::json!({
        "type": format!("{}_personal_sign", body.network.to_lowercase()),
        "signature": body.signature,
        "pubkey": body.pubkey,
    });

    let row = submit_wallet(
        &state.pool,
        &body.property,
        state.config.allow_localhost_property,
        &body.network,
        &body.account_id,
        &body.message,
        proof,
        body.client_timestamp,
        body.version_label.as_deref(),
    )
    .await?;

    Ok(Json(serde_json::json!({
        "id": row.id,
        "signed_at": row.signed_at.to_rfc3339(),
    })))
}

async fn telegram(
    State(state): State<AppState>,
    Json(body): Json<TelegramSubmitBody>,
) -> AppResult<Json<serde_json::Value>> {
    let bot_token = state
        .config
        .telegram_bot_token
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("telegram login not configured".into()))?;

    let auth = TelegramAuthPayload {
        id: body.id,
        first_name: body.first_name.clone(),
        last_name: body.last_name.clone(),
        username: body.username.clone(),
        photo_url: body.photo_url.clone(),
        auth_date: body.auth_date,
        hash: body.hash.clone(),
    };
    verify_telegram_login(&auth, bot_token)?;

    let client_timestamp = DateTime::from_timestamp(body.auth_date, 0)
        .ok_or_else(|| AppError::BadRequest("invalid auth_date".into()))?
        .with_timezone(&Utc);

    let account_id = body.id.to_string();
    let display = body.username.as_deref().map(|u| format!("@{u}"));

    let prop = resolve_property(&state.pool, &body.property, state.config.allow_localhost_property).await?;
    let terms = if let Some(ref label) = body.version_label {
        crate::terms::get_terms_by_label(&state.pool, label)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("version {label}")))?
    } else {
        get_latest_terms(&state.pool)
            .await?
            .ok_or_else(|| AppError::NotFound("no published terms".into()))?
    };

    let message = build_telegram_acceptance_message(
        &terms.version_label,
        terms.effective_date,
        &prop.identifier,
        &account_id,
        client_timestamp,
    );

    let proof = serde_json::json!({
        "type": "telegram_login",
        "hash": body.hash,
        "auth_date": body.auth_date,
    });

    let row = submit_telegram(
        &state.pool,
        &body.property,
        state.config.allow_localhost_property,
        &account_id,
        &message,
        proof,
        client_timestamp,
        body.version_label.as_deref(),
        display.as_deref(),
    )
    .await?;

    Ok(Json(serde_json::json!({
        "id": row.id,
        "signed_at": row.signed_at.to_rfc3339(),
    })))
}
