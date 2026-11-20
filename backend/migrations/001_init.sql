CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
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
