use std::collections::BTreeMap;

use chrono::{DateTime, Utc};
use serde_json::Value;

use crate::{
    error::{AppError, AppResult},
    importers::{
        append_note_section, apply_imported_totp, clean_password,
        csv_parser::{CsvRow, CsvTable},
        detect_provider_hint_from_headers, host_from_url, json_scalar_raw,
        json_scalar_str, parse_bool_flag, parse_import_timestamp, RawImportItem,
    },
    models::{CustomField, CustomFieldType},
};

fn parse_csv_checking_json(content: &str, provider_label: &str) -> AppResult<CsvTable> {
    let stripped = content.strip_prefix('\u{feff}').unwrap_or(content);
    let trimmed = stripped.trim_start();
    if trimmed.is_empty() {
        return Err(AppError::BadRequest("Il file da importare è vuoto.".to_string()));
    }
    if trimmed.starts_with('{') {
        return Err(AppError::BadRequest(format!(
            "Il file è in formato JSON, mentre {provider_label} supporta solo l'importazione da file CSV. Se stai importando un export di Bitwarden, seleziona 'Bitwarden'."
        )));
    }
    CsvTable::parse(stripped)
}

fn ensure_headers_or_hint(
    table: &CsvTable,
    required_any: &[&str],
    current_provider_id: &str,
    expected_hint: &str,
) -> AppResult<()> {
    if table.has_any_header(required_any) {
        return Ok(());
    }
    if let Some(hint) = detect_provider_hint_from_headers(&table.headers, current_provider_id) {
        return Err(AppError::BadRequest(hint));
    }
    Err(AppError::BadRequest(expected_hint.to_string()))
}

fn split_tags(raw: &str) -> Vec<String> {
    raw.split([',', ';'])
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

fn extract_csv_created_at(row: CsvRow<'_>) -> Option<DateTime<Utc>> {
    [
        "timecreated",
        "createtime",
        "create_time",
        "created_at",
        "creation_date",
        "creationdate",
        "creation time",
        "creation date",
        "created",
        "creata",
        "data creazione",
    ]
    .iter()
    .find_map(|alias| parse_import_timestamp(row.get_trimmed(alias)))
}

fn extract_csv_updated_at(row: CsvRow<'_>) -> Option<DateTime<Utc>> {
    [
        "timepasswordchanged",
        "modifytime",
        "modify_time",
        "updated_at",
        "revision_date",
        "revisiondate",
        "last modified",
        "last_modified",
        "last modification time",
        "modified",
        "updated",
        "ultima modifica",
        "data modifica",
        "timelastused",
    ]
    .iter()
    .find_map(|alias| parse_import_timestamp(row.get_trimmed(alias)))
}

fn normalize_bool_str(raw: &str) -> Option<&'static str> {
    match raw.trim().to_lowercase().as_str() {
        "1" | "true" | "yes" | "y" | "si" | "sì" => Some("true"),
        "0" | "false" | "no" | "n" => Some("false"),
        _ => None,
    }
}

pub(super) fn parse_1password(content: &str) -> AppResult<Vec<RawImportItem>> {
    let table = parse_csv_checking_json(content, "1Password")?;
    ensure_headers_or_hint(
        &table,
        &["title", "username", "password", "url", "website", "otpauth", "one-time password"],
        "1password",
        "Intestazione CSV non riconosciuta per 1Password. Verifica di aver esportato un file CSV da 1Password.",
    )?;

    let mut items = Vec::with_capacity(table.rows.len());
    for row in table.iter_rows() {
        let title = row.get_any_trimmed(&["title", "name"]).to_string();
        let url = row.get_any_trimmed(&["url", "website", "urls"]).to_string();
        let username = row.get_any_trimmed(&["username", "user"]).to_string();
        let password = clean_password(row.get("password"));
        let totp = row.get_any_trimmed(&["otpauth", "one-time password", "totp"]);
        let favorite = parse_bool_flag(row.get_any_trimmed(&["favorite", "fav"]));
        let extra_tags = split_tags(row.get_any_trimmed(&["tags", "tag"]));
        let mut notes = row.get_any_trimmed(&["notes", "note"]).to_string();
        let mut fields = BTreeMap::new();

        apply_imported_totp(totp, &mut fields, &mut notes);

        let raw_type = row.get_any_trimmed(&["type", "category"]).to_lowercase();
        let category = match raw_type.as_str() {
            "secure note" | "secure_note" | "note" | "nota" => "note",
            "credit card" | "credit_card" | "card" | "carta" => "card",
            "database" => "database",
            "ssh key" | "ssh_key" | "ssh" => "ssh",
            "api credential" | "api_credential" | "api key" | "api_key" => "api_key",
            "oauth2_client" | "oauth2 client" | "client oauth2" | "client_oauth2" | "oauth2"
            | "oauth client" | "oauth_client" => "oauth2_client",
            "software license" | "software_license" | "license" | "licenza" => "license",
            "identity" | "identità" | "identita" => "identity",
            "passkey" | "fido2" | "webauthn" => "passkey",
            _ => "login",
        };

        if category == "passkey"
            && let Some(host) = host_from_url(&url) {
                fields.insert("rp_id".to_string(), host);
            }

        items.push(RawImportItem {
            title,
            username,
            password,
            url,
            category: category.to_string(),
            notes,
            fields,
            custom_fields: Vec::new(),
            favorite,
            source_folder: None,
            folder_tags: Vec::new(),
            extra_tags,
            created_at: extract_csv_created_at(row),
            updated_at: extract_csv_updated_at(row),
            warning: None,
            pre_skip_reason: None,
        });
    }

    Ok(items)
}

