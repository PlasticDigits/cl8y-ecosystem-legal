use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub listen_addr: String,
    pub legal_public_base_url: String,
    pub terms_gitlab_raw_url: String,
    pub terms_sync_interval_hours: u64,
    pub terms_sync_on_startup: bool,
    pub admin_token: String,
    pub telegram_bot_token: Option<String>,
    pub rate_limit_read: u32,
    pub rate_limit_write: u32,
    pub cors_origins: Vec<String>,
    pub allow_localhost_property: bool,
    pub static_dir: Option<String>,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        Ok(Self {
            database_url: env::var("DATABASE_URL")
                .unwrap_or_else(|_| "postgres://cl8y_legal:cl8y_legal@localhost:5432/cl8y_legal".into()),
            listen_addr: env::var("LISTEN_ADDR").unwrap_or_else(|_| "0.0.0.0:8080".into()),
            legal_public_base_url: env::var("LEGAL_PUBLIC_BASE_URL")
                .unwrap_or_else(|_| "https://terms.cl8y.com".into()),
            terms_gitlab_raw_url: env::var("TERMS_GITLAB_RAW_URL").unwrap_or_else(|_| {
                "https://gitlab.com/PlasticDigits/cl8y-ecosystem-legal/-/raw/main/TERMS_AND_CONDITIONS.txt".into()
            }),
            terms_sync_interval_hours: env::var("TERMS_SYNC_INTERVAL_HOURS")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(4),
            terms_sync_on_startup: env::var("TERMS_SYNC_ON_STARTUP")
                .map(|v| v != "false" && v != "0")
                .unwrap_or(true),
            admin_token: env::var("ADMIN_TOKEN").unwrap_or_else(|_| "dev-admin-token".into()),
            telegram_bot_token: env::var("TELEGRAM_BOT_TOKEN").ok().filter(|s| !s.is_empty()),
            rate_limit_read: env::var("RATE_LIMIT_READ")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(60),
            rate_limit_write: env::var("RATE_LIMIT_WRITE")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(10),
            cors_origins: env::var("CORS_ORIGINS")
                .unwrap_or_else(|_| "https://terms.cl8y.com".into())
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect(),
            allow_localhost_property: env::var("ALLOW_LOCALHOST_PROPERTY")
                .map(|v| v == "true" || v == "1")
                .unwrap_or(true),
            static_dir: env::var("STATIC_DIR").ok().filter(|s| !s.is_empty()),
        })
    }
}
