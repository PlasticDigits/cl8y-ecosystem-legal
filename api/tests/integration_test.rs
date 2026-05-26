use axum::body::Body;
use axum::http::{Request, StatusCode};
use chrono::Utc;
use cl8y_legal_api::{
    build_app, build_state, config::Config, message::build_wallet_message, terms::publish_from_path,
};
use http_body_util::BodyExt;
use k256::ecdsa::{signature::hazmat::PrehashSigner, SigningKey}; // PrehashSigner used by sign_prehash_recoverable
use sha3::{Digest, Keccak256};
use tower::ServiceExt;

fn test_config(database_url: &str) -> Config {
    Config {
        database_url: database_url.to_string(),
        listen_addr: "127.0.0.1:0".into(),
        legal_public_base_url: "http://localhost:8080".into(),
        terms_gitlab_raw_url: "https://gitlab.com/PlasticDigits/cl8y-ecosystem-legal/-/raw/main/TERMS_AND_CONDITIONS.txt".into(),
        terms_sync_interval_hours: 4,
        terms_sync_on_startup: false,
        admin_token: "test-admin".into(),
        telegram_bot_token: Some("123456:ABC-DEF".into()),
        rate_limit_read: 1000,
        rate_limit_write: 1000,
        cors_origins: vec!["*".into()],
        allow_localhost_property: true,
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
    let database_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| {
        "postgres://cl8y_legal:cl8y_legal@127.0.0.1:5432/cl8y_legal".into()
    });

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
