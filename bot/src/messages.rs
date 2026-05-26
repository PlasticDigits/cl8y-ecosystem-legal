use crate::config::Config;

pub fn reminder_text(config: &Config, chat_id: i64, version: &str) -> String {
    format!(
        "📋 <b>CL8Y Terms required</b>\n\n\
        You must accept the latest Terms & Conditions (<code>{version}</code>) for this group.\n\n\
        • Open the bot: {bot}\n\
        • Tap <b>Sign terms</b> and pick this group (or Sign all)\n\
        • Or use the WebApp button if shown\n\n\
        Direct link: {sign_url}\n\n\
        Members who do not sign within <b>{grace} days</b> may be removed from <b>all</b> managed groups they belong to."
        ,
        bot = config.bot_dm_link(),
        sign_url = config.sign_url(chat_id),
        grace = config.grace_period_days,
    )
}

pub fn welcome_new_member(config: &Config, chat_id: i64, version: &str) -> String {
    format!(
        "👋 Welcome. This group requires accepting CL8Y Terms (<code>{version}</code>).\n\n\
        Sign via {bot} or: {sign_url}\n\n\
        You have <b>{grace} days</b> to sign or you may be removed from all managed groups you belong to.",
        bot = config.bot_dm_link(),
        sign_url = config.sign_url(chat_id),
        grace = config.grace_period_days,
    )
}

pub fn terms_updated_header(version: &str) -> String {
    format!(
        "⚠️ <b>Terms & Conditions updated</b> — version <code>{version}</code>\n\n\
        Everyone must re-sign the new terms or you may be removed after the grace period.\n\
        Full text is attached below and repeated in the following messages.\n\n\
        Sign at @cl8ytermsbot or use the signing link in the next reminder."
    )
}

pub fn private_start_intro(config: &Config) -> String {
    format!(
        "Sign CL8Y Terms for your Telegram groups.\n\n\
        • Choose a group below (opens the signing WebApp)\n\
        • Or tap <b>Sign all groups</b> for every group this bot manages\n\n\
        ⚠️ If you do not agree, you will be kicked in <b>{grace} days</b> from all managed groups \
        you are a member of that you have not signed for.\n\n\
        Bot: {bot}",
        bot = config.bot_dm_link(),
        grace = config.grace_period_days,
    )
}

pub fn unauthorized_group(chat_id: i64) -> String {
    format!(
        "This bot is not authorized for this group and will leave.\n\n\
        <b>Chat ID:</b> <code>{chat_id}</code>\n\n\
        Add this id to <code>ALLOWED_CHAT_IDS</code> in the bot server config (or use a public @username in <code>ALLOWED_CHAT_USERNAMES</code>), then restart the bot and re-add it here."
    )
}

pub const BOT_ADDED: &str =
    "CL8Y Terms bot is active. New members must accept the latest terms within the grace period. Use @cl8ytermsbot to sign.";
