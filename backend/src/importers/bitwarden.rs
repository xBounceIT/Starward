use std::collections::{BTreeMap, HashMap};

use serde::Deserialize;
use serde_json::Value;

use crate::{
    error::{AppError, AppResult},
    importers::{
        append_note_section, clean_password, csv_parser::CsvTable,
        detect_provider_hint_from_headers, parse_bool_flag, parse_import_timestamp, RawImportItem,
    },
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
}

#[derive(Debug, Deserialize)]
struct BitwardenLogin {
    #[serde(default)]
    uris: Option<Vec<BitwardenUri>>,
    #[serde(default)]
    username: Option<String>,
    #[serde(default)]
    password: Option<String>,
    #[serde(default)]
    totp: Option<String>,
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
    postal_code: Option<String>,
    #[serde(default)]
    country: Option<String>,
    #[serde(default)]
    company: Option<String>,
    #[serde(default)]
    email: Option<String>,
    #[serde(default)]
    phone: Option<String>,
    #[serde(default)]
    ssn: Option<String>,
    #[serde(default)]
    username: Option<String>,
    #[serde(default)]
    passport_number: Option<String>,
    #[serde(default)]
    license_number: Option<String>,
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
    let export: BitwardenExport = serde_json::from_str(content).map_err(|e| {
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

        if let Some(fid) = item.folder_id.as_deref() {
            if let Some(fname) = folders_map.get(fid) {
                source_folder = Some(fname.clone());
                folder_tags.push(fname.clone());
            }
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
        if let Some(custom_fields) = item.fields {
            for cf in custom_fields {
                let fname = cf.name.unwrap_or_default().trim().to_string();
                let fval = json_val_to_string(cf.value.as_ref());
                if fval.is_empty() && fname.is_empty() {
                    continue;
                }
                if fname.is_empty() {
                    custom_field_lines.push(fval);
                } else if !fval.is_empty() {
                    custom_field_lines.push(format!("{fname}: {fval}"));
                }
            }
        }

        let mut username = String::new();
        let mut password = String::new();
        let mut url = String::new();
        let mut fields = BTreeMap::new();
        let mut extra_tags = Vec::new();
        let mut warning = None;
        let mut pre_skip_reason = None;

        let category = match item.item_type {
            Some(1) => {
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
                        let clean_totp = totp.trim();
                        if !clean_totp.is_empty() {
                            append_note_section(&mut notes, None, &format!("TOTP: {clean_totp}"));
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
                    let mut lines = Vec::new();
                    let full_name = [
                        ident.title,
                        ident.first_name,
                        ident.middle_name,
                        ident.last_name,
                    ]
                    .into_iter()
                    .flatten()
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect::<Vec<_>>()
                    .join(" ");

                    if !full_name.is_empty() {
                        lines.push(format!("Nome completo: {full_name}"));
                    }
                    push_identity_line(&mut lines, "Azienda", ident.company);
                    push_identity_line(&mut lines, "Email", ident.email);
                    push_identity_line(&mut lines, "Telefono", ident.phone);
                    push_identity_line(&mut lines, "Username", ident.username);
                    let addr = [
                        ident.address1,
                        ident.address2,
                        ident.address3,
                        ident.city,
                        ident.state,
                        ident.postal_code,
                        ident.country,
                    ]
                    .into_iter()
                    .flatten()
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect::<Vec<_>>()
                    .join(", ");
                    if !addr.is_empty() {
                        lines.push(format!("Indirizzo: {addr}"));
                    }
                    push_identity_line(&mut lines, "Codice Fiscale / SSN", ident.ssn);
                    push_identity_line(&mut lines, "Passaporto", ident.passport_number);
                    push_identity_line(&mut lines, "Patente / Licenza", ident.license_number);

                    if !lines.is_empty() {
                        append_note_section(&mut notes, Some("Dati identità:"), &lines.join("\n"));
                    }
                }
                extra_tags.push("identity".to_string());
                warning = Some("Identità Bitwarden importata come Nota Sicura".to_string());
                "note".to_string()
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

    Ok(parsed_items)
}

fn push_identity_line(lines: &mut Vec<String>, label: &str, value: Option<String>) {
    if let Some(v) = value {
        let trimmed = v.trim();
        if !trimmed.is_empty() {
            lines.push(format!("{label}: {trimmed}"));
        }
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

fn parse_bitwarden_csv(content: &str) -> AppResult<Vec<RawImportItem>> {
    let table = CsvTable::parse(content)?;

    let has_bw_specific = table.has_any_header(&[
        "login_username",
        "login_password",
        "login_uri",
        "login_totp",
        "reprompt",
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

        if !totp.is_empty() {
            append_note_section(&mut notes, None, &format!("TOTP: {totp}"));
        }

        if !custom_fields.is_empty() {
            append_note_section(&mut notes, Some("Campi personalizzati:"), custom_fields);
        }

        let category = match item_type.as_str() {
            "note" | "securenote" | "secure_note" => "note",
            "card" => "card",
            "ssh" | "sshkey" | "ssh_key" => "ssh",
            "identity" => "note",
            _ => "login",
        };

        let warning = if item_type == "identity" {
            Some("Identità Bitwarden importata come Nota Sicura".to_string())
        } else {
            None
        };

        let mut extra_tags = Vec::new();
        if item_type == "identity" {
            extra_tags.push("identity".to_string());
        }

        let created_at = ["creation_date", "created_at", "created"]
            .iter()
            .find_map(|alias| parse_import_timestamp(row.get_trimmed(alias)));
        let updated_at = ["revision_date", "updated_at", "modified"]
            .iter()
            .find_map(|alias| parse_import_timestamp(row.get_trimmed(alias)));

        items.push(RawImportItem {
            title,
            username: row.get_trimmed("login_username").to_string(),
            password: clean_password(row.get("login_password")),
            url,
            category: category.to_string(),
            notes,
            fields: BTreeMap::new(),
            favorite,
            source_folder,
            folder_tags,
            extra_tags,
            created_at,
            updated_at,
            warning,
            pre_skip_reason: None,
        });
    }

    Ok(items)
}
