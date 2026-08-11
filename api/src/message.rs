use chrono::{DateTime, NaiveDate, Utc};

use crate::error::{AppError, AppResult};

pub const MAX_TIMESTAMP_SKEW_SECS: i64 = 300;

fn format_effective_date(date: NaiveDate) -> String {
    date.format("%B %-d, %Y").to_string()
}

/// Canonical acceptance text (wallet and Telegram).
///
/// Binding lines tie the signature to property, identity, and the exact terms bytes
/// via `Content-SHA256` (hex of the published document body).
///
/// # Invariants
/// - Rust, `@plasticdigits/cl8y-clickwrap`, and the portal builders must stay byte-identical.
/// - Adding/removing binding lines is a **breaking** deploy: ship API + SDK + web together
///   and bump the terms `Version:` so clients re-sign the new format.
pub fn build_acceptance_message(
    version_label: &str,
    effective_date: NaiveDate,
    content_sha256: &str,
    property: &str,
    network: &str,
    account_id: &str,
    client_timestamp: DateTime<Utc>,
) -> String {
    let effective = format_effective_date(effective_date);
    format!(
        "I have read, understood, and accepted the CL8Y Ecosystem Terms and Conditions, Version {version_label}, effective {effective}. I understand that CL8Y ecosystem activity is experimental, non-custodial, provided as-is, and not an investment. I confirm that I am not an investment-type entity, politically exposed person, or acting for or on behalf of either.\n\nProperty: {property}\nNetwork: {network}\nAccount: {account_id}\nContent-SHA256: {content_sha256}\nAccepted at (UTC): {}",
        client_timestamp.format("%Y-%m-%dT%H:%M:%SZ")
    )
}

pub fn build_wallet_message(
    version_label: &str,
    effective_date: NaiveDate,
    content_sha256: &str,
    property: &str,
    network: &str,
    account_id: &str,
    client_timestamp: DateTime<Utc>,
) -> String {
    build_acceptance_message(
        version_label,
        effective_date,
        content_sha256,
        property,
        network,
        account_id,
        client_timestamp,
    )
}

pub fn build_telegram_acceptance_message(
    version_label: &str,
    effective_date: NaiveDate,
    content_sha256: &str,
    property: &str,
    account_id: &str,
    client_timestamp: DateTime<Utc>,
) -> String {
    build_acceptance_message(
        version_label,
        effective_date,
        content_sha256,
        property,
        "TELEGRAM",
        account_id,
        client_timestamp,
    )
}

pub fn validate_timestamp(client_timestamp: DateTime<Utc>) -> AppResult<()> {
    let now = Utc::now();
    let diff = (now - client_timestamp).num_seconds().abs();
    if diff > MAX_TIMESTAMP_SKEW_SECS {
        return Err(AppError::BadRequest(format!(
            "client_timestamp skew too large (max {MAX_TIMESTAMP_SKEW_SECS}s)"
        )));
    }
    Ok(())
}

pub fn verify_message_matches(expected: &str, provided: &str) -> AppResult<()> {
    if expected != provided {
        return Err(AppError::BadRequest(
            "message does not match canonical format".into(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn acceptance_message_legal_text_and_binding() {
        let ts = Utc.with_ymd_and_hms(2026, 5, 26, 12, 0, 0).unwrap();
        let msg = build_wallet_message(
            "Draft 1.3",
            NaiveDate::from_ymd_opt(2026, 5, 26).unwrap(),
            "abc123def456",
            "cl8y.com",
            "EVM",
            "0xabc",
            ts,
        );
        assert!(msg.contains(
            "I have read, understood, and accepted the CL8Y Ecosystem Terms and Conditions, Version Draft 1.3, effective May 26, 2026."
        ));
        assert!(msg.contains("not an investment"));
        assert!(msg.contains("investment-type entity"));
        assert!(msg.contains("Property: cl8y.com"));
        assert!(msg.contains("Network: EVM"));
        assert!(msg.contains("Account: 0xabc"));
        assert!(msg.contains("Content-SHA256: abc123def456"));
        assert!(msg.contains("Accepted at (UTC): 2026-05-26T12:00:00Z"));
    }

    #[test]
    fn acceptance_message_golden_includes_content_sha256_line() {
        let ts = Utc.with_ymd_and_hms(2026, 5, 26, 12, 0, 0).unwrap();
        let msg = build_acceptance_message(
            "Draft 1.3",
            NaiveDate::from_ymd_opt(2026, 5, 26).unwrap(),
            "deadbeef",
            "cl8y.com",
            "EVM",
            "0xabc",
            ts,
        );
        let expected = "I have read, understood, and accepted the CL8Y Ecosystem Terms and Conditions, Version Draft 1.3, effective May 26, 2026. I understand that CL8Y ecosystem activity is experimental, non-custodial, provided as-is, and not an investment. I confirm that I am not an investment-type entity, politically exposed person, or acting for or on behalf of either.\n\nProperty: cl8y.com\nNetwork: EVM\nAccount: 0xabc\nContent-SHA256: deadbeef\nAccepted at (UTC): 2026-05-26T12:00:00Z";
        assert_eq!(msg, expected);
    }

    #[test]
    fn validate_timestamp_within_skew() {
        validate_timestamp(Utc::now()).unwrap();
    }

    #[test]
    fn validate_timestamp_rejects_large_skew() {
        let old = Utc::now() - chrono::Duration::seconds(MAX_TIMESTAMP_SKEW_SECS + 1);
        assert!(validate_timestamp(old).is_err());
    }

    #[test]
    fn verify_message_matches_exact() {
        let a = "same";
        verify_message_matches(a, a).unwrap();
        assert!(verify_message_matches(a, "other").is_err());
    }
}
