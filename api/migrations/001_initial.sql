CREATE TYPE property_kind AS ENUM ('website', 'telegram_channel');
CREATE TYPE identity_kind AS ENUM ('wallet', 'social');

CREATE TABLE terms_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_label TEXT NOT NULL UNIQUE,
    effective_date DATE NOT NULL,
    content_sha256 TEXT NOT NULL,
    content_text TEXT NOT NULL,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_latest BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX terms_versions_one_latest ON terms_versions ((TRUE)) WHERE is_latest;

CREATE TABLE properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind property_kind NOT NULL,
    identifier TEXT NOT NULL,
    display_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (kind, identifier)
);

CREATE INDEX properties_identifier ON properties (identifier);

CREATE TABLE signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    terms_version_id UUID NOT NULL REFERENCES terms_versions(id) ON DELETE CASCADE,
    identity_kind identity_kind NOT NULL,
    network TEXT NOT NULL,
    account_id TEXT NOT NULL,
    account_display TEXT,
    signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    client_timestamp TIMESTAMPTZ NOT NULL,
    message TEXT NOT NULL,
    proof JSONB NOT NULL,
    UNIQUE (property_id, terms_version_id, network, account_id)
);

CREATE INDEX signatures_lookup ON signatures (property_id, network, account_id);
