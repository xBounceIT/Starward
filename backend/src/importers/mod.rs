pub mod bitwarden;
pub mod csv_parser;
pub mod providers;

use std::collections::{BTreeMap, HashSet};

use chrono::{DateTime, Duration, NaiveDate, NaiveDateTime, Utc};

use crate::{
    error::{AppError, AppResult},
    models::{ImportPreviewItemDto, ImportPreviewResponseDto, ImportProviderDto},
    routes::credentials::{clean_extra_fields, normalize_category, validate_credential_fields},
};

pub(crate) type DedupKey = (String, String, String, String);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImportProvider {
    Bitwarden,
    BitwardenJson,
    BitwardenCsv,
    OnePassword,
    LastPass,
    KeePass,
    Chrome,
    Firefox,
    Safari,
    Dashlane,
    ProtonPass,
    NordPass,
    GenericCsv,
}

impl ImportProvider {
    pub fn from_id(raw: &str) -> AppResult<Self> {
        match raw.trim().to_lowercase().as_str() {
            "bitwarden" => Ok(Self::Bitwarden),
            "bitwarden_json" | "bitwarden-json" => Ok(Self::BitwardenJson),
            "bitwarden_csv" | "bitwarden-csv" => Ok(Self::BitwardenCsv),
            "1password" | "1password_csv" | "onepassword" => Ok(Self::OnePassword),
            "lastpass" | "lastpass_csv" => Ok(Self::LastPass),
            "keepass" | "keepassxc" | "keepass_csv" => Ok(Self::KeePass),
            "chrome" | "edge" | "brave" | "chromium" => Ok(Self::Chrome),
            "firefox" => Ok(Self::Firefox),
            "safari" | "apple" | "apple_passwords" => Ok(Self::Safari),
            "dashlane" => Ok(Self::Dashlane),
            "protonpass" | "proton_pass" | "proton-pass" => Ok(Self::ProtonPass),
            "nordpass" => Ok(Self::NordPass),
            "generic_csv" | "generic" | "csv" => Ok(Self::GenericCsv),
            other => Err(AppError::BadRequest(format!(
                "Provider di importazione non supportato: '{other}'"
            ))),
        }
    }

    pub fn canonical_id(self) -> &'static str {
        match self {
            Self::Bitwarden => "bitwarden",
            Self::BitwardenJson => "bitwarden_json",
            Self::BitwardenCsv => "bitwarden_csv",
            Self::OnePassword => "1password",
            Self::LastPass => "lastpass",
            Self::KeePass => "keepass",
            Self::Chrome => "chrome",
            Self::Firefox => "firefox",
            Self::Safari => "safari",
            Self::Dashlane => "dashlane",
            Self::ProtonPass => "protonpass",
            Self::NordPass => "nordpass",
            Self::GenericCsv => "generic_csv",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Bitwarden => "Bitwarden",
            Self::BitwardenJson => "Bitwarden (JSON)",
            Self::BitwardenCsv => "Bitwarden (CSV)",
            Self::OnePassword => "1Password",
            Self::LastPass => "LastPass",
            Self::KeePass => "KeePass / KeePassXC",
            Self::Chrome => "Chrome / Edge / Brave",
            Self::Firefox => "Mozilla Firefox",
            Self::Safari => "Safari / Password Apple",
            Self::Dashlane => "Dashlane",
            Self::ProtonPass => "Proton Pass",
            Self::NordPass => "NordPass",
            Self::GenericCsv => "CSV Generico",
        }
    }
}

pub fn all_provider_dtos() -> Vec<ImportProviderDto> {
    vec![
        ImportProviderDto {
            id: "bitwarden".to_string(),
            name: "Bitwarden".to_string(),
            description:
                "Export vault personale o organizzazione (Login, Note, Carte, Identità, Chiavi SSH)"
                    .to_string(),
            formats: vec!["JSON".to_string(), "CSV".to_string()],
            extensions: vec![".json".to_string(), ".csv".to_string()],
            featured: true,
            supports_folders: true,
        },
        ImportProviderDto {
            id: "1password".to_string(),
            name: "1Password".to_string(),
            description: "Export CSV standard da 1Password desktop o web".to_string(),
            formats: vec!["CSV".to_string()],
            extensions: vec![".csv".to_string()],
            featured: false,
            supports_folders: false,
        },
        ImportProviderDto {
            id: "lastpass".to_string(),
            name: "LastPass".to_string(),
            description: "Export CSV con supporto a gruppi, carte, database e chiavi SSH"
                .to_string(),
            formats: vec!["CSV".to_string()],
            extensions: vec![".csv".to_string()],
            featured: false,
            supports_folders: true,
        },
        ImportProviderDto {
            id: "keepass".to_string(),
            name: "KeePass / KeePassXC".to_string(),
            description: "Export CSV da KeePassXC o KeePass 1.x / 2.x con gruppi".to_string(),
            formats: vec!["CSV".to_string()],
            extensions: vec![".csv".to_string()],
            featured: false,
            supports_folders: true,
        },
        ImportProviderDto {
            id: "chrome".to_string(),
            name: "Chrome / Edge / Brave".to_string(),
            description: "Export password CSV dai browser basati su Chromium".to_string(),
            formats: vec!["CSV".to_string()],
            extensions: vec![".csv".to_string()],
            featured: false,
            supports_folders: false,
        },
        ImportProviderDto {
            id: "firefox".to_string(),
            name: "Mozilla Firefox".to_string(),
            description: "Export CSV da Password di Firefox (about:logins)".to_string(),
            formats: vec!["CSV".to_string()],
            extensions: vec![".csv".to_string()],
            featured: false,
            supports_folders: false,
        },
        ImportProviderDto {
            id: "safari".to_string(),
            name: "Safari / Password Apple".to_string(),
            description: "Export CSV dall'app Password di macOS / iOS o Safari".to_string(),
            formats: vec!["CSV".to_string()],
            extensions: vec![".csv".to_string()],
            featured: false,
            supports_folders: false,
        },
        ImportProviderDto {
            id: "dashlane".to_string(),
            name: "Dashlane".to_string(),
            description: "Export CSV non cifrato delle credenziali Dashlane".to_string(),
            formats: vec!["CSV".to_string()],
            extensions: vec![".csv".to_string()],
            featured: false,
            supports_folders: true,
        },
        ImportProviderDto {
            id: "protonpass".to_string(),
            name: "Proton Pass".to_string(),
            description: "Export CSV da Proton Pass con vault e TOTP".to_string(),
            formats: vec!["CSV".to_string()],
            extensions: vec![".csv".to_string()],
            featured: false,
            supports_folders: true,
        },
        ImportProviderDto {
            id: "nordpass".to_string(),
            name: "NordPass".to_string(),
            description: "Export CSV da NordPass (login, carte e cartelle)".to_string(),
            formats: vec!["CSV".to_string()],
            extensions: vec![".csv".to_string()],
            featured: false,
            supports_folders: true,
        },
        ImportProviderDto {
            id: "generic_csv".to_string(),
            name: "CSV Generico".to_string(),
            description: "File CSV personalizzato (colonne name/title, username, password, url, notes)"
                .to_string(),
            formats: vec!["CSV".to_string()],
            extensions: vec![".csv".to_string()],
            featured: false,
            supports_folders: true,
        },
    ]
}