pub(super) fn parse_lastpass(content: &str) -> AppResult<Vec<RawImportItem>> {
    let table = parse_csv_checking_json(content, "LastPass")?;

    if !table.has_any_header(&["grouping", "extra", "fav"])
        && let Some(hint) = detect_provider_hint_from_headers(&table.headers, "lastpass") {
            return Err(AppError::BadRequest(hint));
        }

    ensure_headers_or_hint(
        &table,
        &["url", "username", "password", "extra", "name", "grouping"],
        "lastpass",
        "Intestazione CSV non riconosciuta per LastPass (attese colonne come url, username, password, extra, name, grouping).",
    )?;

    let mut items = Vec::with_capacity(table.rows.len());
    for row in table.iter_rows() {
        let mut url = row.get_trimmed("url").to_string();
        let mut username = row.get_trimmed("username").to_string();
        let mut password = clean_password(row.get("password"));
        let totp = row.get_trimmed("totp");
        let extra = row.get_trimmed("extra");
        let title = row.get_any_trimmed(&["name", "title"]).to_string();
        let grouping = row.get_trimmed("grouping");
        let favorite = parse_bool_flag(row.get_trimmed("fav"));

        let source_folder = if grouping.is_empty() {
            None
        } else {
            Some(grouping.to_string())
        };
        let folder_tags = source_folder.iter().cloned().collect();

        let mut category = "login".to_string();
        let mut notes = String::new();
        let mut fields = BTreeMap::new();

        if url.eq_ignore_ascii_case("http://sn") {
            url.clear();
            let kv = parse_lastpass_extra(extra);
            let note_type = kv
                .get("notetype")
                .map(|s| s.trim().to_lowercase())
                .unwrap_or_default();

            if note_type == "payment card" || note_type == "credit card" {
                category = "card".to_string();
                if let Some(holder) = kv.get("name on card").filter(|s| !s.is_empty()) {
                    username = holder.clone();
                }
                if let Some(num) = kv.get("number").filter(|s| !s.is_empty()) {
                    password = clean_password(num);
                }
                if let Some(cvv) = kv.get("security code").filter(|s| !s.is_empty()) {
                    fields.insert("cvv".to_string(), cvv.clone());
                }
                if let Some(brand) = kv.get("type").filter(|s| !s.is_empty()) {
                    fields.insert("brand".to_string(), brand.clone());
                }
                let exp_month = kv
                    .get("expiration month")
                    .map(String::as_str)
                    .unwrap_or("")
                    .trim();
                let exp_year = kv
                    .get("expiration year")
                    .map(String::as_str)
                    .unwrap_or("")
                    .trim();
                if !exp_month.is_empty() || !exp_year.is_empty() {
                    let y = if exp_year.len() == 4 {
                        &exp_year[2..]
                    } else {
                        exp_year
                    };
                    let expiry = match (exp_month.is_empty(), y.is_empty()) {
                        (false, false) => format!("{exp_month}/{y}"),
                        (false, true) => exp_month.to_string(),
                        (true, false) => y.to_string(),
                        (true, true) => String::new(),
                    };
                    if !expiry.is_empty() {
                        fields.insert("expiry".to_string(), expiry);
                    }
                }
                if let Some(n) = kv.get("notes").filter(|s| !s.is_empty()) {
                    notes = n.clone();
                }
            } else if note_type == "ssh key" {
                category = "ssh".to_string();
                if let Some(pk) = kv.get("private key").filter(|s| !s.is_empty()) {
                    fields.insert("private_key".to_string(), pk.clone());
                }
                if let Some(pubk) = kv.get("public key").filter(|s| !s.is_empty()) {
                    fields.insert("public_key".to_string(), pubk.clone());
                }
                if let Some(host) = kv.get("hostname").filter(|s| !s.is_empty()) {
                    url = host.clone();
                }
                if let Some(u) = kv.get("username").filter(|s| !s.is_empty()) {
                    username = u.clone();
                }
                if let Some(pass) = kv.get("passphrase").filter(|s| !s.is_empty()) {
                    password = clean_password(pass);
                }
                if let Some(n) = kv.get("notes").filter(|s| !s.is_empty()) {
                    notes = n.clone();
                }
            } else if note_type == "database" {
                category = "database".to_string();
                if let Some(db_t) = kv.get("type").filter(|s| !s.is_empty()) {
                    fields.insert("db_type".to_string(), normalize_db_type(db_t));
                }
                if let Some(host) = kv.get("hostname").filter(|s| !s.is_empty()) {
                    url = host.clone();
                }
                if let Some(port) = kv.get("port").filter(|s| !s.is_empty()) {
                    fields.insert("port".to_string(), port.clone());
                }
                if let Some(dbname) = kv.get("database").filter(|s| !s.is_empty()) {
                    fields.insert("database_name".to_string(), dbname.clone());
                }
                if let Some(u) = kv.get("username").filter(|s| !s.is_empty()) {
                    username = u.clone();
                }
                if let Some(pass) = kv.get("password").filter(|s| !s.is_empty()) {
                    password = clean_password(pass);
                }
                if let Some(n) = kv.get("notes").filter(|s| !s.is_empty()) {
                    notes = n.clone();
                }
            } else if note_type == "address" || note_type == "identity" {
                category = "identity".to_string();
                if let Some(t) = kv.get("title").filter(|s| !s.is_empty()) {
                    fields.insert("identity_title".to_string(), t.clone());
                }
                if let Some(fn_) = kv.get("first name").filter(|s| !s.is_empty()) {
                    fields.insert("first_name".to_string(), fn_.clone());
                }
                if let Some(mn) = kv.get("middle name").filter(|s| !s.is_empty()) {
                    fields.insert("middle_name".to_string(), mn.clone());
                }
                if let Some(ln) = kv.get("last name").filter(|s| !s.is_empty()) {
                    fields.insert("last_name".to_string(), ln.clone());
                }
                if let Some(co) = kv.get("company").filter(|s| !s.is_empty()) {
                    fields.insert("company".to_string(), co.clone());
                }
                if let Some(em) = kv
                    .get("email address")
                    .or_else(|| kv.get("email"))
                    .filter(|s| !s.is_empty())
                {
                    username = em.clone();
                }
                if let Some(ph) = kv
                    .get("phone")
                    .or_else(|| kv.get("mobile phone"))
                    .or_else(|| kv.get("evening phone"))
                    .filter(|s| !s.is_empty())
                {
                    fields.insert("phone".to_string(), ph.clone());
                }
                if let Some(u) = kv.get("username").filter(|s| !s.is_empty()) {
                    fields.insert("identity_username".to_string(), u.clone());
                }
                if let Some(a1) = kv.get("address 1").filter(|s| !s.is_empty()) {
                    fields.insert("address1".to_string(), a1.clone());
                }
                if let Some(a2) = kv.get("address 2").filter(|s| !s.is_empty()) {
                    fields.insert("address2".to_string(), a2.clone());
                }
                if let Some(a3) = kv.get("address 3").filter(|s| !s.is_empty()) {
                    fields.insert("address3".to_string(), a3.clone());
                }
                if let Some(city) = kv
                    .get("city / town")
                    .or_else(|| kv.get("city"))
                    .filter(|s| !s.is_empty())
                {
                    fields.insert("city".to_string(), city.clone());
                }
                if let Some(st) = kv.get("state").filter(|s| !s.is_empty()) {
                    fields.insert("state".to_string(), st.clone());
                }
                if let Some(zip) = kv
                    .get("zip / postal code")
                    .or_else(|| kv.get("postal code"))
                    .filter(|s| !s.is_empty())
                {
                    fields.insert("postal_code".to_string(), zip.clone());
                }
                if let Some(country) = kv.get("country").filter(|s| !s.is_empty()) {
                    fields.insert("country".to_string(), country.clone());
                }
                if let Some(ssn) = kv.get("social security number").filter(|s| !s.is_empty()) {
                    fields.insert("ssn".to_string(), ssn.clone());
                }
                if let Some(n) = kv.get("notes").filter(|s| !s.is_empty()) {
                    notes = n.clone();
                }
            } else if note_type == "passkey" {
                category = "passkey".to_string();
                if let Some(rp) = kv.get("rp id").filter(|s| !s.is_empty()) {
                    fields.insert("rp_id".to_string(), rp.clone());
                }
                if let Some(cid) = kv.get("credential id").filter(|s| !s.is_empty()) {
                    fields.insert("credential_id".to_string(), cid.clone());
                }
                if let Some(pk) = kv.get("private key").filter(|s| !s.is_empty()) {
                    fields.insert("private_key".to_string(), pk.clone());
                }
                if let Some(host) = kv.get("hostname").filter(|s| !s.is_empty()) {
                    url = host.clone();
                }
                if !fields.contains_key("rp_id")
                    && let Some(host) = host_from_url(&url) {
                        fields.insert("rp_id".to_string(), host);
                    }
                if let Some(u) = kv.get("username").filter(|s| !s.is_empty()) {
                    username = u.clone();
                }
                if let Some(n) = kv.get("notes").filter(|s| !s.is_empty()) {
                    notes = n.clone();
                }
            } else {
                category = "note".to_string();
                notes = extra.to_string();
            }
        } else if !extra.is_empty() {
            notes = extra.to_string();
        }

        apply_imported_totp(totp, &mut fields, &mut notes);

        items.push(RawImportItem {
            title,
            username,
            password,
            url,
            category,
            notes,
            fields,
            custom_fields: Vec::new(),
            favorite,
            source_folder,
            folder_tags,
            extra_tags: Vec::new(),
            created_at: extract_csv_created_at(row),
            updated_at: extract_csv_updated_at(row),
            warning: None,
            pre_skip_reason: None,
        });
    }

    Ok(items)
}

