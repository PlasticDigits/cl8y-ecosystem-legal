use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use crate::property::PropertyRow;
use crate::{
    account::normalize_account,
    error::{AppError, AppResult},
    message::{
        build_telegram_acceptance_message, build_wallet_message, validate_timestamp,
        verify_message_matches,
    },
    property::{resolve_property, PropertyKind},
    terms::{get_latest_terms, get_terms_by_label, TermsVersion},
    verify::verify_wallet_signature,
};

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct SignatureRow {
    pub id: Uuid,
    pub property_id: Uuid,
    pub terms_version_id: Uuid,
    pub network: String,
    pub account_id: String,
    pub signed_at: DateTime<Utc>,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct SignatureWithVersion {
    pub terms_version_id: Uuid,
    pub signed_at: DateTime<Utc>,
    pub version_label: String,
}

pub async fn get_signature_for_account(
    pool: &PgPool,
    property_id: Uuid,
    network: &str,
    account_id: &str,
) -> AppResult<Option<SignatureWithVersion>> {
    let row = sqlx::query_as::<_, SignatureWithVersion>(
        r#"
        SELECT s.terms_version_id, s.signed_at, tv.version_label
        FROM signatures s
        JOIN terms_versions tv ON tv.id = s.terms_version_id
        WHERE s.property_id = $1 AND s.network = $2 AND s.account_id = $3
        ORDER BY s.signed_at DESC
        LIMIT 1
        "#,
    )
    .bind(property_id)
    .bind(network.to_uppercase())
    .bind(account_id)
    .fetch_optional(pool)
    .await?;

    Ok(row)
}

#[allow(clippy::too_many_arguments)]
pub async fn insert_signature(
    pool: &PgPool,
    property_id: Uuid,
    terms: &TermsVersion,
    identity_kind: &str,
    network: &str,
    account_id: &str,
    account_display: Option<&str>,
    client_timestamp: DateTime<Utc>,
    message: &str,
    proof: Value,
) -> AppResult<SignatureRow> {
    let kind = if identity_kind == "social" {
        "social"
    } else {
        "wallet"
    };

    let row = sqlx::query_as::<_, SignatureRow>(
        r#"
        INSERT INTO signatures (
            property_id, terms_version_id, identity_kind, network, account_id,
            account_display, client_timestamp, message, proof
        )
        VALUES ($1, $2, $3::identity_kind, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (property_id, terms_version_id, network, account_id) DO UPDATE
        SET signed_at = NOW(), client_timestamp = EXCLUDED.client_timestamp,
            message = EXCLUDED.message, proof = EXCLUDED.proof
        RETURNING id, property_id, terms_version_id, network, account_id, signed_at
        "#,
    )
    .bind(property_id)
    .bind(terms.id)
    .bind(kind)
    .bind(network.to_uppercase())
    .bind(account_id)
    .bind(account_display)
    .bind(client_timestamp)
    .bind(message)
    .bind(proof)
    .fetch_one(pool)
    .await?;

    Ok(row)
}

#[allow(clippy::too_many_arguments)]
pub async fn submit_wallet(
    pool: &PgPool,
    property_raw: &str,
    allow_localhost: bool,
    network: &str,
    account_id_raw: &str,
    message: &str,
    proof: Value,
    client_timestamp: DateTime<Utc>,
    version_label: Option<&str>,
) -> AppResult<SignatureRow> {
    validate_timestamp(client_timestamp)?;

    let property: PropertyRow = resolve_property(pool, property_raw, allow_localhost).await?;
    if property.kind != PropertyKind::Website {
        return Err(AppError::BadRequest(
            "wallet signing requires a website property (hostname)".into(),
        ));
    }

    let network_upper = network.trim().to_uppercase();
    let account_id = normalize_account(&network_upper, account_id_raw)?;

    let terms = if let Some(label) = version_label {
        get_terms_by_label(pool, label)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("terms version {label}")))?
    } else {
        get_latest_terms(pool)
            .await?
            .ok_or_else(|| AppError::NotFound("no published terms".into()))?
    };

    let expected = build_wallet_message(
        &terms.version_label,
        terms.effective_date,
        &terms.content_sha256,
        &property.identifier,
        &network_upper,
        &account_id,
        client_timestamp,
    );
    verify_message_matches(&expected, message)?;
    verify_wallet_signature(&network_upper, &account_id, message, &proof)?;

    insert_signature(
        pool,
        property.id,
        &terms,
        "wallet",
        &network_upper,
        &account_id,
        None,
        client_timestamp,
        message,
        proof,
    )
    .await
}

#[allow(clippy::too_many_arguments)]
pub async fn submit_telegram(
    pool: &PgPool,
    property_raw: &str,
    allow_localhost: bool,
    account_id: &str,
    message: &str,
    proof: Value,
    client_timestamp: DateTime<Utc>,
    version_label: Option<&str>,
    account_display: Option<&str>,
) -> AppResult<SignatureRow> {
    validate_timestamp(client_timestamp)?;

    let property = resolve_property(pool, property_raw, allow_localhost).await?;
    if property.kind != PropertyKind::TelegramChannel {
        return Err(AppError::BadRequest(
            "telegram signing requires a telegram channel chat_id property".into(),
        ));
    }

    let account_id = normalize_account("TELEGRAM", account_id)?;

    let terms = if let Some(label) = version_label {
        get_terms_by_label(pool, label)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("terms version {label}")))?
    } else {
        get_latest_terms(pool)
            .await?
            .ok_or_else(|| AppError::NotFound("no published terms".into()))?
    };

    let expected = build_telegram_acceptance_message(
        &terms.version_label,
        terms.effective_date,
        &terms.content_sha256,
        &property.identifier,
        &account_id,
        client_timestamp,
    );
    verify_message_matches(&expected, message)?;

    insert_signature(
        pool,
        property.id,
        &terms,
        "social",
        "TELEGRAM",
        &account_id,
        account_display,
        client_timestamp,
        message,
        proof,
    )
    .await
}
