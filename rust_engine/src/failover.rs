use crate::provider::UniversalSmmClient;
use crate::types::*;
use anyhow::{bail, Result};
use std::sync::Arc;

pub struct FailoverRouter {
    providers: Vec<Arc<UniversalSmmClient>>,
}

impl FailoverRouter {
    pub fn new(providers: Vec<UniversalSmmClient>) -> Self {
        Self {
            providers: providers.into_iter().map(Arc::new).collect(),
        }
    }

    pub fn add_provider(&mut self, provider: UniversalSmmClient) {
        self.providers.push(Arc::new(provider));
    }

    pub async fn dispatch_order_with_failover(&self, req: &AddOrderRequest) -> Result<(String, u64)> {
        if self.providers.is_empty() {
            bail!("No upstream providers configured in router");
        }

        let mut errors = Vec::new();

        for provider in &self.providers {
            tracing::info!(
                provider = %provider.name,
                service = %req.service,
                quantity = %req.quantity,
                "Attempting upstream dispatch..."
            );

            match provider.add_order(req).await {
                Ok(order_id) => {
                    tracing::info!(
                        provider = %provider.name,
                        upstream_order_id = %order_id,
                        "Order successfully accepted by upstream provider!"
                    );
                    return Ok((provider.name.clone(), order_id));
                }
                Err(err) => {
                    tracing::warn!(
                        provider = %provider.name,
                        error = %err,
                        "Provider failed, failing over to next provider..."
                    );
                    errors.push(format!("{}: {}", provider.name, err));
                }
            }
        }

        bail!("All providers failed to fulfill order: {}", errors.join(" | "))
    }
}
