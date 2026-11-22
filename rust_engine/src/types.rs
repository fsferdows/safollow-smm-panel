use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmmService {
    pub service: String,
    pub name: String,
    #[serde(rename = "type", default = "default_type")]
    pub service_type: String,
    pub category: String,
    pub rate: String,
    pub min: String,
    pub max: String,
    #[serde(default)]
    pub refill: bool,
    #[serde(default)]
    pub cancel: bool,
}

fn default_type() -> String {
    "Default".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmmBalance {
    pub balance: String,
    pub currency: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddOrderRequest {
    pub service: String,
    pub link: String,
    pub quantity: u64,
    #[serde(default)]
    pub comments: Option<String>,
    #[serde(default)]
    pub runs: Option<u64>,
    #[serde(default)]
    pub interval: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddOrderResponse {
    pub order: Option<u64>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderStatusResponse {
    pub charge: Option<String>,
    pub start_count: Option<String>,
    pub status: Option<String>,
    pub remains: Option<String>,
    pub currency: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CancelResult {
    pub order: u64,
    pub cancel: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefillResponse {
    pub refill: Option<u64>,
    pub error: Option<String>,
}
