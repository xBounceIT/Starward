use std::collections::BTreeMap;

use axum::{
    body::Bytes,
    extract::State,
    http::{header, HeaderMap, HeaderName, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde_json::{json, Map, Value};

use crate::{
    auth::AuthenticatedMcpUser,
    error::AppError,
    models::{CreateCredentialRequest, CreateVaultRequest, UpdateCredentialRequest, VaultDto},
    routes::{
        credentials::{
            create_credential_for_user, delete_credential_for_user, get_credential_for_user,
            list_credential_metadata_for_user, update_credential_for_user, ListCredentialsQuery,
        },
        vaults::{create_vault_for_user, list_vaults_for_user},
    },
    AppState, APP_VERSION,
};

const SUPPORTED_PROTOCOL_VERSIONS: &[&str] = &["2025-06-18", "2025-03-26", "2024-11-05"];
const DEFAULT_PROTOCOL_VERSION: &str = "2025-06-18";
const MAX_BATCH_SIZE: usize = 50;

const CREDENTIAL_CATEGORY_ENUM: &[&str] = &[
    "login",
    "api_key",
    "database",
    "ssh",
    "card",
    "license",
    "note",
];

#[derive(Debug)]
struct RpcError {
    code: i64,
    message: String,
    data: Option<Value>,
}

impl RpcError {
    fn method_not_found(method: &str) -> Self {
        Self {
            code: -32601,
            message: format!("Metodo JSON-RPC non supportato: {method}"),
            data: None,
        }
    }

    fn invalid_params(message: impl Into<String>) -> Self {
        Self {
            code: -32602,
            message: message.into(),
            data: None,
        }
    }

    fn resource_not_found(message: impl Into<String>) -> Self {
        Self {
            code: -32002,
            message: message.into(),
            data: None,
        }
    }

    fn internal(message: impl Into<String>) -> Self {
        Self {
            code: -32603,
            message: message.into(),
            data: None,
        }
    }
}

fn jsonrpc_success(id: Value, result: Value) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": result
    })
}

fn jsonrpc_error(id: Value, code: i64, message: impl Into<String>, data: Option<Value>) -> Value {
    let mut err = Map::new();
    err.insert("code".to_string(), json!(code));
    err.insert("message".to_string(), json!(message.into()));
    if let Some(extra) = data {
        err.insert("data".to_string(), extra);
    }
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": Value::Object(err)
    })
}

fn negotiate_protocol_version(requested: Option<&str>) -> &'static str {
    let Some(req) = requested.map(str::trim).filter(|s| !s.is_empty()) else {
        return DEFAULT_PROTOCOL_VERSION;
    };
    SUPPORTED_PROTOCOL_VERSIONS
        .iter()
        .copied()
        .find(|v| *v == req)
        .unwrap_or(DEFAULT_PROTOCOL_VERSION)
}

