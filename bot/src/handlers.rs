use std::sync::Arc;

use teloxide::prelude::*;
use teloxide::types::{
    InlineKeyboardButton, InlineKeyboardMarkup, MessageEntityKind, ParseMode, WebAppInfo,
};
use tracing::warn;

use crate::{api_client::LegalApi, config::Config, enforcement, messages::private_start_intro};

pub struct BotState {
    pub config: Config,
    pub pool: sqlx::PgPool,
    pub api: LegalApi,
}

pub async fn on_message(bot: Bot, state: Arc<BotState>, msg: Message) -> ResponseResult<()> {
    let me = bot.get_me().await?;
    let bot_user = me.username.as_deref();

    if is_command(&msg, "chatid", bot_user) && (msg.chat.is_group() || msg.chat.is_supergroup()) {
        reply_chat_id(&bot, &msg).await?;
        return Ok(());
    }

    if let Some(ref user) = msg.from {
        if !user.is_bot && (msg.chat.is_group() || msg.chat.is_supergroup()) {
            let chat_id = msg.chat.id.0;
            if state.config.is_allowed_chat(chat_id) {
                if let Err(e) = enforcement::handle_group_message(
                    &state.pool,
                    &state.config,
                    &state.api,
                    chat_id,
                    user.id.0 as i64,
                )
                .await
                {
                    warn!(?e, "group message compliance check");
                }
            }
        }
    }

    if !msg.chat.is_private() {
        return Ok(());
    }

    let text = msg.text().unwrap_or("").trim();
    if text == "/start" || text.starts_with("/start ") || is_command(&msg, "start", bot_user) {
        send_sign_menu(&bot, &state.config, msg.chat.id).await?;
    }

    Ok(())
}

/// True for `/cmd` and `/cmd@botname` (required in groups when BotFather privacy mode is on).
fn is_command(msg: &Message, cmd: &str, bot_username: Option<&str>) -> bool {
    let Some(text) = msg.text() else {
        return false;
    };
    let text = text.trim();
    let base = format!("/{cmd}");
    if text == base {
        return true;
    }
    if let Some(u) = bot_username {
        let with_bot = format!("{base}@{u}");
        if text == with_bot || text.starts_with(&format!("{with_bot} ")) {
            return true;
        }
    }
    if let Some(entities) = msg.entities() {
        for entity in entities {
            if !matches!(entity.kind, MessageEntityKind::BotCommand) {
                continue;
            }
            let start = entity.offset;
            let end = start + entity.length;
            let Some(slice) = text.get(start..end) else {
                continue;
            };
            if slice == base {
                return true;
            }
            if let Some(u) = bot_username {
                if slice == format!("{base}@{u}") {
                    return true;
                }
            }
        }
    }
    false
}

async fn reply_chat_id(bot: &Bot, msg: &Message) -> ResponseResult<()> {
    let id = msg.chat.id.0;
    let title = msg.chat.title().unwrap_or("group");
    bot.send_message(
        msg.chat.id,
        format!(
            "Chat ID for <b>{title}</b>: <code>{id}</code>\n\n\
            Add to <code>ALLOWED_CHAT_IDS</code> in the bot server config, restart the bot, then re-add it here.\n\n\
            In groups with privacy mode, use <code>/chatid@cl8ytermsbot</code>."
        ),
    )
    .parse_mode(ParseMode::Html)
    .await?;
    Ok(())
}

pub async fn on_chat_member(
    bot: Bot,
    state: Arc<BotState>,
    update: ChatMemberUpdated,
) -> ResponseResult<()> {
    let chat_id = update.chat.id;
    let user = &update.new_chat_member.user;

    if user.is_bot && user.id == bot.get_me().await?.id {
        let was_added = matches!(
            update.old_chat_member.status(),
            teloxide::types::ChatMemberStatus::Left | teloxide::types::ChatMemberStatus::Banned
        ) && !matches!(
            update.new_chat_member.status(),
            teloxide::types::ChatMemberStatus::Left | teloxide::types::ChatMemberStatus::Banned
        );

        if let Err(e) = enforcement::handle_bot_membership(
            bot.clone(),
            state.config.clone(),
            chat_id,
            was_added,
        )
        .await
        {
            warn!(?e, "bot membership handler");
        }
        return Ok(());
    }

    if user.is_bot {
        return Ok(());
    }

    let joined = matches!(
        update.old_chat_member.status(),
        teloxide::types::ChatMemberStatus::Left
            | teloxide::types::ChatMemberStatus::Banned
            | teloxide::types::ChatMemberStatus::Restricted
    ) && matches!(
        update.new_chat_member.status(),
        teloxide::types::ChatMemberStatus::Member
            | teloxide::types::ChatMemberStatus::Administrator
    );

    if joined {
        if let Err(e) = enforcement::handle_member_joined(
            bot,
            state.pool.clone(),
            state.config.clone(),
            state.api.clone(),
            chat_id,
            user.id.0 as i64,
        )
        .await
        {
            warn!(?e, "member join handler");
        }
    }

    Ok(())
}

async fn send_sign_menu(bot: &Bot, config: &Config, dm_chat: ChatId) -> ResponseResult<()> {
    let mut rows: Vec<Vec<InlineKeyboardButton>> = Vec::new();

    for chat in &config.allowed_chats {
        let label = format!("Sign {}", chat.label);
        let url = config.sign_url(chat.chat_id);
        let web_app = WebAppInfo {
            url: url.parse().expect("valid sign url"),
        };
        rows.push(vec![InlineKeyboardButton::web_app(label, web_app)]);
    }

    let sign_all_url = config.sign_all_url();
    rows.push(vec![InlineKeyboardButton::web_app(
        "Sign all groups",
        WebAppInfo {
            url: sign_all_url.parse().expect("valid sign all url"),
        },
    )]);

    let markup = InlineKeyboardMarkup::new(rows);
    let text = private_start_intro(config);

    bot.send_message(dm_chat, text)
        .parse_mode(ParseMode::Html)
        .reply_markup(markup)
        .await?;

    Ok(())
}
