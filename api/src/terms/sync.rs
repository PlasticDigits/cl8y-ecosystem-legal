//! GitLab → API terms oracle sync.
//!
//! # Invariants
//! - Compare **content hash** and version label (not label alone).
//! - Same `Version:` + different body → **reject** (operators must bump the label).
//! - Never mark a previously published label as `is_latest` unless `FORCE_TERMS_DOWNGRADE=true`.
//! - Fail closed: empty/unparseable remote must not clear `is_latest`.
//! - Historical rows are never deleted; publish appends, force-downgrade only flips `is_latest`.

use serde::Serialize;
use sqlx::PgPool;

use super::{
    get_latest_terms, get_terms_by_label, parse_terms_file, publish_terms, set_latest_by_label,
    ParsedTermsFile, TermsVersion,
};
use crate::error::{AppError, AppResult};

/// Soft cap on remote terms body (fail closed; no panic).
pub const MAX_TERMS_BYTES: usize = 2 * 1024 * 1024;

/// Extract `Version: …` from line 2 of the GitLab terms file (1-indexed).
pub fn parse_version_line_2(content: &str) -> AppResult<String> {
    let line = content
        .lines()
        .nth(1)
        .ok_or_else(|| AppError::BadRequest("terms file missing line 2 (version)".into()))?
        .trim();

    line.strip_prefix("Version:")
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .ok_or_else(|| AppError::BadRequest(format!("line 2 must be 'Version: …', got: {line}")))
}

pub async fn fetch_terms_from_url(url: &str) -> AppResult<String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent("cl8y-legal-api/1.0")
        .build()
        .map_err(|e| AppError::Internal(anyhow::anyhow!("http client: {e}")))?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("fetch terms: {e}")))?;

    if !response.status().is_success() {
        return Err(AppError::Internal(anyhow::anyhow!(
            "fetch terms: HTTP {}",
            response.status()
        )));
    }

    if let Some(len) = response.content_length() {
        if len as usize > MAX_TERMS_BYTES {
            return Err(AppError::BadRequest(format!(
                "terms body too large ({len} bytes; max {MAX_TERMS_BYTES})"
            )));
        }
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("read terms body: {e}")))?;

    if bytes.len() > MAX_TERMS_BYTES {
        return Err(AppError::BadRequest(format!(
            "terms body too large ({} bytes; max {MAX_TERMS_BYTES})",
            bytes.len()
        )));
    }

    String::from_utf8(bytes.to_vec())
        .map_err(|e| AppError::BadRequest(format!("terms body is not valid UTF-8: {e}")))
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum TermsSyncOutcome {
    Unchanged {
        version_label: String,
    },
    Published {
        version_label: String,
        effective_date: String,
        content_sha256: String,
    },
}

impl TermsSyncOutcome {
    pub fn version_label(&self) -> &str {
        match self {
            TermsSyncOutcome::Unchanged { version_label } => version_label,
            TermsSyncOutcome::Published { version_label, .. } => version_label,
        }
    }
}

/// Pure sync plan (unit-tested; no I/O).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TermsSyncPlan {
    Unchanged { version_label: String },
    PublishNew,
    ReactivateExisting { version_label: String },
}