fn resolve_response_protocol_version(headers: &HeaderMap, negotiated: Option<&'static str>) -> &'static str {
    if let Some(version) = negotiated {
        return version;
    }
    let header_ver = headers
        .get("mcp-protocol-version")
        .and_then(|v| v.to_str().ok());
    negotiate_protocol_version(header_ver)
}

fn tool_success(value: Value) -> Value {
    let text = serde_json::to_string_pretty(&value).unwrap_or_else(|_| value.to_string());
    json!({
        "content": [
            {
                "type": "text",
                "text": text
            }
        ],
        "isError": false
    })
}

fn tool_error(err: AppError) -> Value {
    let message = match err {
        AppError::Database(db_err) => {
            tracing::error!(error = ?db_err, "MCP tool database error");
            "Errore interno del database durante l'operazione MCP".to_string()
        }
        AppError::Internal(msg) => {
            tracing::error!(error = %msg, "MCP tool internal error");
            "Errore interno del server durante l'operazione MCP".to_string()
        }
        AppError::Unauthorized(msg)
        | AppError::Forbidden(msg)
        | AppError::NotFound(msg)
        | AppError::BadRequest(msg)
        | AppError::Conflict(msg) => msg,
    };

    json!({
        "content": [
            {
                "type": "text",
                "text": message
            }
        ],
        "isError": true
    })
}

fn vault_summary_json(vault: &VaultDto) -> Value {
    json!({
        "id": vault.id,
        "name": vault.name,
        "description": vault.description,
        "icon": vault.icon,
        "color": vault.color,
        "is_personal": vault.is_personal,
        "role": vault.role,
        "is_shared": vault.is_shared,
        "is_shared_with_me": vault.is_shared_with_me,
        "owner_name": vault.owner_name,
        "owner_email": vault.owner_email,
        "owner_group_name": vault.owner_group_name,
        "credential_count": vault.credential_count,
        "updated_at": vault.updated_at,
    })
}

fn build_tools_list(mcp_user: &AuthenticatedMcpUser) -> Vec<Value> {
    let can_write = mcp_user.key.permission == "read_write";
    let can_create_vault = can_write && mcp_user.key.vault_ids.is_empty();

    let mut tools = vec![
        json!({
            "name": "whoami",
            "description": "Restituisce l'identità dell'utente Starward autenticato, i permessi della chiave MCP e l'eventuale restrizione sulle cartelle.",
            "inputSchema": {
                "type": "object",
                "properties": {},
                "additionalProperties": false
            },
            "annotations": {
                "readOnlyHint": true,
                "destructiveHint": false,
                "idempotentHint": true,
                "openWorldHint": false
            }
        }),
        json!({
            "name": "list_vaults",
            "description": "Elenca le cartelle del vault accessibili dall'utente nel rispetto dello scope della chiave MCP.",
            "inputSchema": {
                "type": "object",
                "properties": {},
                "additionalProperties": false
            },
            "annotations": {
                "readOnlyHint": true,
                "destructiveHint": false,
                "idempotentHint": true,
                "openWorldHint": false
            }
        }),
        json!({
            "name": "list_credentials",
            "description": "Cerca o elenca i soli metadati delle credenziali accessibili (titolo, username, url, categoria, cartella) senza esporre password o note cifrate. Usa get_credential per ottenere i segreti di una singola credenziale.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "vault_id": {
                        "type": "string",
                        "description": "Filtra le credenziali per ID della cartella"
                    },
                    "q": {
                        "type": "string",
                        "description": "Ricerca testuale su titolo, username, URL o nome cartella"
                    },
                    "category": {
                        "type": "string",
                        "enum": CREDENTIAL_CATEGORY_ENUM,
                        "description": "Filtra per categoria credenziale"
                    },
                    "favorite": {
                        "type": "boolean",
                        "description": "Se true restituisce solo le credenziali preferite"
                    },
                    "limit": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 200,
                        "default": 50,
                        "description": "Numero massimo di risultati da restituire (predefinito 50, massimo 200)"
                    }
                },
                "additionalProperties": false
            },
            "annotations": {
                "readOnlyHint": true,
                "destructiveHint": false,
                "idempotentHint": true,
                "openWorldHint": false
            }
        }),
        json!({
            "name": "get_credential",
            "description": "Recupera e decifra on-demand tutti i dettagli di una singola credenziale (inclusi password, note e campi extra), registrando l'accesso nel registro attività.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "credential_id": {
                        "type": "string",
                        "description": "ID univoco della credenziale da leggere"
                    }
                },
                "required": ["credential_id"],
                "additionalProperties": false
            },
            "annotations": {
                "readOnlyHint": true,
                "destructiveHint": false,
                "idempotentHint": true,
                "openWorldHint": false
            }
        }),
    ];

    if can_write {
        tools.push(json!({
            "name": "create_credential",
            "description": "Crea e cifra una nuova credenziale in una cartella scrivibile (richiede permesso read_write).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "vault_id": { "type": "string", "description": "ID della cartella di destinazione" },
                    "title": { "type": "string", "description": "Titolo della credenziale (1-140 caratteri)" },
                    "category": {
                        "type": "string",
                        "enum": CREDENTIAL_CATEGORY_ENUM,
                        "default": "login",
                        "description": "Categoria della credenziale"
                    },
                    "username": { "type": "string", "description": "Username, email o key ID" },
                    "password": { "type": "string", "description": "Password, token, API key o valore segreto" },
                    "url": { "type": "string", "description": "URL o host associato" },
                    "notes": { "type": "string", "description": "Note cifrate opzionali" },
                    "fields": {
                        "type": "object",
                        "additionalProperties": { "type": "string" },
                        "description": "Campi extra opzionali (es. provider, environment, db_type, port, private_key)"
                    },
                    "favorite": { "type": "boolean", "default": false }
                },
                "required": ["vault_id", "title"],
                "additionalProperties": false
            },
            "annotations": {
                "readOnlyHint": false,
                "destructiveHint": false,
                "idempotentHint": false,
                "openWorldHint": false
            }
        }));

        tools.push(json!({
            "name": "update_credential",
            "description": "Aggiorna i campi di una credenziale esistente (richiede permesso read_write).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "credential_id": { "type": "string", "description": "ID della credenziale da modificare" },
                    "vault_id": { "type": "string", "description": "Nuova cartella di destinazione (opzionale)" },
                    "title": { "type": "string", "description": "Nuovo titolo" },
                    "category": { "type": "string", "enum": CREDENTIAL_CATEGORY_ENUM },
                    "username": { "type": "string" },
                    "password": { "type": "string" },
                    "url": { "type": "string" },
                    "notes": { "type": "string" },
                    "fields": {
                        "type": "object",
                        "additionalProperties": { "type": "string" },
                        "description": "Campi extra opzionali (se fornito, sostituisce i campi extra esistenti; ometti per lasciarli invariati)"
                    },
                    "favorite": { "type": "boolean" }
                },
                "required": ["credential_id"],
                "additionalProperties": false
            },
            "annotations": {
                "readOnlyHint": false,
                "destructiveHint": false,
                "idempotentHint": true,
                "openWorldHint": false
            }
        }));

        tools.push(json!({
            "name": "delete_credential",
            "description": "Elimina definitivamente una credenziale dal vault (richiede permesso read_write).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "credential_id": { "type": "string", "description": "ID della credenziale da eliminare" }
                },
                "required": ["credential_id"],
                "additionalProperties": false
            },
            "annotations": {
                "readOnlyHint": false,
                "destructiveHint": true,
                "idempotentHint": true,
                "openWorldHint": false
            }
        }));
    }

    if can_create_vault {
        tools.push(json!({
            "name": "create_vault",
            "description": "Crea una nuova cartella personale/condivisibile nel vault (richiede chiave MCP read_write senza restrizioni su cartelle specifiche).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "name": { "type": "string", "description": "Nome della cartella (1-80 caratteri)" },
                    "description": { "type": "string", "description": "Descrizione opzionale" },
                    "icon": { "type": "string", "default": "folder", "description": "Identificativo icona" },
                    "color": { "type": "string", "default": "indigo", "description": "Colore della cartella" }
                },
                "required": ["name"],
                "additionalProperties": false
            },
            "annotations": {
                "readOnlyHint": false,
                "destructiveHint": false,
                "idempotentHint": false,
                "openWorldHint": false
            }
        }));
    }

    tools
}

