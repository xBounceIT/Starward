use std::collections::HashSet;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::Utc;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    auth::AuthenticatedUser,
    error::{AppError, AppResult},
    importers::{
        all_provider_dtos, evaluate_import, make_dedup_key, DedupKey, EvaluatedImportItem,
    },
    models::{
        ImportPreviewResponseDto, ImportProviderDto, ImportResultDto, ImportSkippedItemDto,
        ImportVaultRequest,
    },
    routes::{
        credentials::encrypt_extra_fields, record_audit, require_vault_role,
    },
    AppState,
};

pub const MAX_IMPORT_BYTES: usize = 10 * 1024 * 1024;
pub const MAX_IMPORT_ITEMS: usize = 5_000;
const MAX_SKIPPED_DETAILS: usize = 200;

#[derive(Debug)]
pub(crate) struct SelectedImportPlan<'a> {
    pub to_insert: Vec<&'a EvaluatedImportItem>,
    pub duplicate_skipped_count: usize,
    pub invalid_skipped_count: usize,
    pub skipped_items: Vec<ImportSkippedItemDto>,
}

pub(crate) fn select_items_for_import<'a>(
    items: &'a [EvaluatedImportItem],
    duplicate_strategy: &str,
    selected_indices: Option<&[usize]>,
    include_source_folders: Option<&[String]>,
) -> SelectedImportPlan<'a> {
    let selected_set: Option<HashSet<usize>> =
        selected_indices.map(|indices| indices.iter().copied().collect());

    let folder_filter: Option<(bool, HashSet<String>)> =
        include_source_folders.map(|folders| {
            let mut include_none = false;
            let mut names = HashSet::new();
            for f in folders {
                let trimmed = f.trim();
                if trimmed.is_empty() || trimmed == "__none__" {
                    include_none = true;
                } else {
                    names.insert(trimmed.to_lowercase());
                }
            }
            (include_none, names)
        });

    let mut to_insert = Vec::new();
    let mut duplicate_skipped_count = 0usize;
    let mut invalid_skipped_count = 0usize;
    let mut skipped_items = Vec::new();

    for item in items {
        if let Some((include_none, ref allowed_names)) = folder_filter {
            let matches_folder = match item.source_folder {
                Some(ref fname) => allowed_names.contains(&fname.trim().to_lowercase()),
                None => include_none,
            };
            if !matches_folder {
                continue;
            }
        }

        if let Some(ref reason) = item.skip_reason {
            invalid_skipped_count += 1;
            if skipped_items.len() < MAX_SKIPPED_DETAILS {
                skipped_items.push(ImportSkippedItemDto {
                    index: item.index,
                    title: item.title.clone(),
                    reason: reason.clone(),
                });
            }
            continue;
        }

        if item.is_duplicate && duplicate_strategy == "skip" {
            duplicate_skipped_count += 1;
            if skipped_items.len() < MAX_SKIPPED_DETAILS {
                skipped_items.push(ImportSkippedItemDto {
                    index: item.index,
                    title: item.title.clone(),
                    reason: "Duplicato già presente".to_string(),
                });
            }
            continue;
        }

        if let Some(ref sel) = selected_set {
            if !sel.contains(&item.index) {
                continue;
            }
        }

        to_insert.push(item);
    }

    SelectedImportPlan {
        to_insert,
        duplicate_skipped_count,
        invalid_skipped_count,
        skipped_items,
    }
}

fn format_import_audit_details(
    imported_count: usize,
    provider_label: &str,
    detected_format: &str,
    duplicate_skipped_count: usize,
    invalid_skipped_count: usize,
) -> String {
    let base = if imported_count == 1 {
        format!(
            "Importata 1 credenziale da {} ({})",
            provider_label, detected_format
        )
    } else {
        format!(
            "Importate {} credenziali da {} ({})",
            imported_count, provider_label, detected_format
        )
    };

    let mut notes = Vec::new();
    if duplicate_skipped_count > 0 {
        notes.push(if duplicate_skipped_count == 1 {
            "1 duplicato ignorato".to_string()
        } else {
            format!("{duplicate_skipped_count} duplicati ignorati")
        });
    }
    if invalid_skipped_count > 0 {
        notes.push(if invalid_skipped_count == 1 {
            "1 voce non valida saltata".to_string()
        } else {
            format!("{invalid_skipped_count} voci non valide saltate")
        });
    }

    if notes.is_empty() {
        base
    } else {
        format!("{base} ({})", notes.join(", "))
    }
}

fn validate_import_content(content: &str) -> AppResult<()> {
    if content.trim().is_empty() {
        return Err(AppError::BadRequest(
            "Il file da importare è vuoto.".to_string(),
        ));
    }
    if content.len() > MAX_IMPORT_BYTES {
        return Err(AppError::BadRequest(
            "Il file supera il limite massimo di 10 MB.".to_string(),
        ));
    }
    Ok(())
}