#[derive(Debug, Clone)]
pub(crate) struct RawImportItem {
    pub title: String,
    pub username: String,
    pub password: String,
    pub url: String,
    pub category: String,
    pub notes: String,
    pub fields: BTreeMap<String, String>,
    pub favorite: bool,
    pub source_folder: Option<String>,
    pub folder_tags: Vec<String>,
    pub extra_tags: Vec<String>,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
    pub warning: Option<String>,
    pub pre_skip_reason: Option<String>,
}

#[derive(Debug, Clone)]
pub struct EvaluatedImportItem {
    pub index: usize,
    pub title: String,
    pub username: String,
    pub password: String,
    pub url: String,
    pub category: String,
    pub notes: String,
    pub fields: BTreeMap<String, String>,
    pub favorite: bool,
    pub source_folder: Option<String>,
    pub tags: Vec<String>,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
    pub status: String,
    pub is_duplicate: bool,
    pub warning: Option<String>,
    pub skip_reason: Option<String>,
}

impl EvaluatedImportItem {
    pub fn to_preview_dto(&self) -> ImportPreviewItemDto {
        let extra_field_count = self.fields.keys().filter(|k| k.as_str() != "tags").count();
        ImportPreviewItemDto {
            index: self.index,
            title: self.title.clone(),
            username: self.username.clone(),
            url: self.url.clone(),
            category: self.category.clone(),
            source_folder: self.source_folder.clone(),
            favorite: self.favorite,
            tags: self.tags.clone(),
            has_password: !self.password.is_empty(),
            has_notes: !self.notes.is_empty(),
            extra_field_count,
            status: self.status.clone(),
            is_duplicate: self.is_duplicate,
            warning: self.warning.clone(),
            skip_reason: self.skip_reason.clone(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct EvaluatedImportBatch {
    pub provider: String,
    pub provider_label: String,
    pub detected_format: String,
    pub total_parsed: usize,
    pub ready_count: usize,
    pub warning_count: usize,
    pub duplicate_count: usize,
    pub skipped_count: usize,
    pub source_folders: Vec<String>,
    pub has_items_without_folder: bool,
    pub items: Vec<EvaluatedImportItem>,
}

impl EvaluatedImportBatch {
    pub fn to_preview_response(&self) -> ImportPreviewResponseDto {
        ImportPreviewResponseDto {
            provider: self.provider.clone(),
            provider_label: self.provider_label.clone(),
            detected_format: self.detected_format.clone(),
            total_parsed: self.total_parsed,
            ready_count: self.ready_count,
            warning_count: self.warning_count,
            duplicate_count: self.duplicate_count,
            skipped_count: self.skipped_count,
            source_folders: self.source_folders.clone(),
            has_items_without_folder: self.has_items_without_folder,
            items: self.items.iter().map(EvaluatedImportItem::to_preview_dto).collect(),
        }
    }
}

pub fn evaluate_import(
    provider_id: &str,
    content: &str,
    filename: Option<&str>,
    folder_as_tag: bool,
    existing_keys: &HashSet<DedupKey>,
) -> AppResult<EvaluatedImportBatch> {
    let provider = ImportProvider::from_id(provider_id)?;

    let (detected_format, raw_items) = match provider {
        ImportProvider::Bitwarden => bitwarden::parse_bitwarden(content, filename, None)?,
        ImportProvider::BitwardenJson => {
            bitwarden::parse_bitwarden(content, filename, Some("json"))?
        }
        ImportProvider::BitwardenCsv => {
            bitwarden::parse_bitwarden(content, filename, Some("csv"))?
        }
        ImportProvider::OnePassword => ("CSV".to_string(), providers::parse_1password(content)?),
        ImportProvider::LastPass => ("CSV".to_string(), providers::parse_lastpass(content)?),
        ImportProvider::KeePass => ("CSV".to_string(), providers::parse_keepass(content)?),
        ImportProvider::Chrome => ("CSV".to_string(), providers::parse_chrome(content)?),
        ImportProvider::Firefox => ("CSV".to_string(), providers::parse_firefox(content)?),
        ImportProvider::Safari => ("CSV".to_string(), providers::parse_safari(content)?),
        ImportProvider::Dashlane => ("CSV".to_string(), providers::parse_dashlane(content)?),
        ImportProvider::ProtonPass => ("CSV".to_string(), providers::parse_protonpass(content)?),
        ImportProvider::NordPass => ("CSV".to_string(), providers::parse_nordpass(content)?),
        ImportProvider::GenericCsv => ("CSV".to_string(), providers::parse_generic_csv(content)?),
    };

    let mut seen_keys = existing_keys.clone();
    let mut evaluated_items = Vec::with_capacity(raw_items.len());
    let mut ready_count = 0usize;
    let mut warning_count = 0usize;
    let mut duplicate_count = 0usize;
    let mut skipped_count = 0usize;
    let mut folder_set: HashSet<String> = HashSet::new();
    let mut has_items_without_folder = false;

    for (index, raw) in raw_items.into_iter().enumerate() {
        let mut item = finalize_item(index, raw, folder_as_tag);

        if let Some(ref folder) = item.source_folder {
            folder_set.insert(folder.clone());
        } else {
            has_items_without_folder = true;
        }

        if item.skip_reason.is_some() {
            item.status = "skipped".to_string();
            item.is_duplicate = false;
            skipped_count += 1;
        } else {
            let key = make_dedup_key(&item.category, &item.title, &item.username, &item.url);
            if seen_keys.contains(&key) {
                item.is_duplicate = true;
                item.status = "duplicate".to_string();
                duplicate_count += 1;
            } else {
                seen_keys.insert(key);
                item.is_duplicate = false;
                if item.warning.is_some() {
                    item.status = "warning".to_string();
                    warning_count += 1;
                } else {
                    item.status = "ready".to_string();
                    ready_count += 1;
                }
            }
        }

        evaluated_items.push(item);
    }

    let mut source_folders: Vec<String> = folder_set.into_iter().collect();
    source_folders.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()).then(a.cmp(b)));

    Ok(EvaluatedImportBatch {
        provider: provider.canonical_id().to_string(),
        provider_label: provider.label().to_string(),
        detected_format,
        total_parsed: evaluated_items.len(),
        ready_count,
        warning_count,
        duplicate_count,
        skipped_count,
        source_folders,
        has_items_without_folder,
        items: evaluated_items,
    })
}

fn finalize_item(index: usize, raw: RawImportItem, folder_as_tag: bool) -> EvaluatedImportItem {
    let source_folder = raw
        .source_folder
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned);

    if let Some(reason) = raw.pre_skip_reason {
        let display_title = if raw.title.trim().is_empty() {
            "Elemento ignorato".to_string()
        } else {
            truncate_title(raw.title.trim(), 140).0
        };
        return EvaluatedImportItem {
            index,
            title: display_title,
            username: raw.username.trim().to_string(),
            password: String::new(),
            url: raw.url.trim().to_string(),
            category: normalize_category(&raw.category),
            notes: String::new(),
            fields: BTreeMap::new(),
            favorite: raw.favorite,
            source_folder,
            tags: Vec::new(),
            created_at: None,
            updated_at: None,
            status: "skipped".to_string(),
            is_duplicate: false,
            warning: None,
            skip_reason: Some(reason),
        };
    }

    let created_at = raw.created_at;
    let updated_at = raw.updated_at;
    let mut category = normalize_category(&raw.category);
    let username = raw.username.trim().to_string();
    let mut password = clean_password(&raw.password);
    let url = raw.url.trim().to_string();
    let mut notes = raw.notes.trim().to_string();
    let mut fields = clean_extra_fields(&raw.fields);
    let mut warning = raw.warning;

    let candidate_title = if !raw.title.trim().is_empty() {
        raw.title.trim().to_string()
    } else if let Some(host) = host_from_url(&url) {
        host
    } else if !username.is_empty() {
        username.clone()
    } else if category == "note" {
        notes
            .lines()
            .map(str::trim)
            .find(|l| !l.is_empty())
            .map(ToOwned::to_owned)
            .unwrap_or_default()
    } else if !password.is_empty() || !notes.is_empty() || !fields.is_empty() {
        "Senza titolo".to_string()
    } else {
        String::new()
    };

    if candidate_title.is_empty()
        && username.is_empty()
        && password.is_empty()
        && url.is_empty()
        && notes.is_empty()
        && fields.is_empty()
    {
        return EvaluatedImportItem {
            index,
            title: "Voce vuota".to_string(),
            username,
            password,
            url,
            category,
            notes,
            fields,
            favorite: raw.favorite,
            source_folder,
            tags: Vec::new(),
            created_at: None,
            updated_at: None,
            status: "skipped".to_string(),
            is_duplicate: false,
            warning: None,
            skip_reason: Some("Voce vuota".to_string()),
        };
    }

    let full_title = if candidate_title.is_empty() {
        "Senza titolo".to_string()
    } else {
        candidate_title
    };
    let (title, was_truncated) = truncate_title(&full_title, 140);
    if was_truncated {
        append_note_section(&mut notes, None, &format!("Titolo completo: {full_title}"));
    }

    // Build deduplicated tags
    let mut tags: Vec<String> = Vec::new();
    let mut push_tag = |raw_tag: &str| {
        let cleaned = raw_tag.replace(',', " ").trim().to_string();
        if !cleaned.is_empty()
            && !tags.iter().any(|existing| existing.eq_ignore_ascii_case(&cleaned))
        {
            tags.push(cleaned);
        }
    };

    if let Some(existing_tags) = fields.get("tags").cloned() {
        for t in existing_tags.split(',') {
            push_tag(t);
        }
    }
    for t in &raw.extra_tags {
        push_tag(t);
    }
    if folder_as_tag {
        for ft in &raw.folder_tags {
            push_tag(ft);
        }
        if let Some(ref sf) = source_folder {
            push_tag(sf);
        }
    }

    if !tags.is_empty() {
        fields.insert("tags".to_string(), tags.join(", "));
    } else {
        fields.remove("tags");
    }

    if validate_credential_fields(&category, &password, &notes, &fields).is_err() {
        let has_non_tag_extra = fields.keys().any(|k| k != "tags");
        let has_metadata =
            !username.is_empty() || !url.is_empty() || !notes.is_empty() || has_non_tag_extra;

        if !has_metadata {
            let reason = match category.as_str() {
                "note" => "Nota vuota",
                "card" => "Numero carta mancante",
                "ssh" => "Password e chiave privata SSH mancanti",
                "api_key" => "Chiave API / token mancante",
                "license" => "Chiave di licenza mancante",
                _ => "Password mancante",
            };
            return EvaluatedImportItem {
                index,
                title,
                username,
                password: String::new(),
                url,
                category,
                notes: String::new(),
                fields,
                favorite: raw.favorite,
                source_folder,
                tags,
                created_at: None,
                updated_at: None,
                status: "skipped".to_string(),
                is_duplicate: false,
                warning: None,
                skip_reason: Some(reason.to_string()),
            };
        }

        // Convert secretless item with meaningful metadata into a Secure Note
        let orig_cat = category.clone();
        let mut fallback_lines = Vec::new();
        if orig_cat != "note" {
            fallback_lines.push(format!("Categoria originale: {orig_cat}"));
        }
        if !username.is_empty() {
            fallback_lines.push(format!("Username: {username}"));
        }
        if !url.is_empty() {
            fallback_lines.push(format!("URL: {url}"));
        }
        for (k, v) in &fields {
            if k != "tags" && k != "totp" {
                fallback_lines.push(format!("{k}: {v}"));
            }
        }
        if !fallback_lines.is_empty() {
            append_note_section(&mut notes, Some("Dettagli importati:"), &fallback_lines.join("\n"));
        }

        let fallback_warning = match orig_cat.as_str() {
            "ssh" => "Password e chiave privata mancanti: importata come Nota Sicura",
            "card" => "Numero carta mancante: importata come Nota Sicura",
            "api_key" => "Token mancante: importata come Nota Sicura",
            "license" => "Chiave di licenza mancante: importata come Nota Sicura",
            "note" => "Nota ricostruita dai metadati disponibili",
            _ => "Password mancante: importata come Nota Sicura",
        };
        if warning.is_none() {
            warning = Some(fallback_warning.to_string());
        }

        category = "note".to_string();
        password.clear();
    }

    EvaluatedImportItem {
        index,
        title,
        username,
        password,
        url,
        category,
        notes,
        fields,
        favorite: raw.favorite,
        source_folder,
        tags,
        created_at,
        updated_at,
        status: "ready".to_string(),
        is_duplicate: false,
        warning,
        skip_reason: None,
    }
}

pub(crate) fn parse_import_timestamp(raw: &str) -> Option<DateTime<Utc>> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    let parsed = if let Ok(dt) = DateTime::parse_from_rfc3339(trimmed) {
        Some(dt.with_timezone(&Utc))
    } else if let Ok(dt) = DateTime::parse_from_str(trimmed, "%Y-%m-%d %H:%M:%S%.f %:z")
        .or_else(|_| DateTime::parse_from_str(trimmed, "%Y-%m-%d %H:%M:%S %:z"))
        .or_else(|_| DateTime::parse_from_str(trimmed, "%Y-%m-%d %H:%M:%S%.f %z"))
        .or_else(|_| DateTime::parse_from_str(trimmed, "%Y-%m-%d %H:%M:%S %z"))
    {
        Some(dt.with_timezone(&Utc))
    } else if let Some(ndt) = [
        "%Y-%m-%dT%H:%M:%S%.f",
        "%Y-%m-%d %H:%M:%S%.f",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%Y/%m/%d %H:%M:%S",
    ]
    .iter()
    .find_map(|fmt| NaiveDateTime::parse_from_str(trimmed, fmt).ok())
    {
        Some(ndt.and_utc())
    } else if let Ok(nd) = NaiveDate::parse_from_str(trimmed, "%Y-%m-%d") {
        nd.and_hms_opt(0, 0, 0).map(|ndt| ndt.and_utc())
    } else if let Ok(epoch) = trimmed.parse::<i64>() {
        if epoch >= 1_000_000_000_000 {
            DateTime::from_timestamp_millis(epoch)
        } else if epoch >= 100_000_000 {
            DateTime::from_timestamp(epoch, 0)
        } else {
            None
        }
    } else {
        None
    }?;

