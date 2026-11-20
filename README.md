# Starward — Password Manager

Password manager full-stack con **backend Rust** (Axum + **PostgreSQL** + cifratura autenticata **AES-256-GCM**), **frontend TanStack Start** + **shadcn/ui** e autenticazione **Better Auth** su **PostgreSQL dedicato** (account locali + SSO OIDC/OAuth2).

## Funzionalità principali

1. **Autenticazione Locale & SSO via Better Auth (su PostgreSQL)**
   - Registrazione e login con email e password (sessioni HttpOnly gestite da Better Auth su PostgreSQL via `pg.Pool`, con migrazione automatica all'avvio).
   - Supporto SSO pronto all'uso per qualsiasi **Identity Provider OIDC/OAuth2 aziendale** (Keycloak, Okta, Authentik, Auth0, Microsoft Entra ID) tramite plugin `genericOAuth`, oltre a Google, GitHub e Microsoft.
   - Bridge autenticato sicuro tra TanStack Start (`/api/v1/*`) e backend Rust tramite JWT HS256 a breve scadenza.

2. **Vault Centralizzato con Cartelle Condivise**
   - Ogni utente riceve automaticamente una cartella **Personale** al primo accesso e può creare cartelle dedicate (es. *Produzione*, *Team Engineering*, *Clienti*).
   - **Condivisione ad utenti specifici**: il proprietario può condividere qualsiasi cartella indicando un'email (con autocompletamento degli utenti registrati) e scegliendo il ruolo **Editor** o **Sola lettura (Viewer)**.
   - Anche se un utente invitato non si è ancora registrato, l'accesso alla cartella condivisa viene collegato automaticamente al suo primo login (locale o SSO).
   - Tutti i membri vedono la cartella condivisa direttamente nella sidebar (sezione *Condivise con me*) con accesso live alle credenziali e registro attività (*Audit Log*).

3. **RBAC (Admin & User) e Pannello Admin**
   - Controllo degli accessi basato sui ruoli con ruoli globali **Admin** e **User** (il primo utente registrato diventa automaticamente **Admin**, con supporto opzionale per la variabile d'ambiente `ADMIN_EMAILS`).
   - **Pannello Admin** integrato nella sidebar (visibile esclusivamente agli utenti con ruolo **Admin**) con:
     - **Lista utenti**: visualizzazione dettagli utenti, statistiche cartelle/credenziali, modifica del ruolo (`Admin` / `User`) ed eliminazione utenti.
     - **Audit di sistema**: registro globale degli eventi di sicurezza e amministrazione (*chi ha fatto cosa e quando*) con filtri per attore/ruolo, categoria risorsa, codice azione e intervallo temporale.

4. **Sicurezza & UI Intuitiva**
   - Password e note cifrate a riposo in Rust con **AES-256-GCM**, nonce casuali a 96-bit per ogni salvataggio e derivazione chiave **HKDF-SHA256**.
   - Interfaccia master-detail ispirata ai moderni password manager: ricerca istantanea (`Ctrl+K`), filtri per categoria, copia rapida in un clic, generatore di password con indicatore di robustezza, tema chiaro/scuro e layout responsive.

4. **Impostazioni Utente & API Key Personali (`sw_live_...`)**
   - Pannello impostazioni completo (Profilo, Sicurezza & Sessioni Attive, Preferenze Vault e Generatore Password, Gestione API Key).
   - Generazione di **API Key personali** salvate esclusivamente come hash **SHA-256**, con scelta dei permessi (`read` o `read_write`), restrizione opzionale a specifiche cartelle e scadenza configurabile.
   - Autenticazione programmatica diretta tramite header `Authorization: Bearer sw_live_...` o `X-API-Key: sw_live_...` su `/api/v1/*` e `/api/*`.

## Struttura del progetto

```text
Starward/
├── docker-compose.yml       # Istanza PostgreSQL 19 dedicata con volume persistente
├── backend/                 # Backend Rust (Axum + SQLx PostgreSQL + AES-256-GCM)
│   ├── migrations/001_init.sql
│   └── src/
│       ├── main.rs          # Router Axum, CORS, migrazioni PostgreSQL e test
│       ├── auth.rs          # Validazione JWT HS256, sync utenti e collegamento inviti pendenti
│       ├── crypto.rs        # Cifratura AES-256-GCM + HKDF-SHA256
│       └── routes/          # API REST /api/vaults, /api/credentials, /api/users, /api/health
└── frontend/                # Frontend TanStack Start + Better Auth (pg) + Tailwind v4 + shadcn/ui
    └── src/
        ├── lib/auth.ts      # Configurazione Better Auth su PostgreSQL (Locale + SSO OIDC/Social)
        ├── routes/api/      # Handler /api/auth/$ e proxy autenticato /api/v1/$
        ├── routes/login.tsx # Pagina accesso locale + SSO
        ├── routes/vault.tsx # Workspace principale del password manager
        └── components/      # Componenti shadcn/ui e moduli vault/condivisione
```

## Deploy da immagini GHCR pre-compilate (Produzione)

Le immagini Docker ufficiali vengono compilate e pubblicate automaticamente su **GitHub Container Registry (GHCR)** ad ogni tag `vX.Y.Z`:
- `ghcr.io/xbounceit/starward-backend`
- `ghcr.io/xbounceit/starward-frontend`

Per avviare lo stack senza compilare in locale:

```bash
# 1. Copia e personalizza .env (opzionalmente imposta STARWARD_VERSION=v1.0.0)
cp .env.example .env

# 2. Scarica le immagini da GHCR e avvia tutti i servizi
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

## Release automatiche tramite tag (`vX.Y.Z`)

Non è necessario aprire PR per il bump della versione: `Cargo.toml` e `package.json` mantengono `0.0.0-dev` e la versione dell'app (esposta su UI, log di avvio, `/api/health` e metadati OCI delle immagini Docker) viene derivata automaticamente dal tag Git spinto:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Il workflow `.github/workflows/release.yml` esegue automaticamente:
1. Validazione del tag SemVer (`vX.Y.Z` o prerelease `vX.Y.Z-rc.1`) e derivazione di `APP_VERSION` (`X.Y.Z`).
2. Build e push parallelo su GHCR delle immagini `starward-backend` e `starward-frontend` con tag SemVer (`X.Y.Z`, `vX.Y.Z`, `X.Y`, `X` e `latest` per le release stabili).
3. Creazione della GitHub Release con patch notes autogenerate (configurate in `.github/release.yml`), riferimenti alle immagini GHCR e allegato `docker-compose.prod.yml`.

## Deploy rapido con Docker Compose (build sul momento)

Per compilare e avviare l'intero stack (**PostgreSQL 19 + Backend Rust + Frontend TanStack Start**) con un solo comando:

```bash
# 1. Copia e personalizza le chiavi segrete (e opzionalmente SSO)
cp .env.example .env

# 2. Compila le immagini sul momento e avvia tutti i servizi
docker compose up --build -d
```

- **App Web**: `http://0.0.0.0:3000` (raggiungibile da altri PC in rete tramite `http://<IP-DEL-SERVER>:3000`, o in locale su [http://localhost:3000](http://localhost:3000))
- **Backend Rust Health**: `http://0.0.0.0:8080/api/health` (`http://<IP-DEL-SERVER>:8080/api/health`)
- **PostgreSQL dedicato**: `localhost:5432` (volume persistente `starward_pgdata`)

> Con `BETTER_AUTH_URL=http://0.0.0.0:3000` (impostazione predefinita in `.env.example`), frontend e backend accettano automaticamente le richieste provenienti da qualsiasi dispositivo sulla rete locale tramite l'IP/hostname del server. In produzione dietro dominio/HTTPS imposta l'URL esatto (es. `BETTER_AUTH_URL=https://vault.esempio.it`).

Per fermare tutto (mantenendo i dati nel volume PostgreSQL):
```bash
docker compose down
```

---

## Sviluppo locale (senza container per app)

### Prerequisiti
- **PostgreSQL 16+** (o **Docker** tramite il `docker-compose.yml` incluso)
- **Rust** (`cargo`, `rustc`)
- **Node.js** >= 22 e **pnpm**

### 1. Avvia il database PostgreSQL dedicato
```bash
docker compose up -d postgres
```
Questo avvia un'istanza **PostgreSQL 19** dedicata su `127.0.0.1:5432` con database `starward` (utente `starward`, password `starward`).
In alternativa puoi puntare a qualsiasi istanza PostgreSQL esterna o gestita (Neon, Supabase, RDS, self-hosted) configurando `DATABASE_URL` (e opzionalmente `AUTH_DATABASE_URL` se vuoi separare auth e vault su due database distinti).

### 2. Configura le variabili d'ambiente
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```
> **Importante**: assicurati che `STARWARD_AUTH_SECRET` abbia lo stesso valore in `backend/.env` e `frontend/.env`.

### 3. Avvia il backend Rust (porta `8080`)
```bash
cd backend
cargo run
```
All'avvio il backend applica automaticamente lo schema PostgreSQL in `backend/migrations/001_init.sql`.

### 4. Avvia il frontend TanStack Start (porta `3000`)
```bash
cd frontend
pnpm install
pnpm dev
```
Al primo accesso Better Auth crea automaticamente le proprie tabelle (`user`, `session`, `account`, `verification`) su PostgreSQL.

Apri [http://localhost:3000](http://localhost:3000) per accedere al vault.

## Configurazione SSO (Better Auth)

Per attivare il login SSO in `frontend/.env`:

- **Enterprise OIDC (Keycloak, Okta, Authentik, Entra ID, Auth0)**:
  ```env
  SSO_OIDC_NAME=SSO Aziendale
  SSO_OIDC_CLIENT_ID=...
  SSO_OIDC_CLIENT_SECRET=...
  SSO_OIDC_DISCOVERY_URL=https://idp.esempio.it/.well-known/openid-configuration
  ```
- **Google / GitHub / Microsoft**: imposta le rispettive variabili `*_CLIENT_ID` e `*_CLIENT_SECRET` elencate in `frontend/.env.example`.

## Test e Build

```bash
# Test unitari backend Rust
cargo test --manifest-path backend/Cargo.toml

# Test di integrazione completo contro PostgreSQL dedicato
TEST_DATABASE_URL=postgres://starward:starward@127.0.0.1:5432/starward cargo test --manifest-path backend/Cargo.toml

# Typecheck e build di produzione del frontend TanStack Start
pnpm --dir frontend typecheck
pnpm --dir frontend build
```