fn parse_lastpass_extra(extra: &str) -> BTreeMap<String, String> {
    let mut map = BTreeMap::new();
    let mut current_key: Option<String> = None;
    let mut current_val = String::new();

    for line in extra.lines() {
        if let Some((k, v)) = line.split_once(':') {
            let key_clean = k.trim().to_lowercase();
            // Treat as new key when key is reasonably short & alphabetic/spaces
            if !key_clean.is_empty()
                && key_clean.len() <= 32
                && !v.starts_with("//")
                && (!key_clean.contains('/') || key_clean.contains(" / "))
                && !key_clean.starts_with("-----")
            {
                if let Some(prev_key) = current_key.take() {
                    map.insert(prev_key, current_val.trim().to_string());
                }
                current_key = Some(key_clean);
                current_val = v.trim_start().to_string();
                continue;
            }
        }
        if current_key.is_some() {
            if !current_val.is_empty() {
                current_val.push('\n');
            }
            current_val.push_str(line);
        }
    }

    if let Some(last_key) = current_key {
        map.insert(last_key, current_val.trim().to_string());
    }
    map
}

fn normalize_db_type(raw: &str) -> String {
    let lower = raw.trim().to_lowercase();
    if lower.contains("postgres") {
        "postgresql".to_string()
    } else if lower.contains("mysql") || lower.contains("maria") {
        "mysql".to_string()
    } else if lower.contains("mongo") {
        "mongodb".to_string()
    } else if lower.contains("redis") {
        "redis".to_string()
    } else if lower.contains("mssql") || lower.contains("sql server") {
        "mssql".to_string()
    } else if lower.contains("oracle") {
        "oracle".to_string()
    } else if lower.contains("sqlite") {
        "sqlite".to_string()
    } else {
        "other".to_string()
    }
}

pub(super) fn parse_keepass(content: &str) -> AppResult<Vec<RawImportItem>> {
    let table = parse_csv_checking_json(content, "KeePass / KeePassXC")?;
    ensure_headers_or_hint(
        &table,
        &["title", "account", "login name", "username", "password", "web site", "url"],
        "keepass",
        "Intestazione CSV non riconosciuta per KeePass / KeePassXC (attese colonne come Group, Title, Username, Password, URL, Notes o Account, Login Name, Password, Web Site, Comments).",
    )?;

    let mut items = Vec::with_capacity(table.rows.len());
    for row in table.iter_rows() {
        let raw_group = row.get_any_trimmed(&["group", "gruppo"]);
        let cleaned_group = clean_keepass_group(raw_group);
        let source_folder = if cleaned_group.is_empty() {
            None
        } else {
            Some(cleaned_group.clone())
        };
        let folder_tags = source_folder.iter().cloned().collect();

        let title = row.get_any_trimmed(&["title", "account"]).to_string();
        let username = row
            .get_any_trimmed(&["username", "login name", "user name"])
            .to_string();
        let password = clean_password(row.get_any(&["password"]));
        let url = row.get_any_trimmed(&["url", "web site", "website"]).to_string();
        let mut notes = row.get_any_trimmed(&["notes", "comments", "note"]).to_string();
        let totp = row.get_any_trimmed(&["totp", "otp"]);
        let mut fields = BTreeMap::new();

        apply_imported_totp(totp, &mut fields, &mut notes);

        items.push(RawImportItem {
            title,
            username,
            password,
            url,
            category: "login".to_string(),
            notes,
            fields,
            custom_fields: Vec::new(),
            favorite: false,
            source_folder,
            folder_tags,
            extra_tags: Vec::new(),
            created_at: extract_csv_created_at(row),
            updated_at: extract_csv_updated_at(row),
            warning: None,
            pre_skip_reason: None,
        });
    }

    Ok(items)
}

fn clean_keepass_group(raw: &str) -> String {
    let mut trimmed = raw.trim().trim_matches('/').to_string();
    loop {
        let lower = trimmed.to_lowercase();
        if lower == "root" || lower == "database" {
            return String::new();
        }
        if lower.starts_with("root/") {
            trimmed = trimmed[5..].trim_start_matches('/').to_string();
        } else if lower.starts_with("database/") {
            trimmed = trimmed[9..].trim_start_matches('/').to_string();
        } else {
            break;
        }
    }
    trimmed
}

pub(super) fn parse_chrome(content: &str) -> AppResult<Vec<RawImportItem>> {
    let table = parse_csv_checking_json(content, "Chrome / Edge / Brave")?;
    ensure_headers_or_hint(
        &table,
        &["url", "username", "password"],
        "chrome",
        "Intestazione CSV non riconosciuta per Chrome / Edge / Brave (attese colonne name, url, username, password, note).",
    )?;

    let mut items = Vec::with_capacity(table.rows.len());
    for row in table.iter_rows() {
        let url = row.get_trimmed("url").to_string();
        let username = row.get_trimmed("username").to_string();
        let password = clean_password(row.get("password"));
        let notes = row.get_any_trimmed(&["note", "notes"]).to_string();

        let raw_name = row.get_any_trimmed(&["name", "title"]);
        let title = if !raw_name.is_empty() {
            raw_name.to_string()
        } else {
            host_from_url(&url).unwrap_or_else(|| username.clone())
        };

        items.push(RawImportItem {
            title,
            username,
            password,
            url,
            category: "login".to_string(),
            notes,
            fields: BTreeMap::new(),
            custom_fields: Vec::new(),
            favorite: false,
            source_folder: None,
            folder_tags: Vec::new(),
            extra_tags: Vec::new(),
            created_at: extract_csv_created_at(row),
            updated_at: extract_csv_updated_at(row),
            warning: None,
            pre_skip_reason: None,
        });
    }

    Ok(items)
}

pub(super) fn parse_firefox(content: &str) -> AppResult<Vec<RawImportItem>> {
    let table = parse_csv_checking_json(content, "Mozilla Firefox")?;
    ensure_headers_or_hint(
        &table,
        &["url", "password", "username"],
        "firefox",
        "Intestazione CSV non riconosciuta per Mozilla Firefox (attese colonne url, username, password).",
    )?;

    let mut items = Vec::with_capacity(table.rows.len());
    for row in table.iter_rows() {
        let url = row.get_trimmed("url").to_string();
        let username = row.get_trimmed("username").to_string();
        let password = clean_password(row.get("password"));
        let realm = row.get_trimmed("httprealm");

        let title = host_from_url(&url)
            .or_else(|| {
                if username.is_empty() {
                    None
                } else {
                    Some(username.clone())
                }
            })
            .unwrap_or_else(|| url.clone());

        let mut notes = String::new();
        if !realm.is_empty() {
            append_note_section(&mut notes, None, &format!("Realm: {realm}"));
        }

        items.push(RawImportItem {
            title,
            username,
            password,
            url,
            category: "login".to_string(),
            notes,
            fields: BTreeMap::new(),
            custom_fields: Vec::new(),
            favorite: false,
            source_folder: None,
            folder_tags: Vec::new(),
            extra_tags: Vec::new(),
            created_at: extract_csv_created_at(row),
            updated_at: extract_csv_updated_at(row),
            warning: None,
            pre_skip_reason: None,
        });
    }

    Ok(items)
}

pub(super) fn parse_safari(content: &str) -> AppResult<Vec<RawImportItem>> {
    let table = parse_csv_checking_json(content, "Safari / Password Apple")?;
    ensure_headers_or_hint(
        &table,
        &["title", "url", "username", "password"],
        "safari",
        "Intestazione CSV non riconosciuta per Safari / Password Apple (attese colonne Title, URL, Username, Password, Notes, OTPAuth).",
    )?;

    let mut items = Vec::with_capacity(table.rows.len());
    for row in table.iter_rows() {
        let title = row.get_any_trimmed(&["title", "name"]).to_string();
        let url = row.get_trimmed("url").to_string();
        let username = row.get_trimmed("username").to_string();
        let password = clean_password(row.get("password"));
        let mut notes = row.get_any_trimmed(&["notes", "note"]).to_string();
        let otpauth = row.get_any_trimmed(&["otpauth", "totp"]);
        let mut fields = BTreeMap::new();

        apply_imported_totp(otpauth, &mut fields, &mut notes);

        items.push(RawImportItem {
            title,
            username,
            password,
            url,
            category: "login".to_string(),
            notes,
            fields,
            custom_fields: Vec::new(),
            favorite: false,
            source_folder: None,
            folder_tags: Vec::new(),
            extra_tags: Vec::new(),
            created_at: extract_csv_created_at(row),
            updated_at: extract_csv_updated_at(row),
            warning: None,
            pre_skip_reason: None,
        });
    }

    Ok(items)
}

