use std::collections::HashMap;
use std::env;

use teloxide::prelude::*;

#[derive(Clone, Debug)]
pub struct AllowedChat {
    pub chat_id: i64,
    pub label: String,
}

#[derive(Clone, Debug)]
pub struct Config {
    pub telegram_bot_token: String,
    pub allowed_chats: Vec<AllowedChat>,
    pub legal_api_base_url: String,
    pub legal_public_base_url: String,
    pub database_url: String,
    pub reminder_interval_hours: u64,
    pub grace_period_days: i64,
    pub terms_poll_interval_minutes: u64,
    pub enforcement_interval_minutes: u64,
    /// Parsed from env; resolved in [`Config::resolve_chats`].
    allowed_chat_ids: Vec<i64>,
    allowed_chat_usernames: Vec<String>,
    chat_labels: HashMap<String, String>,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let allowed_chat_ids = parse_csv_i64(env::var("ALLOWED_CHAT_IDS").ok().as_deref());
        let allowed_chat_usernames =
            parse_csv_str(env::var("ALLOWED_CHAT_USERNAMES").ok().as_deref());
        let chat_labels = parse_chat_labels(env::var("CHAT_LABELS").ok().as_deref());

        if allowed_chat_ids.is_empty() && allowed_chat_usernames.is_empty() {
            anyhow::bail!("set ALLOWED_CHAT_IDS and/or ALLOWED_CHAT_USERNAMES (comma-separated)");
        }

        Ok(Self {
            telegram_bot_token: env::var("TELEGRAM_BOT_TOKEN")
                .map_err(|_| anyhow::anyhow!("TELEGRAM_BOT_TOKEN is required"))?,
            allowed_chats: Vec::new(),
            legal_api_base_url: env::var("LEGAL_API_BASE_URL")
                .unwrap_or_else(|_| "https://api.terms.cl8y.com/api/v1".into()),
            legal_public_base_url: env::var("LEGAL_PUBLIC_BASE_URL")
                .unwrap_or_else(|_| "https://terms.cl8y.com".into()),
            database_url: env::var("DATABASE_URL").unwrap_or_else(|_| {
                "postgres://cl8y_legal:cl8y_legal@localhost:5432/cl8y_legal".into()
            }),
            reminder_interval_hours: env::var("REMINDER_INTERVAL_HOURS")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(6),
            grace_period_days: env::var("GRACE_PERIOD_DAYS")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(30),
            terms_poll_interval_minutes: env::var("TERMS_POLL_INTERVAL_MINUTES")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(15),
            enforcement_interval_minutes: env::var("ENFORCEMENT_INTERVAL_MINUTES")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(60),
            allowed_chat_ids,
            allowed_chat_usernames,
            chat_labels,
        })
    }

    /// Resolve @usernames via Bot API and build the final allowlist.
    pub async fn resolve_chats(mut self, bot: &Bot) -> anyhow::Result<Self> {
        let mut chats = Vec::new();
        let mut seen = std::collections::HashSet::new();

        // Usernames first so CHAT_LABELS keys match; numeric ALLOWED_CHAT_IDS are fallback only.
        for username in self.allowed_chat_usernames.clone() {
            let handle = format!("@{username}");
            let chat = match bot.get_chat(handle.clone()).await {
                Ok(chat) => chat,
                Err(e) => {
                    tracing::warn!(username = %username, ?e, "getChat failed; use ALLOWED_CHAT_IDS if already configured");
                    continue;
                }
            };
            let id = chat.id.0;
            if seen.insert(id) {
                let label = self.display_label(&username, chat.title().map(str::to_string));
                tracing::info!(username = %username, chat_id = id, %label, "resolved group");
                chats.push(AllowedChat { chat_id: id, label });
            }
        }

        for id in &self.allowed_chat_ids {
            let id = *id;
            if seen.insert(id) {
                let id_key = id.to_string();
                chats.push(AllowedChat {
                    chat_id: id,
                    label: self.display_label(&id_key, None),
                });
            }
        }

        if chats.is_empty() {
            anyhow::bail!("no allowed chats after resolution");
        }

        self.allowed_chats = chats;
        Ok(self)
    }

    /// Label from CHAT_LABELS, else Telegram title, else key.
    fn display_label(&self, key: &str, telegram_title: Option<String>) -> String {
        if let Some(label) = self.label_from_map(key) {
            return label;
        }
        if let Some(title) = telegram_title.filter(|t| !t.is_empty()) {
            return title;
        }
        key.to_string()
    }

    fn label_from_map(&self, key: &str) -> Option<String> {
        let lower = key.to_ascii_lowercase();
        self.chat_labels
            .get(&lower)
            .or_else(|| self.chat_labels.get(key))
            .cloned()
    }

    pub fn is_allowed_chat(&self, chat_id: i64) -> bool {
        self.allowed_chats.iter().any(|c| c.chat_id == chat_id)
    }

    pub fn sign_url(&self, chat_id: i64) -> String {
        let base = self.legal_public_base_url.trim_end_matches('/');
        let id = chat_id.to_string();
        let q = urlencoding::encode(&id);
        format!("{base}/sign/telegram?property={q}")
    }

    pub fn sign_all_url(&self) -> String {
        let base = self.legal_public_base_url.trim_end_matches('/');
        let groups: String = self
            .allowed_chats
            .iter()
            .map(|c| c.chat_id.to_string())
            .collect::<Vec<_>>()
            .join(",");
        let q = urlencoding::encode(&groups);
        format!("{base}/sign/telegram?groups={q}")
    }

    pub fn bot_dm_link(&self) -> String {
        "https://t.me/cl8ytermsbot".to_string()
    }
}

fn parse_csv_i64(raw: Option<&str>) -> Vec<i64> {
    raw.map(|s| {
        s.split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .filter_map(|s| s.parse().ok())
            .collect()
    })
    .unwrap_or_default()
}

fn parse_csv_str(raw: Option<&str>) -> Vec<String> {
    raw.map(|s| {
        s.split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| s.trim_start_matches('@').to_string())
            .collect()
    })
    .unwrap_or_default()
}

fn parse_chat_labels(raw: Option<&str>) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let Some(s) = raw else { return map };
    for part in s.split(',') {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }
        let Some((key, label)) = part.split_once(':') else {
            continue;
        };
        let key = key.trim().trim_start_matches('@').to_ascii_lowercase();
        let label = label.trim();
        if !key.is_empty() && !label.is_empty() {
            map.insert(key, label.to_string());
        }
    }
    map
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_labels() {
        let m = parse_chat_labels(Some("ceramicliberty:Ceramic,yieldomega:Yield"));
        assert_eq!(m.get("ceramicliberty"), Some(&"Ceramic".to_string()));
        assert_eq!(m.get("yieldomega"), Some(&"Yield".to_string()));
    }

    #[test]
    fn parse_labels_negative_chat_id() {
        let m = parse_chat_labels(Some("-1002917877606:cl8y strategy group"));
        assert_eq!(
            m.get("-1002917877606"),
            Some(&"cl8y strategy group".to_string())
        );
    }

    #[test]
    fn from_dotenv_file() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(".env");
        dotenvy::from_path(&path).ok();
        let raw = std::env::var("CHAT_LABELS").expect("CHAT_LABELS");
        let m = parse_chat_labels(Some(&raw));
        assert!(
            m.get("-1002917877606").is_some(),
            "missing strategy label; CHAT_LABELS={raw:?}"
        );
    }
}
