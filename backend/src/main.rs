mod auth;
mod config;
mod crypto;
mod error;
mod models;
mod routes;

use std::net::SocketAddr;

use axum::{
    http::{header, HeaderValue, Method},
    routing::{get, patch, post},
    Router,
};
use sqlx::{postgres::PgPoolOptions, PgPool};
use tower_http::{
    cors::{AllowOrigin, CorsLayer},
    trace::TraceLayer,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::{config::Config, crypto::VaultCrypto};

pub const APP_VERSION: &str = env!("STARWARD_APP_VERSION");

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub config: Config,
    pub crypto: VaultCrypto,
}

const INIT_MIGRATION_SQL: &str = include_str!("../migrations/001_init.sql");

pub async fn init_db(database_url: &str) -> Result<PgPool, sqlx::Error> {
    let pool = PgPoolOptions::new()
        .max_connections(15)
        .connect(database_url)
        .await?;

    sqlx::raw_sql(INIT_MIGRATION_SQL).execute(&pool).await?;

    Ok(pool)
}

fn is_wildcard_cors_origin(origin: &str) -> bool {
    let trimmed = origin.trim();
    if trimmed.is_empty() || trimmed == "*" {
        return true;
    }

    let without_scheme = trimmed
        .strip_prefix("http://")
        .or_else(|| trimmed.strip_prefix("https://"))
        .unwrap_or(trimmed);
    let authority = without_scheme.split('/').next().unwrap_or("");

    authority == "0.0.0.0"
        || authority.starts_with("0.0.0.0:")
        || authority == "[::]"
        || authority.starts_with("[::]:")
        || authority == "*"
        || authority.starts_with("*:")
}

fn build_cors_origin(raw: &str) -> AllowOrigin {
    if is_wildcard_cors_origin(raw) {
        return AllowOrigin::mirror_request();
    }

    let origins: Vec<HeaderValue> = raw
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .filter_map(|s| s.parse::<HeaderValue>().ok())
        .collect();

    if origins.is_empty() {
        AllowOrigin::exact(HeaderValue::from_static("http://localhost:3000"))
    } else if origins.len() == 1 {
        AllowOrigin::exact(origins.into_iter().next().unwrap())
    } else {
        AllowOrigin::list(origins)
    }
}

pub fn build_app(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(build_cors_origin(&state.config.cors_origin))
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PATCH,
            Method::PUT,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE, header::ACCEPT]);

    Router::new()
        .route("/api/health", get(routes::health::health_check))
        .route("/api/me", get(routes::users::get_me))
        .route("/api/users", get(routes::users::list_users))
        .route(
            "/api/vaults",
            get(routes::vaults::list_vaults).post(routes::vaults::create_vault),
        )
        .route(
            "/api/vaults/{vault_id}",
            patch(routes::vaults::update_vault).delete(routes::vaults::delete_vault),
        )
        .route(
            "/api/vaults/{vault_id}/members",
            post(routes::vaults::share_vault),
        )
        .route(
            "/api/vaults/{vault_id}/members/{member_id}",
            patch(routes::vaults::update_member_role).delete(routes::vaults::remove_member),
        )
        .route(
            "/api/vaults/{vault_id}/audit",
            get(routes::vaults::get_vault_audit),
        )
        .route(
            "/api/credentials",
            get(routes::credentials::list_credentials).post(routes::credentials::create_credential),
        )
        .route(
            "/api/credentials/{credential_id}",
            get(routes::credentials::get_credential)
                .patch(routes::credentials::update_credential)
                .delete(routes::credentials::delete_credential),
        )
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