async fn load_existing_dedup_keys(db: &PgPool, vault_id: &str) -> AppResult<HashSet<DedupKey>> {
    let rows: Vec<(String, String, String, String)> = sqlx::query_as(
        "SELECT category, title, username, url FROM credentials WHERE vault_id = $1",
    )
    .bind(vault_id)
    .fetch_all(db)
    .await?;

    Ok(rows
        .into_iter()
        .map(|(cat, title, username, url)| make_dedup_key(&cat, &title, &username, &url))
        .collect())
}

pub async fn list_import_providers(
    _user: AuthenticatedUser,
) -> AppResult<Json<Vec<ImportProviderDto>>> {
    Ok(Json(all_provider_dtos()))
}

pub async fn preview_vault_import(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(vault_id): Path<String>,
    Json(payload): Json<ImportVaultRequest>,
) -> AppResult<Json<ImportPreviewResponseDto>> {
    require_vault_role(&state.db, &vault_id, &user, &["owner", "editor"]).await?;
    validate_import_content(&payload.content)?;

    let existing_keys = load_existing_dedup_keys(&state.db, &vault_id).await?;
    let batch = evaluate_import(
        &payload.provider,
        &payload.content,
        payload.filename.as_deref(),
        payload.folder_as_tag,
        &existing_keys,
    )?;

    if batch.items.len() > MAX_IMPORT_ITEMS {
        return Err(AppError::BadRequest(format!(
            "Il file contiene {} voci (massimo consentito: {} per importazione).",
            batch.items.len(),
            MAX_IMPORT_ITEMS
        )));
    }

    Ok(Json(batch.to_preview_response()))
}