    let min_valid = DateTime::from_timestamp(631_152_000, 0)?; // 1990-01-01T00:00:00Z
    let max_valid = Utc::now() + Duration::days(1);
    if parsed < min_valid || parsed > max_valid {
        return None;
    }

    Some(parsed)
}

pub(crate) fn apply_imported_totp(
    raw_totp: &str,
    fields: &mut BTreeMap<String, String>,
    notes: &mut String,
) {
    let clean = raw_totp.trim();
    if clean.is_empty() {
        return;
    }
    if let Ok(normalized) = crate::otp::normalize_totp_storage_value(clean) {
        fields.insert("totp".to_string(), normalized);
    } else {
        append_note_section(notes, None, &format!("TOTP: {clean}"));
    }
}

pub(crate) fn clean_password(raw: &str) -> String {
    if raw.trim().is_empty() {
        String::new()
    } else {
        raw.to_string()
    }
}

pub(crate) fn parse_bool_flag(raw: &str) -> bool {
    matches!(
        raw.trim().to_lowercase().as_str(),
        "1" | "true" | "yes" | "y" | "si" | "sì"
    )
}

pub(crate) fn append_note_section(notes: &mut String, heading: Option<&str>, content: &str) {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return;
    }
    if !notes.is_empty() {
        notes.push_str("\n\n");
    }
    if let Some(h) = heading {
        notes.push_str(h);
        notes.push('\n');
    }
    notes.push_str(trimmed);
}

