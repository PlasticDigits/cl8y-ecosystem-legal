pub mod admin;
pub mod signatures;
pub mod terms;
pub mod update_terms;

use axum::extract::DefaultBodyLimit;
use axum::Router;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;

use crate::{config::Config, rate_limit::rate_limit_middleware, AppState};

/// Cap JSON wallet/telegram submits (message + sig + pubkey). Legal messages are small.
const MAX_REQUEST_BODY_BYTES: usize = 64 * 1024;

pub fn build_router(state: AppState) -> Router {
    let cors = build_cors(&state.config);

    let api = Router::new()
        .merge(terms::routes())
        .merge(signatures::routes());

    let admin = admin::routes();

    let static_dir = state.config.static_dir.clone();

    let mut app = Router::new()
        .merge(update_terms::routes())
        .nest("/api/v1", api)
        .nest("/admin", admin)
        .layer(DefaultBodyLimit::max(MAX_REQUEST_BODY_BYTES))
        .layer(axum::middleware::from_fn_with_state(
            state.rate_limit.clone(),
            rate_limit_middleware,
        ))
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .with_state(state);

    if let Some(dir) = static_dir {
        app = app.fallback_service(tower_http::services::ServeDir::new(dir));
    }

    app
}

fn build_cors(config: &Config) -> CorsLayer {
    if config.cors_origins.len() == 1 && config.cors_origins[0] == "*" {
        CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any)
    } else {
        let origins: Vec<_> = config
            .cors_origins
            .iter()
            .filter_map(|o| o.parse().ok())
            .collect();
        CorsLayer::new()
            .allow_origin(origins)
            .allow_methods(Any)
            .allow_headers(Any)
    }
}
