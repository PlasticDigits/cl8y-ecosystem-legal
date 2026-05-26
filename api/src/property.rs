use sqlx::PgPool;
use uuid::Uuid;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type)]
#[sqlx(type_name = "property_kind", rename_all = "snake_case")]
pub enum PropertyKind {
    Website,
    TelegramChannel,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct PropertyRow {
    pub id: Uuid,
    pub kind: PropertyKind,
    pub identifier: String,
}

/// Infer kind: negative integer strings are Telegram channel chat ids.
pub fn infer_kind(raw: &str) -> PropertyKind {
    let trimmed = raw.trim();
    if trimmed.starts_with('-') && trimmed[1..].chars().all(|c| c.is_ascii_digit()) {
        PropertyKind::TelegramChannel
    } else if trimmed.chars().all(|c| c.is_ascii_digit() || c == '-') && trimmed.parse::<i64>().is_ok()
    {
        // positive small ids unlikely for channels; treat negative only as telegram
        PropertyKind::Website
    } else {
        PropertyKind::Website
    }
}

pub fn normalize_identifier(raw: &str, kind: PropertyKind, allow_localhost: bool) -> AppResult<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(AppError::BadRequest("property is required".into()));
    }

    match kind {
        PropertyKind::TelegramChannel => {
            let id = trimmed.parse::<i64>().map_err(|_| {
                AppError::BadRequest("telegram property must be a numeric chat_id".into())
            })?;
            if id >= 0 {
                return Err(AppError::BadRequest(
                    "telegram channel chat_id must be negative (e.g. -1001234567890)".into(),
                ));
            }
            Ok(id.to_string())
        }
        PropertyKind::Website => {
            let mut host = trimmed.to_lowercase();
            if host.starts_with("https://") {
                host = host[8..].to_string();
            } else if host.starts_with("http://") {
                host = host[7..].to_string();
            }
            if let Some((h, _)) = host.split_once('/') {
                host = h.to_string();
            }
            if let Some((h, _)) = host.split_once(':') {
                host = h.to_string();
            }
            if host.is_empty() {
                return Err(AppError::BadRequest("invalid website property".into()));
            }
            if !allow_localhost && (host == "localhost" || host.ends_with(".localhost")) {
                return Err(AppError::BadRequest("localhost property not allowed".into()));
            }
            if !host.contains('.') && host != "localhost" {
                return Err(AppError::BadRequest("invalid website hostname".into()));
            }
            Ok(host)
        }
    }
}

pub fn normalize_property(raw: &str, allow_localhost: bool) -> AppResult<(PropertyKind, String)> {
    let kind = infer_kind(raw);
    let identifier = normalize_identifier(raw, kind, allow_localhost)?;
    Ok((kind, identifier))
}

pub async fn upsert_property(
    pool: &PgPool,
    kind: PropertyKind,
    identifier: &str,
) -> AppResult<PropertyRow> {
    let row = sqlx::query_as::<_, PropertyRow>(
        r#"
        INSERT INTO properties (kind, identifier)
        VALUES ($1, $2)
        ON CONFLICT (kind, identifier) DO UPDATE SET identifier = EXCLUDED.identifier
        RETURNING id, kind, identifier
        "#,
    )
    .bind(kind)
    .bind(identifier)
    .fetch_one(pool)
    .await?;

    Ok(row)
}

pub async fn resolve_property(
    pool: &PgPool,
    raw: &str,
    allow_localhost: bool,
) -> AppResult<PropertyRow> {
    let (kind, identifier) = normalize_property(raw, allow_localhost)?;
    upsert_property(pool, kind, &identifier).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn telegram_chat_id() {
        let (k, id) = normalize_property("-1001234567890", true).unwrap();
        assert_eq!(k, PropertyKind::TelegramChannel);
        assert_eq!(id, "-1001234567890");
    }

    #[test]
    fn website_host() {
        let (k, id) = normalize_property("https://CL8Y.com/path", true).unwrap();
        assert_eq!(k, PropertyKind::Website);
        assert_eq!(id, "cl8y.com");
    }
}
