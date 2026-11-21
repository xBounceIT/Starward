use std::collections::HashMap;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone)]
pub struct CsvTable {
    pub headers: Vec<String>,
    header_map: HashMap<String, usize>,
    pub rows: Vec<Vec<String>>,
}

#[derive(Debug, Clone, Copy)]
pub struct CsvRow<'a> {
    table: &'a CsvTable,
    cells: &'a [String],
}

impl<'a> CsvRow<'a> {
    pub fn get(&self, col: &str) -> &str {
        let key = col.trim().to_lowercase();
        self.table
            .header_map
            .get(&key)
            .and_then(|&idx| self.cells.get(idx))
            .map(String::as_str)
            .unwrap_or("")
    }

    pub fn get_trimmed(&self, col: &str) -> &str {
        self.get(col).trim()
    }

    pub fn get_any(&self, aliases: &[&str]) -> &str {
        for alias in aliases {
            let val = self.get(alias);
            if !val.trim().is_empty() {
                return val;
            }
        }
        ""
    }

    pub fn get_any_trimmed(&self, aliases: &[&str]) -> &str {
        self.get_any(aliases).trim()
    }
}

impl CsvTable {
    pub fn parse(raw_content: &str) -> AppResult<Self> {
        let stripped = raw_content.strip_prefix('\u{feff}').unwrap_or(raw_content);
        if stripped.trim().is_empty() {
            return Err(AppError::BadRequest("Il file CSV è vuoto.".to_string()));
        }

        let delimiter = detect_delimiter(stripped);
        let records = parse_records(stripped, delimiter)?;

        let Some(raw_headers) = records.first() else {
            return Err(AppError::BadRequest(
                "Il file CSV non contiene un'intestazione valida.".to_string(),
            ));
        };

        let headers: Vec<String> = raw_headers
            .iter()
            .map(|h| h.trim().to_lowercase())
            .collect();

        if headers.is_empty() || headers.iter().all(|h| h.is_empty()) {
            return Err(AppError::BadRequest(
                "Intestazione CSV mancante o non valida.".to_string(),
            ));
        }

        let mut header_map = HashMap::new();
        for (idx, h) in headers.iter().enumerate() {
            if !h.is_empty() {
                header_map.entry(h.clone()).or_insert(idx);
            }
        }

        let mut rows = Vec::new();
        for record in records.into_iter().skip(1) {
            if record.iter().all(|cell| cell.trim().is_empty()) {
                continue;
            }
            rows.push(record);
        }

        Ok(Self {
            headers,
            header_map,
            rows,
        })
    }

    pub fn has_header(&self, col: &str) -> bool {
        self.header_map.contains_key(&col.trim().to_lowercase())
    }

    pub fn has_any_header(&self, aliases: &[&str]) -> bool {
        aliases.iter().any(|alias| self.has_header(alias))
    }

    pub fn iter_rows(&self) -> impl Iterator<Item = CsvRow<'_>> {
        self.rows.iter().map(move |cells| CsvRow {
            table: self,
            cells: cells.as_slice(),
        })
    }
}

fn detect_delimiter(content: &str) -> char {
    let mut in_quotes = false;
    let mut comma_count = 0usize;
    let mut semicolon_count = 0usize;
    let mut chars = content.chars().peekable();

    while let Some(ch) = chars.next() {
        if in_quotes {
            if ch == '"' {
                if chars.peek() == Some(&'"') {
                    chars.next();
                } else {
                    in_quotes = false;
                }
            }
            continue;
        }

        match ch {
            '"' => in_quotes = true,
            '\n' | '\r' => break,
            ',' => comma_count += 1,
            ';' => semicolon_count += 1,
            _ => {}
        }
    }

    if comma_count == 0 && semicolon_count > 0 {
        ';'
    } else {
        ','
    }
}

fn parse_records(content: &str, delimiter: char) -> AppResult<Vec<Vec<String>>> {
    let mut records: Vec<Vec<String>> = Vec::new();
    let mut current_row: Vec<String> = Vec::new();
    let mut current_field = String::new();
    let mut in_quotes = false;
    let mut field_started = false;

    let mut chars = content.chars().peekable();
    while let Some(ch) = chars.next() {
        if in_quotes {
            if ch == '"' {
                if chars.peek() == Some(&'"') {
                    current_field.push('"');
                    chars.next();
                } else {
                    in_quotes = false;
                }
            } else {
                current_field.push(ch);
            }
            continue;
        }

        if !field_started && ch == '"' {
            in_quotes = true;
            field_started = true;
            continue;
        }

        if ch == delimiter {
            current_row.push(std::mem::take(&mut current_field));
            field_started = false;
        } else if ch == '\r' {
            if chars.peek() == Some(&'\n') {
                chars.next();
            }
            current_row.push(std::mem::take(&mut current_field));
            records.push(std::mem::take(&mut current_row));
            field_started = false;
        } else if ch == '\n' {
            current_row.push(std::mem::take(&mut current_field));
            records.push(std::mem::take(&mut current_row));
            field_started = false;
        } else {
            current_field.push(ch);
            field_started = true;
        }
    }

    if in_quotes {
        return Err(AppError::BadRequest(
            "Formato CSV non valido: virgolette non chiuse.".to_string(),
        ));
    }

    if field_started || !current_row.is_empty() {
        current_row.push(current_field);
        records.push(current_row);
    }

    Ok(records)
}
