use serde::Serialize;
use sqlx::PgPool;

use super::{get_latest_terms, parse_terms_file, publish_terms};
use crate::error::{AppError, AppResult};

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

    response
        .text()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("read terms body: {e}")))
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

/// Fetch terms from `url`, publish only when line-2 version differs from current latest.
pub async fn sync_terms_from_url(pool: &PgPool, url: &str) -> AppResult<TermsSyncOutcome> {
    let content = fetch_terms_from_url(url).await?;
    let remote_version = parse_version_line_2(&content)?;

    let latest = get_latest_terms(pool).await?;
    if latest
        .as_ref()
        .is_some_and(|t| t.version_label == remote_version)
    {
        tracing::debug!(version = %remote_version, "terms unchanged");
        return Ok(TermsSyncOutcome::Unchanged {
            version_label: remote_version,
        });
    }

    let parsed = parse_terms_file(&content)?;
    if parsed.version_label != remote_version {
        return Err(AppError::BadRequest(format!(
            "parsed version {:?} does not match line 2 {:?}",
            parsed.version_label, remote_version
        )));
    }

    let published = publish_terms(pool, parsed).await?;
    tracing::info!(
        version = %published.version_label,
        "published new terms from GitLab"
    );

    Ok(TermsSyncOutcome::Published {
        version_label: published.version_label,
        effective_date: published.effective_date.to_string(),
        content_sha256: published.content_sha256,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_version_from_line_2() {
        let content = "CL8Y ECOSYSTEM TERMS AND CONDITIONS\nVersion: Draft 1.3\nEffective date: May 26, 2026\n";
        assert_eq!(parse_version_line_2(content).unwrap(), "Draft 1.3");
    }
}
