use crate::types::*;
use anyhow::{bail, Context, Result};
use reqwest::Client;
use std::collections::HashMap;
use std::time::Duration;

#[derive(Clone, Debug)]
pub struct UniversalSmmClient {
    pub name: String,
    pub api_url: String,
    pub api_key: String,
    http: Client,
}

impl UniversalSmmClient {
    pub fn new(name: impl Into<String>, api_url: impl Into<String>, api_key: impl Into<String>) -> Result<Self> {
        let http = Client::builder()
            .timeout(Duration::from_secs(30))
            .pool_max_idle_per_host(20)
            .user_agent("Universal-SMM-Rust-Gateway/3.0.0 (FS Ferdows)")
            .build()?;

        Ok(Self {
            name: name.into(),
            api_url: api_url.into().trim_end_matches('/').to_string(),
            api_key: api_key.into(),
            http,
        })
    }

    pub async fn get_balance(&self) -> Result<SmmBalance> {
        let mut form = HashMap::new();
        form.insert("key", self.api_key.as_str());
        form.insert("action", "balance");

        let res = self.http.post(&self.api_url)
            .form(&form)
            .send()
            .await
            .context("Failed to send balance request")?;

        let body = res.text().await?;
        let val: serde_json::Value = serde_json::from_str(&body)
            .context(format!("Failed to parse balance response: {}", body))?;

        if let Some(err) = val.get("error").and_then(|e| e.as_str()) {
            bail!("Provider error: {}", err);
        }

        let balance = val.get("balance")
            .and_then(|b| if b.is_string() { b.as_str().map(|s| s.to_string()) } else { Some(b.to_string()) })
            .unwrap_or_else(|| "0.00".to_string());

        let currency = val.get("currency")
            .and_then(|c| c.as_str())
            .unwrap_or("USD")
            .to_string();

        Ok(SmmBalance { balance, currency })
    }

    pub async fn get_services(&self) -> Result<Vec<SmmService>> {
        let mut form = HashMap::new();
        form.insert("key", self.api_key.as_str());
        form.insert("action", "services");

        let res = self.http.post(&self.api_url)
            .form(&form)
            .send()
            .await?;

        let services: Vec<SmmService> = res.json().await?;
        Ok(services)
    }

    pub async fn add_order(&self, req: &AddOrderRequest) -> Result<u64> {
        let mut form = HashMap::new();
        form.insert("key", self.api_key.as_str());
        form.insert("action", "add");
        form.insert("service", req.service.as_str());
        form.insert("link", req.link.as_str());
        let qty_str = req.quantity.to_string();
        form.insert("quantity", qty_str.as_str());

        if let Some(ref c) = req.comments {
            form.insert("comments", c.as_str());
        }
        let runs_str;
        if let Some(r) = req.runs {
            runs_str = r.to_string();
            form.insert("runs", runs_str.as_str());
        }
        let interval_str;
        if let Some(i) = req.interval {
            interval_str = i.to_string();
            form.insert("interval", interval_str.as_str());
        }

        let res = self.http.post(&self.api_url)
            .form(&form)
            .send()
            .await?;

        let body = res.text().await?;
        let parsed: serde_json::Value = serde_json::from_str(&body)?;

        if let Some(err) = parsed.get("error").and_then(|e| e.as_str()) {
            bail!("Provider rejected order: {}", err);
        }

        if let Some(order_id) = parsed.get("order").and_then(|o| o.as_u64()) {
            return Ok(order_id);
        }

        bail!("Missing order ID in response: {}", body);
    }

    pub async fn get_status(&self, order_id: u64) -> Result<OrderStatusResponse> {
        let mut form = HashMap::new();
        form.insert("key", self.api_key.as_str());
        form.insert("action", "status");
        let id_str = order_id.to_string();
        form.insert("order", id_str.as_str());

        let res = self.http.post(&self.api_url)
            .form(&form)
            .send()
            .await?;

        let resp: OrderStatusResponse = res.json().await?;
        Ok(resp)
    }

    pub async fn cancel_order(&self, order_id: u64) -> Result<bool> {
        let mut form = HashMap::new();
        form.insert("key", self.api_key.as_str());
        form.insert("action", "cancel");
        let id_str = order_id.to_string();
        form.insert("orders", id_str.as_str());

        let res = self.http.post(&self.api_url)
            .form(&form)
            .send()
            .await?;

        let body = res.text().await?;
        Ok(!body.contains("error"))
    }
}
