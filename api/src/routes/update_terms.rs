use axum::{extract::State, routing::get, Json, Router};

use crate::{
    error::AppResult,
    terms::{sync_terms_from_url, TermsSyncOutcome},
    AppState,
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/update_terms", get(update_terms).post(update_terms))
}

async fn update_terms(State(state): State<AppState>) -> AppResult<Json<TermsSyncOutcome>> {
    let outcome = sync_terms_from_url(&state.pool, &state.config.terms_gitlab_raw_url).await?;
    Ok(Json(outcome))
}
