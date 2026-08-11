use std::env;

use ipnet::IpNet;

/// Known insecure default that must never be silent in production-like boots.
pub const INSECURE_DEFAULT_ADMIN_TOKEN: &str = "dev-admin-token";

#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub listen_addr: String,
    pub legal_public_base_url: String,
    pub terms_gitlab_raw_url: String,
    pub terms_sync_interval_hours: u64,
    pub terms_sync_on_startup: bool,
    /// When true, sync may re-mark a previously published label as `is_latest` (rollback).
    /// Dev/ops escape hatch only — never enable silently in production.
    pub force_terms_downgrade: bool,
    pub admin_token: String,
    /// When true, missing `ADMIN_TOKEN` may fall back to [`INSECURE_DEFAULT_ADMIN_TOKEN`].
    pub allow_insecure_defaults: bool,
    pub telegram_bot_token: Option<String>,
    pub rate_limit_read: u32,
    pub rate_limit_write: u32,
    pub cors_origins: Vec<String>,
    pub allow_localhost_property: bool,
    /// CIDRs of reverse proxies allowed to supply `X-Forwarded-For`.
    /// Empty = never trust XFF; use socket peer IP only.
    pub trusted_proxy_cidrs: Vec<IpNet>,
    pub static_dir: Option<String>,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let allow_insecure_defaults = env_flag("ALLOW_INSECURE_DEFAULTS", false);
        let admin_token = resolve_admin_token(allow_insecure_defaults)?;
        let trusted_proxy_cidrs =
            parse_trusted_proxy_cidrs(&env::var("TRUSTED_PROXY_CIDRS").unwrap_or_default())?;

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
            force_terms_downgrade: env_flag("FORCE_TERMS_DOWNGRADE", false),
            admin_token,
            allow_insecure_defaults,
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
            trusted_proxy_cidrs,
            static_dir: env::var("STATIC_DIR").ok().filter(|s| !s.is_empty()),
        })
    }
}

fn env_flag(name: &str, default: bool) -> bool {
    match env::var(name) {
        Ok(v) => v == "true" || v == "1",
        Err(_) => default,
    }
}

/// Resolve `ADMIN_TOKEN` with fail-fast against missing/known-insecure values.
pub fn resolve_admin_token(allow_insecure_defaults: bool) -> anyhow::Result<String> {
    match env::var("ADMIN_TOKEN") {
        Ok(token) => {
            let token = token.trim().to_string();
            if token.is_empty() {
                anyhow::bail!(
                    "ADMIN_TOKEN is empty; set a strong secret or ALLOW_INSECURE_DEFAULTS=true for local dev only"
                );
            }
            if token == INSECURE_DEFAULT_ADMIN_TOKEN && !allow_insecure_defaults {
                anyhow::bail!(
                    "ADMIN_TOKEN is the known insecure default ({INSECURE_DEFAULT_ADMIN_TOKEN}); \
                     set a unique secret or ALLOW_INSECURE_DEFAULTS=true for local dev only"
                );
            }
            Ok(token)
        }
        Err(_) => {
            if allow_insecure_defaults {
                tracing::warn!(
                    "ADMIN_TOKEN unset; using insecure default because ALLOW_INSECURE_DEFAULTS=true"
                );
                Ok(INSECURE_DEFAULT_ADMIN_TOKEN.to_string())
            } else {
                anyhow::bail!(
                    "ADMIN_TOKEN is required; set a strong secret or ALLOW_INSECURE_DEFAULTS=true for local dev only"
                )
            }
        }
    }
}

pub fn parse_trusted_proxy_cidrs(raw: &str) -> anyhow::Result<Vec<IpNet>> {
    let mut out = Vec::new();
    for part in raw.split(',').map(str::trim).filter(|s| !s.is_empty()) {
        let net: IpNet = part
            .parse()
            .map_err(|e| anyhow::anyhow!("invalid TRUSTED_PROXY_CIDRS entry '{part}': {e}"))?;
        out.push(net);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, OnceLock};

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    #[test]
    fn resolve_admin_token_requires_explicit_secret() {
        let _g = env_lock().lock().unwrap();
        env::remove_var("ADMIN_TOKEN");
        let err = resolve_admin_token(false).unwrap_err().to_string();
        assert!(err.contains("ADMIN_TOKEN is required"));
    }

    #[test]
    fn resolve_admin_token_rejects_known_default_without_opt_in() {
        let _g = env_lock().lock().unwrap();
        env::set_var("ADMIN_TOKEN", INSECURE_DEFAULT_ADMIN_TOKEN);
        let err = resolve_admin_token(false).unwrap_err().to_string();
        assert!(err.contains("known insecure default"));
        env::remove_var("ADMIN_TOKEN");
    }

    #[test]
    fn resolve_admin_token_allows_insecure_opt_in() {
        let _g = env_lock().lock().unwrap();
        env::remove_var("ADMIN_TOKEN");
        assert_eq!(
            resolve_admin_token(true).unwrap(),
            INSECURE_DEFAULT_ADMIN_TOKEN
        );
    }

    #[test]
    fn parse_trusted_proxy_cidrs_ok() {
        let nets = parse_trusted_proxy_cidrs("127.0.0.1/32, 10.0.0.0/8").unwrap();
        assert_eq!(nets.len(), 2);
        assert!(parse_trusted_proxy_cidrs("").unwrap().is_empty());
    }

    #[test]
    fn parse_trusted_proxy_cidrs_rejects_garbage() {
        assert!(parse_trusted_proxy_cidrs("not-a-cidr").is_err());
    }
}
