use sqlx::PgPool;

pub async fn connect(database_url: &str) -> anyhow::Result<PgPool> {
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(5)
        .connect(database_url)
        .await?;
    Ok(pool)
}

pub async fn get_last_known_version(pool: &PgPool, chat_id: i64) -> anyhow::Result<Option<String>> {
    let row: Option<(Option<String>,)> =
        sqlx::query_as("SELECT last_known_version FROM bot_chat_state WHERE chat_id = $1")
            .bind(chat_id)
            .fetch_optional(pool)
            .await?;
    Ok(row.and_then(|r| r.0))
}

pub async fn set_last_known_version(pool: &PgPool, chat_id: i64, version: &str) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        INSERT INTO bot_chat_state (chat_id, last_known_version, last_reminder_at)
        VALUES ($1, $2, NULL)
        ON CONFLICT (chat_id) DO UPDATE SET last_known_version = EXCLUDED.last_known_version
        "#,
    )
    .bind(chat_id)
    .bind(version)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn touch_reminder(pool: &PgPool, chat_id: i64) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        INSERT INTO bot_chat_state (chat_id, last_known_version, last_reminder_at)
        VALUES ($1, NULL, NOW())
        ON CONFLICT (chat_id) DO UPDATE SET last_reminder_at = NOW()
        "#,
    )
    .bind(chat_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn mark_non_compliant(pool: &PgPool, chat_id: i64, user_id: i64) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        INSERT INTO bot_member_compliance (chat_id, user_id, required_since)
        VALUES ($1, $2, NOW())
        ON CONFLICT (chat_id, user_id) DO NOTHING
        "#,
    )
    .bind(chat_id)
    .bind(user_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn reset_compliance_deadlines(pool: &PgPool, chat_id: i64) -> anyhow::Result<()> {
    sqlx::query(
        "UPDATE bot_member_compliance SET required_since = NOW() WHERE chat_id = $1",
    )
    .bind(chat_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn clear_compliant(pool: &PgPool, chat_id: i64, user_id: i64) -> anyhow::Result<()> {
    sqlx::query("DELETE FROM bot_member_compliance WHERE chat_id = $1 AND user_id = $2")
        .bind(chat_id)
        .bind(user_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Distinct users past the grace period in at least one tracked group.
pub async fn overdue_user_ids(pool: &PgPool, grace_days: i64) -> anyhow::Result<Vec<i64>> {
    let rows: Vec<(i64,)> = sqlx::query_as(
        r#"
        SELECT DISTINCT user_id
        FROM bot_member_compliance
        WHERE required_since < NOW() - ($1::bigint * INTERVAL '1 day')
        "#,
    )
    .bind(grace_days)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(|r| r.0).collect())
}

pub async fn clear_user_compliance(pool: &PgPool, user_id: i64) -> anyhow::Result<()> {
    sqlx::query("DELETE FROM bot_member_compliance WHERE user_id = $1")
        .bind(user_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn members_for_chat(pool: &PgPool, chat_id: i64) -> anyhow::Result<Vec<i64>> {
    let rows: Vec<(i64,)> =
        sqlx::query_as("SELECT user_id FROM bot_member_compliance WHERE chat_id = $1")
            .bind(chat_id)
            .fetch_all(pool)
            .await?;
    Ok(rows.into_iter().map(|r| r.0).collect())
}