pub(super) fn parse_dashlane(content: &str) -> AppResult<Vec<RawImportItem>> {
    let table = parse_csv_checking_json(content, "Dashlane")?;
    ensure_headers_or_hint(
        &table,
        &["title", "url", "username", "password"],
        "dashlane",
        "Intestazione CSV non riconosciuta per Dashlane (attese colonne title, url, username, password, note, category, otpSecret).",
    )?;

    let mut items = Vec::with_capacity(table.rows.len());
    for row in table.iter_rows() {
        let title = row.get_any_trimmed(&["title", "name"]).to_string();
        let url = row.get_trimmed("url").to_string();
        let u1 = row.get_trimmed("username");
        let u2 = row.get_trimmed("username2");
        let u3 = row.get_trimmed("username3");
        let username = [u1, u2, u3]
            .into_iter()
            .find(|u| !u.is_empty())
            .unwrap_or("")
            .to_string();

        let password = clean_password(row.get("password"));
        let mut notes = row.get_any_trimmed(&["note", "notes"]).to_string();
        let mut fields = BTreeMap::new();

        for alt in [u2, u3] {
            if !alt.is_empty() && alt != username {
                append_note_section(&mut notes, None, &format!("Username alternativo: {alt}"));
            }
        }

        let otp = row.get_any_trimmed(&["otpsecret", "otp_secret", "totp"]);
        apply_imported_totp(otp, &mut fields, &mut notes);

        let cat_folder = row.get_trimmed("category");
        let source_folder = if cat_folder.is_empty() {
            None
        } else {
            Some(cat_folder.to_string())
        };
        let folder_tags = source_folder.iter().cloned().collect();

        items.push(RawImportItem {
            title,
            username,
            password,
            url,
            category: "login".to_string(),
            notes,
            fields,
            custom_fields: Vec::new(),
            favorite: false,
            source_folder,
            folder_tags,
            extra_tags: Vec::new(),
            created_at: extract_csv_created_at(row),
            updated_at: extract_csv_updated_at(row),
            warning: None,
            pre_skip_reason: None,
        });
    }

    Ok(items)
}

pub(super) fn parse_protonpass(content: &str) -> AppResult<Vec<RawImportItem>> {
    let table = parse_csv_checking_json(content, "Proton Pass")?;
    ensure_headers_or_hint(
        &table,
        &["url", "username", "email", "password", "vault"],
        "protonpass",
        "Intestazione CSV non riconosciuta per Proton Pass (attese colonne name, url, username, email, password, note, totp, vault).",
    )?;

    let mut items = Vec::with_capacity(table.rows.len());
    for row in table.iter_rows() {
        let title = row.get_any_trimmed(&["name", "title"]).to_string();
        let url = row.get_trimmed("url").to_string();
        let raw_username = row.get_trimmed("username");
        let raw_email = row.get_trimmed("email");

        let raw_type = row.get_trimmed("type").to_lowercase();
        let category = match raw_type.as_str() {
            "note" | "secure_note" => "note",
            "creditcard" | "credit_card" | "card" => "card",
            "identity" => "identity",
            "passkey" => "passkey",
            _ => "login",
        };

        let mut fields = BTreeMap::new();
        let mut notes = row.get_any_trimmed(&["note", "notes"]).to_string();

        let username = if category == "identity" {
            if !raw_username.is_empty() {
                fields.insert("identity_username".to_string(), raw_username.to_string());
            }
            raw_email.to_string()
        } else {
            if !raw_username.is_empty() && !raw_email.is_empty() && raw_email != raw_username {
                append_note_section(&mut notes, None, &format!("Email: {raw_email}"));
            }
            if !raw_username.is_empty() {
                raw_username.to_string()
            } else {
                raw_email.to_string()
            }
        };

        let password = clean_password(row.get("password"));

        let totp = row.get_trimmed("totp");
        apply_imported_totp(totp, &mut fields, &mut notes);

        let vault = row.get_trimmed("vault");
        let source_folder = if vault.is_empty() {
            None
        } else {
            Some(vault.to_string())
        };
        let folder_tags = source_folder.iter().cloned().collect();

        if category == "passkey" && !fields.contains_key("rp_id")
            && let Some(host) = host_from_url(&url) {
                fields.insert("rp_id".to_string(), host);
            }

        items.push(RawImportItem {
            title,
            username,
            password,
            url,
            category: category.to_string(),
            notes,
            fields,
            custom_fields: Vec::new(),
            favorite: false,
            source_folder,
            folder_tags,
            extra_tags: Vec::new(),
            created_at: extract_csv_created_at(row),
            updated_at: extract_csv_updated_at(row),
            warning: None,
            pre_skip_reason: None,
        });
    }

    Ok(items)
}

pub(super) fn parse_nordpass(content: &str) -> AppResult<Vec<RawImportItem>> {
    let table = parse_csv_checking_json(content, "NordPass")?;
    ensure_headers_or_hint(
        &table,
        &["url", "username", "password", "cardnumber", "full_name"],
        "nordpass",
        "Intestazione CSV non riconosciuta per NordPass (attese colonne name, url, username, password, note, folder).",
    )?;

    let mut items = Vec::with_capacity(table.rows.len());
    for row in table.iter_rows() {
        let title = row.get_any_trimmed(&["name", "title"]).to_string();
        let url = row.get_trimmed("url").to_string();
        let mut username = row.get_trimmed("username").to_string();
        let mut password = clean_password(row.get("password"));
        let notes = row.get_any_trimmed(&["note", "notes"]).to_string();

        let folder = row.get_trimmed("folder");
        let source_folder = if folder.is_empty() {
            None
        } else {
            Some(folder.to_string())
        };
        let folder_tags = source_folder.iter().cloned().collect();

        let card_num = row.get_trimmed("cardnumber");
        let raw_type = row.get_trimmed("type").to_lowercase();
        let mut fields = BTreeMap::new();

        let category = if !card_num.is_empty()
            || raw_type == "credit_card"
            || raw_type == "card"
        {
            if !card_num.is_empty() {
                password = clean_password(card_num);
            }
            let holder = row.get_trimmed("cardholdername");
            if !holder.is_empty() {
                username = holder.to_string();
            }
            let cvc = row.get_trimmed("cvc");
            if !cvc.is_empty() {
                fields.insert("cvv".to_string(), cvc.to_string());
            }
            let expiry = row.get_trimmed("expirydate");
            if !expiry.is_empty() {
                fields.insert("expiry".to_string(), expiry.to_string());
            }
            "card"
        } else if raw_type == "identity" || raw_type == "personal_info" {
            let mut fn_val = row.get_any_trimmed(&["first_name", "firstname"]).to_string();
            let mut ln_val = row.get_any_trimmed(&["last_name", "lastname"]).to_string();
            if fn_val.is_empty() && ln_val.is_empty() {
                let full_name = row.get_any_trimmed(&["full_name", "fullname"]);
                if !full_name.is_empty() {
                    if let Some((first, rest)) = full_name.split_once(char::is_whitespace) {
                        fn_val = first.trim().to_string();
                        ln_val = rest.trim().to_string();
                    } else {
                        fn_val = full_name.to_string();
                    }
                }
            }
            if !fn_val.is_empty() {
                fields.insert("first_name".to_string(), fn_val);
            }
            if !ln_val.is_empty() {
                fields.insert("last_name".to_string(), ln_val);
            }
            let email = row.get_trimmed("email");
            if !email.is_empty() {
                username = email.to_string();
            }
            let phone = row.get_any_trimmed(&["phone_number", "phone"]);
            if !phone.is_empty() {
                fields.insert("phone".to_string(), phone.to_string());
            }
            let addr1 = row.get_any_trimmed(&["address1", "address"]);
            if !addr1.is_empty() {
                fields.insert("address1".to_string(), addr1.to_string());
            }
            let addr2 = row.get_trimmed("address2");
            if !addr2.is_empty() {
                fields.insert("address2".to_string(), addr2.to_string());
            }
            let city = row.get_trimmed("city");
            if !city.is_empty() {
                fields.insert("city".to_string(), city.to_string());
            }
            let state = row.get_trimmed("state");
            if !state.is_empty() {
                fields.insert("state".to_string(), state.to_string());
            }
            let zip = row.get_any_trimmed(&["zip_code", "postal_code"]);
            if !zip.is_empty() {
                fields.insert("postal_code".to_string(), zip.to_string());
            }
            let country = row.get_trimmed("country");
            if !country.is_empty() {
                fields.insert("country".to_string(), country.to_string());
            }
            let company = row.get_trimmed("company");
            if !company.is_empty() {
                fields.insert("company".to_string(), company.to_string());
            }
            "identity"
        } else if raw_type == "passkey" {
            if let Some(host) = host_from_url(&url) {
                fields.insert("rp_id".to_string(), host);
            }
            "passkey"
        } else if raw_type == "note" || raw_type == "secure_note" {
            "note"
        } else {
            "login"
        };

        items.push(RawImportItem {
            title,
            username,
            password,
            url,
            category: category.to_string(),
            notes,
            fields,
            custom_fields: Vec::new(),
            favorite: false,
            source_folder,
            folder_tags,
            extra_tags: Vec::new(),
            created_at: extract_csv_created_at(row),
            updated_at: extract_csv_updated_at(row),
            warning: None,
            pre_skip_reason: None,
        });
    }

    Ok(items)
}

