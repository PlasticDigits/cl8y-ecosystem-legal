use axum::body::Body;
use axum::http::{Request, StatusCode};
use chrono::Utc;
use cl8y_legal_api::{
    build_app, build_state, config::Config, message::build_wallet_message, terms::publish_from_path,
};
use http_body_util::BodyExt;
use k256::ecdsa::{signature::hazmat::PrehashSigner, SigningKey};
use sha3::{Digest, Keccak256};
use tokio::sync::Mutex;
use tower::ServiceExt;

/// Shared Postgres fixture — serialize integration tests that truncate tables.
static DB_LOCK: Mutex<()> = Mutex::const_new(());

fn test_config(database_url: &str) -> Config {
    Config {
        database_url: database_url.to_string(),
        listen_addr: "127.0.0.1:0".into(),
        legal_public_base_url: "http://localhost:8080".into(),
        terms_gitlab_raw_url: "https://gitlab.com/PlasticDigits/cl8y-ecosystem-legal/-/raw/main/TERMS_AND_CONDITIONS.txt".into(),
        terms_sync_interval_hours: 4,
        terms_sync_on_startup: false,
        admin_token: "test-admin".into(),
        allow_insecure_defaults: false,
        telegram_bot_token: Some("123456:ABC-DEF".into()),
        rate_limit_read: 1000,
        rate_limit_write: 1000,
        cors_origins: vec!["*".into()],
        allow_localhost_property: true,
        trusted_proxy_cidrs: vec![],
        static_dir: None,
    }
}

fn eip191_sign(key: &SigningKey, message: &str) -> String {
    let prefix = format!("\x19Ethereum Signed Message:\n{}", message.len());
    let mut hasher = Keccak256::new();
    hasher.update(prefix.as_bytes());
    hasher.update(message.as_bytes());
    let hash: [u8; 32] = hasher.finalize().into();

    let (sig, recid) = key.sign_prehash_recoverable(&hash).unwrap();
    let mut bytes = [0u8; 65];
    bytes[..64].copy_from_slice(&sig.to_bytes());
    bytes[64] = recid.to_byte() + 27;
    format!("0x{}", hex::encode(bytes))
}

async fn body_json(body: Body) -> serde_json::Value {
    let bytes = body.collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap()
}

