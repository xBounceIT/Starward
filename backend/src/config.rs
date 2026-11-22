use std::env;

/// Dev mode is opt-in via `STARWARD_DEV_MODE=true`; by default the app runs in
/// production mode and refuses to start with insecure dev defaults.
pub fn dev_mode() -> bool {
    matches!(
        env::var("STARWARD_DEV_MODE").as_deref(),
        Ok("true") | Ok("1") | Ok("yes")
    )
}

const DEV_AUTH_SECRET: &str = "dev-starward-auth-secret-change-in-production-32chars";
const DEV_MASTER_KEY: &str = "dev-starward-master-key-change-in-production-32chars";
const DEV_DATABASE_URL: &str = "postgres://starward:starward@127.0.0.1:5432/starward";

/// Returns the value of `var`. In dev mode the dev default is allowed; in
/// production the variable must be set to a value different from the dev
/// default, otherwise startup fails fast.
fn secret_from_env(var: &str, dev_default: &str) -> String {
    if dev_mode() {
        return env::var(var).unwrap_or_else(|_| dev_default.to_string());
    }
    match env::var(var) {
        Ok(v) if !v.trim().is_empty() && v != dev_default => v,
        _ => panic!(
            "{var} must be set to a strong non-default value in production \
             (for secrets: min 32 random chars), \
             or set STARWARD_DEV_MODE=true for local development."
        ),
    }
}

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
        let database_url = secret_from_env("DATABASE_URL", DEV_DATABASE_URL);
        let auth_secret = secret_from_env("STARWARD_AUTH_SECRET", DEV_AUTH_SECRET);
        let master_key = secret_from_env("STARWARD_MASTER_KEY", DEV_MASTER_KEY);
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
