//! Bearer admin authentication helpers.
//!
//! # Invariants
//! - Admin and `/update_terms` share the same `ADMIN_TOKEN` Bearer scheme.
//! - Token comparison is constant-time (`subtle::ConstantTimeEq`) to reduce timing oracles.
//! - Missing/malformed `Authorization` headers fail closed (unauthorized).

use axum::http::{header::AUTHORIZATION, HeaderMap};
use subtle::ConstantTimeEq;

use crate::error::{AppError, AppResult};

/// Extract the Bearer token from `Authorization`, if present and well-formed.
pub fn bearer_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(str::trim)
        .filter(|t| !t.is_empty())
}

/// Constant-time equality for UTF-8 token strings (compares raw bytes).
pub fn tokens_equal(provided: &str, expected: &str) -> bool {
    let a = provided.as_bytes();
    let b = expected.as_bytes();
    if a.len() != b.len() {
        // Still perform a dummy compare to keep the failure path closer in cost.
        let _ = a.ct_eq(a);
        return false;
    }
    bool::from(a.ct_eq(b))
}

/// Require a valid admin Bearer token.
pub fn require_admin(headers: &HeaderMap, admin_token: &str) -> AppResult<()> {
    let provided = bearer_token(headers).unwrap_or("");
    if !tokens_equal(provided, admin_token) {
        return Err(AppError::Unauthorized);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    #[test]
    fn bearer_token_parses_prefix() {
        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_static("Bearer secret-token"),
        );
        assert_eq!(bearer_token(&headers), Some("secret-token"));
    }

    #[test]
    fn bearer_token_rejects_missing_or_wrong_scheme() {
        let mut headers = HeaderMap::new();
        assert!(bearer_token(&headers).is_none());
        headers.insert(AUTHORIZATION, HeaderValue::from_static("Basic x"));
        assert!(bearer_token(&headers).is_none());
    }

    #[test]
    fn tokens_equal_matches_and_rejects() {
        assert!(tokens_equal("abc", "abc"));
        assert!(!tokens_equal("abc", "abd"));
        assert!(!tokens_equal("abc", "abcd"));
        assert!(!tokens_equal("", "x"));
    }

    #[test]
    fn require_admin_ok_and_unauthorized() {
        let mut headers = HeaderMap::new();
        headers.insert(AUTHORIZATION, HeaderValue::from_static("Bearer good"));
        assert!(require_admin(&headers, "good").is_ok());
        assert!(require_admin(&headers, "bad").is_err());
        assert!(require_admin(&HeaderMap::new(), "good").is_err());
    }
}
