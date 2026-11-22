mod auth;
mod config;
mod crypto;
mod error;
mod importers;
mod models;
mod otp;
mod routes;

use std::net::SocketAddr;

use axum::{
    extract::DefaultBodyLimit,
    http::{header, HeaderName, HeaderValue, Method},
    routing::{delete, get, patch, post},
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

const SCHEMA_SQL: &str = include_str!("schema.sql");

pub async fn init_db(database_url: &str) -> Result<PgPool, sqlx::Error> {
    let pool = PgPoolOptions::new()
        .max_connections(15)
        .connect(database_url)
        .await?;

    sqlx::raw_sql(SCHEMA_SQL).execute(&pool).await?;

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
        .allow_headers([
            header::AUTHORIZATION,
            header::CONTENT_TYPE,
            header::ACCEPT,
            HeaderName::from_static("x-api-key"),
            HeaderName::from_static("mcp-protocol-version"),
            HeaderName::from_static("mcp-session-id"),
        ])
        .expose_headers([
            HeaderName::from_static("mcp-session-id"),
            HeaderName::from_static("mcp-protocol-version"),
        ]);

    Router::new()
        .route("/api/health", get(routes::health::health_check))
        .route(
            "/api/me",
            get(routes::users::get_me).patch(routes::users::update_me),
        )
        .route(
            "/api/settings",
            get(routes::users::get_settings).patch(routes::users::update_settings),
        )
        .route(
            "/api/api-keys",
            get(routes::api_keys::list_api_keys).post(routes::api_keys::create_api_key),
        )
        .route(
            "/api/api-keys/{key_id}",
            delete(routes::api_keys::delete_api_key),
        )
        .route(
            "/api/mcp-keys",
            get(routes::mcp_keys::list_mcp_keys).post(routes::mcp_keys::create_mcp_key),
        )
        .route(
            "/api/mcp-keys/{key_id}",
            delete(routes::mcp_keys::delete_mcp_key),
        )
        .route(
            "/api/mcp",
            post(routes::mcp::handle_mcp_post)
                .get(routes::mcp::handle_mcp_get)
                .delete(routes::mcp::handle_mcp_delete)
                .layer(DefaultBodyLimit::max(1024 * 1024)),
        )
        .route("/api/users", get(routes::users::list_users))
        .route("/api/admin/users", get(routes::admin::list_admin_users))
        .route(
            "/api/admin/users/{user_id}",
            patch(routes::admin::update_user_role).delete(routes::admin::delete_user),
        )
        .route("/api/admin/groups", get(routes::groups::list_admin_groups))
        .route("/api/admin/audit", get(routes::admin::list_system_audit))
        .route(
            "/api/groups",
            get(routes::groups::list_groups).post(routes::groups::create_group),
        )
        .route(
            "/api/groups/directory",
            get(routes::groups::search_groups_directory),
        )
        .route(
            "/api/groups/{group_id}",
            get(routes::groups::get_group)
                .patch(routes::groups::update_group)
                .delete(routes::groups::delete_group),
        )
        .route(
            "/api/groups/{group_id}/members",
            post(routes::groups::add_group_member),
        )
        .route(
            "/api/groups/{group_id}/members/{member_id}",
            patch(routes::groups::update_group_member_role)
                .delete(routes::groups::remove_group_member),
        )
        .route(
            "/api/admin/service-accounts/resources",
            get(routes::service_accounts::list_selectable_resources),
        )
        .route(
            "/api/admin/service-accounts",
            get(routes::service_accounts::list_service_accounts)
                .post(routes::service_accounts::create_service_account),
        )
        .route(
            "/api/admin/service-accounts/{sa_id}",
            patch(routes::service_accounts::update_service_account)
                .delete(routes::service_accounts::delete_service_account),
        )
        .route(
            "/api/admin/service-accounts/{sa_id}/keys",
            post(routes::service_accounts::create_service_account_key),
        )
        .route(
            "/api/admin/service-accounts/{sa_id}/keys/{key_id}",
            delete(routes::service_accounts::delete_service_account_key),
        )
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
            "/api/vaults/{vault_id}/groups",
            post(routes::vaults::share_vault_with_group),
        )
        .route(
            "/api/vaults/{vault_id}/groups/{group_id}",
            patch(routes::vaults::update_vault_group_role)
                .delete(routes::vaults::remove_vault_group),
        )
        .route(
            "/api/vaults/{vault_id}/audit",
            get(routes::vaults::get_vault_audit),
        )
        .route(
            "/api/import/providers",
            get(routes::import::list_import_providers),
        )
        .route(
            "/api/vaults/{vault_id}/import/preview",
            post(routes::import::preview_vault_import)
                .layer(DefaultBodyLimit::max(routes::import::MAX_IMPORT_BYTES)),
        )
        .route(
            "/api/vaults/{vault_id}/import",
            post(routes::import::import_vault)
                .layer(DefaultBodyLimit::max(routes::import::MAX_IMPORT_BYTES)),
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
        .route(
            "/api/credentials/{credential_id}/otp",
            get(routes::credentials::get_credential_otp),
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
        .expect("Failed to connect to PostgreSQL and apply the schema");
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

    #[test]
    fn admin_emails_parsing_and_matching_works() {
        let parsed = crate::config::parse_admin_emails(" Admin@Starward.io , ops@starward.io ,, ");
        assert_eq!(
            parsed,
            vec!["admin@starward.io".to_string(), "ops@starward.io".to_string()]
        );

        let cfg = Config {
            host: "127.0.0.1".to_string(),
            port: 8080,
            database_url: String::new(),
            auth_secret: String::new(),
            master_key: String::new(),
            cors_origin: String::new(),
            admin_emails: parsed,
        };
        assert!(cfg.is_admin_email("ADMIN@starward.io"));
        assert!(cfg.is_admin_email(" ops@starward.io "));
        assert!(!cfg.is_admin_email("user@starward.io"));
        assert!(!cfg.is_admin_email(""));
    }

    #[test]
    fn share_vault_request_deserializes_user_id_and_email() {
        let by_id: crate::models::ShareVaultRequest =
            serde_json::from_value(json!({ "user_id": "user-123", "role": "editor" })).unwrap();
        assert_eq!(by_id.user_id.as_deref(), Some("user-123"));
        assert_eq!(by_id.email, None);
        assert_eq!(by_id.role, "editor");

        let by_email: crate::models::ShareVaultRequest =
            serde_json::from_value(json!({ "email": "bob@starward.io" })).unwrap();
        assert_eq!(by_email.user_id, None);
        assert_eq!(by_email.email.as_deref(), Some("bob@starward.io"));
        assert_eq!(by_email.role, "viewer");
    }

    #[tokio::test]
    async fn shared_folder_workflow_and_permissions_postgres() {
        let Ok(database_url) = std::env::var("TEST_DATABASE_URL") else {
            eprintln!("Skipping PostgreSQL integration test: TEST_DATABASE_URL not set");
            return;
        };

        let suffix = Uuid::new_v4().simple().to_string();
        let alice_id = format!("test-alice-{suffix}");
        let bob_id = format!("test-bob-{suffix}");
        let alice_email = format!("alice-{suffix}@starward.io");
        let bob_email = format!("bob-{suffix}@starward.io");

        let config = Config {
            host: "127.0.0.1".to_string(),
            port: 0,
            database_url,
            auth_secret: "test-secret-key-for-jwt-validation-32".to_string(),
            master_key: "test-master-key-for-aes-256-gcm-enc".to_string(),
            cors_origin: "http://localhost:3000".to_string(),
            admin_emails: vec![alice_email.clone()],
        };

        let db = init_db(&config.database_url).await.unwrap();
        let crypto = VaultCrypto::from_master_key(&config.master_key);
        let app = build_app(AppState {
            db: db.clone(),
            config: config.clone(),
            crypto,
        });

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

        // 7b. Alice shares "Produzione" with Charlie via user_id selection
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/vaults/{prod_id}/members"))
                    .header("Authorization", format!("Bearer {alice_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({ "user_id": charlie_id, "role": "editor" }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CREATED);
        let updated_prod = read_json(res).await;
        assert!(updated_prod["members"]
            .as_array()
            .unwrap()
            .iter()
            .any(|m| m["user_id"] == charlie_id && m["role"] == "editor" && m["is_pending"] == false));

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

        // 10. RBAC: Alice has 'admin' role, Bob has 'user' role
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/me")
                    .header("Authorization", format!("Bearer {alice_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let alice_me = read_json(res).await;
        assert_eq!(alice_me["role"], "admin");

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/me")
                    .header("Authorization", format!("Bearer {bob_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let bob_me = read_json(res).await;
        assert_eq!(bob_me["role"], "user");

        // Bob (user) is forbidden from accessing admin endpoints
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/admin/users")
                    .header("Authorization", format!("Bearer {bob_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::FORBIDDEN);

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/admin/audit")
                    .header("Authorization", format!("Bearer {bob_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::FORBIDDEN);

        // Alice (admin) can list users, access predisposed system audit endpoint, update roles, and delete users
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/admin/users")
                    .header("Authorization", format!("Bearer {alice_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let admin_users = read_json(res).await;
        assert!(admin_users
            .as_array()
            .unwrap()
            .iter()
            .any(|u| u["id"] == bob_id && u["role"] == "user"));

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/admin/audit")
                    .header("Authorization", format!("Bearer {alice_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);

        // Alice cannot demote herself
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("PATCH")
                    .uri(format!("/api/admin/users/{alice_id}"))
                    .header("Authorization", format!("Bearer {alice_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(json!({ "role": "user" }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);

        // Alice promotes Bob to admin, then demotes him back to user
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("PATCH")
                    .uri(format!("/api/admin/users/{bob_id}"))
                    .header("Authorization", format!("Bearer {alice_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(json!({ "role": "admin" }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let updated_bob = read_json(res).await;
        assert_eq!(updated_bob["role"], "admin");

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("PATCH")
                    .uri(format!("/api/admin/users/{bob_id}"))
                    .header("Authorization", format!("Bearer {alice_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(json!({ "role": "user" }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let demoted_bob = read_json(res).await;
        assert_eq!(demoted_bob["role"], "user");

        // Alice deletes Charlie
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri(format!("/api/admin/users/{charlie_id}"))
                    .header("Authorization", format!("Bearer {alice_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::NO_CONTENT);

        // 11. User settings & display name customization
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/settings")
                    .header("Authorization", format!("Bearer {alice_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let default_settings = read_json(res).await;
        assert_eq!(default_settings["theme"], "dark");
        assert_eq!(default_settings["password_generator_length"], 20);

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("PATCH")
                    .uri("/api/settings")
                    .header("Authorization", format!("Bearer {alice_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({
                            "theme": "sync-security",
                            "password_generator_length": 28,
                            "password_generator_symbols": false,
                            "default_vault_id": prod_id
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let updated_settings = read_json(res).await;
        assert_eq!(updated_settings["theme"], "sync-security");
        assert_eq!(updated_settings["password_generator_length"], 28);
        assert_eq!(updated_settings["password_generator_symbols"], false);
        assert_eq!(updated_settings["default_vault_id"], prod_id);

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("PATCH")
                    .uri("/api/me")
                    .header("Authorization", format!("Bearer {alice_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(json!({ "name": "Alice Security Lead" }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let updated_me = read_json(res).await;
        assert_eq!(updated_me["name"], "Alice Security Lead");

        // Subsequent request with original JWT preserves customized name
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/me")
                    .header("Authorization", format!("Bearer {alice_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let me_again = read_json(res).await;
        assert_eq!(me_again["name"], "Alice Security Lead");

        // 12. API Keys: create read-only scoped key, test permissions and vault scope
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/api-keys")
                    .header("Authorization", format!("Bearer {alice_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({
                            "name": "CI/CD Prod Reader",
                            "permission": "read",
                            "vault_ids": [prod_id],
                            "expires_in_days": 30
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CREATED);
        let created_key = read_json(res).await;
        let api_key_id = created_key["api_key"]["id"].as_str().unwrap().to_string();
        let secret_key = created_key["secret_key"].as_str().unwrap().to_string();
        assert!(secret_key.starts_with("sw_live_"));

        // Authenticate with Bearer API Key -> only sees scoped vault
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/vaults")
                    .header("Authorization", format!("Bearer {secret_key}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let scoped_vaults = read_json(res).await;
        assert_eq!(scoped_vaults.as_array().unwrap().len(), 1);
        assert_eq!(scoped_vaults[0]["id"], prod_id);

        // Authenticate with X-API-Key header -> reads credential in allowed vault
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri(format!("/api/credentials/{cred_id}"))
                    .header("X-API-Key", &secret_key)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let api_cred = read_json(res).await;
        assert_eq!(api_cred["password"], "UltraSecret!Password99");

        // Read-only API Key cannot create or delete credentials
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri(format!("/api/credentials/{cred_id}"))
                    .header("Authorization", format!("Bearer {secret_key}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::FORBIDDEN);

        // API Key cannot create other API keys
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/api-keys")
                    .header("Authorization", format!("Bearer {secret_key}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(json!({ "name": "Escalation" }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::FORBIDDEN);

        // Revoke API Key and verify it is no longer accepted
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri(format!("/api/api-keys/{api_key_id}"))
                    .header("Authorization", format!("Bearer {alice_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::NO_CONTENT);

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/vaults")
                    .header("Authorization", format!("Bearer {secret_key}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);

        // 13. System Audit Log: verify recorded events and filtering (Chi / Cosa / Quando)
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri(format!("/api/admin/audit?actor_id={alice_id}"))
                    .header("Authorization", format!("Bearer {alice_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let alice_audit = read_json(res).await;
        let alice_events = alice_audit.as_array().unwrap();
        let recorded_actions: Vec<&str> = alice_events
            .iter()
            .filter_map(|e| e["action"].as_str())
            .collect();

        assert!(recorded_actions.contains(&"auth.login"));
        assert!(recorded_actions.contains(&"vault.created"));
        assert!(recorded_actions.contains(&"vault.shared"));
        assert!(recorded_actions.contains(&"credential.created"));
        assert!(recorded_actions.contains(&"rbac.role_changed"));
        assert!(recorded_actions.contains(&"user.deleted"));
        assert!(recorded_actions.contains(&"user.settings_updated"));
        assert!(recorded_actions.contains(&"user.profile_updated"));
        assert!(recorded_actions.contains(&"api_key.created"));
        assert!(recorded_actions.contains(&"auth.api_key_used"));
        assert!(recorded_actions.contains(&"credential.accessed"));
        assert!(recorded_actions.contains(&"api_key.revoked"));

        // Filter system audit by action & actor_id
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri(format!(
                        "/api/admin/audit?actor_id={alice_id}&action=user.deleted&target_type=user"
                    ))
                    .header("Authorization", format!("Bearer {alice_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let deleted_audit = read_json(res).await;
        let deleted_events = deleted_audit.as_array().unwrap();
        assert_eq!(deleted_events.len(), 1);
        assert_eq!(deleted_events[0]["target_id"], charlie_id);
        assert_eq!(deleted_events[0]["actor_role"], "admin");

        // 14. Groups: create group, share existing vault with group, create vault on behalf of group, dynamic membership
        let dave_id = format!("test-dave-{suffix}");
        let dave_email = format!("dave-{suffix}@starward.io");
        let dave_token = make_token(&config.auth_secret, &dave_id, &dave_email, "Dave");

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/groups")
                    .header("Authorization", format!("Bearer {alice_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({
                            "name": format!("DevOps-{suffix}"),
                            "description": "Team infrastruttura",
                            "color": "emerald",
                            "member_ids": [bob_id]
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CREATED);
        let group = read_json(res).await;
        let group_id = group["id"].as_str().unwrap().to_string();
        assert_eq!(group["member_count"], 2);
        assert_eq!(group["my_role"], "owner");

        // Share existing "Produzione" vault with group as editor (upgrades Bob from viewer to editor!)
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/vaults/{prod_id}/groups"))
                    .header("Authorization", format!("Bearer {alice_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({ "group_id": group_id, "role": "editor" }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CREATED);
        let shared_prod = read_json(res).await;
        assert_eq!(shared_prod["group_count"], 1);

        // Bob now has effective role 'editor' on Produzione via group (higher than direct 'viewer')
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
        let bob_vaults_after = read_json(res).await;
        let bob_prod = bob_vaults_after
            .as_array()
            .unwrap()
            .iter()
            .filter(|v| v["id"] == prod_id)
            .collect::<Vec<_>>();
        assert_eq!(bob_prod.len(), 1);
        assert_eq!(bob_prod[0]["role"], "editor");

        // Create a folder ON BEHALF OF the group -> automatically shared with all members
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
                            "name": "Infrastruttura DevOps",
                            "description": "Cartella di proprietà del gruppo",
                            "icon": "server",
                            "color": "emerald",
                            "owner_group_id": group_id,
                            "group_role": "editor"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CREATED);
        let group_vault = read_json(res).await;
        let group_vault_id = group_vault["id"].as_str().unwrap().to_string();
        assert_eq!(group_vault["owner_group_id"], group_id);
        assert_eq!(group_vault["member_count"], 2);
        assert_eq!(group_vault["shared_groups"][0]["is_owner_group"], true);

        // Bob (group member) immediately sees the group-owned vault as editor and can create a credential in it
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/credentials")
                    .header("Authorization", format!("Bearer {bob_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({
                            "vault_id": group_vault_id,
                            "title": "K8s Cluster Admin",
                            "username": "kubeadmin",
                            "password": "ClusterSecret!2026"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CREATED);

        // Ensure Dave exists as a platform user (JIT provisioning on first authenticated call)
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/me")
                    .header("Authorization", format!("Bearer {dave_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);

        // Add Dave to the group by platform user id
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/groups/{group_id}/members"))
                    .header("Authorization", format!("Bearer {alice_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({ "user_id": dave_id, "role": "member" }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CREATED);

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/vaults")
                    .header("Authorization", format!("Bearer {dave_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let dave_vaults = read_json(res).await;
        assert!(dave_vaults
            .as_array()
            .unwrap()
            .iter()
            .any(|v| v["id"] == group_vault_id && v["role"] == "editor"));
        assert!(dave_vaults
            .as_array()
            .unwrap()
            .iter()
            .any(|v| v["id"] == prod_id && v["role"] == "editor"));

        // Deleting the group preserves the group-owned vault by returning ownership to creator
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri(format!("/api/groups/{group_id}"))
                    .header("Authorization", format!("Bearer {alice_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::NO_CONTENT);

        // Alice still owns the preserved vault; Dave lost group access
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/vaults")
                    .header("Authorization", format!("Bearer {dave_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let dave_vaults_after = read_json(res).await;
        assert!(!dave_vaults_after
            .as_array()
            .unwrap()
            .iter()
            .any(|v| v["id"] == group_vault_id));

        // Clean up test users and system audit logs
        let _ = sqlx::query("DELETE FROM users WHERE id IN ($1, $2, $3, $4)")
            .bind(&alice_id)
            .bind(&bob_id)
            .bind(&charlie_id)
            .bind(&dave_id)
            .execute(&db)
            .await;
        let _ = sqlx::query("DELETE FROM system_audit_logs WHERE actor_id IN ($1, $2, $3, $4)")
            .bind(&alice_id)
            .bind(&bob_id)
            .bind(&charlie_id)
            .bind(&dave_id)
            .execute(&db)
            .await;
    }

    #[tokio::test]
    async fn service_accounts_workflow_and_scoping_postgres() {
        let Ok(database_url) = std::env::var("TEST_DATABASE_URL") else {
            eprintln!("Skipping PostgreSQL service account integration test: TEST_DATABASE_URL not set");
            return;
        };

        let suffix = Uuid::new_v4().simple().to_string();
        let admin_id = format!("test-sa-admin-{suffix}");
        let user_id = format!("test-sa-user-{suffix}");
        let admin_email = format!("sa-admin-{suffix}@starward.io");
        let user_email = format!("sa-user-{suffix}@starward.io");

        let config = Config {
            host: "127.0.0.1".to_string(),
            port: 0,
            database_url,
            auth_secret: "test-secret-key-for-jwt-validation-32".to_string(),
            master_key: "test-master-key-for-aes-256-gcm-enc".to_string(),
            cors_origin: "http://localhost:3000".to_string(),
            admin_emails: vec![admin_email.clone()],
        };

        let db = init_db(&config.database_url).await.unwrap();
        let crypto = VaultCrypto::from_master_key(&config.master_key);
        let app = build_app(AppState {
            db: db.clone(),
            config: config.clone(),
            crypto,
        });

        let admin_token = make_token(&config.auth_secret, &admin_id, &admin_email, "Admin");
        let user_token = make_token(&config.auth_secret, &user_id, &user_email, "Standard User");

        // Bootstrap both users
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/me")
                    .header("Authorization", format!("Bearer {admin_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/me")
                    .header("Authorization", format!("Bearer {user_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);

        // Create two folders: "Produzione" (full folder grant) and "Billing" (single credential grant)
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/vaults")
                    .header("Authorization", format!("Bearer {admin_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(json!({ "name": "Produzione" }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CREATED);
        let prod_vault_id = read_json(res).await["id"].as_str().unwrap().to_string();

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/vaults")
                    .header("Authorization", format!("Bearer {admin_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(json!({ "name": "Billing" }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CREATED);
        let billing_vault_id = read_json(res).await["id"].as_str().unwrap().to_string();

        // Create credentials in both folders
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/credentials")
                    .header("Authorization", format!("Bearer {admin_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({
                            "vault_id": prod_vault_id,
                            "title": "Prod DB",
                            "username": "dbuser",
                            "password": "ProdDbPassword!1"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CREATED);
        let prod_cred_id = read_json(res).await["id"].as_str().unwrap().to_string();

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/credentials")
                    .header("Authorization", format!("Bearer {admin_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({
                            "vault_id": billing_vault_id,
                            "title": "Stripe Live Key",
                            "category": "api_key",
                            "password": "sk_live_billing_allowed"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CREATED);
        let allowed_billing_cred_id = read_json(res).await["id"].as_str().unwrap().to_string();

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/credentials")
                    .header("Authorization", format!("Bearer {admin_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({
                            "vault_id": billing_vault_id,
                            "title": "Corporate Card",
                            "category": "card",
                            "password": "4242-secret-card"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CREATED);
        let hidden_billing_cred_id = read_json(res).await["id"].as_str().unwrap().to_string();

        // 1. Standard non-admin user CANNOT list or create service accounts
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/admin/service-accounts")
                    .header("Authorization", format!("Bearer {user_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::FORBIDDEN);

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/admin/service-accounts")
                    .header("Authorization", format!("Bearer {user_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(json!({ "name": "Unauthorized Bot" }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::FORBIDDEN);

        // 2. Admin can inspect selectable resources without secrets
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/admin/service-accounts/resources")
                    .header("Authorization", format!("Bearer {admin_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let resources = read_json(res).await;
        assert!(resources["vaults"]
            .as_array()
            .unwrap()
            .iter()
            .any(|v| v["id"] == prod_vault_id));
        assert!(resources["credentials"]
            .as_array()
            .unwrap()
            .iter()
            .any(|c| c["id"] == allowed_billing_cred_id && c.get("password").is_none()));

        // 3. Admin creates a read-only Service Account with 1 folder + 1 specific credential
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/admin/service-accounts")
                    .header("Authorization", format!("Bearer {admin_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({
                            "name": "CI/CD Deploy Bot",
                            "description": "Accesso automatico pipeline",
                            "permission": "read",
                            "vault_ids": [prod_vault_id],
                            "credential_ids": [allowed_billing_cred_id],
                            "generate_initial_key": true,
                            "initial_key_name": "Chiave primaria",
                            "initial_key_expires_in_days": 90
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CREATED);
        let created_sa = read_json(res).await;
        let sa_id = created_sa["service_account"]["id"]
            .as_str()
            .unwrap()
            .to_string();
        let key1_id = created_sa["initial_key"]["key"]["id"]
            .as_str()
            .unwrap()
            .to_string();
        let key1_secret = created_sa["initial_key"]["secret_key"]
            .as_str()
            .unwrap()
            .to_string();
        assert!(key1_secret.starts_with("sw_sa_"));

        // 4. Service Account authenticates with Bearer & X-API-Key
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/me")
                    .header("Authorization", format!("Bearer {key1_secret}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let sa_me = read_json(res).await;
        assert_eq!(sa_me["is_service_account"], true);
        assert_eq!(sa_me["role"], "user");

        // GET /api/vaults returns only explicitly assigned folders
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/vaults")
                    .header("X-API-Key", &key1_secret)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let sa_vaults = read_json(res).await;
        assert_eq!(sa_vaults.as_array().unwrap().len(), 1);
        assert_eq!(sa_vaults[0]["id"], prod_vault_id);

        // GET /api/credentials returns folder credentials + specific credential, excluding hidden one
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/credentials")
                    .header("Authorization", format!("Bearer {key1_secret}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let sa_creds = read_json(res).await;
        let cred_ids: Vec<&str> = sa_creds
            .as_array()
            .unwrap()
            .iter()
            .map(|c| c["id"].as_str().unwrap())
            .collect();
        assert_eq!(cred_ids.len(), 2);
        assert!(cred_ids.contains(&prod_cred_id.as_str()));
        assert!(cred_ids.contains(&allowed_billing_cred_id.as_str()));
        assert!(!cred_ids.contains(&hidden_billing_cred_id.as_str()));

        // Direct fetch of allowed specific credential succeeds and decrypts password
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri(format!("/api/credentials/{allowed_billing_cred_id}"))
                    .header("X-API-Key", &key1_secret)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        assert_eq!(
            read_json(res).await["password"],
            "sk_live_billing_allowed"
        );

        // Direct fetch of hidden credential in same vault is forbidden
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri(format!("/api/credentials/{hidden_billing_cred_id}"))
                    .header("X-API-Key", &key1_secret)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::FORBIDDEN);

        // Read-only SA cannot update or create credentials
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("PATCH")
                    .uri(format!("/api/credentials/{allowed_billing_cred_id}"))
                    .header("Authorization", format!("Bearer {key1_secret}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(json!({ "title": "Hacked" }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::FORBIDDEN);

        // 5. Admin upgrades SA to read_write and rotates API key
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("PATCH")
                    .uri(format!("/api/admin/service-accounts/{sa_id}"))
                    .header("Authorization", format!("Bearer {admin_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(json!({ "permission": "read_write" }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/admin/service-accounts/{sa_id}/keys"))
                    .header("Authorization", format!("Bearer {admin_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({ "name": "Chiave rotazione", "expires_in_days": 30 }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CREATED);
        let key2_secret = read_json(res).await["secret_key"]
            .as_str()
            .unwrap()
            .to_string();

        // SA with read_write can create credential inside assigned folder "Produzione"
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/credentials")
                    .header("Authorization", format!("Bearer {key2_secret}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({
                            "vault_id": prod_vault_id,
                            "title": "Rotated Token",
                            "password": "GeneratedByServiceAccount!"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CREATED);
        let sa_created_cred_id = read_json(res).await["id"].as_str().unwrap().to_string();

        // SA cannot create credential inside "Billing" (not in vault_ids, only single credential granted)
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/credentials")
                    .header("Authorization", format!("Bearer {key2_secret}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({
                            "vault_id": billing_vault_id,
                            "title": "Unauthorized Billing Cred",
                            "password": "Nope!"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::FORBIDDEN);

        // SA can update its specific granted credential in place
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("PATCH")
                    .uri(format!("/api/credentials/{allowed_billing_cred_id}"))
                    .header("Authorization", format!("Bearer {key2_secret}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({ "password": "sk_live_billing_rotated" }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        assert_eq!(
            read_json(res).await["password"],
            "sk_live_billing_rotated"
        );

        // Revoke key1 -> key1 rejected, key2 still works
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri(format!("/api/admin/service-accounts/{sa_id}/keys/{key1_id}"))
                    .header("Authorization", format!("Bearer {admin_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::NO_CONTENT);

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/credentials")
                    .header("Authorization", format!("Bearer {key1_secret}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);

        // Disable SA -> key2 rejected with FORBIDDEN
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("PATCH")
                    .uri(format!("/api/admin/service-accounts/{sa_id}"))
                    .header("Authorization", format!("Bearer {admin_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(json!({ "is_active": false }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/credentials")
                    .header("Authorization", format!("Bearer {key2_secret}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::FORBIDDEN);

        // Delete SA -> succeeds, preserves credential created by SA, key2 returns UNAUTHORIZED
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri(format!("/api/admin/service-accounts/{sa_id}"))
                    .header("Authorization", format!("Bearer {admin_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::NO_CONTENT);

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri(format!("/api/credentials/{sa_created_cred_id}"))
                    .header("Authorization", format!("Bearer {admin_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/credentials")
                    .header("Authorization", format!("Bearer {key2_secret}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);

        // Clean up test users
        let _ = sqlx::query("DELETE FROM users WHERE id IN ($1, $2)")
            .bind(&admin_id)
            .bind(&user_id)
            .execute(&db)
            .await;
    }

    #[tokio::test]
    async fn vault_import_workflow_and_permissions_postgres() {
        let Ok(database_url) = std::env::var("TEST_DATABASE_URL") else {
            eprintln!("Skipping PostgreSQL integration test: TEST_DATABASE_URL not set");
            return;
        };

        let suffix = Uuid::new_v4().simple().to_string();
        let owner_id = format!("test-imp-owner-{suffix}");
        let viewer_id = format!("test-imp-viewer-{suffix}");
        let owner_email = format!("imp-owner-{suffix}@starward.io");
        let viewer_email = format!("imp-viewer-{suffix}@starward.io");

        let config = Config {
            host: "127.0.0.1".to_string(),
            port: 0,
            database_url,
            auth_secret: "test-secret-key-for-jwt-validation-32".to_string(),
            master_key: "test-master-key-for-aes-256-gcm-enc".to_string(),
            cors_origin: "http://localhost:3000".to_string(),
            admin_emails: vec![owner_email.clone()],
        };

        let db = init_db(&config.database_url).await.unwrap();
        let crypto = VaultCrypto::from_master_key(&config.master_key);
        let app = build_app(AppState {
            db: db.clone(),
            config: config.clone(),
            crypto,
        });

        let owner_token = make_token(&config.auth_secret, &owner_id, &owner_email, "Owner");
        let viewer_token = make_token(&config.auth_secret, &viewer_id, &viewer_email, "Viewer");

        // 1. Provider listing works
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/import/providers")
                    .header("Authorization", format!("Bearer {owner_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let providers = read_json(res).await;
        assert_eq!(providers[0]["id"], "bitwarden");
        assert_eq!(providers[0]["featured"], true);

        // 2. Owner creates a vault and shares with viewer (read-only)
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/vaults")
                    .header("Authorization", format!("Bearer {owner_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(json!({ "name": "Import Test" }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CREATED);
        let vault_id = read_json(res).await["id"].as_str().unwrap().to_string();

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/vaults/{vault_id}/members"))
                    .header("Authorization", format!("Bearer {owner_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({ "email": viewer_email, "role": "viewer" }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CREATED);

        let bw_json = json!({
            "encrypted": false,
            "folders": [{ "id": "f1", "name": "Cloud" }],
            "items": [
                {
                    "type": 1,
                    "folderId": "f1",
                    "name": "AWS Console",
                    "favorite": true,
                    "login": {
                        "username": "admin@acme.io",
                        "password": "TopSecretImportPassword!",
                        "uris": [{ "uri": "https://console.aws.amazon.com" }],
                        "totp": "otpauth://totp/AWS",
                        "fido2Credentials": [
                            {
                                "credentialId": "aws-fido2-cred-id",
                                "keyType": "public-key",
                                "keyAlgorithm": "ECDSA",
                                "keyCurve": "P-256",
                                "keyValue": "MIGH-AWS-PASSKEY-PRIVATE-KEY",
                                "rpId": "signin.aws.amazon.com",
                                "rpName": "AWS",
                                "userName": "admin@acme.io",
                                "counter": "0",
                                "discoverable": "true"
                            }
                        ]
                    }
                },
                {
                    "type": 1,
                    "folderId": "f1",
                    "name": "GitHub Passkey Only",
                    "login": {
                        "uris": [{ "uri": "https://github.com" }],
                        "username": "octocat",
                        "password": "",
                        "fido2Credentials": [
                            {
                                "credentialId": "gh-fido2-cred-id",
                                "keyType": "public-key",
                                "keyAlgorithm": "ECDSA",
                                "keyCurve": "P-256",
                                "keyValue": "MIGH-GH-PASSKEY-PRIVATE-KEY",
                                "rpId": "github.com",
                                "rpName": "GitHub",
                                "userName": "octocat",
                                "counter": 2,
                                "discoverable": true
                            }
                        ]
                    }
                },
                {
                    "type": 2,
                    "name": "Recovery Keys",
                    "notes": "SECRET-NOTE-LINE-123"
                },
                {
                    "type": 3,
                    "name": "Corp Visa",
                    "card": {
                        "cardholderName": "Owner",
                        "brand": "Visa",
                        "number": "4111000099998888",
                        "expMonth": "12",
                        "expYear": "2029",
                        "code": "777"
                    }
                },
                {
                    "type": 4,
                    "name": "Company Identity",
                    "identity": {
                        "firstName": "Mario",
                        "lastName": "Rossi",
                        "email": "mario@acme.io",
                        "ssn": "RSSMRA80A01F205X",
                        "passportNumber": "YA9988776"
                    }
                },
                {
                    "type": 5,
                    "name": "Bastion SSH",
                    "sshKey": {
                        "privateKey": "-----BEGIN OPENSSH PRIVATE KEY-----\nkeydata\n-----END OPENSSH PRIVATE KEY-----",
                        "publicKey": "ssh-ed25519 AAAAC3"
                    }
                }
            ]
        })
        .to_string();

        // 3. Viewer is forbidden from preview & import
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/vaults/{vault_id}/import/preview"))
                    .header("Authorization", format!("Bearer {viewer_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({ "provider": "bitwarden", "content": bw_json }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::FORBIDDEN);

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/vaults/{vault_id}/import"))
                    .header("Authorization", format!("Bearer {viewer_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({ "provider": "bitwarden", "content": bw_json }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::FORBIDDEN);

        // 4. Preview succeeds and NEVER leaks plaintext secrets
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/vaults/{vault_id}/import/preview"))
                    .header("Authorization", format!("Bearer {owner_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({ "provider": "bitwarden", "content": bw_json, "filename": "bitwarden.json" }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let preview_bytes = res.into_body().collect().await.unwrap().to_bytes();
        let preview_text = String::from_utf8(preview_bytes.to_vec()).unwrap();
        assert!(!preview_text.contains("TopSecretImportPassword!"));
        assert!(!preview_text.contains("SECRET-NOTE-LINE-123"));
        assert!(!preview_text.contains("4111000099998888"));
        assert!(!preview_text.contains("BEGIN OPENSSH PRIVATE KEY"));
        assert!(!preview_text.contains("MIGH-AWS-PASSKEY-PRIVATE-KEY"));
        assert!(!preview_text.contains("MIGH-GH-PASSKEY-PRIVATE-KEY"));
        assert!(!preview_text.contains("RSSMRA80A01F205X"));
        assert!(!preview_text.contains("YA9988776"));
        let preview_json: Value = serde_json::from_str(&preview_text).unwrap();
        // Hybrid AWS (login + passkey) + GitHub passkey-only + Note + Card + Identity + SSH = 7
        assert_eq!(preview_json["total_parsed"], 7);
        assert_eq!(preview_json["ready_count"], 7);
        assert_eq!(preview_json["warning_count"], 0);

        // 5. Commit import succeeds and encrypts at rest
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/vaults/{vault_id}/import"))
                    .header("Authorization", format!("Bearer {owner_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({ "provider": "bitwarden", "content": bw_json, "filename": "bitwarden.json" }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CREATED);
        let import_res = read_json(res).await;
        assert_eq!(import_res["imported_count"], 7);

        // Verify encrypted at rest and decrypted via GET /api/credentials
        let raw_ciphers: Vec<(String, String)> = sqlx::query_as(
            "SELECT password_ciphertext, extra_fields_ciphertext FROM credentials WHERE vault_id = $1",
        )
        .bind(&vault_id)
        .fetch_all(&db)
        .await
        .unwrap();
        assert_eq!(raw_ciphers.len(), 7);
        for (cipher, extra_cipher) in &raw_ciphers {
            assert!(!cipher.contains("TopSecretImportPassword!"));
            assert!(!cipher.contains("4111000099998888"));
            assert!(!extra_cipher.contains("MIGH-AWS-PASSKEY-PRIVATE-KEY"));
            assert!(!extra_cipher.contains("MIGH-GH-PASSKEY-PRIVATE-KEY"));
            assert!(!extra_cipher.contains("RSSMRA80A01F205X"));
            assert!(!extra_cipher.contains("YA9988776"));
        }

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri(format!("/api/credentials?vault_id={vault_id}"))
                    .header("Authorization", format!("Bearer {owner_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let creds = read_json(res).await;
        assert_eq!(creds.as_array().unwrap().len(), 7);

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri(format!("/api/credentials?vault_id={vault_id}&category=passkey"))
                    .header("Authorization", format!("Bearer {owner_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let passkey_creds = read_json(res).await;
        assert_eq!(passkey_creds.as_array().unwrap().len(), 2);
        assert!(passkey_creds
            .as_array()
            .unwrap()
            .iter()
            .any(|c| c["fields"]["private_key"] == "MIGH-GH-PASSKEY-PRIVATE-KEY"));

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri(format!("/api/credentials?vault_id={vault_id}&category=identity"))
                    .header("Authorization", format!("Bearer {owner_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let identity_creds = read_json(res).await;
        assert_eq!(identity_creds.as_array().unwrap().len(), 1);
        assert_eq!(identity_creds[0]["fields"]["ssn"], "RSSMRA80A01F205X");
        assert_eq!(identity_creds[0]["fields"]["passport_number"], "YA9988776");

        // 6. Re-import with duplicate_strategy = "skip" skips all 7
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/vaults/{vault_id}/import"))
                    .header("Authorization", format!("Bearer {owner_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({
                            "provider": "bitwarden",
                            "content": bw_json,
                            "duplicate_strategy": "skip"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CREATED);
        let reimport_res = read_json(res).await;
        assert_eq!(reimport_res["imported_count"], 0);
        assert_eq!(reimport_res["duplicate_skipped_count"], 7);

        // 7. Audit log contains vault.imported
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri(format!("/api/vaults/{vault_id}/audit"))
                    .header("Authorization", format!("Bearer {owner_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let audit = read_json(res).await;
        assert!(audit
            .as_array()
            .unwrap()
            .iter()
            .any(|a| a["action"] == "vault.imported"));

        // Clean up test users
        let _ = sqlx::query("DELETE FROM users WHERE id IN ($1, $2)")
            .bind(&owner_id)
            .bind(&viewer_id)
            .execute(&db)
            .await;
    }

    #[tokio::test]
    async fn mcp_server_and_keys_workflow_postgres() {
        let Ok(database_url) = std::env::var("TEST_DATABASE_URL") else {
            eprintln!("Skipping PostgreSQL integration test: TEST_DATABASE_URL not set");
            return;
        };

        let suffix = Uuid::new_v4().simple().to_string();
        let alice_id = format!("test-mcp-alice-{suffix}");
        let bob_id = format!("test-mcp-bob-{suffix}");
        let alice_email = format!("mcp-alice-{suffix}@starward.io");
        let bob_email = format!("mcp-bob-{suffix}@starward.io");

        let config = Config {
            host: "127.0.0.1".to_string(),
            port: 0,
            database_url,
            auth_secret: "test-secret-key-for-jwt-validation-32".to_string(),
            master_key: "test-master-key-for-aes-256-gcm-enc".to_string(),
            cors_origin: "http://localhost:3000".to_string(),
            admin_emails: vec![alice_email.clone()],
        };

        let db = init_db(&config.database_url).await.unwrap();
        let crypto = VaultCrypto::from_master_key(&config.master_key);
        let app = build_app(AppState {
            db: db.clone(),
            config: config.clone(),
            crypto,
        });

        let alice_token = make_token(&config.auth_secret, &alice_id, &alice_email, "Alice");
        let bob_token = make_token(&config.auth_secret, &bob_id, &bob_email, "Bob");

        // 1. Seed vaults & credentials (Alice personal + shared "Infra Prod", Bob viewer on "Infra Prod")
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/vaults")
                    .header("Authorization", format!("Bearer {alice_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let alice_vaults = read_json(res).await;
        let alice_personal_id = alice_vaults
            .as_array()
            .unwrap()
            .iter()
            .find(|v| v["is_personal"] == true)
            .unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/vaults")
                    .header("Authorization", format!("Bearer {alice_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({ "name": "Infra Prod", "description": "Server produzione" }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CREATED);
        let infra_vault_id = read_json(res).await["id"].as_str().unwrap().to_string();

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/vaults/{infra_vault_id}/members"))
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

        // Initialize Bob user & personal vault
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

        // Create one credential in Alice Personal and one in Infra Prod
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
                            "vault_id": alice_personal_id,
                            "title": "Alice Private Login",
                            "username": "alice",
                            "password": "AliceOnlySecret!99",
                            "notes": "Private personal note"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CREATED);
        let alice_priv_cred_id = read_json(res).await["id"].as_str().unwrap().to_string();

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
                            "vault_id": infra_vault_id,
                            "title": "Prod DB",
                            "username": "pgadmin",
                            "password": "DbMcpSecret!2026",
                            "url": "db.prod.internal",
                            "category": "database",
                            "notes": "Secret prod note"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CREATED);
        let prod_cred_id = read_json(res).await["id"].as_str().unwrap().to_string();

        // 2. Create MCP keys (read unscoped, read_write scoped, read_write unscoped for Bob) and REST API key
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/mcp-keys")
                    .header("Authorization", format!("Bearer {alice_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({
                            "name": "Alice Read MCP",
                            "permission": "read",
                            "expires_in_days": 30
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CREATED);
        let created_ro = read_json(res).await;
        let ro_key_id = created_ro["mcp_key"]["id"].as_str().unwrap().to_string();
        let ro_secret = created_ro["secret_key"].as_str().unwrap().to_string();
        assert!(ro_secret.starts_with("sw_mcp_"));

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/mcp-keys")
                    .header("Authorization", format!("Bearer {alice_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({
                            "name": "Alice Scoped RW MCP",
                            "permission": "read_write",
                            "vault_ids": [infra_vault_id],
                            "expires_in_days": 90
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CREATED);
        let created_scoped_rw = read_json(res).await;
        let scoped_rw_secret = created_scoped_rw["secret_key"].as_str().unwrap().to_string();

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/mcp-keys")
                    .header("Authorization", format!("Bearer {bob_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({
                            "name": "Bob Full RW MCP",
                            "permission": "read_write"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CREATED);
        let bob_rw_secret = read_json(res).await["secret_key"]
            .as_str()
            .unwrap()
            .to_string();

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/api-keys")
                    .header("Authorization", format!("Bearer {alice_token}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({
                            "name": "Alice REST Key",
                            "permission": "read_write"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CREATED);
        let rest_secret = read_json(res).await["secret_key"]
            .as_str()
            .unwrap()
            .to_string();
        assert!(rest_secret.starts_with("sw_live_"));

        // List MCP keys hides secret and requires session auth
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/mcp-keys")
                    .header("Authorization", format!("Bearer {alice_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let listed_keys = read_json(res).await;
        assert_eq!(listed_keys.as_array().unwrap().len(), 2);

        // 3. Strict bidirectional isolation
        for uri in ["/api/vaults", "/api/credentials", "/api/mcp-keys"] {
            let res = app
                .clone()
                .oneshot(
                    Request::builder()
                        .method("GET")
                        .uri(uri)
                        .header("Authorization", format!("Bearer {ro_secret}"))
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
        }

        for bad_auth in [
            format!("Bearer {rest_secret}"),
            format!("Bearer {alice_token}"),
        ] {
            let res = app
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/api/mcp")
                        .header("Authorization", bad_auth)
                        .header("Content-Type", "application/json")
                        .body(Body::from(
                            json!({"jsonrpc": "2.0", "id": 1, "method": "ping"}).to_string(),
                        ))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
            assert!(res.headers().contains_key("www-authenticate"));
        }

        // Expired MCP key is rejected with 401
        let (expired_secret, expired_prefix, expired_hash) = crate::crypto::generate_mcp_key();
        sqlx::query(
            "INSERT INTO mcp_keys (id, user_id, name, key_prefix, key_hash, permission, vault_ids, expires_at, created_at) VALUES ($1, $2, 'Expired', $3, $4, 'read', '{}', NOW() - INTERVAL '1 hour', NOW())",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(&alice_id)
        .bind(&expired_prefix)
        .bind(&expired_hash)
        .execute(&db)
        .await
        .unwrap();

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/mcp")
                    .header("X-API-Key", &expired_secret)
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({"jsonrpc": "2.0", "id": 1, "method": "ping"}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);

        // 4. Streamable HTTP handshake & methods
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/mcp")
                    .header("Authorization", format!("Bearer {ro_secret}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::METHOD_NOT_ALLOWED);
        assert!(res.headers().contains_key("allow"));

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri("/api/mcp")
                    .header("Authorization", format!("Bearer {ro_secret}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::NO_CONTENT);

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/mcp")
                    .header("Authorization", format!("Bearer {ro_secret}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({
                            "jsonrpc": "2.0",
                            "id": 1,
                            "method": "initialize",
                            "params": {
                                "protocolVersion": "2025-06-18",
                                "capabilities": {},
                                "clientInfo": { "name": "test-client", "version": "1.0" }
                            }
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        assert_eq!(
            res.headers()
                .get("mcp-protocol-version")
                .and_then(|v| v.to_str().ok()),
            Some("2025-06-18")
        );
        let init_json = read_json(res).await;
        assert_eq!(init_json["result"]["serverInfo"]["name"], "starward-mcp");

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/mcp")
                    .header("Authorization", format!("Bearer {ro_secret}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({
                            "jsonrpc": "2.0",
                            "method": "notifications/initialized"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::ACCEPTED);

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/mcp")
                    .header("Authorization", format!("Bearer {ro_secret}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from("{not-json"))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);
        assert_eq!(read_json(res).await["error"]["code"], -32700);

        // 5. Dynamic tools/list per permission & scope
        let mcp_call = |secret: String, body: Value| {
            let app = app.clone();
            async move {
                let res = app
                    .oneshot(
                        Request::builder()
                            .method("POST")
                            .uri("/api/mcp")
                            .header("X-API-Key", secret)
                            .header("Content-Type", "application/json")
                            .body(Body::from(body.to_string()))
                            .unwrap(),
                    )
                    .await
                    .unwrap();
                assert_eq!(res.status(), StatusCode::OK);
                read_json(res).await
            }
        };

        let ro_tools = mcp_call(
            ro_secret.clone(),
            json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list" }),
        )
        .await;
        assert_eq!(ro_tools["result"]["tools"].as_array().unwrap().len(), 5);

        let scoped_tools = mcp_call(
            scoped_rw_secret.clone(),
            json!({ "jsonrpc": "2.0", "id": 3, "method": "tools/list" }),
        )
        .await;
        assert_eq!(scoped_tools["result"]["tools"].as_array().unwrap().len(), 8);

        let bob_tools = mcp_call(
            bob_rw_secret.clone(),
            json!({ "jsonrpc": "2.0", "id": 4, "method": "tools/list" }),
        )
        .await;
        assert_eq!(bob_tools["result"]["tools"].as_array().unwrap().len(), 9);

        // 6. whoami, list_vaults, metadata-only list_credentials, on-demand get_credential
        let whoami_res = mcp_call(
            ro_secret.clone(),
            json!({
                "jsonrpc": "2.0",
                "id": 5,
                "method": "tools/call",
                "params": { "name": "whoami", "arguments": {} }
            }),
        )
        .await;
        assert_eq!(whoami_res["result"]["isError"], false);
        let whoami_payload: Value =
            serde_json::from_str(whoami_res["result"]["content"][0]["text"].as_str().unwrap())
                .unwrap();
        assert_eq!(whoami_payload["user"]["id"], alice_id);
        assert_eq!(whoami_payload["mcp_key"]["permission"], "read");

        let scoped_vaults_res = mcp_call(
            scoped_rw_secret.clone(),
            json!({
                "jsonrpc": "2.0",
                "id": 6,
                "method": "tools/call",
                "params": { "name": "list_vaults", "arguments": {} }
            }),
        )
        .await;
        let scoped_vaults_payload: Value = serde_json::from_str(
            scoped_vaults_res["result"]["content"][0]["text"]
                .as_str()
                .unwrap(),
        )
        .unwrap();
        assert_eq!(scoped_vaults_payload["count"], 1);
        assert_eq!(scoped_vaults_payload["vaults"][0]["id"], infra_vault_id);

        let list_creds_res = mcp_call(
            ro_secret.clone(),
            json!({
                "jsonrpc": "2.0",
                "id": 7,
                "method": "tools/call",
                "params": { "name": "list_credentials", "arguments": { "vault_id": infra_vault_id } }
            }),
        )
        .await;
        let list_creds_text = list_creds_res["result"]["content"][0]["text"]
            .as_str()
            .unwrap();
        assert!(!list_creds_text.contains("DbMcpSecret!2026"));
        assert!(!list_creds_text.contains("Secret prod note"));

        let get_cred_res = mcp_call(
            ro_secret.clone(),
            json!({
                "jsonrpc": "2.0",
                "id": 8,
                "method": "tools/call",
                "params": { "name": "get_credential", "arguments": { "credential_id": prod_cred_id } }
            }),
        )
        .await;
        assert_eq!(get_cred_res["result"]["isError"], false);
        let cred_payload: Value =
            serde_json::from_str(get_cred_res["result"]["content"][0]["text"].as_str().unwrap())
                .unwrap();
        assert_eq!(cred_payload["password"], "DbMcpSecret!2026");
        assert_eq!(cred_payload["notes"], "Secret prod note");

        // Out-of-scope get_credential rejected
        let oos_get = mcp_call(
            scoped_rw_secret.clone(),
            json!({
                "jsonrpc": "2.0",
                "id": 9,
                "method": "tools/call",
                "params": { "name": "get_credential", "arguments": { "credential_id": alice_priv_cred_id } }
            }),
        )
        .await;
        assert_eq!(oos_get["result"]["isError"], true);

        // 7. Write tools & permission enforcement
        let ro_create = mcp_call(
            ro_secret.clone(),
            json!({
                "jsonrpc": "2.0",
                "id": 10,
                "method": "tools/call",
                "params": {
                    "name": "create_credential",
                    "arguments": { "vault_id": infra_vault_id, "title": "Nope", "password": "secret" }
                }
            }),
        )
        .await;
        assert_eq!(ro_create["result"]["isError"], true);

        // Bob (viewer on infra_vault_id) cannot create in infra_vault_id even with read_write MCP key
        let bob_viewer_create = mcp_call(
            bob_rw_secret.clone(),
            json!({
                "jsonrpc": "2.0",
                "id": 11,
                "method": "tools/call",
                "params": {
                    "name": "create_credential",
                    "arguments": { "vault_id": infra_vault_id, "title": "Forbidden", "password": "secret" }
                }
            }),
        )
        .await;
        assert_eq!(bob_viewer_create["result"]["isError"], true);

        // Scoped key cannot create_vault
        let scoped_create_vault = mcp_call(
            scoped_rw_secret.clone(),
            json!({
                "jsonrpc": "2.0",
                "id": 12,
                "method": "tools/call",
                "params": { "name": "create_vault", "arguments": { "name": "Blocked" } }
            }),
        )
        .await;
        assert_eq!(scoped_create_vault["result"]["isError"], true);

        // Scoped RW key creates, updates, and deletes a credential in infra_vault_id
        let rw_create = mcp_call(
            scoped_rw_secret.clone(),
            json!({
                "jsonrpc": "2.0",
                "id": 13,
                "method": "tools/call",
                "params": {
                    "name": "create_credential",
                    "arguments": {
                        "vault_id": infra_vault_id,
                        "title": "MCP Created API Token",
                        "username": "deploy-bot",
                        "password": "CreatedViaMcp!123",
                        "category": "api_key"
                    }
                }
            }),
        )
        .await;
        assert_eq!(rw_create["result"]["isError"], false);
        let rw_create_text = rw_create["result"]["content"][0]["text"].as_str().unwrap();
        assert!(!rw_create_text.contains("CreatedViaMcp!123"));
        let rw_created_json: Value = serde_json::from_str(rw_create_text).unwrap();
        let mcp_cred_id = rw_created_json["id"].as_str().unwrap().to_string();

        let raw_cipher: (String,) =
            sqlx::query_as("SELECT password_ciphertext FROM credentials WHERE id = $1")
                .bind(&mcp_cred_id)
                .fetch_one(&db)
                .await
                .unwrap();
        assert!(!raw_cipher.0.contains("CreatedViaMcp!123"));

        let rw_update = mcp_call(
            scoped_rw_secret.clone(),
            json!({
                "jsonrpc": "2.0",
                "id": 14,
                "method": "tools/call",
                "params": {
                    "name": "update_credential",
                    "arguments": {
                        "credential_id": mcp_cred_id,
                        "password": "RotatedViaMcp!456"
                    }
                }
            }),
        )
        .await;
        assert_eq!(rw_update["result"]["isError"], false);

        let verify_updated = mcp_call(
            ro_secret.clone(),
            json!({
                "jsonrpc": "2.0",
                "id": 15,
                "method": "tools/call",
                "params": { "name": "get_credential", "arguments": { "credential_id": mcp_cred_id } }
            }),
        )
        .await;
        let verify_updated_json: Value =
            serde_json::from_str(verify_updated["result"]["content"][0]["text"].as_str().unwrap())
                .unwrap();
        assert_eq!(verify_updated_json["password"], "RotatedViaMcp!456");

        let rw_delete = mcp_call(
            scoped_rw_secret.clone(),
            json!({
                "jsonrpc": "2.0",
                "id": 16,
                "method": "tools/call",
                "params": { "name": "delete_credential", "arguments": { "credential_id": mcp_cred_id } }
            }),
        )
        .await;
        assert_eq!(rw_delete["result"]["isError"], false);

        // Bob unscoped RW key creates a vault
        let bob_create_vault = mcp_call(
            bob_rw_secret.clone(),
            json!({
                "jsonrpc": "2.0",
                "id": 17,
                "method": "tools/call",
                "params": { "name": "create_vault", "arguments": { "name": "Bob MCP Vault" } }
            }),
        )
        .await;
        assert_eq!(bob_create_vault["result"]["isError"], false);

        // 8. Resources
        let res_read_vaults = mcp_call(
            scoped_rw_secret.clone(),
            json!({
                "jsonrpc": "2.0",
                "id": 18,
                "method": "resources/read",
                "params": { "uri": "starward://vaults" }
            }),
        )
        .await;
        let vaults_res_json: Value = serde_json::from_str(
            res_read_vaults["result"]["contents"][0]["text"]
                .as_str()
                .unwrap(),
        )
        .unwrap();
        assert_eq!(vaults_res_json.as_array().unwrap().len(), 1);

        let res_read_creds = mcp_call(
            ro_secret.clone(),
            json!({
                "jsonrpc": "2.0",
                "id": 19,
                "method": "resources/read",
                "params": { "uri": format!("starward://vaults/{infra_vault_id}/credentials") }
            }),
        )
        .await;
        let creds_res_text = res_read_creds["result"]["contents"][0]["text"]
            .as_str()
            .unwrap();
        assert!(!creds_res_text.contains("DbMcpSecret!2026"));

        let res_read_oos = mcp_call(
            scoped_rw_secret.clone(),
            json!({
                "jsonrpc": "2.0",
                "id": 20,
                "method": "resources/read",
                "params": { "uri": format!("starward://vaults/{alice_personal_id}/credentials") }
            }),
        )
        .await;
        assert_eq!(res_read_oos["error"]["code"], -32002);

        // 9. Audit logs, last_used_at, and revocation
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri(format!("/api/vaults/{infra_vault_id}/audit"))
                    .header("Authorization", format!("Bearer {alice_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let vault_audit = read_json(res).await;
        assert!(vault_audit.as_array().unwrap().iter().any(|a| {
            a["action"] == "credential.accessed"
                && a["details"].as_str().unwrap_or("").contains("[via MCP:")
        }));

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri(format!("/api/mcp-keys/{ro_key_id}"))
                    .header("Authorization", format!("Bearer {alice_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::NO_CONTENT);

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/mcp")
                    .header("Authorization", format!("Bearer {ro_secret}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({"jsonrpc": "2.0", "id": 21, "method": "ping"}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);

        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/admin/audit?target_type=mcp_key")
                    .header("Authorization", format!("Bearer {alice_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let sys_audit = read_json(res).await;
        let actions: Vec<&str> = sys_audit
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|e| e["action"].as_str())
            .collect();
        assert!(actions.contains(&"mcp_key.created"));
        assert!(actions.contains(&"auth.mcp_key_used"));
        assert!(actions.contains(&"mcp_key.revoked"));

        // Clean up test users
        let _ = sqlx::query("DELETE FROM users WHERE id IN ($1, $2)")
            .bind(&alice_id)
            .bind(&bob_id)
            .execute(&db)
            .await;
    }
}
