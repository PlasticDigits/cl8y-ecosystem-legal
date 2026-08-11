//! Fail-closed Legal API compliance classification for the Telegram bot.
//!
//! # Invariant (GitLab #5)
//!
//! A Legal API status error (timeout, 5xx, 429, parse failure, etc.) must **never**
//! be treated as “unsigned”. Coercing `Err` → `false` (e.g. `unwrap_or(false)`)
//! causes wrongful `mark_non_compliant` and kicks during outages.
//!
//! Policy matrix:
//! - [`ComplianceCheck::SignedLatest`] → clear compliance
//! - [`ComplianceCheck::NotSignedLatest`] → mark non-compliant; kick only if overdue
//! - [`ComplianceCheck::Unknown`] → **no DB escalation**; **no kick**
//!
//! See [`skills/bot-enforcement/SKILL.md`](../../skills/bot-enforcement/SKILL.md)
//! and root README “Telegram enforcement bot”.

use tracing::warn;

/// Outcome of a Legal API `is_signed_latest` / status check.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ComplianceCheck {
    SignedLatest,
    NotSignedLatest,
    /// Status could not be determined; enforcement must fail closed.
    Unknown,
}

/// DB / kick action derived from [`ComplianceCheck`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ComplianceAction {
    ClearCompliant,
    MarkNonCompliant,
    /// Leave compliance row untouched; skip kick.
    Hold,
}

impl ComplianceCheck {
    /// Map `Result<bool, _>` without coercing errors to unsigned.
    pub fn from_signed_latest_result(result: Result<bool, impl std::fmt::Display>) -> Self {
        match result {
            Ok(true) => Self::SignedLatest,
            Ok(false) => Self::NotSignedLatest,
            Err(_) => Self::Unknown,
        }
    }

    pub fn action(self) -> ComplianceAction {
        match self {
            Self::SignedLatest => ComplianceAction::ClearCompliant,
            Self::NotSignedLatest => ComplianceAction::MarkNonCompliant,
            Self::Unknown => ComplianceAction::Hold,
        }
    }

    /// Kicks require an explicit unsigned status — never Unknown.
    pub fn may_kick(self) -> bool {
        matches!(self, Self::NotSignedLatest)
    }
}

/// Classify API status and emit a structured warning on Unknown.
pub fn classify_status(
    result: anyhow::Result<bool>,
    chat_id: i64,
    user_id: i64,
    context: &'static str,
) -> ComplianceCheck {
    match result {
        Ok(signed) => ComplianceCheck::from_signed_latest_result(Ok::<bool, &str>(signed)),
        Err(e) => {
            warn!(
                chat_id,
                user_id,
                error = %e,
                context,
                "compliance status unknown; fail-closed (no mark/kick)"
            );
            ComplianceCheck::from_signed_latest_result(Err::<bool, _>(e))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ok_true_signed_latest_clears() {
        let check = ComplianceCheck::from_signed_latest_result(Ok::<bool, &str>(true));
        assert_eq!(check, ComplianceCheck::SignedLatest);
        assert_eq!(check.action(), ComplianceAction::ClearCompliant);
        assert!(!check.may_kick());
    }

    #[test]
    fn ok_false_not_signed_marks_and_may_kick() {
        let check = ComplianceCheck::from_signed_latest_result(Ok::<bool, &str>(false));
        assert_eq!(check, ComplianceCheck::NotSignedLatest);
        assert_eq!(check.action(), ComplianceAction::MarkNonCompliant);
        assert!(check.may_kick());
    }

    #[test]
    fn err_is_unknown_hold_no_kick() {
        let check = ComplianceCheck::from_signed_latest_result(Err::<bool, _>("HTTP 500"));
        assert_eq!(check, ComplianceCheck::Unknown);
        assert_eq!(check.action(), ComplianceAction::Hold);
        assert!(!check.may_kick());
    }

    #[test]
    fn classify_status_maps_three_outcomes() {
        assert_eq!(
            classify_status(Ok(true), 1, 2, "test"),
            ComplianceCheck::SignedLatest
        );
        assert_eq!(
            classify_status(Ok(false), 1, 2, "test"),
            ComplianceCheck::NotSignedLatest
        );
        assert_eq!(
            classify_status(Err(anyhow::anyhow!("timeout")), 1, 2, "test"),
            ComplianceCheck::Unknown
        );
    }

    #[test]
    fn policy_matrix_never_escalates_unknown() {
        // Guard against regressing to fail-open punishment.
        for check in [
            ComplianceCheck::SignedLatest,
            ComplianceCheck::NotSignedLatest,
            ComplianceCheck::Unknown,
        ] {
            if check == ComplianceCheck::Unknown {
                assert_eq!(check.action(), ComplianceAction::Hold);
                assert!(!check.may_kick());
            }
        }
    }
}