pub(crate) fn host_from_url(raw_url: &str) -> Option<String> {
    let trimmed = raw_url.trim();
    if trimmed.is_empty() {
        return None;
    }
    let without_scheme = trimmed
        .split_once("://")
        .map(|(_, rest)| rest)
        .unwrap_or(trimmed);
    let authority = without_scheme
        .split(['/', '?', '#'])
        .next()
        .unwrap_or("")
        .trim();
    if authority.is_empty() {
        return None;
    }
    let host_no_user = authority
        .rsplit_once('@')
        .map(|(_, h)| h)
        .unwrap_or(authority);
    let host = if host_no_user.starts_with('[') {
        host_no_user
    } else {
        host_no_user
            .split_once(':')
            .map(|(h, _)| h)
            .unwrap_or(host_no_user)
    };
    let clean = host
        .strip_prefix("www.")
        .unwrap_or(host)
        .trim();
    if clean.is_empty() {
        None
    } else {
        Some(clean.to_string())
    }
}

pub(crate) fn normalize_url_for_dedup(raw_url: &str) -> String {
    raw_url.trim().trim_end_matches('/').to_lowercase()
}

pub(crate) fn make_dedup_key(
    category: &str,
    title: &str,
    username: &str,
    url: &str,
) -> DedupKey {
    (
        category.trim().to_lowercase(),
        title.trim().to_lowercase(),
        username.trim().to_lowercase(),
        normalize_url_for_dedup(url),
    )
}

fn truncate_title(raw: &str, max_bytes: usize) -> (String, bool) {
    if raw.len() <= max_bytes {
        return (raw.to_string(), false);
    }
    let ellipsis = '…';
    let budget = max_bytes.saturating_sub(ellipsis.len_utf8());
    let mut end_idx = 0;
    for (idx, ch) in raw.char_indices() {
        if idx + ch.len_utf8() > budget {
            break;
        }
        end_idx = idx + ch.len_utf8();
    }
    let mut out = raw[..end_idx].trim_end().to_string();
    out.push(ellipsis);
    (out, true)
}

