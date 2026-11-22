use std::collections::BTreeMap;

use chrono::{DateTime, Utc};

use crate::{
    error::{AppError, AppResult},
    importers::{
        append_note_section, clean_password,
        csv_parser::{CsvRow, CsvTable},
        detect_provider_hint_from_headers, host_from_url, parse_bool_flag,
        parse_import_timestamp, RawImportItem,
    },
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

        if !totp.is_empty() {
            append_note_section(&mut notes, None, &format!("TOTP: {totp}"));
        }

        let raw_type = row.get_any_trimmed(&["type", "category"]).to_lowercase();
        let category = match raw_type.as_str() {
            "secure note" | "secure_note" | "note" | "nota" => "note",
            "credit card" | "credit_card" | "card" | "carta" => "card",
            "database" => "database",
            "ssh key" | "ssh_key" | "ssh" => "ssh",
            "api credential" | "api_credential" | "api key" | "api_key" => "api_key",
            "software license" | "software_license" | "license" | "licenza" => "license",
            _ => "login",
        };

        items.push(RawImportItem {
            title,
            username,
            password,
            url,
            category: category.to_string(),
            notes,
            fields: BTreeMap::new(),
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

    if !table.has_any_header(&["grouping", "extra", "fav"]) {
        if let Some(hint) = detect_provider_hint_from_headers(&table.headers, "lastpass") {
            return Err(AppError::BadRequest(hint));
        }
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
            } else {
                category = "note".to_string();
                notes = extra.to_string();
            }
        } else if !extra.is_empty() {
            notes = extra.to_string();
        }

        if !totp.is_empty() {
            append_note_section(&mut notes, None, &format!("TOTP: {totp}"));
        }

        items.push(RawImportItem {
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
                && !key_clean.contains('/')
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

        if !totp.is_empty() {
            append_note_section(&mut notes, None, &format!("TOTP: {totp}"));
        }

        items.push(RawImportItem {
            title,
            username,
            password,
            url,
            category: "login".to_string(),
            notes,
            fields: BTreeMap::new(),
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

        if !otpauth.is_empty() {
            append_note_section(&mut notes, None, &format!("TOTP: {otpauth}"));
        }

        items.push(RawImportItem {
            title,
            username,
            password,
            url,
            category: "login".to_string(),
            notes,
            fields: BTreeMap::new(),
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

        for alt in [u2, u3] {
            if !alt.is_empty() && alt != username {
                append_note_section(&mut notes, None, &format!("Username alternativo: {alt}"));
            }
        }

        let otp = row.get_any_trimmed(&["otpsecret", "otp_secret", "totp"]);
        if !otp.is_empty() {
            append_note_section(&mut notes, None, &format!("TOTP: {otp}"));
        }

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
            fields: BTreeMap::new(),
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
        let username = if !raw_username.is_empty() {
            raw_username.to_string()
        } else {
            raw_email.to_string()
        };

        let password = clean_password(row.get("password"));
        let mut notes = row.get_any_trimmed(&["note", "notes"]).to_string();

        if !raw_username.is_empty() && !raw_email.is_empty() && raw_email != raw_username {
            append_note_section(&mut notes, None, &format!("Email: {raw_email}"));
        }

        let totp = row.get_trimmed("totp");
        if !totp.is_empty() {
            append_note_section(&mut notes, None, &format!("TOTP: {totp}"));
        }

        let vault = row.get_trimmed("vault");
        let source_folder = if vault.is_empty() {
            None
        } else {
            Some(vault.to_string())
        };
        let folder_tags = source_folder.iter().cloned().collect();

        let raw_type = row.get_trimmed("type").to_lowercase();
        let category = match raw_type.as_str() {
            "note" | "secure_note" => "note",
            "creditcard" | "credit_card" | "card" => "card",
            _ => "login",
        };

        items.push(RawImportItem {
            title,
            username,
            password,
            url,
            category: category.to_string(),
            notes,
            fields: BTreeMap::new(),
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
        &["url", "username", "password", "cardnumber"],
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
            "password",
            "pass",
            "pwd",
            "secret",
            "segreto",
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
        let username = row
            .get_any_trimmed(&[
                "username",
                "user",
                "utente",
                "email",
                "login",
                "login_username",
                "login name",
            ])
            .to_string();
        let password = clean_password(row.get_any(&[
            "password",
            "pass",
            "pwd",
            "secret",
            "segreto",
            "token",
            "key",
            "login_password",
        ]));
        let url = row
            .get_any_trimmed(&["url", "website", "uri", "sito", "web site", "host", "login_uri"])
            .to_string();
        let notes = row
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

        let raw_cat = row
            .get_any_trimmed(&["category", "categoria", "type", "tipo"])
            .to_lowercase();
        let category = match raw_cat.as_str() {
            "note" | "nota" | "secure note" | "secure_note" | "nota sicura" => "note",
            "api_key" | "api key" | "api" | "token" => "api_key",
            "database" | "db" => "database",
            "ssh" | "server" => "ssh",
            "card" | "carta" | "credit card" | "credit_card" => "card",
            "license" | "licenza" => "license",
            _ => "login",
        };

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
            fields: BTreeMap::new(),
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
