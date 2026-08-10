use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

use crate::error::{AppError, AppResult};

type HmacSha256 = Hmac<Sha256>;

const MAX_AUTH_AGE_SECS: i64 = 86400;
const WEBAPP_DATA_KEY: &[u8] = b"WebAppData";

#[derive(Debug, serde::Deserialize)]
pub struct TelegramAuthPayload {
    pub id: i64,
    pub first_name: String,
    #[serde(default)]
    pub last_name: Option<String>,
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub photo_url: Option<String>,
    pub auth_date: i64,
    pub hash: String,
}

pub fn verify_telegram_login(payload: &TelegramAuthPayload, bot_token: &str) -> AppResult<()> {
    let now = chrono::Utc::now().timestamp();
    if now - payload.auth_date > MAX_AUTH_AGE_SECS {
        return Err(AppError::BadRequest("telegram auth data expired".into()));
    }

    let mut pairs = BTreeMap::new();
    pairs.insert("id", payload.id.to_string());
    pairs.insert("first_name", payload.first_name.clone());
    if let Some(ref v) = payload.last_name {
        pairs.insert("last_name", v.clone());
    }
    if let Some(ref v) = payload.username {
        pairs.insert("username", v.clone());
    }
    if let Some(ref v) = payload.photo_url {
        pairs.insert("photo_url", v.clone());
    }
    pairs.insert("auth_date", payload.auth_date.to_string());

    let data_check_string = pairs
        .iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<_>>()
        .join("\n");

    let mut secret_hasher = Sha256::new();
    secret_hasher.update(bot_token.as_bytes());
    let secret_key = secret_hasher.finalize();

    let mut mac = HmacSha256::new_from_slice(&secret_key)
        .map_err(|_| AppError::Internal(anyhow::anyhow!("hmac")))?;
    mac.update(data_check_string.as_bytes());
    let result = mac.finalize().into_bytes();
    let expected = hex::encode(result);

    if expected != payload.hash {
        return Err(AppError::BadRequest("invalid telegram hash".into()));
    }
    Ok(())
}

/// Parsed Telegram user from WebApp `initData` (`user` field JSON).
#[derive(Debug, Clone, serde::Deserialize)]
pub struct TelegramWebAppUser {
    pub id: i64,
    pub first_name: String,
    #[serde(default)]
    pub last_name: Option<String>,
    #[serde(default)]
    pub username: Option<String>,
}

/// Verify Telegram Mini App `initData` and return the authenticated user + auth_date.
pub fn verify_telegram_webapp_init_data(
    init_data: &str,
    bot_token: &str,
) -> AppResult<(TelegramWebAppUser, i64)> {
    let mut fields: BTreeMap<String, String> = BTreeMap::new();
    for pair in init_data.split('&') {
        let Some((key, value)) = pair.split_once('=') else {
            continue;
        };
        let key = urlencoding::decode(key)
            .map_err(|_| AppError::BadRequest("invalid init_data key".into()))?
            .into_owned();
        let value = urlencoding::decode(value)
            .map_err(|_| AppError::BadRequest("invalid init_data value".into()))?
            .into_owned();
        fields.insert(key, value);
    }

    let hash = fields
        .remove("hash")
        .ok_or_else(|| AppError::BadRequest("init_data missing hash".into()))?;

    let auth_date: i64 = fields
        .get("auth_date")
        .ok_or_else(|| AppError::BadRequest("init_data missing auth_date".into()))?
        .parse()
        .map_err(|_| AppError::BadRequest("invalid auth_date".into()))?;

    let now = chrono::Utc::now().timestamp();
    if now - auth_date > MAX_AUTH_AGE_SECS {
        return Err(AppError::BadRequest("telegram webapp auth expired".into()));
    }

    let data_check_string = fields
        .iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<_>>()
        .join("\n");

    let mut secret_hasher = Sha256::new();
    secret_hasher.update(bot_token.as_bytes());
    let secret_key = secret_hasher.finalize();

    let mut mac_key = HmacSha256::new_from_slice(WEBAPP_DATA_KEY)
        .map_err(|_| AppError::Internal(anyhow::anyhow!("hmac")))?;
    mac_key.update(&secret_key);
    let webapp_secret = mac_key.finalize().into_bytes();

    let mut mac = HmacSha256::new_from_slice(&webapp_secret)
        .map_err(|_| AppError::Internal(anyhow::anyhow!("hmac")))?;
    mac.update(data_check_string.as_bytes());
    let expected = hex::encode(mac.finalize().into_bytes());

    if expected != hash {
        return Err(AppError::BadRequest("invalid webapp hash".into()));
    }

    let user_json = fields
        .get("user")
        .ok_or_else(|| AppError::BadRequest("init_data missing user".into()))?;
    let user: TelegramWebAppUser = serde_json::from_str(user_json)
        .map_err(|_| AppError::BadRequest("invalid webapp user".into()))?;

    Ok((user, auth_date))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn telegram_hash_roundtrip() {
        let bot_token = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11";
        let payload = TelegramAuthPayload {
            id: 123,
            first_name: "A".into(),
            last_name: None,
            username: None,
            photo_url: None,
            auth_date: chrono::Utc::now().timestamp(),
            hash: String::new(),
        };

        let mut pairs = BTreeMap::new();
        pairs.insert("id", payload.id.to_string());
        pairs.insert("first_name", payload.first_name.clone());
        pairs.insert("auth_date", payload.auth_date.to_string());
        let data_check_string = pairs
            .iter()
            .map(|(k, v)| format!("{k}={v}"))
            .collect::<Vec<_>>()
            .join("\n");

        let mut secret_hasher = Sha256::new();
        secret_hasher.update(bot_token.as_bytes());
        let secret_key = secret_hasher.finalize();
        let mut mac = HmacSha256::new_from_slice(&secret_key).unwrap();
        mac.update(data_check_string.as_bytes());
        let hash = hex::encode(mac.finalize().into_bytes());

        let mut signed = payload;
        signed.hash = hash;
        verify_telegram_login(&signed, bot_token).unwrap();
    }
}