fn build_resources_list() -> Vec<Value> {
    vec![json!({
        "uri": "starward://vaults",
        "name": "Accessible Vaults",
        "description": "Elenco delle cartelle Starward accessibili dalla chiave MCP corrente",
        "mimeType": "application/json"
    })]
}

fn build_resource_templates_list() -> Vec<Value> {
    vec![json!({
        "uriTemplate": "starward://vaults/{vault_id}/credentials",
        "name": "Vault Credentials Metadata",
        "description": "Metadati delle credenziali contenute nella cartella specificata (senza segreti in chiaro)",
        "mimeType": "application/json"
    })]
}

fn require_args_object(args: &Value) -> Result<&Map<String, Value>, RpcError> {
    args.as_object()
        .ok_or_else(|| RpcError::invalid_params("arguments deve essere un oggetto JSON"))
}

fn require_non_empty_string(args: &Map<String, Value>, key: &str) -> Result<String, RpcError> {
    let raw = args
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| RpcError::invalid_params(format!("Parametro obbligatorio '{key}' mancante o vuoto")))?;
    Ok(raw.to_string())
}

fn optional_string(args: &Map<String, Value>, key: &str) -> Result<Option<String>, RpcError> {
    match args.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(s)) => Ok(Some(s.clone())),
        Some(_) => Err(RpcError::invalid_params(format!(
            "Il parametro '{key}' deve essere una stringa"
        ))),
    }
}

fn optional_bool(args: &Map<String, Value>, key: &str) -> Result<Option<bool>, RpcError> {
    match args.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Bool(b)) => Ok(Some(*b)),
        Some(_) => Err(RpcError::invalid_params(format!(
            "Il parametro '{key}' deve essere booleano"
        ))),
    }
}

fn optional_usize(args: &Map<String, Value>, key: &str) -> Result<Option<usize>, RpcError> {
    match args.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(n)) => {
            let val = n.as_u64().ok_or_else(|| {
                RpcError::invalid_params(format!("Il parametro '{key}' deve essere un intero positivo"))
            })?;
            Ok(Some(usize::try_from(val).unwrap_or(usize::MAX)))
        }
        Some(_) => Err(RpcError::invalid_params(format!(
            "Il parametro '{key}' deve essere un numero intero"
        ))),
    }
}