#[tokio::main]
async fn main() {
    let _ = dotenvy::dotenv();

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "starward_backend=debug,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Config::from_env();
    let db = init_db(&config.database_url)
        .await
        .expect("Failed to connect to PostgreSQL and run migrations");
    let crypto = VaultCrypto::from_master_key(&config.master_key);

    let addr: SocketAddr = format!("{}:{}", config.host, config.port)
        .parse()
        .expect("Invalid HOST:PORT");

    let state = AppState { db, config, crypto };
    let app = build_app(state);

    tracing::info!(
        "Starward Rust backend v{} (PostgreSQL) listening on http://{}",
        APP_VERSION,
        addr
    );
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Failed to bind TCP listener");

    axum::serve(listener, app)
        .await
        .expect("Server error");
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use chrono::Utc;
    use http_body_util::BodyExt;
    use jsonwebtoken::{encode, EncodingKey, Header};
    use serde_json::{json, Value};
    use tower::ServiceExt;
    use uuid::Uuid;

    use crate::auth::AuthClaims;

    fn make_token(secret: &str, id: &str, email: &str, name: &str) -> String {
        let claims = AuthClaims {
            sub: id.to_string(),
            email: email.to_string(),
            name: name.to_string(),
            image: None,
            exp: (Utc::now().timestamp() + 3600) as usize,
        };
        let encoding_key = EncodingKey::from_secret(secret.as_bytes()).unwrap();
        encode(&Header::default(), &claims, &encoding_key).unwrap()
    }

    async fn read_json(res: axum::response::Response) -> Value {
        let bytes = res.into_body().collect().await.unwrap().to_bytes();
        serde_json::from_slice(&bytes).unwrap()
    }

    #[test]
    fn app_version_is_populated() {
        assert!(!APP_VERSION.is_empty());
        assert!(!APP_VERSION.starts_with('v'));
    }

    #[test]
    fn wildcard_cors_origin_detection_works() {
        assert!(is_wildcard_cors_origin("http://0.0.0.0:3000"));
        assert!(is_wildcard_cors_origin("https://0.0.0.0:3000"));
        assert!(is_wildcard_cors_origin("http://0.0.0.0"));
        assert!(is_wildcard_cors_origin("http://[::]:3000"));
        assert!(is_wildcard_cors_origin("*"));
        assert!(!is_wildcard_cors_origin("http://localhost:3000"));
        assert!(!is_wildcard_cors_origin("https://vault.example.com"));
        assert!(!is_wildcard_cors_origin("http://192.168.1.50:3000"));
    }

    #[tokio::test]
    async fn shared_folder_workflow_and_permissions_postgres() {
        let Ok(database_url) = std::env::var("TEST_DATABASE_URL") else {
            eprintln!("Skipping PostgreSQL integration test: TEST_DATABASE_URL not set");
            return;
        };

        let config = Config {
            host: "127.0.0.1".to_string(),
            port: 0,
            database_url,
            auth_secret: "test-secret-key-for-jwt-validation-32".to_string(),
            master_key: "test-master-key-for-aes-256-gcm-enc".to_string(),
            cors_origin: "http://localhost:3000".to_string(),
        };

        let db = init_db(&config.database_url).await.unwrap();
        let crypto = VaultCrypto::from_master_key(&config.master_key);
        let app = build_app(AppState {
            db: db.clone(),
            config: config.clone(),
            crypto,
        });

        let suffix = Uuid::new_v4().simple().to_string();
        let alice_id = format!("test-alice-{suffix}");
        let bob_id = format!("test-bob-{suffix}");
        let alice_email = format!("alice-{suffix}@starward.io");
        let bob_email = format!("bob-{suffix}@starward.io");

        let alice_token = make_token(&config.auth_secret, &alice_id, &alice_email, "Alice");
        let bob_token = make_token(&config.auth_secret, &bob_id, &bob_email, "Bob");

        // 1. Alice creates a shared folder "Produzione"
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/vaults")
                    .header("Authorization", format!("Bearer {alice_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({
                            "name": "Produzione",
                            "description": "Accessi server prod",
                            "icon": "server",
                            "color": "emerald"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CREATED);
        let prod_vault = read_json(res).await;
        let prod_id = prod_vault["id"].as_str().unwrap().to_string();

        // 2. Alice shares "Produzione" with Bob before Bob logs in
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/vaults/{prod_id}/members"))
                    .header("Authorization", format!("Bearer {alice_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({ "email": bob_email, "role": "viewer" }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CREATED);

        // 3. Alice adds an encrypted credential
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/credentials")
                    .header("Authorization", format!("Bearer {alice_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({
                            "vault_id": prod_id,
                            "title": "AWS Root",
                            "username": "ops@starward.io",
                            "password": "UltraSecret!Password99",
                            "url": "https://console.aws.amazon.com",
                            "category": "login",
                            "notes": "MFA hardware key in safe"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CREATED);
        let cred = read_json(res).await;
        let cred_id = cred["id"].as_str().unwrap().to_string();

        // Verify password is encrypted at rest in Postgres
        let raw_cipher: (String,) =
            sqlx::query_as("SELECT password_ciphertext FROM credentials WHERE id = $1")
                .bind(&cred_id)
                .fetch_one(&db)
                .await
                .unwrap();
        assert!(!raw_cipher.0.contains("UltraSecret"));

        // 4. Bob lists vaults and sees shared "Produzione"
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/vaults")
                    .header("Authorization", format!("Bearer {bob_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let bob_vaults = read_json(res).await;
        let shared = bob_vaults
            .as_array()
            .unwrap()
            .iter()
            .find(|v| v["id"] == prod_id)
            .unwrap();
        assert_eq!(shared["is_shared_with_me"], true);
        assert_eq!(shared["role"], "viewer");

        // 5. Bob reads decrypted credential
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri(format!("/api/credentials?vault_id={prod_id}"))
                    .header("Authorization", format!("Bearer {bob_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let bob_creds = read_json(res).await;
        assert_eq!(bob_creds[0]["password"], "UltraSecret!Password99");

        // 6. Bob (viewer) is forbidden from deleting
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri(format!("/api/credentials/{cred_id}"))
                    .header("Authorization", format!("Bearer {bob_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::FORBIDDEN);

        // 7. Concurrent first requests for a brand-new user create exactly one Personal vault
        let charlie_id = format!("test-charlie-{suffix}");
        let charlie_email = format!("charlie-{suffix}@starward.io");
        let charlie_token = make_token(&config.auth_secret, &charlie_id, &charlie_email, "Charlie");

        let (res_vaults, res_creds) = tokio::join!(
            app.clone().oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/vaults")
                    .header("Authorization", format!("Bearer {charlie_token}"))
                    .body(Body::empty())
                    .unwrap(),
            ),
            app.clone().oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/credentials")
                    .header("Authorization", format!("Bearer {charlie_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
        );
        let res_vaults = res_vaults.unwrap();
        let res_creds = res_creds.unwrap();
        assert_eq!(res_vaults.status(), StatusCode::OK);
        assert_eq!(res_creds.status(), StatusCode::OK);

        let charlie_vaults = read_json(res_vaults).await;
        let personal_vaults: Vec<&Value> = charlie_vaults
            .as_array()
            .unwrap()
            .iter()
            .filter(|v| v["is_personal"] == true)
            .collect();
        assert_eq!(personal_vaults.len(), 1);
        let charlie_personal_id = personal_vaults[0]["id"].as_str().unwrap().to_string();

        // 8. Database credential encrypts extra fields at rest and returns decrypted fields
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/credentials")
                    .header("Authorization", format!("Bearer {charlie_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({
                            "vault_id": charlie_personal_id,
                            "title": "Postgres Prod",
                            "username": "pgadmin",
                            "password": "DbSecret!Password",
                            "url": "db.internal",
                            "category": "database",
                            "fields": {
                                "db_type": "postgresql",
                                "port": "5432",
                                "database_name": "starward_prod"
                            }
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CREATED);
        let db_cred = read_json(res).await;
        let db_cred_id = db_cred["id"].as_str().unwrap().to_string();
        assert_eq!(db_cred["fields"]["port"], "5432");
        assert_eq!(db_cred["fields"]["db_type"], "postgresql");

        let raw_extra: (String,) =
            sqlx::query_as("SELECT extra_fields_ciphertext FROM credentials WHERE id = $1")
                .bind(&db_cred_id)
                .fetch_one(&db)
                .await
                .unwrap();
        assert!(!raw_extra.0.is_empty());
        assert!(!raw_extra.0.contains("starward_prod"));

        // 9. Secure note allows empty password and supports PATCH favorite toggle
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/credentials")
                    .header("Authorization", format!("Bearer {charlie_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({
                            "vault_id": charlie_personal_id,
                            "title": "Codici backup",
                            "category": "note",
                            "notes": "RECOVERY-1234-5678"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CREATED);
        let note_cred = read_json(res).await;
        let note_cred_id = note_cred["id"].as_str().unwrap().to_string();

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("PATCH")
                    .uri(format!("/api/credentials/{note_cred_id}"))
                    .header("Authorization", format!("Bearer {charlie_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(json!({ "favorite": true }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let patched_note = read_json(res).await;
        assert_eq!(patched_note["favorite"], true);

        // Clean up test users (cascades vaults, members, credentials, audit logs)
        let _ = sqlx::query("DELETE FROM users WHERE id IN ($1, $2, $3)")
            .bind(&alice_id)
            .bind(&bob_id)
            .bind(&charlie_id)
            .execute(&db)
            .await;
    }
}