pub async fn import_vault(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(vault_id): Path<String>,
    Json(payload): Json<ImportVaultRequest>,
) -> AppResult<(StatusCode, Json<ImportResultDto>)> {
    require_vault_role(&state.db, &vault_id, &user, &["owner", "editor"]).await?;
    validate_import_content(&payload.content)?;

    let duplicate_strategy = payload.duplicate_strategy.trim().to_lowercase();
    if duplicate_strategy != "skip" && duplicate_strategy != "import_all" {
        return Err(AppError::BadRequest(
            "Strategia duplicati non valida: usa 'skip' o 'import_all'.".to_string(),
        ));
    }

    let existing_keys = load_existing_dedup_keys(&state.db, &vault_id).await?;
    let batch = evaluate_import(
        &payload.provider,
        &payload.content,
        payload.filename.as_deref(),
        payload.folder_as_tag,
        &existing_keys,
    )?;

    if batch.items.len() > MAX_IMPORT_ITEMS {
        return Err(AppError::BadRequest(format!(
            "Il file contiene {} voci (massimo consentito: {} per importazione).",
            batch.items.len(),
            MAX_IMPORT_ITEMS
        )));
    }

    let plan = select_items_for_import(
        &batch.items,
        &duplicate_strategy,
        payload.selected_indices.as_deref(),
        payload.include_source_folders.as_deref(),
    );

    let now = Utc::now();
    let mut tx = state.db.begin().await?;
    let mut imported_count = 0usize;

    for item in plan.to_insert {
        let enc_password = state.crypto.encrypt(&item.password)?;
        let enc_notes = state.crypto.encrypt(&item.notes)?;
        let (extra_fields_ciphertext, extra_fields_nonce) =
            encrypt_extra_fields(&state.crypto, &item.fields)?;

        let cred_id = Uuid::new_v4().to_string();

        sqlx::query(
            r#"
            INSERT INTO credentials (
                id, vault_id, title, username, url, category,
                password_ciphertext, password_nonce,
                notes_ciphertext, notes_nonce,
                extra_fields_ciphertext, extra_fields_nonce,
                favorite, created_by, updated_by, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14, $15, $15)
            "#,
        )
        .bind(&cred_id)
        .bind(&vault_id)
        .bind(&item.title)
        .bind(&item.username)
        .bind(&item.url)
        .bind(&item.category)
        .bind(&enc_password.ciphertext)
        .bind(&enc_password.nonce)
        .bind(&enc_notes.ciphertext)
        .bind(&enc_notes.nonce)
        .bind(&extra_fields_ciphertext)
        .bind(&extra_fields_nonce)
        .bind(item.favorite)
        .bind(&user.id)
        .bind(now)
        .execute(&mut *tx)
        .await?;

        imported_count += 1;
    }

    if imported_count > 0 {
        sqlx::query("UPDATE vaults SET updated_at = $1 WHERE id = $2")
            .bind(now)
            .bind(&vault_id)
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;

    if imported_count > 0 {
        let details = format_import_audit_details(
            imported_count,
            &batch.provider_label,
            &batch.detected_format,
            plan.duplicate_skipped_count,
            plan.invalid_skipped_count,
        );
        record_audit(
            &state.db,
            &vault_id,
            None,
            &user,
            "vault.imported",
            &details,
        )
        .await?;
    }

    Ok((
        StatusCode::CREATED,
        Json(ImportResultDto {
            provider: batch.provider,
            provider_label: batch.provider_label,
            detected_format: batch.detected_format,
            vault_id,
            total_parsed: batch.total_parsed,
            imported_count,
            duplicate_skipped_count: plan.duplicate_skipped_count,
            invalid_skipped_count: plan.invalid_skipped_count,
            skipped_items: plan.skipped_items,
        }),
    ))
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::*;

    fn make_item(
        index: usize,
        title: &str,
        source_folder: Option<&str>,
        is_duplicate: bool,
        skip_reason: Option<&str>,
    ) -> EvaluatedImportItem {
        EvaluatedImportItem {
            index,
            title: title.to_string(),
            username: "u".to_string(),
            password: "p".to_string(),
            url: "https://example.com".to_string(),
            category: "login".to_string(),
            notes: String::new(),
            fields: BTreeMap::new(),
            favorite: false,
            source_folder: source_folder.map(str::to_string),
            tags: Vec::new(),
            status: if skip_reason.is_some() {
                "skipped".to_string()
            } else if is_duplicate {
                "duplicate".to_string()
            } else {
                "ready".to_string()
            },
            is_duplicate,
            warning: None,
            skip_reason: skip_reason.map(str::to_string),
        }
    }

    #[test]
    fn select_items_for_import_counts_duplicates_and_invalid_with_ui_selected_indices() {
        let items = vec![
            make_item(0, "Ready 1", Some("Work"), false, None),
            make_item(1, "Dup 1", Some("Work"), true, None),
            make_item(2, "Trashed", Some("Work"), false, Some("Elemento nel cestino Bitwarden")),
            make_item(3, "Ready 2 (unchecked)", Some("Personal"), false, None),
        ];

        // UI only sends checked ready item [0]
        let selected = [0usize];
        let plan = select_items_for_import(&items, "skip", Some(&selected), None);

        assert_eq!(plan.to_insert.len(), 1);
        assert_eq!(plan.to_insert[0].index, 0);
        assert_eq!(plan.duplicate_skipped_count, 1);
        assert_eq!(plan.invalid_skipped_count, 1);
        assert_eq!(plan.skipped_items.len(), 2);
        assert_eq!(plan.skipped_items[0].index, 1);
        assert_eq!(plan.skipped_items[1].index, 2);
    }

    #[test]
    fn select_items_for_import_respects_import_all_and_manual_uncheck() {
        let items = vec![
            make_item(0, "Ready", None, false, None),
            make_item(1, "Dup checked", None, true, None),
            make_item(2, "Dup unchecked", None, true, None),
        ];

        let selected = [0usize, 1usize];
        let plan = select_items_for_import(&items, "import_all", Some(&selected), None);

        assert_eq!(plan.to_insert.len(), 2);
        assert_eq!(plan.to_insert[0].index, 0);
        assert_eq!(plan.to_insert[1].index, 1);
        assert_eq!(plan.duplicate_skipped_count, 0);
        assert_eq!(plan.invalid_skipped_count, 0);
    }

    #[test]
    fn select_items_for_import_filters_by_source_folder_and_no_folder() {
        let items = vec![
            make_item(0, "In Work", Some("Work"), false, None),
            make_item(1, "Dup in Infra", Some("Infra"), true, None),
            make_item(2, "No Folder", None, false, None),
            make_item(3, "Skipped No Folder", None, false, Some("Voce vuota")),
        ];

        // Filter to Work only: excludes Infra dup & No Folder items from counts too
        let work_only = vec!["work".to_string()];
        let plan = select_items_for_import(&items, "skip", None, Some(&work_only));
        assert_eq!(plan.to_insert.len(), 1);
        assert_eq!(plan.to_insert[0].index, 0);
        assert_eq!(plan.duplicate_skipped_count, 0);
        assert_eq!(plan.invalid_skipped_count, 0);

        // Filter to __none__ (Senza cartella)
        let no_folder = vec!["__none__".to_string()];
        let plan_none = select_items_for_import(&items, "skip", None, Some(&no_folder));
        assert_eq!(plan_none.to_insert.len(), 1);
        assert_eq!(plan_none.to_insert[0].index, 2);
        assert_eq!(plan_none.invalid_skipped_count, 1);
        assert_eq!(plan_none.duplicate_skipped_count, 0);
    }

    #[test]
    fn format_import_audit_details_uses_clean_italian_singular_plural() {
        assert_eq!(
            format_import_audit_details(1, "Bitwarden", "JSON", 0, 0),
            "Importata 1 credenziale da Bitwarden (JSON)"
        );
        assert_eq!(
            format_import_audit_details(5, "Bitwarden", "CSV", 1, 2),
            "Importate 5 credenziali da Bitwarden (CSV) (1 duplicato ignorato, 2 voci non valide saltate)"
        );
        assert_eq!(
            format_import_audit_details(3, "1Password", "CSV", 2, 1),
            "Importate 3 credenziali da 1Password (CSV) (2 duplicati ignorati, 1 voce non valida saltata)"
        );
    }
}
