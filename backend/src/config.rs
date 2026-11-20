use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub database_url: String,
    pub auth_secret: String,
    pub master_key: String,
    pub cors_origin: String,
    pub admin_emails: Vec<String>,
}

impl Config {
    pub fn from_env() -> Self {
        let host = env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
        let port = env::var("PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(8080);
        let database_url = env::var("DATABASE_URL").unwrap_or_else(|_| {
            "postgres://starward:starward@127.0.0.1:5432/starward".to_string()
        });
        let auth_secret = env::var("STARWARD_AUTH_SECRET").unwrap_or_else(|_| {
            "dev-starward-auth-secret-change-in-production-32chars".to_string()
        });
        let master_key = env::var("STARWARD_MASTER_KEY").unwrap_or_else(|_| {
            "dev-starward-master-key-change-in-production-32chars".to_string()
        });
        let cors_origin =
            env::var("CORS_ORIGIN").unwrap_or_else(|_| "http://0.0.0.0:3000".to_string());
        let raw_admin_emails = env::var("ADMIN_EMAILS")
            .or_else(|_| env::var("STARWARD_ADMIN_EMAILS"))
            .unwrap_or_default();
        let admin_emails = parse_admin_emails(&raw_admin_emails);

        Self {
            host,
            port,
            database_url,
            auth_secret,
            master_key,
            cors_origin,
            admin_emails,
        }
    }

    pub fn is_admin_email(&self, email: &str) -> bool {
        let normalized = email.trim().to_lowercase();
        !normalized.is_empty() && self.admin_emails.iter().any(|e| e == &normalized)
    }
}

pub fn parse_admin_emails(raw: &str) -> Vec<String> {
    raw.split(',')
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .collect()
}