/// Decide whether remote terms should be left alone, appended, or (with force) reactivated.
///
/// See module invariants and GitLab issue #6.
pub fn plan_terms_sync(
    remote: &ParsedTermsFile,
    latest: Option<&TermsVersion>,
    existing_with_label: Option<&TermsVersion>,
    force_downgrade: bool,
) -> AppResult<TermsSyncPlan> {
    if remote.content_text.trim().is_empty() {
        return Err(AppError::BadRequest("remote terms content is empty".into()));
    }

    if let Some(latest) = latest {
        if latest.content_sha256 == remote.content_sha256
            && latest.version_label == remote.version_label
        {
            return Ok(TermsSyncPlan::Unchanged {
                version_label: remote.version_label.clone(),
            });
        }

        if latest.version_label == remote.version_label
            && latest.content_sha256 != remote.content_sha256
        {
            return Err(AppError::BadRequest(format!(
                "terms content changed under Version {:?} without a label bump \
                 (remote sha256 {}, latest {}); bump Version: in TERMS_AND_CONDITIONS.txt",
                remote.version_label, remote.content_sha256, latest.content_sha256
            )));
        }

        // Same bytes already latest under another label — no republish.
        if latest.content_sha256 == remote.content_sha256 {
            tracing::warn!(
                latest_label = %latest.version_label,
                remote_label = %remote.version_label,
                "remote terms hash matches latest; treating as unchanged despite label mismatch"
            );
            return Ok(TermsSyncPlan::Unchanged {
                version_label: latest.version_label.clone(),
            });
        }
    }

    if let Some(existing) = existing_with_label {
        if existing.content_sha256 != remote.content_sha256 {
            return Err(AppError::BadRequest(format!(
                "Version {:?} was previously published with different content \
                 (stored sha256 {}, remote {}); refusing label reuse",
                remote.version_label, existing.content_sha256, remote.content_sha256
            )));
        }
        if existing.is_latest {
            return Ok(TermsSyncPlan::Unchanged {
                version_label: remote.version_label.clone(),
            });
        }
        if !force_downgrade {
            return Err(AppError::BadRequest(format!(
                "refusing to mark previously published Version {:?} as latest (rollback); \
                 set FORCE_TERMS_DOWNGRADE=true to override (dev/ops only)",
                remote.version_label
            )));
        }
        tracing::warn!(
            version = %remote.version_label,
            "FORCE_TERMS_DOWNGRADE: reactivating previously published terms as latest"
        );
        return Ok(TermsSyncPlan::ReactivateExisting {
            version_label: remote.version_label.clone(),
        });
    }

    Ok(TermsSyncPlan::PublishNew)
}

/// Apply a fetched terms body against the DB (hash-aware, anti-downgrade).
pub async fn sync_terms_content(
    pool: &PgPool,
    content: &str,
    force_downgrade: bool,
) -> AppResult<TermsSyncOutcome> {
    let remote_version = parse_version_line_2(content)?;
    let parsed = parse_terms_file(content)?;
    if parsed.version_label != remote_version {
        return Err(AppError::BadRequest(format!(
            "parsed version {:?} does not match line 2 {:?}",
            parsed.version_label, remote_version
        )));
    }

    let latest = get_latest_terms(pool).await?;
    let existing = get_terms_by_label(pool, &parsed.version_label).await?;

    let plan = plan_terms_sync(
        &parsed,
        latest.as_ref(),
        existing.as_ref(),
        force_downgrade,
    )?;

    match plan {
        TermsSyncPlan::Unchanged { version_label } => {
            tracing::debug!(version = %version_label, "terms unchanged");
            Ok(TermsSyncOutcome::Unchanged { version_label })
        }
        TermsSyncPlan::PublishNew => {
            let published = publish_terms(pool, parsed).await?;
            tracing::info!(
                version = %published.version_label,
                sha256 = %published.content_sha256,
                "published new terms from oracle"
            );
            Ok(TermsSyncOutcome::Published {
                version_label: published.version_label,
                effective_date: published.effective_date.to_string(),
                content_sha256: published.content_sha256,
            })
        }
        TermsSyncPlan::ReactivateExisting { version_label } => {
            let published = set_latest_by_label(pool, &version_label).await?;
            tracing::warn!(
                version = %published.version_label,
                sha256 = %published.content_sha256,
                "reactivated prior terms version as latest (force downgrade)"
            );
            Ok(TermsSyncOutcome::Published {
                version_label: published.version_label,
                effective_date: published.effective_date.to_string(),
                content_sha256: published.content_sha256,
            })
        }
    }
}