fn optional_string_map(
    args: &Map<String, Value>,
    key: &str,
) -> Result<Option<BTreeMap<String, String>>, RpcError> {
    match args.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Object(map)) => {
            let mut out = BTreeMap::new();
            for (k, v) in map {
                let s = v.as_str().ok_or_else(|| {
                    RpcError::invalid_params(format!(
                        "Tutti i valori in '{key}' devono essere stringhe (campo '{k}')"
                    ))
                })?;
                out.insert(k.clone(), s.to_string());
            }
            Ok(Some(out))
        }
        Some(_) => Err(RpcError::invalid_params(format!(
            "Il parametro '{key}' deve essere un oggetto mappa stringa->stringa"
        ))),
    }
}

fn handle_initialize(params: &Value) -> Result<(Value, &'static str), RpcError> {
    let requested = params.get("protocolVersion").and_then(Value::as_str);
    let negotiated = negotiate_protocol_version(requested);

    let result = json!({
        "protocolVersion": negotiated,
        "capabilities": {
            "tools": {
                "listChanged": false
            },
            "resources": {
                "subscribe": false,
                "listChanged": false
            }
        },
        "serverInfo": {
            "name": "starward-mcp",
            "title": "Starward Password Manager MCP Server",
            "version": APP_VERSION
        },
        "instructions": "Server MCP di Starward collegato alla tua chiave MCP personale. Usa list_vaults e list_credentials per consultare i metadati senza esporre segreti, e chiama get_credential solo quando ti serve decifrare una specifica credenziale."
    });

    Ok((result, negotiated))
}

