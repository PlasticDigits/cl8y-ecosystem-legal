pub mod account;
pub mod config;
pub mod error;
pub mod message;
pub mod property;
pub mod rate_limit;
pub mod routes;
pub mod signatures;
pub mod telegram;
pub mod terms;
pub mod terms_worker;
pub mod verify;

use std::sync::Arc;

use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;

use crate::config::Config;
use crate::rate_limit::RateLimitState;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: Arc<Config>,
    pub rate_limit: RateLimitState,
}

pub async fn build_state(config: Config) -> anyhow::Result<AppState> {
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&config.database_url)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    let rate_limit = RateLimitState::new(config.rate_limit_read, config.rate_limit_write);

    let state = AppState {
        pool: pool.clone(),
        config: Arc::new(config.clone()),
        rate_limit,
    };

    if config.terms_sync_on_startup {
        match terms::sync_terms_from_url(&pool, &config.terms_gitlab_raw_url).await {
            Ok(outcome) => tracing::info!(
                version = %outcome.version_label(),
                "startup terms sync: {:?}",
                outcome
            ),
            Err(e) => tracing::error!("startup terms sync failed: {e:?}"),
        }
    }

    terms_worker::spawn_terms_sync_worker(state.clone());

    Ok(state)
}

pub fn build_app(state: AppState) -> axum::Router {
    routes::build_router(state)
}
