use bech32::{decode, encode, FromBase32, ToBase32, Variant};

use crate::error::{AppError, AppResult};

const TERRA_ACCOUNT_HRP: &str = "terra";
const TERRA_ADDRESS_BYTES: usize = 20;

fn normalize_terra_classic_address(account: &str) -> AppResult<String> {
    let (hrp, data, variant) = decode(account)
        .map_err(|_| AppError::BadRequest("invalid Terra Classic address".into()))?;
    if hrp != TERRA_ACCOUNT_HRP || variant != Variant::Bech32 {
        return Err(AppError::BadRequest("invalid Terra Classic address".into()));
    }
    let bytes = Vec::<u8>::from_base32(&data)
        .map_err(|_| AppError::BadRequest("invalid Terra Classic address".into()))?;
    if bytes.len() != TERRA_ADDRESS_BYTES {
        return Err(AppError::BadRequest(
            "invalid Terra Classic address length".into(),
        ));
    }
    // Bech32 decode rejects mixed case; all-uppercase is accepted and re-encoded lowercase.
    encode(TERRA_ACCOUNT_HRP, bytes.to_base32(), Variant::Bech32)
        .map_err(|_| AppError::BadRequest("invalid Terra Classic address".into()))
}

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
        "TERRA_CLASSIC" => normalize_terra_classic_address(account),
        "TELEGRAM" => {
            if !account.chars().all(|c| c.is_ascii_digit()) {
                return Err(AppError::BadRequest("invalid Telegram user id".into()));
            }
            Ok(account.to_string())
        }
        _ => Err(AppError::BadRequest(format!(
            "unsupported network: {network}"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn terra_accepts_valid_bech32() {
        let addr = "terra180pg6mvjmyrnld0r4h6gz7274azxhnhd30spzt";
        assert_eq!(normalize_account("TERRA_CLASSIC", addr).unwrap(), addr);
    }

    #[test]
    fn terra_rejects_prefix_only_and_bad_checksum() {
        assert!(matches!(
            normalize_account("TERRA_CLASSIC", "terra1notavalidaddress"),
            Err(AppError::BadRequest(_))
        ));
        assert!(matches!(
            normalize_account("TERRA_CLASSIC", "terra"),
            Err(AppError::BadRequest(_))
        ));
        assert!(matches!(
            normalize_account(
                "TERRA_CLASSIC",
                "cosmos180pg6mvjmyrnld0r4h6gz7274azxhnhd30spzt"
            ),
            Err(AppError::BadRequest(_))
        ));
    }

    #[test]
    fn terra_uppercases_to_canonical_lowercase_and_rejects_mixed_case() {
        let lower = "terra180pg6mvjmyrnld0r4h6gz7274azxhnhd30spzt";
        let upper = lower.to_uppercase();
        assert_eq!(normalize_account("TERRA_CLASSIC", &upper).unwrap(), lower);
        let mixed = format!("tErRa{}", &lower[5..]);
        assert!(matches!(
            normalize_account("TERRA_CLASSIC", &mixed),
            Err(AppError::BadRequest(_))
        ));
    }
}
