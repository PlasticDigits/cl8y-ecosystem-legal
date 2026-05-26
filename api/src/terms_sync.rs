use serde::Serialize;
use sqlx::PgPool;

use crate::{
    error::{AppError, AppResult},
    terms::{get_latest_terms, parse_terms_file, publish_terms, TermsVersion},
};

pub const DEFAULT_TERMS_GITLAB_RAW_URL: &str =
    "https://gitlab.com/PlasticDigits/cl8y-ecosystem-legal/-/raw/main/TERMS_AND_CONDITIONS.txt";

/// Version label from line 2 of the canonical terms file (`Version: …`).
pub fn version_label_from_line_2(content: &str) -> AppResult<String> {
    let line = content
        .lines()
        .nth(1)
        .ok_or_else(|| AppError::BadRequest("terms file missing line 2".into()))?
        .trim();
    line.strip_prefix("Version:")
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .ok_or_else(|| AppError::BadRequest("line 2 must be Version: <label>".into()))
}

pub async fn fetch_terms_from_url(url: &str) -> AppResult<String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent("cl8y-legal-api/0.1")
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

    response
        .text()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("read terms body: {e}")))
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum TermsSyncOutcome {
    Unchanged {
        version_label: String,
    },
    Published {
        version_label: String,
        effective_date: String,
        content_sha256: String,
        published_at: String,
    },
}

impl From<TermsVersion> for TermsSyncOutcome {
    fn from(t: TermsVersion) -> Self {
        TermsSyncOutcome::Published {
            version_label: t.version_label,
            effective_date: t.effective_date.to_string(),
            content_sha256: t.content_sha256,
            published_at: t.published_at.to_rfc3339(),
        }
    }
}

/// Fetch terms from GitLab raw URL; publish only when line-2 version differs from current latest.
pub async fn sync_terms_from_gitlab(pool: &PgPool, url: &str) -> AppResult<TermsSyncOutcome> {
    let content = fetch_terms_from_url(url).await?;
    let remote_version = version_label_from_line_2(&content)?;

    if let Some(latest) = get_latest_terms(pool).await? {
        if latest.version_label == remote_version {
            tracing::debug!(version = %remote_version, "terms unchanged");
            return Ok(TermsSyncOutcome::Unchanged {
                version_label: remote_version,
            });
        }
    }

    let parsed = parse_terms_file(&content)?;
    if parsed.version_label != remote_version {
        return Err(AppError::Internal(anyhow::anyhow!(
            "parsed version {:?} does not match line 2 {:?}",
            parsed.version_label,
            remote_version
        )));
    }

    let published = publish_terms(pool, parsed).await?;
    tracing::info!(version = %published.version_label, "published new terms from GitLab");
    Ok(published.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_version_from_line_2() {
        let content = "CL8Y ECOSYSTEM TERMS AND CONDITIONS\nVersion: Draft 1.3\nEffective date: May 26, 2026\n";
        assert_eq!(
            version_label_from_line_2(content).unwrap(),
            "Draft 1.3"
        );
    }
}