pub(super) fn parse_generic_csv(content: &str) -> AppResult<Vec<RawImportItem>> {
    let table = parse_csv_checking_json(content, "CSV Generico")?;
    ensure_headers_or_hint(
        &table,
        &[
            "title",
            "titolo",
            "name",
            "nome",
            "account",
            "service",
            "servizio",
            "username",
            "user",
            "utente",
            "email",
            "login",
            "login_username",
            "login name",
            "client_id",
            "client id",
            "password",
            "pass",
            "pwd",
            "secret",
            "segreto",
            "client_secret",
            "client secret",
            "token",
            "key",
            "login_password",
            "url",
            "website",
            "uri",
            "sito",
            "web site",
            "host",
            "login_uri",
            "notes",
            "note",
            "comments",
            "commenti",
            "extra",
        ],
        "generic_csv",
        "Il file CSV non contiene colonne riconosciute (es. title/name, username/email, password, url, notes).",
    )?;

    let mut items = Vec::with_capacity(table.rows.len());
    for row in table.iter_rows() {
        let title = row
            .get_any_trimmed(&[
                "title",
                "titolo",
                "name",
                "nome",
                "account",
                "service",
                "servizio",
            ])
            .to_string();
        let mut username = row
            .get_any_trimmed(&[
                "username",
                "user",
                "utente",
                "email",
                "login",
                "login_username",
                "login name",
                "client_id",
                "client id",
            ])
            .to_string();
        let password = clean_password(row.get_any(&[
            "password",
            "pass",
            "pwd",
            "secret",
            "segreto",
            "client_secret",
            "client secret",
            "token",
            "key",
            "login_password",
        ]));
        let url = row
            .get_any_trimmed(&["url", "website", "uri", "sito", "web site", "host", "login_uri"])
            .to_string();
        let notes_raw = row
            .get_any_trimmed(&[
                "notes",
                "note",
                "comments",
                "commenti",
                "extra",
                "description",
                "descrizione",
            ])
            .to_string();
        let mut notes = notes_raw;
        let mut fields = BTreeMap::new();
        let totp = row.get_any_trimmed(&[
            "totp",
            "otp",
            "otpauth",
            "otp_secret",
            "otpsecret",
            "2fa",
        ]);
        apply_imported_totp(totp, &mut fields, &mut notes);

        let raw_cat = row
            .get_any_trimmed(&["category", "categoria", "type", "tipo"])
            .to_lowercase();
        let category = match raw_cat.as_str() {
            "note" | "nota" | "secure note" | "secure_note" | "nota sicura" => "note",
            "api_key" | "api key" | "api" | "token" => "api_key",
            "oauth2_client" | "oauth2 client" | "client oauth2" | "client_oauth2" | "oauth2"
            | "oauth" | "oauth client" | "oauth_client" => "oauth2_client",
            "database" | "db" => "database",
            "ssh" | "server" => "ssh",
            "card" | "carta" | "credit card" | "credit_card" => "card",
            "license" | "licenza" => "license",
            "identity" | "identità" | "identita" | "persona" => "identity",
            "passkey" | "fido2" | "webauthn" => "passkey",
            _ => "login",
        };

        if category == "identity" {
            let mappings: &[(&str, &[&str])] = &[
                ("identity_title", &["identity_title"]),
                ("first_name", &["first_name", "firstname", "identity_first_name"]),
                ("middle_name", &["middle_name", "middlename", "identity_middle_name"]),
                ("last_name", &["last_name", "lastname", "cognome", "identity_last_name"]),
                ("company", &["company", "azienda", "identity_company"]),
                ("phone", &["phone", "telefono", "identity_phone"]),
                ("identity_username", &["identity_username"]),
                ("address1", &["address1", "indirizzo", "address", "identity_address1"]),
                ("address2", &["address2", "identity_address2"]),
                ("address3", &["address3", "identity_address3"]),
                ("city", &["city", "citta", "città", "identity_city"]),
                ("state", &["state", "provincia", "stato", "identity_state"]),
                ("postal_code", &["postal_code", "cap", "zip", "identity_postal_code"]),
                ("country", &["country", "paese", "nazione", "identity_country"]),
                ("ssn", &["ssn", "codice_fiscale", "identity_ssn"]),
                ("passport_number", &["passport_number", "passaporto", "identity_passport_number"]),
                ("license_number", &["license_number", "patente", "identity_license_number"]),
            ];
            for (field_key, aliases) in mappings {
                let val = row.get_any_trimmed(aliases);
                if !val.is_empty() {
                    fields.insert((*field_key).to_string(), val.to_string());
                }
            }
            let raw_email = row.get_trimmed("email");
            let raw_user = row.get_any_trimmed(&[
                "username",
                "user",
                "utente",
                "login",
                "login_username",
                "login name",
            ]);
            if !raw_email.is_empty() {
                username = raw_email.to_string();
                if !raw_user.is_empty()
                    && !raw_user.eq_ignore_ascii_case(raw_email)
                    && !fields.contains_key("identity_username")
                {
                    fields.insert("identity_username".to_string(), raw_user.to_string());
                }
            }
        } else if category == "passkey" {
            let mappings: &[(&str, &[&str])] = &[
                ("rp_id", &["rp_id", "fido2_rp_id", "passkey_rp_id"]),
                ("rp_name", &["rp_name", "fido2_rp_name", "passkey_rp_name"]),
                ("credential_id", &["credential_id", "fido2_credential_id", "passkey_credential_id"]),
                ("private_key", &["private_key", "key_value", "fido2_key_value", "passkey_key_value"]),
                ("user_display_name", &["user_display_name", "fido2_user_display_name", "passkey_user_display_name"]),
                ("user_handle", &["user_handle", "fido2_user_handle", "passkey_user_handle"]),
                ("key_type", &["key_type", "fido2_key_type", "passkey_key_type"]),
                ("key_algorithm", &["key_algorithm", "fido2_key_algorithm", "passkey_key_algorithm"]),
                ("key_curve", &["key_curve", "fido2_key_curve", "passkey_key_curve"]),
                ("counter", &["counter", "fido2_counter", "passkey_counter"]),
                ("discoverable", &["discoverable", "fido2_discoverable", "passkey_discoverable"]),
                ("creation_date", &["creation_date", "fido2_creation_date", "passkey_creation_date"]),
            ];
            for (field_key, aliases) in mappings {
                let val = row.get_any_trimmed(aliases);
                if !val.is_empty() {
                    if *field_key == "discoverable" {
                        if let Some(norm) = normalize_bool_str(val) {
                            fields.insert((*field_key).to_string(), norm.to_string());
                        }
                    } else {
                        fields.insert((*field_key).to_string(), val.to_string());
                    }
                }
            }
            if !fields.contains_key("rp_id")
                && let Some(host) = host_from_url(&url) {
                    fields.insert("rp_id".to_string(), host);
                }
        } else if category == "oauth2_client" {
            let mappings: &[(&str, &[&str])] = &[
                ("provider", &["provider", "idp", "identity_provider"]),
                ("environment", &["environment", "env", "ambiente"]),
                ("scopes", &["scopes", "scope"]),
                (
                    "redirect_uris",
                    &["redirect_uris", "redirect_uri", "callback_url", "callback_uri", "redirect_url"],
                ),
                ("expires_at", &["expires_at", "expiry", "expiration", "scadenza"]),
            ];
            for (field_key, aliases) in mappings {
                let val = row.get_any_trimmed(aliases);
                if !val.is_empty() {
                    fields.insert((*field_key).to_string(), val.to_string());
                }
            }
        }

        let favorite = parse_bool_flag(row.get_any_trimmed(&["favorite", "preferito", "fav"]));
        let extra_tags = split_tags(row.get_any_trimmed(&["tags", "tag", "labels"]));

        let folder_raw = row.get_any_trimmed(&[
            "folder",
            "cartella",
            "group",
            "gruppo",
            "grouping",
            "vault",
            "collection",
            "collections",
        ]);
        let source_folder = if folder_raw.is_empty() {
            None
        } else {
            Some(folder_raw.to_string())
        };
        let folder_tags = source_folder.iter().cloned().collect();

        items.push(RawImportItem {
            title,
            username,
            password,
            url,
            category: category.to_string(),
            notes,
            fields,
            custom_fields: Vec::new(),
            favorite,
            source_folder,
            folder_tags,
            extra_tags,
            created_at: extract_csv_created_at(row),
            updated_at: extract_csv_updated_at(row),
            warning: None,
            pre_skip_reason: None,
        });
    }

    Ok(items)
}