async fn handle_tools_call(
    state: &AppState,
    mcp_user: &AuthenticatedMcpUser,
    params: &Value,
) -> Result<Value, RpcError> {
    let params_obj = params
        .as_object()
        .ok_or_else(|| RpcError::invalid_params("params deve essere un oggetto JSON"))?;

    let tool_name = require_non_empty_string(params_obj, "name")?;
    let args_val = params_obj
        .get("arguments")
        .cloned()
        .unwrap_or_else(|| Value::Object(Map::new()));
    let args = require_args_object(&args_val)?;
    let audit_tag = mcp_user.audit_tag();

    match tool_name.as_str() {
        "whoami" => Ok(tool_success(json!({
            "user": {
                "id": mcp_user.user.id,
                "name": mcp_user.user.name,
                "email": mcp_user.user.email,
                "role": mcp_user.user.role,
            },
            "mcp_key": {
                "id": mcp_user.key.id,
                "name": mcp_user.key.name,
                "key_prefix": mcp_user.key.key_prefix,
                "permission": mcp_user.key.permission,
                "scoped_vault_ids": mcp_user.key.vault_ids,
                "all_vaults_access": mcp_user.key.vault_ids.is_empty(),
            }
        }))),

        "list_vaults" => match list_vaults_for_user(state, &mcp_user.user).await {
            Ok(vaults) => {
                let summaries: Vec<Value> = vaults.iter().map(vault_summary_json).collect();
                let count = summaries.len();
                Ok(tool_success(json!({
                    "vaults": summaries,
                    "count": count
                })))
            }
            Err(err) => Ok(tool_error(err)),
        },

        "list_credentials" => {
            let vault_id = optional_string(args, "vault_id")?
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());
            let q = optional_string(args, "q")?;
            let category = optional_string(args, "category")?;
            let favorite = optional_bool(args, "favorite")?;
            let limit = optional_usize(args, "limit")?.unwrap_or(50).clamp(1, 200);

            match list_credential_metadata_for_user(
                state,
                &mcp_user.user,
                ListCredentialsQuery {
                    vault_id,
                    q,
                    favorite,
                    category,
                },
            )
            .await
            {
                Ok(mut all) => {
                    let total_matched = all.len();
                    let truncated = total_matched > limit;
                    all.truncate(limit);
                    let count = all.len();
                    Ok(tool_success(json!({
                        "credentials": all,
                        "count": count,
                        "total_matched": total_matched,
                        "truncated": truncated
                    })))
                }
                Err(err) => Ok(tool_error(err)),
            }
        }

        "get_credential" => {
            let credential_id = require_non_empty_string(args, "credential_id")?;
            match get_credential_for_user(state, &mcp_user.user, &credential_id, Some(&audit_tag))
                .await
            {
                Ok(dto) => Ok(tool_success(json!(dto))),
                Err(err) => Ok(tool_error(err)),
            }
        }

        "create_credential" => {
            let vault_id = require_non_empty_string(args, "vault_id")?;
            let title = require_non_empty_string(args, "title")?;
            let username = optional_string(args, "username")?.unwrap_or_default();
            let password = optional_string(args, "password")?.unwrap_or_default();
            let url = optional_string(args, "url")?.unwrap_or_default();
            let category = optional_string(args, "category")?
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "login".to_string());
            let notes = optional_string(args, "notes")?.unwrap_or_default();
            let fields = optional_string_map(args, "fields")?.unwrap_or_default();
            let favorite = optional_bool(args, "favorite")?.unwrap_or(false);

            if let Err(err) = mcp_user.user.require_write_permission() {
                return Ok(tool_error(err));
            }

            let payload = CreateCredentialRequest {
                vault_id,
                title,
                username,
                password,
                url,
                category,
                notes,
                fields,
                favorite,
            };

            match create_credential_for_user(state, &mcp_user.user, payload, Some(&audit_tag))
                .await
            {
                Ok(dto) => {
                    let field_keys: Vec<String> = dto.fields.keys().cloned().collect();
                    Ok(tool_success(json!({
                        "id": dto.id,
                        "vault_id": dto.vault_id,
                        "vault_name": dto.vault_name,
                        "title": dto.title,
                        "username": dto.username,
                        "url": dto.url,
                        "category": dto.category,
                        "favorite": dto.favorite,
                        "field_keys": field_keys,
                        "created_at": dto.created_at,
                        "updated_at": dto.updated_at
                    })))
                }
                Err(err) => Ok(tool_error(err)),
            }
        }

        "update_credential" => {
            let credential_id = require_non_empty_string(args, "credential_id")?;
            let vault_id = optional_string(args, "vault_id")?;
            let title = optional_string(args, "title")?;
            let username = optional_string(args, "username")?;
            let password = optional_string(args, "password")?;
            let url = optional_string(args, "url")?;
            let category = optional_string(args, "category")?;
            let notes = optional_string(args, "notes")?;
            let fields = optional_string_map(args, "fields")?;
            let favorite = optional_bool(args, "favorite")?;

            if let Err(err) = mcp_user.user.require_write_permission() {
                return Ok(tool_error(err));
            }

            let payload = UpdateCredentialRequest {
                vault_id,
                title,
                username,
                password,
                url,
                category,
                notes,
                fields,
                favorite,
            };

            match update_credential_for_user(
                state,
                &mcp_user.user,
                &credential_id,
                payload,
                Some(&audit_tag),
            )
            .await
            {
                Ok(dto) => {
                    let field_keys: Vec<String> = dto.fields.keys().cloned().collect();
                    Ok(tool_success(json!({
                        "id": dto.id,
                        "vault_id": dto.vault_id,
                        "vault_name": dto.vault_name,
                        "title": dto.title,
                        "username": dto.username,
                        "url": dto.url,
                        "category": dto.category,
                        "favorite": dto.favorite,
                        "field_keys": field_keys,
                        "updated_at": dto.updated_at
                    })))
                }
                Err(err) => Ok(tool_error(err)),
            }
        }

        "delete_credential" => {
            let credential_id = require_non_empty_string(args, "credential_id")?;

            if let Err(err) = mcp_user.user.require_write_permission() {
                return Ok(tool_error(err));
            }

            match delete_credential_for_user(state, &mcp_user.user, &credential_id, Some(&audit_tag))
                .await
            {
                Ok(()) => Ok(tool_success(json!({
                    "deleted": true,
                    "credential_id": credential_id
                }))),
                Err(err) => Ok(tool_error(err)),
            }
        }

        "create_vault" => {
            let name = require_non_empty_string(args, "name")?;
            let description = optional_string(args, "description")?.unwrap_or_default();
            let icon = optional_string(args, "icon")?
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "folder".to_string());
            let color = optional_string(args, "color")?
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "indigo".to_string());

            let payload = CreateVaultRequest {
                name,
                description,
                icon,
                color,
                owner_group_id: None,
                group_role: None,
            };

            match create_vault_for_user(state, &mcp_user.user, payload, Some(&audit_tag)).await {
                Ok(vault) => Ok(tool_success(json!({
                    "id": vault.id,
                    "name": vault.name,
                    "description": vault.description,
                    "icon": vault.icon,
                    "color": vault.color,
                    "role": vault.role,
                    "created_at": vault.created_at
                }))),
                Err(err) => Ok(tool_error(err)),
            }
        }

        _ => Err(RpcError::invalid_params(format!(
            "Strumento MCP sconosciuto: {tool_name}"
        ))),
    }
}

