use crate::failover::FailoverRouter;
use crate::provider::UniversalSmmClient;
use crate::types::*;
use axum::{
    extract::{Query, State},
    response::Json,
    routing::{get, post},
    Form, Router,
};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use tower_http::cors::CorsLayer;

pub struct AppState {
    pub router: FailoverRouter,
}

pub fn create_app(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/health", get(health_check))
        .route("/api/v2", post(handle_api_v2).get(handle_api_v2_get))
        .route("/api/v1", post(handle_api_v2).get(handle_api_v2_get))
        .layer(CorsLayer::permissive())
        .with_state(state)
}

async fn health_check() -> Json<Value> {
    Json(json!({
        "status": "healthy",
        "engine": "Universal-SMM-Rust-Gateway",
        "version": "3.0.0",
        "author": "FS Ferdows"
    }))
}

async fn handle_api_v2_get(
    State(state): State<Arc<AppState>>,
    Query(params): Query<HashMap<String, String>>,
) -> Json<Value> {
    process_smm_action(state, params).await
}

async fn handle_api_v2(
    State(state): State<Arc<AppState>>,
    Form(params): Form<HashMap<String, String>>,
) -> Json<Value> {
    process_smm_action(state, params).await
}

async fn process_smm_action(
    state: Arc<AppState>,
    params: HashMap<String, String>,
) -> Json<Value> {
    let action = params.get("action").map(|s| s.as_str()).unwrap_or("");

    match action {
        "balance" => Json(json!({
            "balance": "9999.0000",
            "currency": "USD"
        })),
        "services" => Json(json!([
            {
                "service": "1925",
                "name": "Instagram Followers | High Speed Instant (Universal Gateway)",
                "type": "Default",
                "category": "Instagram Followers",
                "rate": "0.1500",
                "min": "100",
                "max": "50000",
                "refill": true,
                "cancel": true
            }
        ])),
        "add" => {
            let service = params.get("service").cloned().unwrap_or_default();
            let link = params.get("link").cloned().unwrap_or_default();
            let quantity = params
                .get("quantity")
                .and_then(|q| q.parse::<u64>().ok())
                .unwrap_or(100);

            let req = AddOrderRequest {
                service,
                link,
                quantity,
                comments: params.get("comments").cloned(),
                runs: params.get("runs").and_then(|r| r.parse().ok()),
                interval: params.get("interval").and_then(|i| i.parse().ok()),
            };

            match state.router.dispatch_order_with_failover(&req).await {
                Ok((provider_name, order_id)) => Json(json!({
                    "order": order_id,
                    "provider": provider_name
                })),
                Err(err) => Json(json!({
                    "error": format!("Dispatch failed: {}", err)
                })),
            }
        }
        "status" => {
            let order_id = params.get("order").cloned().unwrap_or_else(|| "1".to_string());
            Json(json!({
                "charge": "0.1500",
                "start_count": "8522",
                "status": "In progress",
                "remains": "0",
                "currency": "USD",
                "order": order_id
            }))
        }
        _ => Json(json!({
            "error": "action is not specified or unknown"
        })),
    }
}
