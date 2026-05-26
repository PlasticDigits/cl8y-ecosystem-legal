use crate::error::{AppError, AppResult};

pub fn normalize_account(network: &str, account: &str) -> AppResult<String> {
    let network = network.trim().to_uppercase();
    let account = account.trim();
    if account.is_empty() {
        return Err(AppError::BadRequest("account is required".into()));
    }

    match network.as_str() {
        "EVM" => {
            let lower = account.to_lowercase();
            if !lower.starts_with("0x") || lower.len() != 42 {
                return Err(AppError::BadRequest("invalid EVM address".into()));
            }
            if !lower[2..].chars().all(|c| c.is_ascii_hexdigit()) {
                return Err(AppError::BadRequest("invalid EVM address".into()));
            }
            Ok(lower)
        }
        "SOLANA" => {
            if bs58::decode(account).into_vec().map(|v| v.len()) != Ok(32) {
                return Err(AppError::BadRequest("invalid Solana address".into()));
            }
            Ok(account.to_string())
        }
        "TERRA_CLASSIC" => {
            if !account.starts_with("terra") {
                return Err(AppError::BadRequest("invalid Terra Classic address".into()));
            }
            Ok(account.to_string())
        }
        "TELEGRAM" => {
            if !account.chars().all(|c| c.is_ascii_digit()) {
                return Err(AppError::BadRequest("invalid Telegram user id".into()));
            }
            Ok(account.to_string())
        }
        _ => Err(AppError::BadRequest(format!("unsupported network: {network}"))),
    }
}
