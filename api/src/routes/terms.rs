use axum::{
    extract::{Query, State},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};

use crate::{
    error::{AppError, AppResult},
    property::resolve_property,
    terms::{get_latest_terms, get_terms_by_label},
    AppState,
};

#[derive(Debug, Deserialize)]
pub struct PropertyQuery {
    pub property: String,
}

#[derive(Debug, Serialize)]
pub struct SignUrls {
    pub telegram: String,
    pub evm: String,
    pub terra_classic: String,
    pub solana: String,
}

#[derive(Debug, Serialize)]
pub struct TermsLatestResponse {
    pub property: String,
    pub version_label: String,
    pub effective_date: String,
    pub content_sha256: String,
    pub published_at: String,
    pub sign_urls: SignUrls,
}

fn build_sign_urls(base: &str, property: &str) -> SignUrls {
    let q = urlencoding::encode(property);
    let base = base.trim_end_matches('/');
    SignUrls {
        telegram: format!("{base}/sign/telegram?property={q}"),
        evm: format!("{base}/sign/evm?property={q}"),
        terra_classic: format!("{base}/sign/terra-classic?property={q}"),
        solana: format!("{base}/sign/solana?property={q}"),
    }
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/terms/latest", get(latest))
        .route("/terms/latest/content", get(latest_content))
        .route("/terms/{version_label}", get(by_version))
}

async fn latest(State(state): State<AppState>, Query(q): Query<PropertyQuery>) -> AppResult<Json<TermsLatestResponse>> {
    let prop = resolve_property(&state.pool, &q.property, state.config.allow_localhost_property).await?;
    let terms = get_latest_terms(&state.pool)
        .await?
        .ok_or_else(|| AppError::NotFound("no published terms".into()))?;

    let property_id = prop.identifier.clone();
    Ok(Json(TermsLatestResponse {
        property: property_id.clone(),
        version_label: terms.version_label.clone(),
        effective_date: terms.effective_date.to_string(),
        content_sha256: terms.content_sha256,
        published_at: terms.published_at.to_rfc3339(),
        sign_urls: build_sign_urls(&state.config.legal_public_base_url, &property_id),
    }))
}

async fn latest_content(
    State(state): State<AppState>,
    Query(q): Query<PropertyQuery>,
) -> AppResult<impl IntoResponse> {
    let prop = resolve_property(&state.pool, &q.property, state.config.allow_localhost_property).await?;
    let terms = get_latest_terms(&state.pool)
        .await?
        .ok_or_else(|| AppError::NotFound("no published terms".into()))?;

    let mut headers = axum::http::HeaderMap::new();
    headers.insert(
        axum::http::header::CONTENT_TYPE,
        axum::http::HeaderValue::from_static("text/plain; charset=utf-8"),
    );
    if let Ok(v) = axum::http::HeaderValue::from_str(&prop.identifier) {
        headers.insert("x-cl8y-property", v);
    }
    Ok((headers, terms.content_text))
}

async fn by_version(
    State(state): State<AppState>,
    axum::extract::Path(version_label): axum::extract::Path<String>,
    Query(q): Query<PropertyQuery>,
) -> AppResult<Json<TermsLatestResponse>> {
    let prop = resolve_property(&state.pool, &q.property, state.config.allow_localhost_property).await?;
    let terms = get_terms_by_label(&state.pool, &version_label)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("version {version_label}")))?;

    let property_id = prop.identifier.clone();
    Ok(Json(TermsLatestResponse {
        property: property_id.clone(),
        version_label: terms.version_label,
        effective_date: terms.effective_date.to_string(),
        content_sha256: terms.content_sha256,
        published_at: terms.published_at.to_rfc3339(),
        sign_urls: build_sign_urls(&state.config.legal_public_base_url, &property_id),
    }))
}