pub(crate) fn detect_provider_hint_from_headers(
    headers: &[String],
    current_provider_id: &str,
) -> Option<String> {
    let has = |col: &str| headers.iter().any(|h| h == col);

    let suggested = if has("login_username") || has("login_password") || has("login_uri") {
        Some(("bitwarden", "Bitwarden"))
    } else if has("grouping") && has("extra") && has("fav") {
        Some(("lastpass", "LastPass"))
    } else if has("httprealm") || has("formactionorigin") {
        Some(("firefox", "Mozilla Firefox"))
    } else if has("otpsecret") || (has("username2") && has("username3")) {
        Some(("dashlane", "Dashlane"))
    } else if has("vault") && has("totp") && has("email") {
        Some(("protonpass", "Proton Pass"))
    } else if has("cardnumber") || has("cardholdername") {
        Some(("nordpass", "NordPass"))
    } else if (has("group") && has("title") && has("username") && has("password"))
        || (has("account") && has("login name") && has("web site"))
    {
        Some(("keepass", "KeePass / KeePassXC"))
    } else if has("one-time password") || (has("otpauth") && has("tags")) {
        Some(("1password", "1Password"))
    } else if has("otpauth") && has("title") && has("notes") {
        Some(("safari", "Safari / Password Apple"))
    } else if has("name") && has("url") && has("username") && has("password") {
        Some(("chrome", "Chrome / Edge / Brave"))
    } else {
        None
    };

    if let Some((id, label)) = suggested {
        if id != current_provider_id {
            return Some(format!(
                "Il file sembra un export CSV di {label}. Seleziona '{label}' (oppure 'CSV Generico') prima di importarlo."
            ));
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn csv_parser_handles_bom_semicolons_multiline_and_escaped_quotes() {
        let csv = "\u{feff}name;url;username;password;note\n\"App \"\"Prod\"\"\";https://prod.example.com;admin;p@ss\"123;\"Riga 1\nRiga 2\"\n;;;\n";
        let batch = evaluate_import("chrome", csv, Some("chrome.csv"), true, &HashSet::new()).unwrap();
        assert_eq!(batch.total_parsed, 1);
        let item = &batch.items[0];
        assert_eq!(item.title, "App \"Prod\"");
        assert_eq!(item.password, "p@ss\"123");
        assert_eq!(item.notes, "Riga 1\nRiga 2");
    }

    #[test]
    fn csv_parser_rejects_unclosed_quotes() {
        let csv = "name,url,username,password,note\n\"Unclosed,https://a.com,u,p,n";
        assert!(evaluate_import("chrome", csv, None, true, &HashSet::new()).is_err());
    }

    #[test]
    fn bitwarden_json_handles_all_types_nulls_folders_collections_and_trash() {
        let json = r#"{
            "encrypted": false,
            "folders": [
                { "id": "f1", "name": "Infrastruttura" },
                { "id": "f2", "name": null }
            ],
            "collections": [
                { "id": "c1", "name": "Team DevOps" }
            ],
            "items": [
                {
                    "type": 1,
                    "folderId": "f1",
                    "collectionIds": ["c1"],
                    "name": "GitHub Org",
                    "notes": null,
                    "favorite": true,
                    "deletedDate": null,
                    "fields": [
                        { "name": "Recovery", "value": 987654, "type": 0 },
                        { "name": null, "value": null, "type": 0 }
                    ],
                    "login": {
                        "uris": [
                            { "uri": "https://github.com/login" },
                            { "uri": "https://api.github.com" },
                            { "uri": null }
                        ],
                        "username": "devops@starward.io",
                        "password": "Secret!Password1",
                        "totp": "otpauth://totp/GitHub"
                    },
                    "card": null,
                    "identity": null,
                    "sshKey": null
                },
                {
                    "type": 2,
                    "folderId": null,
                    "collectionIds": null,
                    "name": "Codici Wifi",
                    "notes": "WPA2: Test1234",
                    "favorite": null
                },
                {
                    "type": 3,
                    "name": "Carta Aziendale",
                    "card": {
                        "cardholderName": "Mario Rossi",
                        "brand": "Visa",
                        "number": "4111222233334444",
                        "expMonth": 4,
                        "expYear": "2029",
                        "code": "999"
                    }
                },
                {
                    "type": 4,
                    "name": "Mario Identity",
                    "identity": {
                        "firstName": "Mario",
                        "lastName": "Rossi",
                        "email": "mario@acme.it",
                        "city": "Milano"
                    }
                },
                {
                    "type": 5,
                    "name": "Prod Bastion SSH",
                    "sshKey": {
                        "privateKey": "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----",
                        "publicKey": "ssh-ed25519 AAAA...",
                        "keyFingerprint": "SHA256:xyz"
                    }
                },
                {
                    "type": 1,
                    "name": "Deleted Entry",
                    "deletedDate": "2026-01-01T00:00:00.000Z",
                    "login": { "username": "old", "password": "old" }
                }
            ]
        }"#;

        let batch = evaluate_import("bitwarden", json, Some("bw.json"), true, &HashSet::new()).unwrap();
        assert_eq!(batch.detected_format, "JSON");
        assert_eq!(batch.total_parsed, 6);
        assert_eq!(batch.ready_count, 4);
        assert_eq!(batch.warning_count, 1);
        assert_eq!(batch.skipped_count, 1);
        assert_eq!(batch.source_folders, vec!["Infrastruttura"]);
        assert!(batch.has_items_without_folder);

        // Login
        let login = &batch.items[0];
        assert_eq!(login.category, "login");
        assert_eq!(login.url, "https://github.com/login");
        assert!(login.favorite);
        assert!(login.notes.contains("https://api.github.com"));
        assert!(login.notes.contains("TOTP: otpauth://totp/GitHub"));
        assert!(login.notes.contains("Recovery: 987654"));
        assert_eq!(login.tags, vec!["Infrastruttura", "Team DevOps"]);

        // Secure Note
        let note = &batch.items[1];
        assert_eq!(note.category, "note");
        assert_eq!(note.notes, "WPA2: Test1234");

        // Card
        let card = &batch.items[2];
        assert_eq!(card.category, "card");
        assert_eq!(card.username, "Mario Rossi");
        assert_eq!(card.password, "4111222233334444");
        assert_eq!(card.fields.get("brand").map(String::as_str), Some("Visa"));
        assert_eq!(card.fields.get("cvv").map(String::as_str), Some("999"));
        assert_eq!(card.fields.get("expiry").map(String::as_str), Some("04/29"));

        // Identity -> Note with warning
        let ident = &batch.items[3];
        assert_eq!(ident.category, "note");
        assert_eq!(ident.status, "warning");
        assert!(ident.warning.is_some());
        assert!(ident.notes.contains("Mario Rossi"));
        assert!(ident.tags.contains(&"identity".to_string()));

        // SSH Key
        let ssh = &batch.items[4];
        assert_eq!(ssh.category, "ssh");
        assert!(ssh.fields.get("private_key").unwrap().contains("OPENSSH"));
        assert_eq!(ssh.fields.get("public_key").map(String::as_str), Some("ssh-ed25519 AAAA..."));
        assert!(ssh.notes.contains("Fingerprint SSH: SHA256:xyz"));

        // Deleted item skipped
        let deleted = &batch.items[5];
        assert_eq!(deleted.status, "skipped");
        assert!(deleted.skip_reason.as_deref().unwrap().contains("cestino"));
    }

    #[test]
    fn bitwarden_json_rejects_encrypted_or_invalid_exports() {
        let encrypted = r#"{ "encrypted": true, "items": [] }"#;
        let err = evaluate_import("bitwarden", encrypted, None, true, &HashSet::new()).unwrap_err();
        assert!(err.to_string().contains("cifrato"));

        let not_bw = r#"{ "foo": "bar" }"#;
        let err = evaluate_import("bitwarden", not_bw, None, true, &HashSet::new()).unwrap_err();
        assert!(err.to_string().contains("items"));
    }

    #[test]
    fn bitwarden_csv_parses_personal_and_org_collections() {
        let csv = "folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\nWork,1,login,Portal,Main portal,\"PIN: 4242\",0,\"https://a.it, https://b.it\",alice,Pass123!,JBSWY3DPEHPK3PXP\n,0,note,Secret Note,Only notes,,,,,";
        let batch = evaluate_import("bitwarden", csv, Some("bw.csv"), true, &HashSet::new()).unwrap();
        assert_eq!(batch.detected_format, "CSV");
        assert_eq!(batch.total_parsed, 2);
        assert_eq!(batch.items[0].url, "https://a.it");
        assert!(batch.items[0].notes.contains("https://b.it"));
        assert_eq!(
            batch.items[0].fields.get("totp").map(String::as_str),
            Some("JBSWY3DPEHPK3PXP")
        );
        assert!(!batch.items[0].notes.contains("TOTP:"));
        assert!(batch.items[0].notes.contains("PIN: 4242"));
        assert_eq!(batch.items[0].source_folder.as_deref(), Some("Work"));
        assert_eq!(batch.items[1].category, "note");
    }

    #[test]
    fn importers_store_valid_totp_in_fields_and_fallback_invalid_to_notes() {
        let bw_json = r#"{
            "encrypted": false,
            "items": [
                {
                    "type": 1,
                    "name": "GitHub Valid Base32",
                    "login": {
                        "username": "alice",
                        "password": "pw",
                        "totp": " jbsw-y3dp ehpk 3pxp "
                    }
                },
                {
                    "type": 1,
                    "name": "AWS Valid URI",
                    "login": {
                        "username": "bob",
                        "password": "pw",
                        "totp": "otpauth://totp/AWS:bob?secret=JBSWY3DPEHPK3PXP&algorithm=SHA256&digits=8&period=60"
                    }
                },
                {
                    "type": 1,
                    "name": "Invalid Placeholder",
                    "login": {
                        "username": "carol",
                        "password": "pw",
                        "totp": "hardware-key"
                    }
                }
            ]
        }"#;
        let batch = evaluate_import("bitwarden", bw_json, None, true, &HashSet::new()).unwrap();
        assert_eq!(
            batch.items[0].fields.get("totp").map(String::as_str),
            Some("JBSWY3DPEHPK3PXP")
        );
        assert_eq!(
            batch.items[1].fields.get("totp").map(String::as_str),
            Some("otpauth://totp/AWS:bob?secret=JBSWY3DPEHPK3PXP&algorithm=SHA256&digits=8&period=60")
        );
        assert!(batch.items[2].fields.get("totp").is_none());
        assert!(batch.items[2].notes.contains("TOTP: hardware-key"));

        let op = "Title,URL,Username,Password,OTPAuth\nStripe,https://stripe.com,ops,pw,otpauth://totp/Stripe?secret=JBSWY3DPEHPK3PXP";
        let op_batch = evaluate_import("1password", op, None, true, &HashSet::new()).unwrap();
        assert_eq!(
            op_batch.items[0].fields.get("totp").map(String::as_str),
            Some("otpauth://totp/Stripe?secret=JBSWY3DPEHPK3PXP")
        );

        let sf = "Title,URL,Username,Password,Notes,OTPAuth\nApple,https://apple.com,a@b.c,pw,,jbswy3dpehpk3pxp";
        let sf_batch = evaluate_import("safari", sf, None, true, &HashSet::new()).unwrap();
        assert_eq!(
            sf_batch.items[0].fields.get("totp").map(String::as_str),
            Some("JBSWY3DPEHPK3PXP")
        );

        let pp = "name,url,username,email,password,note,totp,vault,type\nProton,https://proton.me,u,u@pm.me,pw,,JBSWY3DPEHPK3PXP,Personal,login";
        let pp_batch = evaluate_import("protonpass", pp, None, true, &HashSet::new()).unwrap();
        assert_eq!(
            pp_batch.items[0].fields.get("totp").map(String::as_str),
            Some("JBSWY3DPEHPK3PXP")
        );

        let generic = "title,username,password,url,totp\nGrafana,admin,pw,https://grafana.local,JBSWY3DPEHPK3PXP";
        let gen_batch = evaluate_import("generic_csv", generic, None, true, &HashSet::new()).unwrap();
        assert_eq!(
            gen_batch.items[0].fields.get("totp").map(String::as_str),
            Some("JBSWY3DPEHPK3PXP")
        );
    }

    #[test]
    fn all_other_providers_parse_cleanly() {
        // 1Password
        let op = "Title,URL,Username,Password,OTPAuth,Favorite,Tags,Notes,Type\nStripe,https://stripe.com,ops,sk_123,otpauth://1p,true,\"billing, prod\",API access,API Credential";
        let b = evaluate_import("1password", op, None, true, &HashSet::new()).unwrap();
        assert_eq!(b.items[0].category, "api_key");
        assert_eq!(b.items[0].tags, vec!["billing", "prod"]);

        // LastPass (login + card + ssh + database + note)
        let lp = "url,username,password,totp,extra,name,grouping,fav\n\
            https://lp.com,user,pw123,TOTP1,Note body,Portal,Dev,1\n\
            http://sn,,,,\"NoteType:Payment Card\nName on Card:Mario\nNumber:40001234\nSecurity Code:123\nType:Mastercard\nExpiration Month:11\nExpiration Year:2028\",My Card,Finance,0\n\
            http://sn,,,,\"NoteType:SSH Key\nHostname:10.0.0.1\nUsername:root\nPrivate Key:-----BEGIN KEY-----\n\",Server Key,Ops,0\n\
            http://sn,,,,\"NoteType:Database\nType:PostgreSQL\nHostname:db.int\nPort:5432\nDatabase:app\nUsername:pg\nPassword:dbpw\",Prod DB,Ops,0\n\
            http://sn,,,,Just plain secret note,Plain Note,,0";
        let b = evaluate_import("lastpass", lp, None, true, &HashSet::new()).unwrap();
        assert_eq!(b.total_parsed, 5);
        assert_eq!(b.items[0].category, "login");
        assert_eq!(b.items[0].source_folder.as_deref(), Some("Dev"));
        assert_eq!(b.items[1].category, "card");
        assert_eq!(b.items[1].fields.get("expiry").map(String::as_str), Some("11/28"));
        assert_eq!(b.items[2].category, "ssh");
        assert_eq!(b.items[3].category, "database");
        assert_eq!(b.items[3].fields.get("db_type").map(String::as_str), Some("postgresql"));
        assert_eq!(b.items[4].category, "note");

        // KeePassXC & KeePass 2.x
        let kp = "Group,Title,Username,Password,URL,Notes,TOTP\nRoot/Servers/Prod,SSH GW,ubuntu,pw,ssh://gw,jump,123456";
        let b = evaluate_import("keepass", kp, None, true, &HashSet::new()).unwrap();
        assert_eq!(b.items[0].source_folder.as_deref(), Some("Servers/Prod"));

        let kp2 = "Account,Login Name,Password,Web Site,Comments\nMail,bob,pw2,https://mail.it,note";
        let b = evaluate_import("keepass", kp2, None, true, &HashSet::new()).unwrap();
        assert_eq!(b.items[0].title, "Mail");

        // Chrome
        let ch = "name,url,username,password,note\n,https://www.example.com/login,alice,pw,";
        let b = evaluate_import("chrome", ch, None, true, &HashSet::new()).unwrap();
        assert_eq!(b.items[0].title, "example.com");

        // Firefox
        let ff = "url,username,password,httpRealm,formActionOrigin,guid\nhttps://sub.site.org/auth,bob,pw,Corp,,{1}";
        let b = evaluate_import("firefox", ff, None, true, &HashSet::new()).unwrap();
        assert_eq!(b.items[0].title, "sub.site.org");
        assert!(b.items[0].notes.contains("Realm: Corp"));

        // Safari
        let sf = "Title,URL,Username,Password,Notes,OTPAuth\nApple,https://apple.com,a@b.c,pw,n,otpauth://x";
        let b = evaluate_import("safari", sf, None, true, &HashSet::new()).unwrap();
        assert!(b.items[0].notes.contains("TOTP: otpauth://x"));

        // Dashlane
        let dl = "title,url,username,username2,username3,password,note,category,otpSecret\nDash,https://d.it,,u2,,pw,n,Cloud,OTP";
        let b = evaluate_import("dashlane", dl, None, true, &HashSet::new()).unwrap();
        assert_eq!(b.items[0].username, "u2");
        assert_eq!(b.items[0].source_folder.as_deref(), Some("Cloud"));

        // Proton Pass
        let pp = "name,url,username,email,password,note,totp,vault,type\nProton,https://proton.me,u,u@pm.me,pw,n,totp,Personal,login";
        let b = evaluate_import("protonpass", pp, None, true, &HashSet::new()).unwrap();
        assert_eq!(b.items[0].source_folder.as_deref(), Some("Personal"));
        assert!(b.items[0].notes.contains("Email: u@pm.me"));

        // NordPass
        let np = "name,url,username,password,note,folder,cardholdername,cardnumber,cvc,expirydate\n\
            Site,https://s.it,u,pw,n,Work,,,,\n\
            Visa,,, ,n,Finance,Mario Rossi,4111000011112222,321,10/29";
        let b = evaluate_import("nordpass", np, None, true, &HashSet::new()).unwrap();
        assert_eq!(b.items[0].category, "login");
        assert_eq!(b.items[1].category, "card");
        assert_eq!(b.items[1].password, "4111000011112222");

        // Generic CSV (Italian)
        let generic = "titolo,utente,segreto,sito,note,categoria,preferito,cartella\nPannello,admin,pw123,https://x.it,nota,login,si,Infra";
        let b = evaluate_import("generic_csv", generic, None, true, &HashSet::new()).unwrap();
        assert_eq!(b.items[0].title, "Pannello");
        assert!(b.items[0].favorite);
        assert_eq!(b.items[0].source_folder.as_deref(), Some("Infra"));
    }

    #[test]
    fn utf8_truncation_and_passwordless_fallback_and_dedup_work() {
        let long_title = "🔐 ".repeat(60); // > 140 bytes with multi-byte emojis
        let json = format!(
            r#"{{
                "encrypted": false,
                "items": [
                    {{
                        "type": 1,
                        "name": "{long_title}",
                        "login": {{ "username": "alice", "password": "pw1", "uris": [{{ "uri": "https://a.com/" }}] }}
                    }},
                    {{
                        "type": 1,
                        "name": "NoPasswordWithUser",
                        "login": {{ "username": "bob", "password": "", "uris": [{{ "uri": "https://b.com" }}] }}
                    }},
                    {{
                        "type": 1,
                        "name": "TitleOnlyEmpty",
                        "login": {{ "username": "", "password": "", "uris": [] }}
                    }},
                    {{
                        "type": 1,
                        "name": "AlreadyExists",
                        "login": {{ "username": "carol", "password": "pw3", "uris": [{{ "uri": "https://c.com/" }}] }}
                    }},
                    {{
                        "type": 1,
                        "name": "AlreadyExists",
                        "login": {{ "username": "carol", "password": "pw3", "uris": [{{ "uri": "https://c.com" }}] }}
                    }}
                ]
            }}"#
        );

        let mut existing = HashSet::new();
        existing.insert(make_dedup_key("login", "AlreadyExists", "carol", "https://c.com"));

        let batch = evaluate_import("bitwarden", &json, None, false, &existing).unwrap();
        assert_eq!(batch.total_parsed, 5);
        assert!(batch.items[0].title.len() <= 140);
        assert!(batch.items[0].title.ends_with('…'));
        assert!(batch.items[0].notes.contains("Titolo completo:"));

        // Passwordless login with metadata -> warning note
        assert_eq!(batch.items[1].category, "note");
        assert_eq!(batch.items[1].status, "warning");
        assert!(batch.items[1].notes.contains("Username: bob"));

        // Title only -> skipped
        assert_eq!(batch.items[2].status, "skipped");
        assert_eq!(batch.items[2].skip_reason.as_deref(), Some("Password mancante"));

        // Both item 3 (matches existing) and item 4 (matches existing) -> duplicate
        assert_eq!(batch.items[3].status, "duplicate");
        assert_eq!(batch.items[4].status, "duplicate");
        assert_eq!(batch.duplicate_count, 2);
    }

    #[test]
    fn provider_mismatch_returns_helpful_hint() {
        let bw_json = r#"{ "items": [] }"#;
        let err = evaluate_import("chrome", bw_json, None, true, &HashSet::new()).unwrap_err();
        assert!(err.to_string().contains("Bitwarden"));

        let bw_csv = "folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\n";
        let err = evaluate_import("1password", bw_csv, None, true, &HashSet::new()).unwrap_err();
        assert!(err.to_string().contains("Bitwarden"));

        let lp_csv = "url,username,password,totp,extra,name,grouping,fav\n";
        let err = evaluate_import("bitwarden", lp_csv, None, true, &HashSet::new()).unwrap_err();
        assert!(err.to_string().contains("LastPass"));
    }

    #[test]
    fn parse_import_timestamp_supports_standard_formats_and_rejects_invalid() {
        assert_eq!(
            parse_import_timestamp("2024-05-12T10:15:30.123Z").map(|d| d.to_rfc3339()),
            Some("2024-05-12T10:15:30.123+00:00".to_string())
        );
        assert_eq!(
            parse_import_timestamp("1715508930000").map(|d| d.timestamp()),
            Some(1_715_508_930)
        );
        assert_eq!(
            parse_import_timestamp("1715508930").map(|d| d.timestamp()),
            Some(1_715_508_930)
        );
        assert_eq!(
            parse_import_timestamp("2024-05-12").map(|d| d.format("%Y-%m-%d").to_string()),
            Some("2024-05-12".to_string())
        );
        assert_eq!(
            parse_import_timestamp("2024-05-12 14:20:00").map(|d| d.format("%Y-%m-%d %H:%M:%S").to_string()),
            Some("2024-05-12 14:20:00".to_string())
        );

        assert!(parse_import_timestamp("").is_none());
        assert!(parse_import_timestamp("0").is_none());
        assert!(parse_import_timestamp("1970-01-01T00:00:00Z").is_none());
        assert!(parse_import_timestamp("not-a-date").is_none());
    }

    #[test]
    fn importers_preserve_timestamps_when_present_and_none_when_absent() {
        let bw_json = r#"{
            "encrypted": false,
            "items": [
                {
                    "type": 1,
                    "name": "With Dates",
                    "creationDate": "2023-01-15T08:30:00.000Z",
                    "revisionDate": "2024-06-20T14:45:10.000Z",
                    "login": { "username": "u", "password": "p" }
                },
                {
                    "type": 1,
                    "name": "No Dates",
                    "login": { "username": "u2", "password": "p2" }
                }
            ]
        }"#;
        let bw_batch = evaluate_import("bitwarden", bw_json, Some("bw.json"), false, &HashSet::new()).unwrap();
        assert_eq!(
            bw_batch.items[0].created_at.map(|d| d.format("%Y-%m-%d").to_string()),
            Some("2023-01-15".to_string())
        );
        assert_eq!(
            bw_batch.items[0].updated_at.map(|d| d.format("%Y-%m-%d").to_string()),
            Some("2024-06-20".to_string())
        );
        assert!(bw_batch.items[1].created_at.is_none());
        assert!(bw_batch.items[1].updated_at.is_none());

        let ff_csv = "url,username,password,httpRealm,formActionOrigin,guid,timeCreated,timeLastUsed,timePasswordChanged\n\
            https://example.org,alice,pw,,,{1},1700000000000,1705000000000,1710000000000\n\
            https://fallback.org,bob,pw2,,,{2},1700000000000,1706000000000,0";
        let ff_batch = evaluate_import("firefox", ff_csv, None, false, &HashSet::new()).unwrap();
        assert_eq!(ff_batch.items[0].created_at.map(|d| d.timestamp()), Some(1_700_000_000));
        assert_eq!(ff_batch.items[0].updated_at.map(|d| d.timestamp()), Some(1_710_000_000));
        assert_eq!(ff_batch.items[1].created_at.map(|d| d.timestamp()), Some(1_700_000_000));
        assert_eq!(ff_batch.items[1].updated_at.map(|d| d.timestamp()), Some(1_706_000_000));

        let kp_csv = "Group,Title,Username,Password,URL,Notes,Created,Last Modified\nWork,Server,root,pw,https://srv,,2022-03-10 09:00:00,2024-04-11 12:00:00";
        let kp_batch = evaluate_import("keepass", kp_csv, None, false, &HashSet::new()).unwrap();
        assert_eq!(
            kp_batch.items[0].created_at.map(|d| d.format("%Y-%m-%d").to_string()),
            Some("2022-03-10".to_string())
        );
        assert_eq!(
            kp_batch.items[0].updated_at.map(|d| d.format("%Y-%m-%d").to_string()),
            Some("2024-04-11".to_string())
        );

        let pp_csv = "name,url,username,email,password,note,totp,vault,type,createTime,modifyTime\nProton,https://proton.me,u,u@pm.me,pw,n,,Personal,login,1680000000,1715000000";
        let pp_batch = evaluate_import("protonpass", pp_csv, None, false, &HashSet::new()).unwrap();
        assert_eq!(pp_batch.items[0].created_at.map(|d| d.timestamp()), Some(1_680_000_000));
        assert_eq!(pp_batch.items[0].updated_at.map(|d| d.timestamp()), Some(1_715_000_000));

        let gen_csv = "titolo,utente,segreto,creata,ultima modifica\nPortal,admin,pw123,2023-07-01,2024-08-15";
        let gen_batch = evaluate_import("generic_csv", gen_csv, None, false, &HashSet::new()).unwrap();
        assert_eq!(
            gen_batch.items[0].created_at.map(|d| d.format("%Y-%m-%d").to_string()),
            Some("2023-07-01".to_string())
        );
        assert_eq!(
            gen_batch.items[0].updated_at.map(|d| d.format("%Y-%m-%d").to_string()),
            Some("2024-08-15".to_string())
        );
    }
}
