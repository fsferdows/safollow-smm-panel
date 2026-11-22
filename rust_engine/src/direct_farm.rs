use anyhow::{bail, Result};
use reqwest::header::{HeaderMap, HeaderValue};
use reqwest::Client;
use serde_json::Value;

const DEFAULT_USER_AGENT: &str = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 297.0.0.32.110";
const IG_APP_ID: &str = "936619743392459";

#[derive(Clone, Debug)]
pub struct InstagramBotAccount {
    pub username: String,
    pub session_id: String,
    pub ds_user_id: Option<String>,
    pub csrftoken: Option<String>,
}

pub struct InstagramDirectEngine {
    client: Client,
}

impl InstagramDirectEngine {
    pub fn new() -> Result<Self> {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()?;
        Ok(Self { client })
    }

    pub fn extract_username(input: &str) -> String {
        let s = input.trim().split('?').next().unwrap_or(input).trim_end_matches('/');
        if let Some(pos) = s.find("instagram.com/") {
            let part = &s[pos + 14..];
            return part.split('/').next().unwrap_or(part).to_string();
        }
        s.trim_start_matches('@').to_string()
    }

    pub async fn lookup_user(&self, username: &str) -> Result<u64> {
        let clean = Self::extract_username(username);
        let url = format!("https://www.instagram.com/api/v1/users/web_profile_info/?username={}", clean);

        let mut headers = HeaderMap::new();
        headers.insert("User-Agent", HeaderValue::from_static(DEFAULT_USER_AGENT));
        headers.insert("X-IG-App-ID", HeaderValue::from_static(IG_APP_ID));

        let res = self.client.get(&url).headers(headers).send().await?;
        let text = res.text().await?;
        let json: Value = serde_json::from_str(&text)?;

        if let Some(count) = json.pointer("/data/user/edge_followed_by/count").and_then(|c| c.as_u64()) {
            return Ok(count);
        }

        // Fallback: Default estimate
        Ok(0)
    }

    pub async fn follow_user(&self, bot: &InstagramBotAccount, target_user_id: &str) -> Result<bool> {
        let cookie_str = format!(
            "sessionid={}; ds_user_id={}; csrftoken={};",
            bot.session_id,
            bot.ds_user_id.as_deref().unwrap_or(""),
            bot.csrftoken.as_deref().unwrap_or("missing")
        );

        let mut headers = HeaderMap::new();
        headers.insert("User-Agent", HeaderValue::from_static(DEFAULT_USER_AGENT));
        headers.insert("X-IG-App-ID", HeaderValue::from_static(IG_APP_ID));
        headers.insert("Cookie", HeaderValue::from_str(&cookie_str)?);
        if let Some(ref csrf) = bot.csrftoken {
            headers.insert("X-CSRFToken", HeaderValue::from_str(csrf)?);
        }

        let url = format!("https://www.instagram.com/api/v1/friendships/create/{}/", target_user_id);
        let res = self.client.post(&url)
            .headers(headers)
            .form(&[("user_id", target_user_id)])
            .send()
            .await?;

        let body = res.text().await?;
        let json: Value = serde_json::from_str(&body)?;

        if json.get("status").and_then(|s| s.as_str()) == Some("ok") {
            return Ok(true);
        }

        bail!("Follow action failed: {}", body);
    }
}
