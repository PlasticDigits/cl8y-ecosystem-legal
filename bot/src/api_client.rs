use serde::Deserialize;

use crate::config::Config;

#[derive(Clone)]
pub struct LegalApi {
    base: String,
    client: reqwest::Client,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct StatusResponse {
    pub signed_latest: bool,
    pub latest_version: Option<String>,
    pub signed_version: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TermsLatest {
    pub version_label: String,
}

impl LegalApi {
    pub fn new(config: &Config) -> Self {
        Self {
            base: config.legal_api_base_url.trim_end_matches('/').to_string(),
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .user_agent("cl8y-terms-bot/1.0")
                .build()
                .expect("http client"),
        }
    }

    pub async fn status(&self, chat_id: i64, user_id: i64) -> anyhow::Result<StatusResponse> {
        let chat = chat_id.to_string();
        let uid = user_id.to_string();
        let property = urlencoding::encode(&chat);
        let account = urlencoding::encode(&uid);
        let url = format!(
            "{}/signatures/status?property={property}&network=TELEGRAM&account={account}",
            self.base
        );
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            anyhow::bail!("status API HTTP {}", resp.status());
        }
        Ok(resp.json().await?)
    }

    pub async fn latest_version(&self, chat_id: i64) -> anyhow::Result<Option<String>> {
        let chat = chat_id.to_string();
        let property = urlencoding::encode(&chat);
        let url = format!("{}/terms/latest?property={property}", self.base);
        let resp = self.client.get(&url).send().await?;
        if resp.status().as_u16() == 404 {
            return Ok(None);
        }
        if !resp.status().is_success() {
            anyhow::bail!("terms/latest HTTP {}", resp.status());
        }
        let body: TermsLatest = resp.json().await?;
        Ok(Some(body.version_label))
    }

    pub async fn latest_content(&self, chat_id: i64) -> anyhow::Result<String> {
        let chat = chat_id.to_string();
        let property = urlencoding::encode(&chat);
        let url = format!("{}/terms/latest/content?property={property}", self.base);
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            anyhow::bail!("terms content HTTP {}", resp.status());
        }
        Ok(resp.text().await?)
    }

    pub async fn is_signed_latest(&self, chat_id: i64, user_id: i64) -> anyhow::Result<bool> {
        Ok(self.status(chat_id, user_id).await?.signed_latest)
    }
}
