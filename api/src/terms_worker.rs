use std::time::Duration;

use crate::{terms::sync_terms_from_url, AppState};

pub fn spawn_terms_sync_worker(state: AppState) {
    let pool = state.pool.clone();
    let url = state.config.terms_gitlab_raw_url.clone();
    let hours = state.config.terms_sync_interval_hours;
    let force_downgrade = state.config.force_terms_downgrade;

    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(hours * 3600));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        // Skip the immediate first tick (startup already syncs).
        interval.tick().await;

        loop {
            interval.tick().await;
            match sync_terms_from_url(&pool, &url, force_downgrade).await {
                Ok(outcome) => {
                    tracing::info!(
                        version = %outcome.version_label(),
                        status = ?outcome,
                        "scheduled terms sync"
                    );
                }
                Err(e) => tracing::error!("scheduled terms sync failed: {e:?}"),
            }
        }
    });
}
