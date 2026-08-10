use std::sync::Arc;
use std::time::Duration;

use teloxide::prelude::*;
use tracing::{error, info};

use crate::{
    db,
    enforcement::{announce_terms_update, post_reminder, run_kicks},
    handlers::BotState,
};

pub fn spawn(state: Arc<BotState>, bot: Bot) {
    let reminder_hours = state.config.reminder_interval_hours;
    let terms_minutes = state.config.terms_poll_interval_minutes;
    let enforce_minutes = state.config.enforcement_interval_minutes;

    let boot_bot = bot.clone();
    let boot_state = state.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_secs(30)).await;
        for chat in &boot_state.config.allowed_chats {
            let chat_id = chat.chat_id;
            if let Err(e) = post_reminder(
                &boot_bot,
                &boot_state.pool,
                &boot_state.config,
                &boot_state.api,
                chat_id,
            )
            .await
            {
                error!(?e, chat_id, "startup reminder failed");
            }
        }
    });

    tokio::spawn(reminder_loop(bot.clone(), state.clone(), reminder_hours));
    tokio::spawn(terms_poll_loop(bot.clone(), state.clone(), terms_minutes));
    tokio::spawn(enforcement_loop(bot, state, enforce_minutes));
}

async fn reminder_loop(bot: Bot, state: Arc<BotState>, interval_hours: u64) {
    let interval = Duration::from_secs(interval_hours * 3600);
    loop {
        tokio::time::sleep(interval).await;
        for chat in &state.config.allowed_chats {
            if let Err(e) =
                post_reminder(&bot, &state.pool, &state.config, &state.api, chat.chat_id).await
            {
                error!(?e, chat_id = chat.chat_id, "reminder failed");
            }
        }
        info!("posted scheduled reminders");
    }
}

async fn terms_poll_loop(bot: Bot, state: Arc<BotState>, interval_minutes: u64) {
    let interval = Duration::from_secs(interval_minutes * 60);
    loop {
        tokio::time::sleep(interval).await;
        for chat in &state.config.allowed_chats {
            let chat_id = chat.chat_id;
            match state.api.latest_version(chat_id).await {
                Ok(Some(current)) => {
                    let known = db::get_last_known_version(&state.pool, chat_id)
                        .await
                        .ok()
                        .flatten();
                    if known.as_deref() != Some(current.as_str()) {
                        info!(chat_id, version = %current, "terms version changed");
                        if let Err(e) = announce_terms_update(
                            &bot,
                            &state.pool,
                            &state.config,
                            &state.api,
                            chat_id,
                            &current,
                        )
                        .await
                        {
                            error!(?e, chat_id, "terms announcement failed");
                        }
                    } else if known.is_none() {
                        let _ = db::set_last_known_version(&state.pool, chat_id, &current).await;
                    }
                }
                Ok(None) => {}
                Err(e) => error!(?e, chat_id, "terms poll failed"),
            }
        }
    }
}

async fn enforcement_loop(bot: Bot, state: Arc<BotState>, interval_minutes: u64) {
    let interval = Duration::from_secs(interval_minutes * 60);
    loop {
        tokio::time::sleep(interval).await;
        if let Err(e) = run_kicks(&bot, &state.pool, &state.config, &state.api).await {
            error!(?e, "enforcement kick pass failed");
        }
    }
}