async fn handle_resources_read(
    state: &AppState,
    mcp_user: &AuthenticatedMcpUser,
    params: &Value,
) -> Result<Value, RpcError> {
    let params_obj = params
        .as_object()
        .ok_or_else(|| RpcError::invalid_params("params deve essere un oggetto JSON"))?;
    let uri = require_non_empty_string(params_obj, "uri")?;

    if uri == "starward://vaults" {
        let vaults = list_vaults_for_user(state, &mcp_user.user)
            .await
            .map_err(|e| match e {
                AppError::Database(db_err) => {
                    tracing::error!(error = ?db_err, "MCP resource database error");
                    RpcError::internal("Errore interno durante il recupero delle cartelle")
                }
                AppError::Internal(msg) => {
                    tracing::error!(error = %msg, "MCP resource internal error");
                    RpcError::internal("Errore interno durante il recupero delle cartelle")
                }
                other => RpcError::invalid_params(other.to_string()),
            })?;
        let summaries: Vec<Value> = vaults.iter().map(vault_summary_json).collect();
        let text = serde_json::to_string_pretty(&summaries)
            .map_err(|e| RpcError::internal(format!("Errore serializzazione: {e}")))?;

        return Ok(json!({
            "contents": [
                {
                    "uri": uri,
                    "mimeType": "application/json",
                    "text": text
                }
            ]
        }));
    }

    if let Some(rest) = uri
        .strip_prefix("starward://vaults/")
        .and_then(|s| s.strip_suffix("/credentials"))
    {
        let vault_id = rest.trim();
        if vault_id.is_empty() || vault_id.contains('/') {
            return Err(RpcError::invalid_params("URI cartella non valido"));
        }

        let creds = list_credential_metadata_for_user(
            state,
            &mcp_user.user,
            ListCredentialsQuery {
                vault_id: Some(vault_id.to_string()),
                q: None,
                favorite: None,
                category: None,
            },
        )
        .await
        .map_err(|e| match e {
            AppError::NotFound(msg) | AppError::Forbidden(msg) => RpcError::resource_not_found(msg),
            AppError::BadRequest(msg) => RpcError::invalid_params(msg),
            AppError::Database(db_err) => {
                tracing::error!(error = ?db_err, "MCP resource database error");
                RpcError::internal("Errore interno durante il recupero dei metadati")
            }
            AppError::Internal(msg) => {
                tracing::error!(error = %msg, "MCP resource internal error");
                RpcError::internal("Errore interno durante il recupero dei metadati")
            }
            other => RpcError::internal(other.to_string()),
        })?;

        let text = serde_json::to_string_pretty(&creds)
            .map_err(|e| RpcError::internal(format!("Errore serializzazione: {e}")))?;

        return Ok(json!({
            "contents": [
                {
                    "uri": uri,
                    "mimeType": "application/json",
                    "text": text
                }
            ]
        }));
    }

    Err(RpcError::resource_not_found(format!(
        "Risorsa MCP non trovata: {uri}"
    )))
}

async fn process_jsonrpc_message(
    state: &AppState,
    mcp_user: &AuthenticatedMcpUser,
    msg: Value,
) -> (Option<Value>, Option<&'static str>) {
    let Value::Object(map) = msg else {
        return (
            Some(jsonrpc_error(
                Value::Null,
                -32600,
                "Invalid Request: il messaggio deve essere un oggetto JSON",
                None,
            )),
            None,
        );
    };

    let has_id = map.contains_key("id");
    // Client-sent JSON-RPC responses (e.g. ack to server ping) have no `method`
    if !map.contains_key("method")
        && has_id
        && (map.contains_key("result") || map.contains_key("error"))
    {
        return (None, None);
    }

    let id = map.get("id").cloned().unwrap_or(Value::Null);
    if has_id && !(id.is_string() || id.is_number() || id.is_null()) {
        return (
            Some(jsonrpc_error(
                Value::Null,
                -32600,
                "Invalid Request: 'id' deve essere stringa, numero o null",
                None,
            )),
            None,
        );
    }

    if map.get("jsonrpc").and_then(Value::as_str) != Some("2.0") {
        return if has_id {
            (
                Some(jsonrpc_error(
                    id,
                    -32600,
                    "Invalid Request: 'jsonrpc' deve essere '2.0'",
                    None,
                )),
                None,
            )
        } else {
            (None, None)
        };
    }

    let Some(method) = map.get("method").and_then(Value::as_str) else {
        return if has_id {
            (
                Some(jsonrpc_error(
                    id,
                    -32600,
                    "Invalid Request: 'method' mancante o non valido",
                    None,
                )),
                None,
            )
        } else {
            (None, None)
        };
    };

    // Any notification (no `id` property) produces no JSON-RPC response
    if !has_id {
        return (None, None);
    }

    let params = map
        .get("params")
        .cloned()
        .unwrap_or_else(|| Value::Object(Map::new()));

    let mut negotiated_version = None;
    let outcome: Result<Value, RpcError> = match method {
        "initialize" => match handle_initialize(&params) {
            Ok((result, version)) => {
                negotiated_version = Some(version);
                Ok(result)
            }
            Err(err) => Err(err),
        },
        "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({
            "tools": build_tools_list(mcp_user)
        })),
        "tools/call" => handle_tools_call(state, mcp_user, &params).await,
        "resources/list" => Ok(json!({
            "resources": build_resources_list()
        })),
        "resources/templates/list" => Ok(json!({
            "resourceTemplates": build_resource_templates_list()
        })),
        "resources/read" => handle_resources_read(state, mcp_user, &params).await,
        _ => Err(RpcError::method_not_found(method)),
    };

    let response = match outcome {
        Ok(result) => jsonrpc_success(id, result),
        Err(err) => jsonrpc_error(id, err.code, err.message, err.data),
    };

    (Some(response), negotiated_version)
}

