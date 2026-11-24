use std::collections::{BTreeMap, HashMap};

use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::Value;

use crate::{
    error::{AppError, AppResult},
    importers::{
        append_note_section, apply_imported_totp, clean_password,
        csv_parser::{CsvRow, CsvTable},
        detect_provider_hint_from_headers, host_from_url, parse_bool_flag,
        parse_import_timestamp, RawImportItem,
    },
    models::{is_valid_linked_id, CustomField, CustomFieldType},
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BitwardenExport {
    #[serde(default)]
    encrypted: Option<bool>,
    #[serde(default)]
    password_protected: Option<bool>,
    #[serde(default)]
    folders: Option<Vec<BitwardenNamedEntity>>,
    #[serde(default)]
    collections: Option<Vec<BitwardenNamedEntity>>,
    #[serde(default)]
    items: Option<Vec<BitwardenItem>>,
}

#[derive(Debug, Deserialize)]
struct BitwardenNamedEntity {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BitwardenItem {
    #[serde(rename = "type")]
    #[serde(default)]
    item_type: Option<u8>,
    #[serde(default)]
    folder_id: Option<String>,
    #[serde(default)]
    collection_ids: Option<Vec<String>>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    notes: Option<String>,
    #[serde(default)]
    favorite: Option<bool>,
    #[serde(default)]
    deleted_date: Option<String>,
    #[serde(default)]
    creation_date: Option<String>,
    #[serde(default)]
    revision_date: Option<String>,
    #[serde(default)]
    fields: Option<Vec<BitwardenField>>,
    #[serde(default)]
    login: Option<BitwardenLogin>,
    #[serde(default)]
    card: Option<BitwardenCard>,
    #[serde(default)]
    identity: Option<BitwardenIdentity>,
    #[serde(default)]
    ssh_key: Option<BitwardenSshKey>,
}

#[derive(Debug, Deserialize)]
struct BitwardenField {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    value: Option<Value>,
    /// Bitwarden FieldType: 0=text, 1=hidden, 2=boolean(checkbox), 3=linked
    #[serde(default, rename = "type")]
    field_type: Option<u8>,
    /// Bitwarden LinkedIdType: 100=username, 101=password, 102=uri
    #[serde(default, rename = "linkedId")]
    linked_id: Option<u32>,
}

/// Converte un campo personalizzato Bitwarden (con nome) nel modello tipizzato interno.
/// Un campo "linked" con linkedId mancante/non valido degrada a testo per non perdere il valore.
fn map_bitwarden_custom_field(cf: BitwardenField, label: String) -> CustomField {
    let raw_value = json_val_to_string(cf.value.as_ref());
    let linked = match cf.field_type.unwrap_or(0) {
        3 => cf.linked_id.filter(|id| is_valid_linked_id(*id)),
        _ => None,
    };
    match cf.field_type.unwrap_or(0) {
        1 => CustomField {
            field_type: CustomFieldType::Hidden,
            label,
            value: raw_value,
            linked_id: None,
        },
        2 => CustomField {
            field_type: CustomFieldType::Checkbox,
            label,
            value: raw_value,
            linked_id: None,
        },
        3 => match linked {
            Some(linked_id) => CustomField {
                field_type: CustomFieldType::Linked,
                label,
                value: String::new(),
                linked_id: Some(linked_id),
            },
            None => CustomField {
                field_type: CustomFieldType::Text,
                label,
                value: raw_value,
                linked_id: None,
            },
        },
        _ => CustomField {
            field_type: CustomFieldType::Text,
            label,
            value: raw_value,
            linked_id: None,
        },
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BitwardenLogin {
    #[serde(default)]
    uris: Option<Vec<BitwardenUri>>,
    #[serde(default)]
    username: Option<String>,
    #[serde(default)]
    password: Option<String>,
    #[serde(default)]
    totp: Option<String>,
    #[serde(default, alias = "fido2_credentials")]
    fido2_credentials: Option<Vec<BitwardenFido2Credential>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BitwardenFido2Credential {
    #[serde(default, alias = "credentialID", alias = "credential_id")]
    credential_id: Option<String>,
    #[serde(default, alias = "key_type")]
    key_type: Option<String>,
    #[serde(default, alias = "key_algorithm")]
    key_algorithm: Option<String>,
    #[serde(default, alias = "key_curve")]
    key_curve: Option<String>,
    #[serde(default, alias = "key_value")]
    key_value: Option<String>,
    #[serde(default, alias = "rpID", alias = "rp_id")]
    rp_id: Option<String>,
    #[serde(default, alias = "rp_name")]
    rp_name: Option<String>,
    #[serde(default, alias = "user_handle")]
    user_handle: Option<String>,
    #[serde(default, alias = "user_name", alias = "username")]
    user_name: Option<String>,
    #[serde(default, alias = "user_display_name")]
    user_display_name: Option<String>,
    #[serde(default)]
    counter: Option<Value>,
    #[serde(default)]
    discoverable: Option<Value>,
    #[serde(default, alias = "creation_date")]
    creation_date: Option<String>,
}

#[derive(Debug, Deserialize)]
struct BitwardenUri {
    #[serde(default)]
    uri: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BitwardenCard {
    #[serde(default)]
    cardholder_name: Option<String>,
    #[serde(default)]
    brand: Option<String>,
    #[serde(default)]
    number: Option<String>,
    #[serde(default)]
    exp_month: Option<Value>,
    #[serde(default)]
    exp_year: Option<Value>,
    #[serde(default)]
    code: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BitwardenIdentity {
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    first_name: Option<String>,
    #[serde(default)]
    middle_name: Option<String>,
    #[serde(default)]
    last_name: Option<String>,
    #[serde(default)]
    address1: Option<String>,
    #[serde(default)]
    address2: Option<String>,
    #[serde(default)]
    address3: Option<String>,
    #[serde(default)]
    city: Option<String>,
    #[serde(default)]
    state: Option<String>,
    #[serde(default)]
    postal_code: Option<Value>,
    #[serde(default)]
    country: Option<String>,
    #[serde(default)]
    company: Option<String>,
    #[serde(default)]
    email: Option<String>,
    #[serde(default)]
    phone: Option<Value>,
    #[serde(default)]
    ssn: Option<Value>,
    #[serde(default)]
    username: Option<String>,
    #[serde(default)]
    passport_number: Option<Value>,
    #[serde(default)]
    license_number: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BitwardenSshKey {
    #[serde(default)]
    private_key: Option<String>,
    #[serde(default)]
    public_key: Option<String>,
    #[serde(default)]
    key_fingerprint: Option<String>,
}

pub(super) fn parse_bitwarden(
    content: &str,
    filename: Option<&str>,
    forced_format: Option<&str>,
) -> AppResult<(String, Vec<RawImportItem>)> {
    let stripped = content.strip_prefix('\u{feff}').unwrap_or(content);
    let trimmed = stripped.trim_start();
    if trimmed.is_empty() {
        return Err(AppError::BadRequest("Il file da importare è vuoto.".to_string()));
    }

    let is_json = match forced_format {
        Some("json") => {
            if !trimmed.starts_with('{') {
                return Err(AppError::BadRequest(
                    "Il file selezionato non è in formato Bitwarden JSON valido (deve iniziare con '{').".to_string(),
                ));
            }
            true
        }
        Some("csv") => {
            if trimmed.starts_with('{') {
                return Err(AppError::BadRequest(
                    "Hai selezionato il formato Bitwarden CSV, ma il file è in JSON. Seleziona 'Bitwarden' o 'Bitwarden JSON'.".to_string(),
                ));
            }
            false
        }
        _ => {
            trimmed.starts_with('{')
                || filename
                    .map(|f| f.trim().to_lowercase().ends_with(".json"))
                    .unwrap_or(false)
        }
    };

    if is_json {
        let items = parse_bitwarden_json(stripped)?;
        Ok(("JSON".to_string(), items))
    } else {
        let items = parse_bitwarden_csv(stripped)?;
        Ok(("CSV".to_string(), items))
    }
}

fn json_val_to_string(val: Option<&Value>) -> String {
    match val {
        Some(Value::String(s)) => s.trim().to_string(),
        Some(Value::Number(n)) => n.to_string(),
        Some(Value::Bool(b)) => b.to_string(),
        _ => String::new(),
    }
}

fn format_card_expiry(exp_month: Option<&Value>, exp_year: Option<&Value>) -> String {
    let month_raw = json_val_to_string(exp_month);
    let year_raw = json_val_to_string(exp_year);

    let month_fmt = if let Ok(m) = month_raw.parse::<u32>() {
        if (1..=12).contains(&m) {
            format!("{m:02}")
        } else {
            month_raw
        }
    } else {
        month_raw
    };

    let year_fmt = if year_raw.len() == 4 && year_raw.chars().all(|c| c.is_ascii_digit()) {
        year_raw[2..].to_string()
    } else {
        year_raw
    };

    match (month_fmt.is_empty(), year_fmt.is_empty()) {
        (false, false) => format!("{month_fmt}/{year_fmt}"),
        (false, true) => month_fmt,
        (true, false) => year_fmt,
        (true, true) => String::new(),
    }
}

fn parse_bitwarden_json(content: &str) -> AppResult<Vec<RawImportItem>> {
    // content is size-capped upstream (validate_import_content / MAX_IMPORT_BYTES) and parsed
    // into a typed struct that is validated below (encrypted flag, presence of "items").
    let export: BitwardenExport = serde_json::from_str(content).map_err(|e| { // codeql[trust/unsafe-deserialization]
        AppError::BadRequest(format!(
            "Impossibile leggere il file JSON Bitwarden: {e}"
        ))
    })?;

    if export.encrypted == Some(true) || export.password_protected == Some(true) {
        return Err(AppError::BadRequest(
            "Questo file Bitwarden JSON è cifrato. Esporta il vault da Bitwarden in formato JSON (non cifrato) oppure CSV prima di importarlo."
                .to_string(),
        ));
    }

    let Some(items) = export.items else {
        return Err(AppError::BadRequest(
            "Il file JSON non sembra un export valido di Bitwarden (campo 'items' mancante)."
                .to_string(),
        ));
    };

    let mut folders_map = HashMap::new();
    if let Some(folders) = export.folders {
        for f in folders {
            if let (Some(id), Some(name)) = (f.id, f.name) {
                let clean = name.trim().to_string();
                if !id.is_empty() && !clean.is_empty() {
                    folders_map.insert(id, clean);
                }
            }
        }
    }

    let mut collections_map = HashMap::new();
    if let Some(collections) = export.collections {
        for c in collections {
            if let (Some(id), Some(name)) = (c.id, c.name) {
                let clean = name.trim().to_string();
                if !id.is_empty() && !clean.is_empty() {
                    collections_map.insert(id, clean);
                }
            }
        }
    }

    let mut parsed_items = Vec::with_capacity(items.len());

    for item in items {
        let title = item.name.unwrap_or_default().trim().to_string();
        let favorite = item.favorite.unwrap_or(false);

        let mut source_folder: Option<String> = None;
        let mut folder_tags: Vec<String> = Vec::new();

        if let Some(fid) = item.folder_id.as_deref()
            && let Some(fname) = folders_map.get(fid) {
                source_folder = Some(fname.clone());
                folder_tags.push(fname.clone());
            }

        if let Some(cids) = item.collection_ids {
            for cid in cids {
                if let Some(cname) = collections_map.get(&cid) {
                    if source_folder.is_none() {
                        source_folder = Some(cname.clone());
                    }
                    if !folder_tags.iter().any(|t| t.eq_ignore_ascii_case(cname)) {
                        folder_tags.push(cname.clone());
                    }
                }
            }
        }

        if item
            .deleted_date
            .as_deref()
            .map(|d| !d.trim().is_empty())
            .unwrap_or(false)
        {
            parsed_items.push(RawImportItem {
                title,
                username: String::new(),
                password: String::new(),
                url: String::new(),
                category: "login".to_string(),
                notes: String::new(),
                fields: BTreeMap::new(),
                custom_fields: Vec::new(),
                favorite,
                source_folder,
                folder_tags,
                extra_tags: Vec::new(),
                created_at: None,
                updated_at: None,
                warning: None,
                pre_skip_reason: Some("Elemento nel cestino Bitwarden".to_string()),
            });
            continue;
        }

        let created_at = item
            .creation_date
            .as_deref()
            .and_then(parse_import_timestamp);
        let updated_at = item
            .revision_date
            .as_deref()
            .and_then(parse_import_timestamp);
        let mut notes = item.notes.unwrap_or_default().trim().to_string();

        let mut custom_field_lines = Vec::new();
        let mut custom_fields: Vec<CustomField> = Vec::new();
        if let Some(raw_fields) = item.fields {
            for cf in raw_fields {
                let fname = cf.name.as_deref().unwrap_or_default().trim().to_string();
                if fname.is_empty() {
                    // senza nome non può diventare campo tipizzato: resta come riga di nota
                    let fval = json_val_to_string(cf.value.as_ref());
                    if !fval.is_empty() {
                        custom_field_lines.push(fval);
                    }
                    continue;
                }
                custom_fields.push(map_bitwarden_custom_field(cf, fname));
            }
        }

        let mut username = String::new();
        let mut password = String::new();
        let mut url = String::new();
        let mut fields = BTreeMap::new();
        let extra_tags = Vec::new();
        let mut warning = None;
        let mut pre_skip_reason = None;
        let mut extra_items: Vec<RawImportItem> = Vec::new();
        let mut skip_primary = false;

        let category = match item.item_type {
            Some(1) => {
                let mut fido2_creds: Vec<BitwardenFido2Credential> = Vec::new();
                if let Some(login) = item.login {
                    username = login.username.unwrap_or_default().trim().to_string();
                    password = clean_password(&login.password.unwrap_or_default());

                    let mut uris: Vec<String> = login
                        .uris
                        .unwrap_or_default()
                        .into_iter()
                        .filter_map(|u| u.uri)
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .collect();

                    if !uris.is_empty() {
                        url = uris.remove(0);
                        if !uris.is_empty() {
                            let extra_urls = uris
                                .into_iter()
                                .map(|u| format!("- {u}"))
                                .collect::<Vec<_>>()
                                .join("\n");
                            append_note_section(&mut notes, Some("Altri URL:"), &extra_urls);
                        }
                    }

                    if let Some(totp) = login.totp {
                        apply_imported_totp(&totp, &mut fields, &mut notes);
                    }

                    fido2_creds = login
                        .fido2_credentials
                        .unwrap_or_default()
                        .into_iter()
                        .filter(is_non_empty_fido2)
                        .collect();
                }

                if !fido2_creds.is_empty() {
                    let total = fido2_creds.len();
                    if password.is_empty() {
                        skip_primary = true;
                        let mut passkey_notes = notes.clone();
                        if !custom_field_lines.is_empty() {
                            append_note_section(
                                &mut passkey_notes,
                                Some("Campi personalizzati:"),
                                &custom_field_lines.join("\n"),
                            );
                        }
                        for (idx, fido2) in fido2_creds.iter().enumerate() {
                            let mut pk_item = build_passkey_raw_item(
                                &title,
                                &username,
                                &url,
                                passkey_notes.clone(),
                                favorite,
                                source_folder.clone(),
                                folder_tags.clone(),
                                fido2,
                                idx + 1,
                                total,
                                false,
                                created_at,
                                updated_at,
                                custom_fields.clone(),
                            );
                            if let Some(totp_val) = fields.get("totp") {
                                pk_item.fields.insert("totp".to_string(), totp_val.clone());
                            }
                            extra_items.push(pk_item);
                        }
                    } else {
                        for (idx, fido2) in fido2_creds.iter().enumerate() {
                            extra_items.push(build_passkey_raw_item(
                                &title,
                                &username,
                                &url,
                                String::new(),
                                favorite,
                                source_folder.clone(),
                                folder_tags.clone(),
                                fido2,
                                idx + 1,
                                total,
                                true,
                                created_at,
                                updated_at,
                                custom_fields.clone(),
                            ));
                        }
                    }
                }
                "login".to_string()
            }
            Some(2) => "note".to_string(),
            Some(3) => {
                if let Some(card) = item.card {
                    username = card.cardholder_name.unwrap_or_default().trim().to_string();
                    password = clean_password(&card.number.unwrap_or_default());

                    let brand = card.brand.unwrap_or_default().trim().to_string();
                    if !brand.is_empty() {
                        fields.insert("brand".to_string(), brand);
                    }
                    let cvv = card.code.unwrap_or_default().trim().to_string();
                    if !cvv.is_empty() {
                        fields.insert("cvv".to_string(), cvv);
                    }
                    let expiry = format_card_expiry(card.exp_month.as_ref(), card.exp_year.as_ref());
                    if !expiry.is_empty() {
                        fields.insert("expiry".to_string(), expiry);
                    }
                }
                "card".to_string()
            }
            Some(4) => {
                if let Some(ident) = item.identity {
                    username = ident.email.unwrap_or_default().trim().to_string();
                    insert_opt_field(&mut fields, "identity_title", ident.title.as_deref());
                    insert_opt_field(&mut fields, "first_name", ident.first_name.as_deref());
                    insert_opt_field(&mut fields, "middle_name", ident.middle_name.as_deref());
                    insert_opt_field(&mut fields, "last_name", ident.last_name.as_deref());
                    insert_opt_field(&mut fields, "company", ident.company.as_deref());
                    let phone = json_val_to_string(ident.phone.as_ref());
                    insert_trimmed_field(&mut fields, "phone", &phone);
                    insert_opt_field(&mut fields, "identity_username", ident.username.as_deref());
                    insert_opt_field(&mut fields, "address1", ident.address1.as_deref());
                    insert_opt_field(&mut fields, "address2", ident.address2.as_deref());
                    insert_opt_field(&mut fields, "address3", ident.address3.as_deref());
                    insert_opt_field(&mut fields, "city", ident.city.as_deref());
                    insert_opt_field(&mut fields, "state", ident.state.as_deref());
                    let postal_code = json_val_to_string(ident.postal_code.as_ref());
                    insert_trimmed_field(&mut fields, "postal_code", &postal_code);
                    insert_opt_field(&mut fields, "country", ident.country.as_deref());
                    let ssn = json_val_to_string(ident.ssn.as_ref());
                    insert_trimmed_field(&mut fields, "ssn", &ssn);
                    let passport = json_val_to_string(ident.passport_number.as_ref());
                    insert_trimmed_field(&mut fields, "passport_number", &passport);
                    let license = json_val_to_string(ident.license_number.as_ref());
                    insert_trimmed_field(&mut fields, "license_number", &license);
                }
                "identity".to_string()
            }
            Some(5) => {
                if let Some(ssh) = item.ssh_key {
                    let priv_key = ssh.private_key.unwrap_or_default().trim().to_string();
                    let pub_key = ssh.public_key.unwrap_or_default().trim().to_string();
                    let fp = ssh.key_fingerprint.unwrap_or_default().trim().to_string();

                    if !priv_key.is_empty() {
                        fields.insert("private_key".to_string(), priv_key);
                    }
                    if !pub_key.is_empty() {
                        fields.insert("public_key".to_string(), pub_key);
                        if !fp.is_empty() {
                            append_note_section(
                                &mut notes,
                                None,
                                &format!("Fingerprint SSH: {fp}"),
                            );
                        }
                    } else if !fp.is_empty() {
                        fields.insert("public_key".to_string(), fp);
                    }
                }
                "ssh".to_string()
            }
            _ => {
                if !notes.is_empty() || !custom_field_lines.is_empty() {
                    warning = Some(
                        "Tipo Bitwarden non riconosciuto, importato come Nota Sicura".to_string(),
                    );
                    "note".to_string()
                } else {
                    pre_skip_reason = Some("Tipo Bitwarden non supportato o vuoto".to_string());
                    "note".to_string()
                }
            }
        };

        if !skip_primary {
            if !custom_field_lines.is_empty() {
                append_note_section(
                    &mut notes,
                    Some("Campi personalizzati:"),
                    &custom_field_lines.join("\n"),
                );
            }

            parsed_items.push(RawImportItem {
                title,
                username,
                password,
                url,
                category,
                notes,
                fields,
                custom_fields,
                favorite,
                source_folder,
                folder_tags,
                extra_tags,
                created_at,
                updated_at,
                warning,
                pre_skip_reason,
            });
        }

        parsed_items.extend(extra_items);
    }

    Ok(parsed_items)
}

fn insert_trimmed_field(fields: &mut BTreeMap<String, String>, key: &str, value: &str) {
    let trimmed = value.trim();
    if !trimmed.is_empty() {
        fields.insert(key.to_string(), trimmed.to_string());
    }
}

fn insert_opt_field(fields: &mut BTreeMap<String, String>, key: &str, value: Option<&str>) {
    if let Some(v) = value {
        insert_trimmed_field(fields, key, v);
    }
}

fn normalize_bool_value(val: Option<&Value>) -> Option<&'static str> {
    match val {
        Some(Value::Bool(b)) => Some(if *b { "true" } else { "false" }),
        Some(Value::Number(n)) => match n.as_u64() {
            Some(1) => Some("true"),
            Some(0) => Some("false"),
            _ => None,
        },
        Some(Value::String(s)) => match s.trim().to_lowercase().as_str() {
            "1" | "true" | "yes" | "y" | "si" | "sì" => Some("true"),
            "0" | "false" | "no" | "n" => Some("false"),
            _ => None,
        },
        _ => None,
    }
}

fn is_non_empty_fido2(f: &BitwardenFido2Credential) -> bool {
    [
        f.credential_id.as_deref(),
        f.key_value.as_deref(),
        f.rp_id.as_deref(),
        f.rp_name.as_deref(),
        f.user_name.as_deref(),
        f.user_handle.as_deref(),
    ]
    .into_iter()
    .flatten()
    .any(|s| !s.trim().is_empty())
}

fn url_from_rp_id(rp_id: &str) -> String {
    let trimmed = rp_id.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let lower = trimmed.to_ascii_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        trimmed.to_string()
    } else if trimmed.contains('.') {
        format!("https://{trimmed}")
    } else {
        String::new()
    }
}

#[allow(clippy::too_many_arguments)]
fn build_passkey_raw_item(
    parent_title: &str,
    fallback_username: &str,
    fallback_url: &str,
    notes: String,
    favorite: bool,
    source_folder: Option<String>,
    folder_tags: Vec<String>,
    fido2: &BitwardenFido2Credential,
    idx: usize,
    total: usize,
    is_companion: bool,
    parent_created_at: Option<DateTime<Utc>>,
    parent_updated_at: Option<DateTime<Utc>>,
    custom_fields: Vec<CustomField>,
) -> RawImportItem {
    let rp_id = fido2.rp_id.as_deref().unwrap_or("").trim().to_string();
    let rp_name = fido2.rp_name.as_deref().unwrap_or("").trim().to_string();
    let fido2_user_name = fido2.user_name.as_deref().unwrap_or("").trim().to_string();
    let user_display_name = fido2
        .user_display_name
        .as_deref()
        .unwrap_or("")
        .trim()
        .to_string();

    let username = if !fido2_user_name.is_empty() {
        fido2_user_name
    } else if !fallback_username.trim().is_empty() {
        fallback_username.trim().to_string()
    } else {
        user_display_name.clone()
    };

    let url = if !fallback_url.trim().is_empty() {
        fallback_url.trim().to_string()
    } else {
        url_from_rp_id(&rp_id)
    };
    let rp_id = if !rp_id.is_empty() {
        rp_id
    } else {
        host_from_url(&url).unwrap_or_default()
    };

    let base_title = if !parent_title.trim().is_empty() {
        parent_title.trim().to_string()
    } else if !rp_name.is_empty() {
        rp_name.clone()
    } else if !rp_id.is_empty() {
        rp_id.clone()
    } else {
        String::new()
    };

    let title = if base_title.is_empty() {
        if total > 1 {
            format!("Passkey #{idx}")
        } else {
            String::new()
        }
    } else if is_companion {
        if total > 1 {
            format!("{base_title} (Passkey #{idx})")
        } else if base_title.to_lowercase().contains("passkey") {
            base_title
        } else {
            format!("{base_title} (Passkey)")
        }
    } else if total > 1 {
        format!("{base_title} (Passkey #{idx})")
    } else {
        base_title
    };

    let mut fields = BTreeMap::new();
    insert_opt_field(&mut fields, "credential_id", fido2.credential_id.as_deref());
    insert_trimmed_field(&mut fields, "rp_id", &rp_id);
    insert_trimmed_field(&mut fields, "rp_name", &rp_name);
    insert_trimmed_field(&mut fields, "user_display_name", &user_display_name);
    insert_opt_field(&mut fields, "user_handle", fido2.user_handle.as_deref());
    insert_opt_field(&mut fields, "key_type", fido2.key_type.as_deref());
    insert_opt_field(&mut fields, "key_algorithm", fido2.key_algorithm.as_deref());
    insert_opt_field(&mut fields, "key_curve", fido2.key_curve.as_deref());
    insert_opt_field(&mut fields, "private_key", fido2.key_value.as_deref());
    let counter = json_val_to_string(fido2.counter.as_ref());
    insert_trimmed_field(&mut fields, "counter", &counter);
    if let Some(disc) = normalize_bool_value(fido2.discoverable.as_ref()) {
        fields.insert("discoverable".to_string(), disc.to_string());
    }
    insert_opt_field(&mut fields, "creation_date", fido2.creation_date.as_deref());

    let created_at = fido2
        .creation_date
        .as_deref()
        .and_then(parse_import_timestamp)
        .or(parent_created_at);
    let updated_at = parent_updated_at;

    RawImportItem {
        title,
        username,
        password: String::new(),
        url,
        category: "passkey".to_string(),
        notes,
        fields,
        custom_fields,
        favorite,
        source_folder,
        folder_tags,
        extra_tags: Vec::new(),
        created_at,
        updated_at,
        warning: None,
        pre_skip_reason: None,
    }
}

fn split_bitwarden_csv_uris(raw_uri: &str) -> Vec<String> {
    let mut result = Vec::new();
    for line in raw_uri.split(['\n', '\r']) {
        let trimmed_line = line.trim();
        if trimmed_line.is_empty() {
            continue;
        }
        // Bitwarden CSV sometimes joins multiple URIs with a comma before the next scheme
        let mut start = 0;
        let bytes = trimmed_line.as_bytes();
        let mut idx = 0;
        while idx < bytes.len() {
            if bytes[idx] == b',' {
                let rest = trimmed_line[idx + 1..].trim_start();
                let lower = rest.to_ascii_lowercase();
                if lower.starts_with("http://")
                    || lower.starts_with("https://")
                    || lower.starts_with("androidapp://")
                    || lower.starts_with("iosapp://")
                {
                    let seg = trimmed_line[start..idx].trim();
                    if !seg.is_empty() {
                        result.push(seg.to_string());
                    }
                    let offset = trimmed_line[idx + 1..].len() - rest.len();
                    start = idx + 1 + offset;
                    idx = start;
                    continue;
                }
            }
            idx += 1;
        }
        let tail = trimmed_line[start..].trim();
        if !tail.is_empty() {
            result.push(tail.to_string());
        }
    }
    result
}

fn extract_csv_fido2_credentials(row: CsvRow<'_>) -> Vec<BitwardenFido2Credential> {
    let json_raw = row.get_any_trimmed(&["fido2_credentials", "fido2credentials", "passkeys"]);
    if !json_raw.is_empty() {
        let parsed: Vec<BitwardenFido2Credential> = if json_raw.starts_with('[') {
            serde_json::from_str(json_raw).unwrap_or_default()
        } else if json_raw.starts_with('{') {
            serde_json::from_str::<BitwardenFido2Credential>(json_raw)
                .map(|c| vec![c])
                .unwrap_or_default()
        } else {
            Vec::new()
        };
        let filtered: Vec<BitwardenFido2Credential> =
            parsed.into_iter().filter(is_non_empty_fido2).collect();
        if !filtered.is_empty() {
            return filtered;
        }
    }

    let opt_str = |aliases: &[&str]| -> Option<String> {
        let val = row.get_any_trimmed(aliases);
        if val.is_empty() {
            None
        } else {
            Some(val.to_string())
        }
    };

    let candidate = BitwardenFido2Credential {
        credential_id: opt_str(&["fido2_credential_id", "passkey_credential_id", "credential_id"]),
        key_type: opt_str(&["fido2_key_type", "passkey_key_type", "key_type"]),
        key_algorithm: opt_str(&["fido2_key_algorithm", "passkey_key_algorithm", "key_algorithm"]),
        key_curve: opt_str(&["fido2_key_curve", "passkey_key_curve", "key_curve"]),
        key_value: opt_str(&[
            "fido2_key_value",
            "passkey_key_value",
            "key_value",
            "private_key",
        ]),
        rp_id: opt_str(&["fido2_rp_id", "passkey_rp_id", "rp_id"]),
        rp_name: opt_str(&["fido2_rp_name", "passkey_rp_name", "rp_name"]),
        user_handle: opt_str(&["fido2_user_handle", "passkey_user_handle", "user_handle"]),
        user_name: opt_str(&["fido2_user_name", "passkey_user_name"]),
        user_display_name: opt_str(&[
            "fido2_user_display_name",
            "passkey_user_display_name",
            "user_display_name",
        ]),
        counter: opt_str(&["fido2_counter", "passkey_counter", "counter"]).map(Value::String),
        discoverable: opt_str(&["fido2_discoverable", "passkey_discoverable", "discoverable"])
            .map(Value::String),
        creation_date: opt_str(&["fido2_creation_date", "passkey_creation_date", "creation_date"]),
    };

    if is_non_empty_fido2(&candidate) {
        vec![candidate]
    } else {
        Vec::new()
    }
}

fn parse_bitwarden_csv(content: &str) -> AppResult<Vec<RawImportItem>> {
    let table = CsvTable::parse(content)?;

    let has_bw_specific = table.has_any_header(&[
        "login_username",
        "login_password",
        "login_uri",
        "login_totp",
        "reprompt",
        "identity_first_name",
        "identity_email",
        "fido2_credential_id",
        "passkey_credential_id",
        "fido2_credentials",
    ]);
    if !has_bw_specific {
        if let Some(hint) = detect_provider_hint_from_headers(&table.headers, "bitwarden") {
            return Err(AppError::BadRequest(hint));
        }
        if !table.has_any_header(&["name", "notes"]) {
            return Err(AppError::BadRequest(
                "Intestazione CSV non riconosciuta come export Bitwarden. Verifica di aver esportato in formato Bitwarden CSV (con colonne 'name', 'login_username', 'login_password', 'login_uri').".to_string(),
            ));
        }
    }

    let mut items = Vec::with_capacity(table.rows.len());

    for row in table.iter_rows() {
        let folder = row.get_trimmed("folder");
        let collections = row.get_trimmed("collections");

        let mut source_folder: Option<String> = None;
        let mut folder_tags: Vec<String> = Vec::new();

        if !folder.is_empty() {
            source_folder = Some(folder.to_string());
            folder_tags.push(folder.to_string());
        }
        if !collections.is_empty() {
            for col in collections.split(',').map(str::trim).filter(|s| !s.is_empty()) {
                if source_folder.is_none() {
                    source_folder = Some(col.to_string());
                }
                if !folder_tags.iter().any(|t| t.eq_ignore_ascii_case(col)) {
                    folder_tags.push(col.to_string());
                }
            }
        }

        let favorite = parse_bool_flag(row.get_trimmed("favorite"));
        let item_type = row.get_trimmed("type").to_lowercase();
        let title = row.get_trimmed("name").to_string();
        let mut notes = row.get_trimmed("notes").to_string();
        let custom_fields = row.get_trimmed("fields");
        let totp = row.get_trimmed("login_totp");

        let uris = split_bitwarden_csv_uris(row.get("login_uri"));
        let url = uris.first().cloned().unwrap_or_default();
        if uris.len() > 1 {
            let extra_urls = uris[1..]
                .iter()
                .map(|u| format!("- {u}"))
                .collect::<Vec<_>>()
                .join("\n");
            append_note_section(&mut notes, Some("Altri URL:"), &extra_urls);
        }

        let mut base_fields = BTreeMap::new();
        apply_imported_totp(totp, &mut base_fields, &mut notes);

        if !custom_fields.is_empty() {
            append_note_section(&mut notes, Some("Campi personalizzati:"), custom_fields);
        }

        let login_username = row.get_trimmed("login_username");
        let password = clean_password(row.get("login_password"));
        let created_at = ["creation_date", "created_at", "created"]
            .iter()
            .find_map(|alias| parse_import_timestamp(row.get_trimmed(alias)));
        let updated_at = ["revision_date", "updated_at", "modified"]
            .iter()
            .find_map(|alias| parse_import_timestamp(row.get_trimmed(alias)));

        if matches!(item_type.as_str(), "identity" | "identità" | "identita") {
            let mut fields = base_fields;
            insert_trimmed_field(
                &mut fields,
                "identity_title",
                row.get_any_trimmed(&["identity_title"]),
            );
            insert_trimmed_field(
                &mut fields,
                "first_name",
                row.get_any_trimmed(&["identity_first_name", "first_name", "firstname"]),
            );
            insert_trimmed_field(
                &mut fields,
                "middle_name",
                row.get_any_trimmed(&["identity_middle_name", "middle_name", "middlename"]),
            );
            insert_trimmed_field(
                &mut fields,
                "last_name",
                row.get_any_trimmed(&["identity_last_name", "last_name", "lastname"]),
            );
            insert_trimmed_field(
                &mut fields,
                "company",
                row.get_any_trimmed(&["identity_company", "company"]),
            );
            let email = row.get_any_trimmed(&["identity_email", "email"]);
            insert_trimmed_field(
                &mut fields,
                "phone",
                row.get_any_trimmed(&["identity_phone", "phone"]),
            );
            let ident_user = row.get_any_trimmed(&["identity_username"]);
            insert_trimmed_field(&mut fields, "identity_username", ident_user);
            insert_trimmed_field(
                &mut fields,
                "address1",
                row.get_any_trimmed(&["identity_address1", "address1"]),
            );
            insert_trimmed_field(
                &mut fields,
                "address2",
                row.get_any_trimmed(&["identity_address2", "address2"]),
            );
            insert_trimmed_field(
                &mut fields,
                "address3",
                row.get_any_trimmed(&["identity_address3", "address3"]),
            );
            insert_trimmed_field(
                &mut fields,
                "city",
                row.get_any_trimmed(&["identity_city", "city"]),
            );
            insert_trimmed_field(
                &mut fields,
                "state",
                row.get_any_trimmed(&["identity_state", "state"]),
            );
            insert_trimmed_field(
                &mut fields,
                "postal_code",
                row.get_any_trimmed(&["identity_postal_code", "postal_code", "postalcode"]),
            );
            insert_trimmed_field(
                &mut fields,
                "country",
                row.get_any_trimmed(&["identity_country", "country"]),
            );
            insert_trimmed_field(
                &mut fields,
                "ssn",
                row.get_any_trimmed(&["identity_ssn", "ssn"]),
            );
            insert_trimmed_field(
                &mut fields,
                "passport_number",
                row.get_any_trimmed(&[
                    "identity_passport_number",
                    "passport_number",
                    "passportnumber",
                ]),
            );
            insert_trimmed_field(
                &mut fields,
                "license_number",
                row.get_any_trimmed(&[
                    "identity_license_number",
                    "license_number",
                    "licensenumber",
                ]),
            );

            let mut username = email.to_string();
            if username.is_empty() && !login_username.is_empty() {
                if login_username.contains('@') {
                    username = login_username.to_string();
                } else if ident_user.is_empty() {
                    insert_trimmed_field(&mut fields, "identity_username", login_username);
                }
            } else if !login_username.is_empty()
                && ident_user.is_empty()
                && !login_username.eq_ignore_ascii_case(&username)
            {
                insert_trimmed_field(&mut fields, "identity_username", login_username);
            }

            items.push(RawImportItem {
                title,
                username,
                password: String::new(),
                url,
                category: "identity".to_string(),
                notes,
                fields,
                custom_fields: Vec::new(),
                favorite,
                source_folder,
                folder_tags,
                extra_tags: Vec::new(),
                created_at,
                updated_at,
                warning: None,
                pre_skip_reason: None,
            });
            continue;
        }

        let fido2_creds = extract_csv_fido2_credentials(row);

        if matches!(
            item_type.as_str(),
            "passkey" | "fido2" | "fido2_credential" | "webauthn"
        ) {
            if fido2_creds.is_empty() {
                let mut fields = base_fields;
                if let Some(host) = host_from_url(&url) {
                    fields.insert("rp_id".to_string(), host);
                }
                items.push(RawImportItem {
                    title,
                    username: login_username.to_string(),
                    password: String::new(),
                    url,
                    category: "passkey".to_string(),
                    notes,
                    fields,
                    custom_fields: Vec::new(),
                    favorite,
                    source_folder,
                    folder_tags,
                    extra_tags: Vec::new(),
                    created_at,
                    updated_at,
                    warning: None,
                    pre_skip_reason: None,
                });
            } else {
                let total = fido2_creds.len();
                for (idx, fido2) in fido2_creds.iter().enumerate() {
                    let mut pk_item = build_passkey_raw_item(
                        &title,
                        login_username,
                        &url,
                        notes.clone(),
                        favorite,
                        source_folder.clone(),
                        folder_tags.clone(),
                        fido2,
                        idx + 1,
                        total,
                        false,
                        created_at,
                        updated_at,
                        Vec::new(),
                    );
                    if let Some(totp_val) = base_fields.get("totp") {
                        pk_item.fields.insert("totp".to_string(), totp_val.clone());
                    }
                    items.push(pk_item);
                }
            }
            continue;
        }

        if (item_type.is_empty() || item_type == "login") && !fido2_creds.is_empty() {
            let total = fido2_creds.len();
            if password.is_empty() {
                for (idx, fido2) in fido2_creds.iter().enumerate() {
                    let mut pk_item = build_passkey_raw_item(
                        &title,
                        login_username,
                        &url,
                        notes.clone(),
                        favorite,
                        source_folder.clone(),
                        folder_tags.clone(),
                        fido2,
                        idx + 1,
                        total,
                        false,
                        created_at,
                        updated_at,
                        Vec::new(),
                    );
                    if let Some(totp_val) = base_fields.get("totp") {
                        pk_item.fields.insert("totp".to_string(), totp_val.clone());
                    }
                    items.push(pk_item);
                }
            } else {
                items.push(RawImportItem {
                    title: title.clone(),
                    username: login_username.to_string(),
                    password,
                    url: url.clone(),
                    category: "login".to_string(),
                    notes,
                    fields: base_fields,
                    custom_fields: Vec::new(),
                    favorite,
                    source_folder: source_folder.clone(),
                    folder_tags: folder_tags.clone(),
                    extra_tags: Vec::new(),
                    created_at,
                    updated_at,
                    warning: None,
                    pre_skip_reason: None,
                });
                for (idx, fido2) in fido2_creds.iter().enumerate() {
                    items.push(build_passkey_raw_item(
                        &title,
                        login_username,
                        &url,
                        String::new(),
                        favorite,
                        source_folder.clone(),
                        folder_tags.clone(),
                        fido2,
                        idx + 1,
                        total,
                        true,
                        created_at,
                        updated_at,
                        Vec::new(),
                    ));
                }
            }
            continue;
        }

        let category = match item_type.as_str() {
            "note" | "securenote" | "secure_note" => "note",
            "card" => "card",
            "ssh" | "sshkey" | "ssh_key" => "ssh",
            _ => "login",
        };

        items.push(RawImportItem {
            title,
            username: login_username.to_string(),
            password,
            url,
            category: category.to_string(),
            notes,
            fields: base_fields,
            custom_fields: Vec::new(),
            favorite,
            source_folder,
            folder_tags,
            extra_tags: Vec::new(),
            created_at,
            updated_at,
            warning: None,
            pre_skip_reason: None,
        });
    }

    Ok(items)
}
