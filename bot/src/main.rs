mod api_client;
mod config;
mod db;
mod enforcement;
mod handlers;
mod messages;
mod scheduler;

use std::sync::Arc;

use handlers::BotState;
use teloxide::prelude::*;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "cl8y_terms_bot=info,teloxide=warn".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = config::Config::from_env()?;
    let bot = Bot::new(&config.telegram_bot_token);
    let config = config.resolve_chats(&bot).await?;
    let pool = db::connect(&config.database_url).await?;
    let api = api_client::LegalApi::new(&config);

    let me = bot.get_me().await?;
    tracing::info!(
        username = ?me.username,
        groups = config.allowed_chats.len(),
        "cl8y terms bot started"
    );
    for chat in &config.allowed_chats {
        tracing::info!(chat_id = chat.chat_id, label = %chat.label, "allowed group");
    }

    let state = Arc::new(BotState {
        config: config.clone(),
        pool,
        api,
    });

    scheduler::spawn(state.clone(), bot.clone());

    let message_handler = Update::filter_message().endpoint(
        |bot: Bot, state: Arc<BotState>, msg: Message| async move {
            handlers::on_message(bot, state, msg).await
        },
    );

    let member_handler = Update::filter_chat_member().endpoint(
        |bot: Bot, state: Arc<BotState>, update: ChatMemberUpdated| async move {
            handlers::on_chat_member(bot, state, update).await
        },
    );

    Dispatcher::builder(
        bot,
        dptree::entry()
            .branch(message_handler)
            .branch(member_handler),
    )
    .dependencies(dptree::deps![state])
    .enable_ctrlc_handler()
    .build()
    .dispatch()
    .await;

    Ok(())
}