fn json_http_response(
    status: StatusCode,
    protocol_version: &str,
    payload: Value,
) -> Response {
    let mut response = (status, Json(payload)).into_response();
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    if let Ok(ver_header) = HeaderValue::from_str(protocol_version) {
        response
            .headers_mut()
            .insert(HeaderName::from_static("mcp-protocol-version"), ver_header);
    }
    response
}

pub async fn handle_mcp_post(
    State(state): State<AppState>,
    mcp_user: AuthenticatedMcpUser,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let parsed: Value = match serde_json::from_slice(&body) {
        Ok(val) => val,
        Err(_) => {
            return json_http_response(
                StatusCode::BAD_REQUEST,
                resolve_response_protocol_version(&headers, None),
                jsonrpc_error(Value::Null, -32700, "Parse error: JSON non valido", None),
            );
        }
    };

    match parsed {
        Value::Array(items) => {
            if items.is_empty() {
                return json_http_response(
                    StatusCode::BAD_REQUEST,
                    resolve_response_protocol_version(&headers, None),
                    jsonrpc_error(
                        Value::Null,
                        -32600,
                        "Invalid Request: batch JSON-RPC vuoto",
                        None,
                    ),
                );
            }

            if items.len() > MAX_BATCH_SIZE {
                return json_http_response(
                    StatusCode::BAD_REQUEST,
                    resolve_response_protocol_version(&headers, None),
                    jsonrpc_error(
                        Value::Null,
                        -32600,
                        format!(
                            "Invalid Request: il batch JSON-RPC supera il limite massimo di {MAX_BATCH_SIZE} richieste"
                        ),
                        None,
                    ),
                );
            }

            let mut responses = Vec::with_capacity(items.len());
            let mut negotiated = None;
            for item in items {
                let (maybe_resp, maybe_ver) =
                    process_jsonrpc_message(&state, &mcp_user, item).await;
                if maybe_ver.is_some() {
                    negotiated = maybe_ver;
                }
                if let Some(resp) = maybe_resp {
                    responses.push(resp);
                }
            }

            if responses.is_empty() {
                return (
                    StatusCode::ACCEPTED,
                    [(header::CACHE_CONTROL, "no-store")],
                )
                    .into_response();
            }

            json_http_response(
                StatusCode::OK,
                resolve_response_protocol_version(&headers, negotiated),
                Value::Array(responses),
            )
        }
        other @ Value::Object(_) => {
            let (maybe_resp, negotiated) = process_jsonrpc_message(&state, &mcp_user, other).await;
            match maybe_resp {
                Some(resp) => json_http_response(
                    StatusCode::OK,
                    resolve_response_protocol_version(&headers, negotiated),
                    resp,
                ),
                None => (
                    StatusCode::ACCEPTED,
                    [(header::CACHE_CONTROL, "no-store")],
                )
                    .into_response(),
            }
        }
        _ => json_http_response(
            StatusCode::BAD_REQUEST,
            resolve_response_protocol_version(&headers, None),
            jsonrpc_error(
                Value::Null,
                -32600,
                "Invalid Request: atteso oggetto o array JSON-RPC 2.0",
                None,
            ),
        ),
    }
}

pub async fn handle_mcp_get(_mcp_user: AuthenticatedMcpUser) -> Response {
    (
        StatusCode::METHOD_NOT_ALLOWED,
        [
            (header::ALLOW, "POST, DELETE, OPTIONS"),
            (header::CACHE_CONTROL, "no-store"),
        ],
        Json(json!({
            "error": {
                "code": "METHOD_NOT_ALLOWED",
                "message": "Questo server MCP Streamable HTTP è stateless e non espone stream SSE su GET. Invia richieste JSON-RPC tramite POST /api/mcp."
            }
        })),
    )
        .into_response()
}

