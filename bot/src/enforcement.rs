use teloxide::prelude::*;
use teloxide::types::{ChatId, ChatMemberStatus, InputFile, ParseMode};
use tracing::{info, warn};

use crate::{
    api_client::LegalApi,
    config::Config,
    db,
    messages::{
        reminder_text, terms_updated_header, unauthorized_group, welcome_new_member, BOT_ADDED,
    },
};

pub async fn handle_bot_membership(
    bot: Bot,
    config: Config,
    chat_id: ChatId,
    was_added: bool,
) -> anyhow::Result<()> {
    if !config.is_allowed_chat(chat_id.0) {
        let _ = bot
            .send_message(chat_id, unauthorized_group(chat_id.0))
            .parse_mode(ParseMode::Html)
            .await;
        bot.leave_chat(chat_id).await?;
        info!(chat_id = chat_id.0, "left unauthorized group");
        return Ok(());
    }

    if was_added {
        let _ = bot
            .send_message(chat_id, BOT_ADDED)
            .parse_mode(ParseMode::Html)
            .await;
    }
    Ok(())
}

pub async fn handle_member_joined(
    bot: Bot,
    pool: sqlx::PgPool,
    config: Config,
    api: LegalApi,
    chat_id: ChatId,
    user_id: i64,
) -> anyhow::Result<()> {
    if !config.is_allowed_chat(chat_id.0) {
        return Ok(());
    }

    match api.is_signed_latest(chat_id.0, user_id).await {
        Ok(true) => {
            db::clear_compliant(&pool, chat_id.0, user_id).await?;
        }
        Ok(false) => {
            db::mark_non_compliant(&pool, chat_id.0, user_id).await?;
            let version = api
                .latest_version(chat_id.0)
                .await?
                .unwrap_or_else(|| "latest".into());
            let text = welcome_new_member(&config, chat_id.0, &version);
            let _ = bot
                .send_message(chat_id, text)
                .parse_mode(ParseMode::Html)
                .await;
        }
        Err(e) => warn!(?e, "status check failed for new member"),
    }
    Ok(())
}

pub async fn handle_group_message(
    pool: &sqlx::PgPool,
    config: &Config,
    api: &LegalApi,
    chat_id: i64,
    user_id: i64,
) -> anyhow::Result<()> {
    if !config.is_allowed_chat(chat_id) {
        return Ok(());
    }
    if api
        .is_signed_latest(chat_id, user_id)
        .await
        .unwrap_or(false)
    {
        db::clear_compliant(pool, chat_id, user_id).await?;
    } else {
        db::mark_non_compliant(pool, chat_id, user_id).await?;
    }
    Ok(())
}

pub async fn post_reminder(
    bot: &Bot,
    pool: &sqlx::PgPool,
    config: &Config,
    api: &LegalApi,
    chat_id: i64,
) -> anyhow::Result<()> {
    let version = match api.latest_version(chat_id).await? {
        Some(v) => v,
        None => return Ok(()),
    };
    let text = reminder_text(config, chat_id, &version);
    bot.send_message(ChatId(chat_id), text)
        .parse_mode(ParseMode::Html)
        .await?;
    db::touch_reminder(pool, chat_id).await?;
    Ok(())
}

pub async fn announce_terms_update(
    bot: &Bot,
    pool: &sqlx::PgPool,
    config: &Config,
    api: &LegalApi,
    chat_id: i64,
    version: &str,
) -> anyhow::Result<()> {
    let content = api.latest_content(chat_id).await?;
    let header = terms_updated_header(version);

    bot.send_message(ChatId(chat_id), header)
        .parse_mode(ParseMode::Html)
        .await?;

    let excerpt: String = content.chars().take(3900).collect();
    let excerpt_note = if content.chars().count() > 3900 {
        "\n\n…(truncated in chat; see attached file for full text)"
    } else {
        ""
    };
    bot.send_message(ChatId(chat_id), format!("{excerpt}{excerpt_note}"))
        .await?;

    let filename = format!("CL8Y_Terms_{}.txt", version.replace(' ', "_"));
    let bytes = content.into_bytes();
    bot.send_document(
        ChatId(chat_id),
        InputFile::memory(bytes).file_name(filename),
    )
    .caption("Full Terms & Conditions (plain text)")
    .await?;

    let reminder = reminder_text(config, chat_id, version);
    bot.send_message(ChatId(chat_id), reminder)
        .parse_mode(ParseMode::Html)
        .await?;

    db::set_last_known_version(pool, chat_id, version).await?;
    db::reset_compliance_deadlines(pool, chat_id).await?;

    let members = db::members_for_chat(pool, chat_id).await?;
    for user_id in members {
        if api
            .is_signed_latest(chat_id, user_id)
            .await
            .unwrap_or(false)
        {
            db::clear_compliant(pool, chat_id, user_id).await?;
        } else {
            db::mark_non_compliant(pool, chat_id, user_id).await?;
        }
    }

    Ok(())
}

pub async fn run_kicks(
    bot: &Bot,
    pool: &sqlx::PgPool,
    config: &Config,
    api: &LegalApi,
) -> anyhow::Result<()> {
    let overdue_users = db::overdue_user_ids(pool, config.grace_period_days).await?;

    for user_id in overdue_users {
        let tg_user = UserId(user_id as u64);
        let mut kicked_any = false;

        for allowed in &config.allowed_chats {
            let chat_id = allowed.chat_id;
            if api
                .is_signed_latest(chat_id, user_id)
                .await
                .unwrap_or(false)
            {
                db::clear_compliant(pool, chat_id, user_id).await?;
                continue;
            }

            let chat = ChatId(chat_id);
            let member = match bot.get_chat_member(chat, tg_user).await {
                Ok(m) => m,
                Err(e) => {
                    tracing::debug!(?e, chat_id, user_id, "skip kick: not in group or no access");
                    continue;
                }
            };

            if !is_active_member(member.status()) {
                continue;
            }

            match bot.ban_chat_member(chat, tg_user).await {
                Ok(_) => {
                    let _ = bot.unban_chat_member(chat, tg_user).await;
                    db::clear_compliant(pool, chat_id, user_id).await?;
                    kicked_any = true;
                    info!(
                        chat_id,
                        user_id,
                        label = %allowed.label,
                        "kicked non-compliant member"
                    );
                }
                Err(e) => warn!(?e, chat_id, user_id, "kick failed"),
            }
        }

        if kicked_any {
            db::clear_user_compliance(pool, user_id).await?;
        }
    }

    Ok(())
}

/// Returns true if the user is still an active member (not left/banned).
pub fn is_active_member(status: ChatMemberStatus) -> bool {
    !matches!(status, ChatMemberStatus::Left | ChatMemberStatus::Banned)
}
