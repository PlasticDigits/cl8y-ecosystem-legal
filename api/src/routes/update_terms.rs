//! On-demand terms sync (authenticated ops endpoint).
//!
//! # Invariants
//! - Requires `Authorization: Bearer <ADMIN_TOKEN>` (same token as `/admin/*`).
//! - POST-only (no GET) to avoid accidental CSRF-ish browser navigation triggers.
//! - Auth is checked **before** the 1 req/s rate limit so unauthenticated floods
//!   return 401 without exhausting the ops bucket or hitting GitLab/DB publish.
//! - Unattended sync remains `TERMS_SYNC_ON_STARTUP` + interval worker — not this route.
//! - Sync is hash-aware / anti-downgrade (see `terms::sync`); `FORCE_TERMS_DOWNGRADE` is
//!   the only rollback escape hatch.

use axum::{
    extract::{Request, State},
    routing::post,
    Json, Router,
};

use crate::{
    auth::require_admin,
    error::AppResult,
    terms::{sync_terms_from_url, TermsSyncOutcome},
    AppState,
};

pub fn routes() -> Router<AppState> {
    Router::new().route("/update_terms", post(update_terms))
}

async fn update_terms(
    State(state): State<AppState>,
    req: Request,
) -> AppResult<Json<TermsSyncOutcome>> {
    require_admin(req.headers(), &state.config.admin_token)?;
    let ip = state.rate_limit.client_ip(&req);
    state.rate_limit.check_update_terms(ip)?;
    let outcome = sync_terms_from_url(
        &state.pool,
        &state.config.terms_gitlab_raw_url,
        state.config.force_terms_downgrade,
    )
    .await?;
    Ok(Json(outcome))
}
