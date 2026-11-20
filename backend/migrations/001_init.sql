CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    name_customized BOOLEAN NOT NULL DEFAULT FALSE,
    image TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));

CREATE TABLE IF NOT EXISTS vaults (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL DEFAULT 'folder',
    color TEXT NOT NULL DEFAULT 'indigo',
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_personal BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vaults_owner_id ON vaults (owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vaults_owner_personal_unique
    ON vaults (owner_id)
    WHERE is_personal = TRUE;

CREATE TABLE IF NOT EXISTS vault_members (
    id TEXT PRIMARY KEY NOT NULL,
    vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    member_email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
    shared_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vault_members_vault_email_lower
    ON vault_members (vault_id, LOWER(member_email));
CREATE INDEX IF NOT EXISTS idx_vault_members_user_id ON vault_members (user_id);
CREATE INDEX IF NOT EXISTS idx_vault_members_email_lower ON vault_members (LOWER(member_email));
CREATE INDEX IF NOT EXISTS idx_vault_members_vault_id ON vault_members (vault_id);

CREATE TABLE IF NOT EXISTS credentials (
    id TEXT PRIMARY KEY NOT NULL,
    vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    username TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'login',
    password_ciphertext TEXT NOT NULL,
    password_nonce TEXT NOT NULL,
    notes_ciphertext TEXT NOT NULL,
    notes_nonce TEXT NOT NULL,
    extra_fields_ciphertext TEXT NOT NULL DEFAULT '',
    extra_fields_nonce TEXT NOT NULL DEFAULT '',
    favorite BOOLEAN NOT NULL DEFAULT FALSE,
    created_by TEXT NOT NULL REFERENCES users(id),
    updated_by TEXT NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credentials_vault_id ON credentials (vault_id);

CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY NOT NULL,
    vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    credential_id TEXT,
    actor_id TEXT NOT NULL,
    actor_email TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_vault_id ON audit_logs (vault_id);

CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    theme TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('light', 'dark')),
    password_generator_length INTEGER NOT NULL DEFAULT 20 CHECK (password_generator_length BETWEEN 8 AND 64),
    password_generator_uppercase BOOLEAN NOT NULL DEFAULT TRUE,
    password_generator_lowercase BOOLEAN NOT NULL DEFAULT TRUE,
    password_generator_numbers BOOLEAN NOT NULL DEFAULT TRUE,
    password_generator_symbols BOOLEAN NOT NULL DEFAULT TRUE,
    default_vault_id TEXT REFERENCES vaults(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    permission TEXT NOT NULL DEFAULT 'read' CHECK (permission IN ('read', 'read_write')),
    vault_ids TEXT[] NOT NULL DEFAULT '{}',
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys (user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys (key_hash);