#[tokio::test]
async fn integration_property_scoped_signatures() {
    let _guard = DB_LOCK.lock().await;
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://cl8y_legal:cl8y_legal@127.0.0.1:5432/cl8y_legal".into());

    let config = test_config(&database_url);
    let state = match build_state(config).await {
        Ok(s) => s,
        Err(e) => {
            eprintln!("SKIP integration_property_scoped_signatures: {e}");
            return;
        }
    };

    sqlx::query("DELETE FROM signatures")
        .execute(&state.pool)
        .await
        .ok();
    sqlx::query("DELETE FROM terms_versions")
        .execute(&state.pool)
        .await
        .ok();
    sqlx::query("DELETE FROM properties")
        .execute(&state.pool)
        .await
        .ok();

    let terms_path = concat!(env!("CARGO_MANIFEST_DIR"), "/../TERMS_AND_CONDITIONS.txt");
    publish_from_path(&state.pool, terms_path)
        .await
        .expect("publish");

    let app = build_app(state);

    let key = SigningKey::from_slice(&[0x22u8; 32]).unwrap();
    let address = {
        use k256::ecdsa::VerifyingKey;
        use sha3::{Digest, Keccak256};
        let vk = VerifyingKey::from(&key);
        let pubkey = vk.to_encoded_point(false);
        let mut hasher = Keccak256::new();
        hasher.update(&pubkey.as_bytes()[1..]);
        let digest: [u8; 32] = hasher.finalize().into();
        format!("0x{}", hex::encode(&digest[12..]))
    };
    let ts = Utc::now();

    async fn sign_for_property(
        app: &axum::Router,
        property: &str,
        key: &SigningKey,
        address: &str,
        ts: chrono::DateTime<Utc>,
    ) -> serde_json::Value {
        let terms: serde_json::Value = body_json(
            app.clone()
                .oneshot(
                    Request::builder()
                        .uri(format!("/api/v1/terms/latest?property={property}"))
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap()
                .into_body(),
        )
        .await;

        let effective = chrono::NaiveDate::parse_from_str(
            terms["effective_date"].as_str().unwrap(),
            "%Y-%m-%d",
        )
        .expect("effective_date");
        let message = build_wallet_message(
            terms["version_label"].as_str().unwrap(),
            effective,
            property,
            "EVM",
            address,
            ts,
        );

        let signature = eip191_sign(key, &message);
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/signatures/wallet")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::json!({
                            "property": property,
                            "network": "EVM",
                            "account_id": address,
                            "message": message,
                            "signature": signature,
                            "client_timestamp": ts.to_rfc3339(),
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        body_json(res.into_body()).await
    }

    sign_for_property(&app, "cl8y.com", &key, &address, ts).await;
    sign_for_property(&app, "yieldomega.com", &key, &address, ts).await;

    let status_cl8y = body_json(
        app.clone()
            .oneshot(
                Request::builder()
                    .uri(format!(
                        "/api/v1/signatures/status?property=cl8y.com&network=EVM&account={address}"
                    ))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap()
            .into_body(),
    )
    .await;
    assert_eq!(status_cl8y["signed_latest"], true);

    let status_yo = body_json(
        app.clone()
            .oneshot(
                Request::builder()
                    .uri(format!(
                        "/api/v1/signatures/status?property=yieldomega.com&network=EVM&account={address}"
                    ))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap()
            .into_body(),
    )
    .await;
    assert_eq!(status_yo["signed_latest"], true);

    // Different property not signed: use fresh address
    let status_other = body_json(
        app.oneshot(
            Request::builder()
                .uri(
                    "/api/v1/signatures/status?property=other.example.com&network=EVM&account=0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
                )
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap()
        .into_body(),
    )
    .await;
    assert_eq!(status_other["signed_latest"], false);
}

fn terra_address_and_pubkey(key: &SigningKey) -> (String, String) {
    use base64::{engine::general_purpose::STANDARD, Engine};
    use bech32::{encode, ToBase32, Variant};
    use k256::ecdsa::VerifyingKey;
    use ripemd::Ripemd160;
    use sha2::{Digest, Sha256};

    let vk = VerifyingKey::from(key);
    let compressed = vk.to_encoded_point(true);
    let digest = Sha256::digest(compressed.as_bytes());
    let rip = Ripemd160::digest(digest);
    let address = encode("terra", rip.to_base32(), Variant::Bech32).expect("bech32");
    (address, STANDARD.encode(compressed.as_bytes()))
}

fn terra_adr036_sign(key: &SigningKey, address: &str, message: &str) -> String {
    use base64::{engine::general_purpose::STANDARD, Engine};
    use cl8y_legal_api::verify::adr036_sign_doc_bytes;
    use k256::ecdsa::{signature::Signer, Signature};

    let doc = adr036_sign_doc_bytes(address, message);
    let sig: Signature = key.sign(&doc);
    STANDARD.encode(sig.to_bytes())
}

async fn reset_db(pool: &sqlx::PgPool) {
    sqlx::query("DELETE FROM signatures")
        .execute(pool)
        .await
        .ok();
    sqlx::query("DELETE FROM terms_versions")
        .execute(pool)
        .await
        .ok();
    sqlx::query("DELETE FROM properties")
        .execute(pool)
        .await
        .ok();
}

async fn publish_fixture_terms(pool: &sqlx::PgPool) {
    let terms_path = concat!(env!("CARGO_MANIFEST_DIR"), "/../TERMS_AND_CONDITIONS.txt");
    publish_from_path(pool, terms_path).await.expect("publish");
}

async fn post_wallet(app: axum::Router, body: serde_json::Value) -> StatusCode {
    app.oneshot(
        Request::builder()
            .method("POST")
            .uri("/api/v1/signatures/wallet")
            .header("content-type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap(),
    )
    .await
    .unwrap()
    .status()
}

#[tokio::test]
async fn integration_terra_classic_adr036_wallet_submit() {
    let _guard = DB_LOCK.lock().await;
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://cl8y_legal:cl8y_legal@127.0.0.1:5432/cl8y_legal".into());

    let config = test_config(&database_url);
    let state = match build_state(config).await {
        Ok(s) => s,
        Err(e) => {
            eprintln!("SKIP integration_terra_classic_adr036_wallet_submit: {e}");
            return;
        }
    };

    reset_db(&state.pool).await;
    publish_fixture_terms(&state.pool).await;

    let app = build_app(state);
    let key = SigningKey::from_slice(&[0x33u8; 32]).unwrap();
    let (address, pubkey_b64) = terra_address_and_pubkey(&key);
    let ts = Utc::now();
    let property = "terra-classic.example.com";

    let terms: serde_json::Value = body_json(
        app.clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/v1/terms/latest?property={property}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap()
            .into_body(),
    )
    .await;

    let effective =
        chrono::NaiveDate::parse_from_str(terms["effective_date"].as_str().unwrap(), "%Y-%m-%d")
            .expect("effective_date");
    let message = build_wallet_message(
        terms["version_label"].as_str().unwrap(),
        effective,
        property,
        "TERRA_CLASSIC",
        &address,
        ts,
    );
    let signature = terra_adr036_sign(&key, &address, &message);

    let res = post_wallet(
        app.clone(),
        serde_json::json!({
            "property": property,
            "network": "TERRA_CLASSIC",
            "account_id": address,
            "message": message,
            "signature": signature,
            "pubkey": pubkey_b64,
            "client_timestamp": ts.to_rfc3339(),
        }),
    )
    .await;
    assert_eq!(res, StatusCode::OK);

    let status = body_json(
        app.oneshot(
            Request::builder()
                .uri(format!(
                    "/api/v1/signatures/status?property={property}&network=TERRA_CLASSIC&account={address}"
                ))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap()
        .into_body(),
    )
    .await;
    assert_eq!(status["signed_latest"], true);
}

/// Issue #1 abuse paths: cross-property replay, skewed timestamp, wrong pubkey at HTTP layer.
#[tokio::test]
async fn integration_terra_classic_adr036_rejects_abuse() {
    let _guard = DB_LOCK.lock().await;
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://cl8y_legal:cl8y_legal@127.0.0.1:5432/cl8y_legal".into());

    let config = test_config(&database_url);
    let state = match build_state(config).await {
        Ok(s) => s,
        Err(e) => {
            eprintln!("SKIP integration_terra_classic_adr036_rejects_abuse: {e}");
            return;
        }
    };

    reset_db(&state.pool).await;
    publish_fixture_terms(&state.pool).await;

    let app = build_app(state);
    let key = SigningKey::from_slice(&[0x33u8; 32]).unwrap();
    let other_key = SigningKey::from_slice(&[0x44u8; 32]).unwrap();
    let (address, pubkey_b64) = terra_address_and_pubkey(&key);
    let (_other_addr, other_pubkey_b64) = terra_address_and_pubkey(&other_key);
    let ts = Utc::now();
    let property_a = "terra-a.example.com";
    let property_b = "terra-b.example.com";

    for property in [property_a, property_b] {
        let _ = body_json(
            app.clone()
                .oneshot(
                    Request::builder()
                        .uri(format!("/api/v1/terms/latest?property={property}"))
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap()
                .into_body(),
        )
        .await;
    }

    let terms: serde_json::Value = body_json(
        app.clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/v1/terms/latest?property={property_a}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap()
            .into_body(),
    )
    .await;
    let effective =
        chrono::NaiveDate::parse_from_str(terms["effective_date"].as_str().unwrap(), "%Y-%m-%d")
            .expect("effective_date");
    let version = terms["version_label"].as_str().unwrap();

    let message_a = build_wallet_message(
        version,
        effective,
        property_a,
        "TERRA_CLASSIC",
        &address,
        ts,
    );
    let signature_a = terra_adr036_sign(&key, &address, &message_a);

    let message_b = build_wallet_message(
        version,
        effective,
        property_b,
        "TERRA_CLASSIC",
        &address,
        ts,
    );
    assert_ne!(message_a, message_b);

    let replay = post_wallet(
        app.clone(),
        serde_json::json!({
            "property": property_b,
            "network": "TERRA_CLASSIC",
            "account_id": address,
            "message": message_b,
            "signature": signature_a,
            "pubkey": pubkey_b64,
            "client_timestamp": ts.to_rfc3339(),
        }),
    )
    .await;
    assert_eq!(replay, StatusCode::BAD_REQUEST);

    let tampered = post_wallet(
        app.clone(),
        serde_json::json!({
            "property": property_a,
            "network": "TERRA_CLASSIC",
            "account_id": address,
            "message": message_b,
            "signature": signature_a,
            "pubkey": pubkey_b64,
            "client_timestamp": ts.to_rfc3339(),
        }),
    )
    .await;
    assert_eq!(tampered, StatusCode::BAD_REQUEST);

    let wrong_pk = post_wallet(
        app.clone(),
        serde_json::json!({
            "property": property_a,
            "network": "TERRA_CLASSIC",
            "account_id": address,
            "message": message_a,
            "signature": signature_a,
            "pubkey": other_pubkey_b64,
            "client_timestamp": ts.to_rfc3339(),
        }),
    )
    .await;
    assert_eq!(wrong_pk, StatusCode::BAD_REQUEST);

    let skewed_ts = ts - chrono::Duration::seconds(301);
    let skewed_msg = build_wallet_message(
        version,
        effective,
        property_a,
        "TERRA_CLASSIC",
        &address,
        skewed_ts,
    );
    let skewed_sig = terra_adr036_sign(&key, &address, &skewed_msg);
    let skew = post_wallet(
        app,
        serde_json::json!({
            "property": property_a,
            "network": "TERRA_CLASSIC",
            "account_id": address,
            "message": skewed_msg,
            "signature": skewed_sig,
            "pubkey": pubkey_b64,
            "client_timestamp": skewed_ts.to_rfc3339(),
        }),
    )
    .await;
    assert_eq!(skew, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn integration_update_terms_requires_admin_bearer() {
    let _guard = DB_LOCK.lock().await;
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://cl8y_legal:cl8y_legal@127.0.0.1:5432/cl8y_legal".into());

    let config = test_config(&database_url);
    let state = match build_state(config).await {
        Ok(s) => s,
        Err(e) => {
            eprintln!("SKIP integration_update_terms_requires_admin_bearer: {e}");
            return;
        }
    };
    let app = build_app(state);

    let unauth = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/update_terms")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(unauth.status(), StatusCode::UNAUTHORIZED);

    let bad = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/update_terms")
                .header("authorization", "Bearer wrong")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(bad.status(), StatusCode::UNAUTHORIZED);

    let health = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(health.status(), StatusCode::OK);

    let admin_unauth = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/admin/properties")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(admin_unauth.status(), StatusCode::UNAUTHORIZED);

    let admin_ok = app
        .oneshot(
            Request::builder()
                .uri("/admin/properties")
                .header("authorization", "Bearer test-admin")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(admin_ok.status(), StatusCode::OK);
}
