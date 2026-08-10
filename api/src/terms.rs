pub mod sync;

use chrono::NaiveDate;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::{AppError, AppResult};

pub use sync::{fetch_terms_from_url, parse_version_line_2, sync_terms_from_url, TermsSyncOutcome};

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct TermsVersion {
    pub id: Uuid,
    pub version_label: String,
    pub effective_date: NaiveDate,
    pub content_sha256: String,
    pub content_text: String,
    pub published_at: chrono::DateTime<chrono::Utc>,
    pub is_latest: bool,
}

#[derive(Debug)]
pub struct ParsedTermsFile {
    pub version_label: String,
    pub effective_date: NaiveDate,
    pub content_text: String,
    pub content_sha256: String,
}

pub fn sha256_hex(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    hex::encode(hasher.finalize())
}

pub fn parse_terms_file(content: &str) -> AppResult<ParsedTermsFile> {
    let mut version_label = None;
    let mut effective_date = None;

    for line in content.lines().take(20) {
        let line = line.trim();
        if let Some(v) = line.strip_prefix("Version:") {
            version_label = Some(v.trim().to_string());
        }
        if let Some(d) = line.strip_prefix("Effective date:") {
            effective_date = Some(
                chrono::NaiveDate::parse_from_str(d.trim(), "%B %d, %Y")
                    .or_else(|_| chrono::NaiveDate::parse_from_str(d.trim(), "%Y-%m-%d"))
                    .map_err(|_| AppError::BadRequest("could not parse effective date".into()))?,
            );
        }
    }

    let version_label = version_label
        .ok_or_else(|| AppError::BadRequest("missing Version: in terms file".into()))?;
    let effective_date = effective_date
        .ok_or_else(|| AppError::BadRequest("missing Effective date: in terms file".into()))?;

    Ok(ParsedTermsFile {
        content_sha256: sha256_hex(content),
        version_label,
        effective_date,
        content_text: content.to_string(),
    })
}

pub async fn get_latest_terms(pool: &PgPool) -> AppResult<Option<TermsVersion>> {
    let row = sqlx::query_as::<_, TermsVersion>(
        r#"SELECT id, version_label, effective_date, content_sha256, content_text, published_at, is_latest
           FROM terms_versions WHERE is_latest = TRUE LIMIT 1"#,
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn get_terms_by_label(pool: &PgPool, label: &str) -> AppResult<Option<TermsVersion>> {
    let row = sqlx::query_as::<_, TermsVersion>(
        r#"SELECT id, version_label, effective_date, content_sha256, content_text, published_at, is_latest
           FROM terms_versions WHERE version_label = $1"#,
    )
    .bind(label)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn publish_terms(pool: &PgPool, parsed: ParsedTermsFile) -> AppResult<TermsVersion> {
    let mut tx = pool.begin().await?;

    sqlx::query("UPDATE terms_versions SET is_latest = FALSE WHERE is_latest = TRUE")
        .execute(&mut *tx)
        .await?;

    let row = sqlx::query_as::<_, TermsVersion>(
        r#"INSERT INTO terms_versions (version_label, effective_date, content_sha256, content_text, is_latest)
           VALUES ($1, $2, $3, $4, TRUE)
           RETURNING id, version_label, effective_date, content_sha256, content_text, published_at, is_latest"#,
    )
    .bind(&parsed.version_label)
    .bind(parsed.effective_date)
    .bind(&parsed.content_sha256)
    .bind(&parsed.content_text)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(row)
}

pub async fn publish_from_path(pool: &PgPool, path: &str) -> AppResult<TermsVersion> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("read terms file: {e}")))?;
    let parsed = parse_terms_file(&content)?;
    publish_terms(pool, parsed).await
}

pub async fn bootstrap_from_gitlab(pool: &PgPool, url: &str) -> AppResult<TermsSyncOutcome> {
    sync_terms_from_url(pool, url).await
}