/// Fetch terms from `url` and sync under oracle policy.
pub async fn sync_terms_from_url(
    pool: &PgPool,
    url: &str,
    force_downgrade: bool,
) -> AppResult<TermsSyncOutcome> {
    let content = fetch_terms_from_url(url).await?;
    sync_terms_content(pool, &content, force_downgrade).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{NaiveDate, Utc};
    use uuid::Uuid;

    fn sample_terms(label: &str, body_tail: &str) -> ParsedTermsFile {
        let content = format!(
            "CL8Y ECOSYSTEM TERMS AND CONDITIONS\nVersion: {label}\nEffective date: May 26, 2026\n{body_tail}\n"
        );
        parse_terms_file(&content).unwrap()
    }

    fn version_row(label: &str, sha: &str, is_latest: bool) -> TermsVersion {
        TermsVersion {
            id: Uuid::nil(),
            version_label: label.into(),
            effective_date: NaiveDate::from_ymd_opt(2026, 5, 26).unwrap(),
            content_sha256: sha.into(),
            content_text: String::new(),
            published_at: Utc::now(),
            is_latest,
        }
    }

    #[test]
    fn parse_version_from_line_2() {
        let content =
            "CL8Y ECOSYSTEM TERMS AND CONDITIONS\nVersion: Draft 1.3\nEffective date: May 26, 2026\n";
        assert_eq!(parse_version_line_2(content).unwrap(), "Draft 1.3");
    }

    #[test]
    fn plan_unchanged_when_label_and_hash_match() {
        let remote = sample_terms("Draft 1.3", "body");
        let latest = version_row("Draft 1.3", &remote.content_sha256, true);
        let plan = plan_terms_sync(&remote, Some(&latest), Some(&latest), false).unwrap();
        assert_eq!(
            plan,
            TermsSyncPlan::Unchanged {
                version_label: "Draft 1.3".into()
            }
        );
    }

    #[test]
    fn plan_rejects_same_label_mutated_body() {
        let remote = sample_terms("Draft 1.3", "mutated");
        let latest = version_row("Draft 1.3", "deadbeef", true);
        let err = plan_terms_sync(&remote, Some(&latest), Some(&latest), false).unwrap_err();
        assert!(err.to_string().contains("without a label bump"));
    }

    #[test]
    fn plan_publishes_new_label() {
        let remote = sample_terms("Draft 1.4", "new body");
        let latest = version_row("Draft 1.3", "oldhash", true);
        let plan = plan_terms_sync(&remote, Some(&latest), None, false).unwrap();
        assert_eq!(plan, TermsSyncPlan::PublishNew);
    }

    #[test]
    fn plan_rejects_downgrade_without_force() {
        let remote = sample_terms("Draft 1.2", "older");
        let latest = version_row("Draft 1.3", "newerhash", true);
        let prior = version_row("Draft 1.2", &remote.content_sha256, false);
        let err = plan_terms_sync(&remote, Some(&latest), Some(&prior), false).unwrap_err();
        assert!(err.to_string().contains("rollback"));
    }

    #[test]
    fn plan_reactivates_with_force() {
        let remote = sample_terms("Draft 1.2", "older");
        let latest = version_row("Draft 1.3", "newerhash", true);
        let prior = version_row("Draft 1.2", &remote.content_sha256, false);
        let plan = plan_terms_sync(&remote, Some(&latest), Some(&prior), true).unwrap();
        assert_eq!(
            plan,
            TermsSyncPlan::ReactivateExisting {
                version_label: "Draft 1.2".into()
            }
        );
    }

    #[test]
    fn plan_rejects_label_reuse_with_different_hash() {
        let remote = sample_terms("Draft 1.2", "tampered");
        let latest = version_row("Draft 1.3", "newerhash", true);
        let prior = version_row("Draft 1.2", "originalhash", false);
        let err = plan_terms_sync(&remote, Some(&latest), Some(&prior), true).unwrap_err();
        assert!(err.to_string().contains("refusing label reuse"));
    }

    #[test]
    fn plan_first_publish_when_empty_db() {
        let remote = sample_terms("Draft 1.0", "genesis");
        let plan = plan_terms_sync(&remote, None, None, false).unwrap();
        assert_eq!(plan, TermsSyncPlan::PublishNew);
    }
}
