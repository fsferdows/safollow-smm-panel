mod direct_farm;
mod failover;
mod provider;
mod server;
mod types;

use clap::{Parser, Subcommand};
use failover::FailoverRouter;
use provider::UniversalSmmClient;
use std::net::SocketAddr;
use std::sync::Arc;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Parser)]
#[command(name = "universal-smm-gateway")]
#[command(author = "FS Ferdows <fsferdows@icloud.com>")]
#[command(version = "3.0.0")]
#[command(about = "High-Performance Universal SMM Panel API Gateway in Rust", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Start the high-performance Universal SMM HTTP Gateway server
    Serve {
        #[arg(short, long, default_value_t = 3002)]
        port: u16,
    },
    /// Query account balance on any upstream provider
    Balance {
        #[arg(short, long)]
        url: String,
        #[arg(short, long)]
        key: String,
    },
    /// Directly lookup live Instagram profile follower count
    Lookup {
        #[arg(short, long)]
        username: String,
    },
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let cli = Cli::parse();

    match cli.command {
        Commands::Serve { port } => {
            tracing::info!("🚀 Starting Universal SMM Rust Gateway on port {}", port);

            // Pre-configure wholesale providers
            let mut providers = Vec::new();

            if let Ok(p) = UniversalSmmClient::new(
                "Ezkify Global",
                "https://ezkify.com/api/v2",
                "e46d816d996d500f326e43a3011a1540",
            ) {
                providers.push(p);
            }

            if let Ok(p) = UniversalSmmClient::new(
                "SAFollow Official",
                "https://www.safollow.com/api/v2",
                "",
            ) {
                providers.push(p);
            }

            if let Ok(p) = UniversalSmmClient::new(
                "NeoFollower",
                "https://panel.neofollower.com/api/v1",
                "",
            ) {
                providers.push(p);
            }

            let router = FailoverRouter::new(providers);
            let state = Arc::new(server::AppState { router });
            let app = server::create_app(state);

            let addr = SocketAddr::from(([127, 0, 0, 1], port));
            let listener = tokio::net::TcpListener::bind(addr).await?;
            tracing::info!("✨ Server listening on http://127.0.0.1:{}", port);

            axum::serve(listener, app).await?;
        }
        Commands::Balance { url, key } => {
            let client = UniversalSmmClient::new("Test Provider", url, key)?;
            let bal = client.get_balance().await?;
            println!("Balance: {} {}", bal.balance, bal.currency);
        }
        Commands::Lookup { username } => {
            let engine = direct_farm::InstagramDirectEngine::new()?;
            let count = engine.lookup_user(&username).await?;
            println!("Profile @{} Follower Count: {}", username, count);
        }
    }

    Ok(())
}