pub async fn handle_mcp_delete(_mcp_user: AuthenticatedMcpUser) -> Response {
    (
        StatusCode::NO_CONTENT,
        [(header::CACHE_CONTROL, "no-store")],
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::{AuthenticatedUser, McpKeyAuthContext};

    fn make_mcp_user(permission: &str, vault_ids: Vec<&str>) -> AuthenticatedMcpUser {
        let key = McpKeyAuthContext {
            id: "mcp-1".to_string(),
            name: "Cursor".to_string(),
            key_prefix: "sw_mcp_abcdef123".to_string(),
            permission: permission.to_string(),
            vault_ids: vault_ids.into_iter().map(String::from).collect(),
        };
        let user = AuthenticatedUser {
            id: "user-1".to_string(),
            email: "alice@starward.io".to_string(),
            name: "Alice".to_string(),
            image: None,
            role: "admin".to_string(),
            is_service_account: false,
            api_key: None,
            service_account: None,
            mcp_key: Some(key.clone()),
        };
        AuthenticatedMcpUser { user, key }
    }

    #[test]
    fn protocol_version_negotiation_supports_known_and_falls_back() {
        assert_eq!(negotiate_protocol_version(Some("2025-06-18")), "2025-06-18");
        assert_eq!(negotiate_protocol_version(Some("2025-03-26")), "2025-03-26");
        assert_eq!(negotiate_protocol_version(Some("2024-11-05")), "2024-11-05");
        assert_eq!(negotiate_protocol_version(Some("2099-01-01")), "2025-06-18");
        assert_eq!(negotiate_protocol_version(None), "2025-06-18");
    }

    #[test]
    fn tools_list_respects_permission_and_vault_scope() {
        let read_only = make_mcp_user("read", vec![]);
        let ro_tools = build_tools_list(&read_only);
        let ro_names: Vec<&str> = ro_tools
            .iter()
            .filter_map(|t| t["name"].as_str())
            .collect();
        assert_eq!(
            ro_names,
            vec!["whoami", "list_vaults", "list_credentials", "get_credential"]
        );

        let scoped_rw = make_mcp_user("read_write", vec!["vault-1"]);
        let srw_tools = build_tools_list(&scoped_rw);
        let srw_names: Vec<&str> = srw_tools
            .iter()
            .filter_map(|t| t["name"].as_str())
            .collect();
        assert_eq!(
            srw_names,
            vec![
                "whoami",
                "list_vaults",
                "list_credentials",
                "get_credential",
                "create_credential",
                "update_credential",
                "delete_credential"
            ]
        );

        let full_rw = make_mcp_user("read_write", vec![]);
        let frw_tools = build_tools_list(&full_rw);
        let frw_names: Vec<&str> = frw_tools
            .iter()
            .filter_map(|t| t["name"].as_str())
            .collect();
        assert_eq!(
            frw_names,
            vec![
                "whoami",
                "list_vaults",
                "list_credentials",
                "get_credential",
                "create_credential",
                "update_credential",
                "delete_credential",
                "create_vault"
            ]
        );
    }

    #[tokio::test]
    async fn jsonrpc_helpers_distinguish_requests_and_notifications() {
        let mcp_user = make_mcp_user("read", vec![]);
        // Ensure notification yields None even without hitting DB
        let pool = sqlx::postgres::PgPoolOptions::new()
            .connect_lazy("postgres://starward:starward@127.0.0.1:5432/starward")
            .unwrap();
        let state = AppState {
            db: pool,
            config: crate::config::Config {
                host: "127.0.0.1".to_string(),
                port: 0,
                database_url: String::new(),
                auth_secret: String::new(),
                master_key: String::new(),
                cors_origin: String::new(),
                admin_emails: vec![],
            },
            crypto: crate::crypto::VaultCrypto::from_master_key("test-key"),
        };

        let notif = json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        });
        let (resp, _) = process_jsonrpc_message(&state, &mcp_user, notif).await;
        assert!(resp.is_none());

        let init_req = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": { "protocolVersion": "2025-03-26" }
        });
        let (resp, ver) = process_jsonrpc_message(&state, &mcp_user, init_req).await;
        assert_eq!(ver, Some("2025-03-26"));
        let resp = resp.unwrap();
        assert_eq!(resp["id"], 1);
        assert_eq!(resp["result"]["protocolVersion"], "2025-03-26");
        assert_eq!(resp["result"]["serverInfo"]["name"], "starward-mcp");

        let bad_method = json!({
            "jsonrpc": "2.0",
            "id": "abc",
            "method": "unknown/method"
        });
        let (resp, _) = process_jsonrpc_message(&state, &mcp_user, bad_method).await;
        let resp = resp.unwrap();
        assert_eq!(resp["id"], "abc");
        assert_eq!(resp["error"]["code"], -32601);
    }
}
