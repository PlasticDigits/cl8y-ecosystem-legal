-- State for cl8ytermsbot enforcement (shared DB with legal API).

CREATE TABLE bot_chat_state (
    chat_id BIGINT PRIMARY KEY,
    last_known_version TEXT,
    last_reminder_at TIMESTAMPTZ
);

CREATE TABLE bot_member_compliance (
    chat_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    required_since TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (chat_id, user_id)
);

CREATE INDEX bot_member_compliance_required_since ON bot_member_compliance (required_since);