// ---------------------------------------------------------------------------
// Psono (FOSS password manager, psono.com / psono.pw)
//
// The web client / desktop app export ("Other" -> "Export" -> JSON) is the
// decrypted password datastore: a root folder object with recursive
// `folders` (each with `name`, `folders`, `items`) and `items`. Every item
// has a string `type` (e.g. "website_password") plus the decrypted secret
// fields prefixed with the type (e.g. `website_password_password`).
// ---------------------------------------------------------------------------

fn psono_field(item: &Value, prefix: &str, name: &str) -> String {
    json_scalar_str(item.get(format!("{prefix}_{name}").as_str()))
}

fn psono_field_raw(item: &Value, prefix: &str, name: &str) -> String {
    json_scalar_raw(item.get(format!("{prefix}_{name}").as_str()))
}

/// Percent-encodes an otpauth label so titles containing '?', '#', '&' or
/// spaces cannot break the URI structure (the parser splits on those chars).
fn psono_encode_otp_label(label: &str) -> String {
    let mut out = String::with_capacity(label.len());
    for byte in label.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b':' => {
                out.push(byte as char)
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

fn psono_build_totp_uri(code: &str, digits: &str, period: &str, algorithm: &str, label: &str) -> String {
    let code = code.trim();
    if code.is_empty() {
        return String::new();
    }
    let label = if label.trim().is_empty() { "TOTP" } else { label.trim() };
    let mut uri = format!(
        "otpauth://totp/{}?secret={}",
        psono_encode_otp_label(label),
        psono_encode_otp_label(code)
    );
    if let Ok(d) = digits.trim().parse::<u32>()
        && d != 6 {
            uri.push_str(&format!("&digits={d}"));
        }
    if let Ok(p) = period.trim().parse::<u32>()
        && p != 30 {
            uri.push_str(&format!("&period={p}"));
        }
    match algorithm.trim().to_uppercase().as_str() {
        "SHA256" | "SHA512" => uri.push_str(&format!("&algorithm={}", algorithm.trim().to_uppercase())),
        _ => {}
    }
    uri
}

fn psono_looks_like_bitwarden(root: &Value) -> bool {
    if root.get("encrypted").is_some() {
        return true;
    }
    root.get("items")
        .and_then(Value::as_array)
        .map(|items| {
            items.iter().any(|it| {
                it.as_object()
                    .map(|o| {
                        o.contains_key("login")
                            || o.contains_key("card")
                            || o.contains_key("identity")
                            || o.contains_key("sshKey")
                            || o.get("type").and_then(Value::as_u64).is_some()
                    })
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false)
}

fn psono_walk_folder(folder: &Value, path: &str, out: &mut Vec<RawImportItem>) {
    if let Some(items) = folder.get("items").and_then(Value::as_array) {
        for item in items {
            match psono_parse_item(item, path) {
                Some(raw) => out.push(raw),
                None => out.push(RawImportItem {
                    title: "Elemento non valido".to_string(),
                    username: String::new(),
                    password: String::new(),
                    url: String::new(),
                    category: "login".to_string(),
                    notes: String::new(),
                    fields: BTreeMap::new(),
                    custom_fields: Vec::new(),
                    favorite: false,
                    source_folder: if path.is_empty() { None } else { Some(path.to_string()) },
                    folder_tags: if path.is_empty() { Vec::new() } else { vec![path.to_string()] },
                    extra_tags: Vec::new(),
                    created_at: None,
                    updated_at: None,
                    warning: None,
                    pre_skip_reason: Some(
                        "Voce dell'export Psono non valida (non è un oggetto JSON)".to_string(),
                    ),
                }),
            }
        }
    }
    if let Some(subfolders) = folder.get("folders").and_then(Value::as_array) {
        for sub in subfolders {
            if sub.get("deleted").and_then(Value::as_bool).unwrap_or(false) {
                continue;
            }
            let name = json_scalar_str(sub.get("name"));
            let child_path = if name.is_empty() {
                path.to_string()
            } else if path.is_empty() {
                name
            } else {
                format!("{path}/{name}")
            };
            psono_walk_folder(sub, &child_path, out);
        }
    }
}

fn psono_parse_item(item: &Value, path: &str) -> Option<RawImportItem> {
    let obj = item.as_object()?;
    let item_type = json_scalar_str(item.get("type"));
    let title_fallback = json_scalar_str(item.get("name"));
    let prefix = item_type.as_str();
    // urlfilter lives on the datastore item; the decrypted secret may also
    // carry a "<type>_url_filter" copy — use it as fallback.
    let urlfilter = {
        let u = json_scalar_str(item.get("urlfilter"));
        if u.is_empty() { psono_field(item, prefix, "url_filter") } else { u }
    };

    let source_folder = if path.is_empty() {
        None
    } else {
        Some(path.to_string())
    };
    let folder_tags: Vec<String> = source_folder.iter().cloned().collect();

    let created_at = parse_import_timestamp(&json_scalar_str(item.get("create_date")));
    let updated_at = parse_import_timestamp(&json_scalar_str(item.get("write_date")))
        .or_else(|| parse_import_timestamp(&json_scalar_str(item.get("password_modification_datetime"))));

    // Psono tags (array of strings) -> extra tags
    let extra_tags: Vec<String> = item
        .get("tags")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|t| t.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(ToOwned::to_owned)
                .collect()
        })
        .unwrap_or_default();

    // Psono custom fields ({ name, value, type? }) -> Starward custom fields
    let custom_fields: Vec<CustomField> = item
        .get("custom_fields")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|f| f.as_object())
                .filter_map(|f| {
                    let name = json_scalar_str(f.get("name"));
                    if name.is_empty() {
                        return None;
                    }
                    let field_type = match json_scalar_str(f.get("type")).to_lowercase().as_str() {
                        "password" | "hidden" | "secret" => CustomFieldType::Hidden,
                        "checkbox" | "boolean" => CustomFieldType::Checkbox,
                        "linked" => CustomFieldType::Linked,
                        _ => CustomFieldType::Text,
                    };
                    Some(CustomField {
                        field_type,
                        label: name,
                        value: json_scalar_raw(f.get("value")),
                        linked_id: None,
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let base = |category: &str, title: String, username: String, password: String, url: String, notes: String, fields: BTreeMap<String, String>, warning: Option<String>, pre_skip_reason: Option<String>| RawImportItem {
        title,
        username,
        password,
        url,
        category: category.to_string(),
        notes,
        fields,
        custom_fields: custom_fields.clone(),
        favorite: parse_bool_flag(&json_scalar_str(item.get("favorite"))),
        source_folder,
        folder_tags: folder_tags.clone(),
        extra_tags: extra_tags.clone(),
        created_at,
        updated_at,
        warning,
        pre_skip_reason,
    };

    if obj.get("deleted").and_then(Value::as_bool).unwrap_or(false) {
        return Some(base(
            "login",
            if title_fallback.is_empty() { "Elemento nel cestino".to_string() } else { title_fallback },
            String::new(),
            String::new(),
            urlfilter,
            String::new(),
            BTreeMap::new(),
            None,
            Some("Elemento nel cestino di Psono".to_string()),
        ));
    }

    let typed_title = psono_field(item, prefix, "title");
    let title = if !typed_title.is_empty() { typed_title } else { title_fallback.clone() };

    match prefix {
        "website_password" | "application_password" => {
            let url = {
                let u = psono_field(item, prefix, "url");
                if u.is_empty() { urlfilter.clone() } else { u }
            };
            let username = psono_field(item, prefix, "username");
            let password = clean_password(&psono_field_raw(item, prefix, "password"));
            let mut notes = psono_field(item, prefix, "notes");
            // Legacy autofill callback fields may carry extra credentials
            for (key, label) in [
                ("callback_url", "Callback URL"),
                ("callback_user", "Callback user"),
                ("callback_pass", "Callback password"),
            ] {
                let v = json_scalar_raw(item.get(key));
                if !v.trim().is_empty() {
                    append_note_section(&mut notes, None, &format!("{label}: {v}"));
                }
            }
            let mut fields = BTreeMap::new();

            let totp_code = psono_field(item, prefix, "totp_code");
            if !totp_code.is_empty() {
                let label = if !title.is_empty() { title.clone() } else { host_from_url(&url).unwrap_or_else(|| "TOTP".to_string()) };
                let uri = psono_build_totp_uri(
                    &totp_code,
                    &psono_field(item, prefix, "totp_digits"),
                    &psono_field(item, prefix, "totp_period"),
                    &psono_field(item, prefix, "totp_algorithm"),
                    &label,
                );
                apply_imported_totp(&uri, &mut fields, &mut notes);
            }

            Some(base("login", title, username, password, url, notes, fields, None, None))
        }
        "totp" => {
            let mut notes = psono_field(item, prefix, "notes");
            let mut fields = BTreeMap::new();
            let code = psono_field(item, prefix, "code");
            let label = if !title.is_empty() { title.clone() } else { "TOTP".to_string() };
            let uri = psono_build_totp_uri(
                &code,
                &psono_field(item, prefix, "digits"),
                &psono_field(item, prefix, "period"),
                &psono_field(item, prefix, "algorithm"),
                &label,
            );
            if !uri.is_empty() {
                apply_imported_totp(&uri, &mut fields, &mut notes);
                if notes.is_empty() {
                    append_note_section(&mut notes, None, &uri);
                }
            }
            let url = urlfilter.clone();
            Some(base("note", title, String::new(), String::new(), url, notes, fields, None, None))
        }
        "note" => {
            let notes = psono_field(item, prefix, "notes");
            Some(base("note", title, String::new(), String::new(), urlfilter, notes, BTreeMap::new(), None, None))
        }
        "bookmark" => {
            let url = {
                let u = psono_field(item, prefix, "url");
                if u.is_empty() { urlfilter.clone() } else { u }
            };
            let notes = psono_field(item, prefix, "notes");
            Some(base("login", title, String::new(), String::new(), url, notes, BTreeMap::new(), None, None))
        }
        "credit_card" => {
            let mut fields = BTreeMap::new();
            let cvv = psono_field(item, prefix, "cvc");
            if !cvv.is_empty() {
                fields.insert("cvv".to_string(), cvv);
            }
            let expiry = psono_field(item, prefix, "valid_through");
            if !expiry.is_empty() {
                fields.insert("expiry".to_string(), expiry);
            }
            let mut notes = psono_field(item, prefix, "notes");
            let pin = psono_field(item, prefix, "pin");
            if !pin.is_empty() {
                append_note_section(&mut notes, None, &format!("PIN: {pin}"));
            }
            let number = clean_password(&psono_field_raw(item, prefix, "number"));
            let holder = psono_field(item, prefix, "name");
            Some(base("card", title, holder, number, urlfilter, notes, fields, None, None))
        }
        "identity" => {
            let mut fields = BTreeMap::new();
            let mappings: &[(&str, &str)] = &[
                ("identity_title", "title"),
                ("first_name", "first_name"),
                ("last_name", "last_name"),
                ("company", "company"),
                ("address1", "address"),
                ("city", "city"),
                ("state", "state"),
                ("postal_code", "postal_code"),
                ("country", "country"),
                ("phone", "phone_number"),
            ];
            for (field_key, psono_name) in mappings {
                let val = psono_field(item, prefix, psono_name);
                if !val.is_empty() {
                    fields.insert((*field_key).to_string(), val);
                }
            }
            let email = psono_field(item, prefix, "email");
            let notes = psono_field(item, prefix, "notes");
            Some(base("identity", title, email, String::new(), urlfilter, notes, fields, None, None))
        }
        "ssh_own_key" => {
            let mut fields = BTreeMap::new();
            let priv_key = psono_field(item, prefix, "private");
            if !priv_key.is_empty() {
                fields.insert("private_key".to_string(), priv_key);
            }
            let pub_key = psono_field(item, prefix, "public");
            if !pub_key.is_empty() {
                fields.insert("public_key".to_string(), pub_key);
            }
            let notes = psono_field(item, prefix, "notes");
            let username = {
                let n = psono_field(item, prefix, "name");
                if !n.is_empty() { n } else { psono_field(item, prefix, "email") }
            };
            Some(base("ssh", title, username, String::new(), urlfilter, notes, fields, None, None))
        }
        "ssh_connection" => {
            let mut fields = BTreeMap::new();
            let port = psono_field(item, prefix, "port");
            if !port.is_empty() {
                fields.insert("port".to_string(), port);
            }
            let priv_key = psono_field(item, prefix, "private_key");
            if !priv_key.is_empty() {
                fields.insert("private_key".to_string(), priv_key);
            }
            let mut notes = psono_field(item, prefix, "notes");
            let auth_type = psono_field(item, prefix, "authentication_type");
            if !auth_type.is_empty() {
                append_note_section(&mut notes, None, &format!("Autenticazione: {auth_type}"));
            }
            let host = psono_field(item, prefix, "host");
            let url = if !host.is_empty() { host } else { urlfilter.clone() };
            let username = psono_field(item, prefix, "username");
            let password = clean_password(&psono_field_raw(item, prefix, "password"));
            Some(base("ssh", title, username, password, url, notes, fields, None, None))
        }
        "rdp_connection" | "vnc_connection" => {
            let scheme = if prefix == "rdp_connection" { "rdp" } else { "vnc" };
            let host = psono_field(item, prefix, "host");
            let port = psono_field(item, prefix, "port");
            let url = if !host.is_empty() {
                if !port.is_empty() { format!("{scheme}://{host}:{port}") } else { format!("{scheme}://{host}") }
            } else {
                urlfilter.clone()
            };
            let mut notes = psono_field(item, prefix, "notes");
            let domain = psono_field(item, prefix, "domain");
            if !domain.is_empty() {
                append_note_section(&mut notes, None, &format!("Dominio: {domain}"));
            }
            let username = psono_field(item, prefix, "username");
            let password = clean_password(&psono_field_raw(item, prefix, "password"));
            Some(base("login", title, username, password, url, notes, BTreeMap::new(), None, None))
        }
        "environment_variables" => {
            let mut notes = psono_field(item, prefix, "notes");
            let vars = item.get(format!("{prefix}_variables").as_str());
            let mut lines = Vec::new();
            match vars {
                Some(Value::Array(arr)) => {
                    for v in arr {
                        let key = {
                            let k = json_scalar_str(v.get("key"));
                            if k.is_empty() { json_scalar_str(v.get("name")) } else { k }
                        };
                        let val = json_scalar_str(v.get("value"));
                        if !key.is_empty() {
                            lines.push(format!("{key}: {val}"));
                        }
                    }
                }
                Some(Value::Object(map)) => {
                    for (k, v) in map {
                        lines.push(format!("{k}: {}", json_scalar_str(Some(v))));
                    }
                }
                _ => {}
            }
            if !lines.is_empty() {
                append_note_section(&mut notes, Some("Variabili d'ambiente:"), &lines.join("\n"));
            }
            Some(base("note", title, String::new(), String::new(), urlfilter, notes, BTreeMap::new(), None, None))
        }
        "mail_gpg_own_key" => {
            let mut notes = String::new();
            let name = psono_field(item, prefix, "name");
            if !name.is_empty() {
                append_note_section(&mut notes, None, &format!("Nome: {name}"));
            }
            let email = psono_field(item, prefix, "email");
            if !email.is_empty() {
                append_note_section(&mut notes, None, &format!("Email: {email}"));
            }
            let pub_key = psono_field(item, prefix, "public");
            if !pub_key.is_empty() {
                append_note_section(&mut notes, Some("Chiave pubblica GPG:"), &pub_key);
            }
            let priv_key = psono_field(item, prefix, "private");
            if !priv_key.is_empty() {
                append_note_section(&mut notes, Some("Chiave privata GPG:"), &priv_key);
            }
            Some(base("note", title, email, String::new(), urlfilter, notes, BTreeMap::new(), None, None))
        }
        "elster_certificate" => {
            let password = clean_password(&psono_field_raw(item, prefix, "password"));
            let mut notes = psono_field(item, prefix, "notes");
            let retrieval = psono_field(item, prefix, "retrieval_code");
            if !retrieval.is_empty() {
                append_note_section(&mut notes, None, &format!("Codice di recupero: {retrieval}"));
            }
            Some(base("note", title, String::new(), password, urlfilter, notes, BTreeMap::new(), None, None))
        }
        "passkey" => {
            let mut fields = BTreeMap::new();
            let rp_id = psono_field(item, prefix, "rp_id");
            if !rp_id.is_empty() {
                fields.insert("rp_id".to_string(), rp_id);
            }
            let cred_id = psono_field(item, prefix, "id");
            if !cred_id.is_empty() {
                fields.insert("credential_id".to_string(), cred_id);
            }
            let priv_key = psono_field(item, prefix, "private_key");
            if !priv_key.is_empty() {
                fields.insert("private_key".to_string(), priv_key);
            }
            let user_handle = psono_field(item, prefix, "user_handle");
            if !user_handle.is_empty() {
                fields.insert("user_handle".to_string(), user_handle);
            }
            let algorithm = psono_field(item, prefix, "algorithm");
            if !algorithm.is_empty() {
                fields.insert("key_algorithm".to_string(), algorithm);
            }
            let url = {
                let u = psono_field(item, prefix, "url");
                if u.is_empty() { urlfilter.clone() } else { u }
            };
            if !fields.contains_key("rp_id")
                && let Some(host) = host_from_url(&url) {
                    fields.insert("rp_id".to_string(), host);
                }
            let notes = psono_field(item, prefix, "notes");
            Some(base("passkey", title, String::new(), String::new(), url, notes, fields, None, None))
        }
        "file" => Some(base(
            "login",
            if title_fallback.is_empty() { "File".to_string() } else { title_fallback },
            String::new(),
            String::new(),
            urlfilter,
            String::new(),
            BTreeMap::new(),
            None,
            Some("I file non sono supportati dall'importazione (l'export JSON di Psono non include i file)".to_string()),
        )),
        other => {
            // Tipo non riconosciuto: conserva i dati come nota con i campi serializzati
            let mut lines = Vec::new();
            for (k, v) in obj {
                if k.starts_with(&format!("{other}_")) {
                    let val = json_scalar_str(Some(v));
                    if !val.is_empty() {
                        lines.push(format!("{}: {}", &k[other.len() + 1..], val));
                    }
                }
            }
            let mut notes = String::new();
            if !lines.is_empty() {
                append_note_section(&mut notes, Some("Dettagli importati:"), &lines.join("\n"));
            }
            Some(base("note", title, String::new(), String::new(), urlfilter, notes, BTreeMap::new(), None, None))
        }
    }
}

pub(super) fn parse_psono(content: &str) -> AppResult<Vec<RawImportItem>> {
    let stripped = content.strip_prefix('\u{feff}').unwrap_or(content);
    let trimmed = stripped.trim_start();
    if trimmed.is_empty() {
        return Err(AppError::BadRequest("Il file da importare è vuoto.".to_string()));
    }
    if !trimmed.starts_with('{') {
        return Err(AppError::BadRequest(
            "Psono esporta solo file JSON: carica il file export.json scaricato dal client Psono (Other → Export). Per i file CSV usa 'CSV Generico'.".to_string(),
        ));
    }
    let root: Value = serde_json::from_str(stripped).map_err(|e| { // codeql[trust/unsafe-deserialization]
        AppError::BadRequest(format!("Impossibile leggere il file JSON Psono: {e}"))
    })?;

    if psono_looks_like_bitwarden(&root) {
        return Err(AppError::BadRequest(
            "Il file sembra un export JSON di Bitwarden. Seleziona 'Bitwarden' prima di importarlo.".to_string(),
        ));
    }

    let obj = root.as_object().ok_or_else(|| {
        AppError::BadRequest("Il file JSON di Psono deve contenere un oggetto radice (il datastore).".to_string())
    })?;

    let has_folders = obj.get("folders").and_then(Value::as_array).is_some();
    let has_items = obj.get("items").and_then(Value::as_array).is_some();
    if !has_folders && !has_items {
        return Err(AppError::BadRequest(
            "Il file JSON non sembra un export di Psono (attesi i campi 'folders' e/o 'items' del datastore).".to_string(),
        ));
    }

    let mut items = Vec::new();
    psono_walk_folder(&root, "", &mut items);
    Ok(items)
}
