use chrono::{DateTime, Utc};
use hmac::{Hmac, KeyInit, Mac};
use sha1::Sha1;
use sha2::{Sha256, Sha512};
use url::Url;

use crate::models::TotpCodeDto;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OtpAlgorithm {
    Sha1,
    Sha256,
    Sha512,
}

impl OtpAlgorithm {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Sha1 => "SHA1",
            Self::Sha256 => "SHA256",
            Self::Sha512 => "SHA512",
        }
    }

    fn parse(raw: &str) -> Result<Self, String> {
        match raw.trim().to_ascii_uppercase().as_str() {
            "" | "SHA1" | "SHA-1" => Ok(Self::Sha1),
            "SHA256" | "SHA-256" => Ok(Self::Sha256),
            "SHA512" | "SHA-512" => Ok(Self::Sha512),
            _ => Err(
                "Algoritmo OTP non supportato (ammessi SHA1, SHA256, SHA512)".to_string(),
            ),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TotpConfig {
    pub secret_base32: String,
    pub secret_bytes: Vec<u8>,
    pub algorithm: OtpAlgorithm,
    pub digits: u32,
    pub period: u64,
    pub issuer: Option<String>,
    pub label: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GeneratedTotp {
    pub code: String,
    pub remaining_seconds: u64,
    pub period: u64,
    pub digits: u32,
    pub algorithm: OtpAlgorithm,
    pub expires_at: DateTime<Utc>,
}

/// Decodes an RFC 4648 Base32 secret (case-insensitive, ignoring spaces and hyphens).
pub fn decode_base32(input: &str) -> Result<(String, Vec<u8>), String> {
    let cleaned: String = input
        .chars()
        .filter(|c| !c.is_ascii_whitespace() && *c != '-')
        .map(|c| c.to_ascii_uppercase())
        .collect();

    if cleaned.is_empty() {
        return Err("Il segreto OTP non può essere vuoto".to_string());
    }

    let without_pad = cleaned.trim_end_matches('=');
    if without_pad.contains('=') {
        return Err("Il segreto Base32 contiene caratteri '=' non validi".to_string());
    }

    if without_pad.is_empty() {
        return Err("Il segreto OTP non può essere vuoto".to_string());
    }

    if matches!(without_pad.len() % 8, 1 | 3 | 6) {
        return Err("Il segreto Base32 ha una lunghezza non valida".to_string());
    }

    let mut bytes = Vec::with_capacity((without_pad.len() * 5) / 8);
    let mut buffer: u32 = 0;
    let mut bits_left: u8 = 0;

    for ch in without_pad.chars() {
        let val = match ch {
            'A'..='Z' => (ch as u8 - b'A') as u32,
            '2'..='7' => (ch as u8 - b'2' + 26) as u32,
            _ => {
                return Err(
                    "Il segreto Base32 contiene caratteri non validi (ammessi solo A-Z e 2-7)"
                        .to_string(),
                )
            }
        };

        buffer = (buffer << 5) | val;
        bits_left += 5;

        if bits_left >= 8 {
            bits_left -= 8;
            bytes.push(((buffer >> bits_left) & 0xff) as u8);
        }
    }

    if bytes.len() < 5 {
        return Err("Il segreto OTP è troppo corto (minimo 8 caratteri Base32)".to_string());
    }

    Ok((without_pad.to_string(), bytes))
}

fn percent_decode_utf8(raw: &str) -> String {
    let bytes = raw.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len()
            && let (Some(hi), Some(lo)) = (
                (bytes[i + 1] as char).to_digit(16),
                (bytes[i + 2] as char).to_digit(16),
            ) {
                out.push(((hi << 4) | lo) as u8);
                i += 3;
                continue;
            }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Parses either a raw Base32 secret or an `otpauth://totp/...` URI.
pub fn parse_totp_config(raw: &str) -> Result<TotpConfig, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Il segreto OTP non può essere vuoto".to_string());
    }

    if trimmed.to_ascii_lowercase().starts_with("otpauth://") {
        let url = Url::parse(trimmed)
            .map_err(|_| "URI otpauth:// non valido".to_string())?;

        let otp_type = url.host_str().map(|h| h.to_ascii_lowercase());
        match otp_type.as_deref() {
            Some("totp") => {}
            Some("hotp") => {
                return Err(
                    "I codici HOTP basati su contatore non sono supportati; usa un segreto TOTP (otpauth://totp/...)"
                        .to_string(),
                )
            }
            _ => {
                return Err(
                    "URI otpauth non valido: è supportato solo il tipo 'totp'".to_string(),
                )
            }
        }

        let raw_label = url.path().trim_start_matches('/');
        let decoded_label = percent_decode_utf8(raw_label);
        let label = {
            let clean = decoded_label.trim();
            if clean.is_empty() {
                None
            } else {
                Some(clean.to_string())
            }
        };

        let mut secret_param: Option<String> = None;
        let mut algorithm = OtpAlgorithm::Sha1;
        let mut digits: u32 = 6;
        let mut period: u64 = 30;
        let mut issuer: Option<String> = None;

        for (k, v) in url.query_pairs() {
            let key = k.to_ascii_lowercase();
            match key.as_str() {
                "secret" => {
                    secret_param = Some(v.into_owned());
                }
                "algorithm" => {
                    algorithm = OtpAlgorithm::parse(&v)?;
                }
                "digits" => {
                    let trimmed_d = v.trim();
                    if !trimmed_d.is_empty() {
                        let parsed = trimmed_d.parse::<u32>().map_err(|_| {
                            "Il numero di cifre OTP deve essere compreso tra 6 e 8".to_string()
                        })?;
                        if !(6..=8).contains(&parsed) {
                            return Err(
                                "Il numero di cifre OTP deve essere compreso tra 6 e 8"
                                    .to_string(),
                            );
                        }
                        digits = parsed;
                    }
                }
                "period" => {
                    let trimmed_p = v.trim();
                    if !trimmed_p.is_empty() {
                        let parsed = trimmed_p.parse::<u64>().map_err(|_| {
                            "Il periodo OTP deve essere compreso tra 10 e 300 secondi".to_string()
                        })?;
                        if !(10..=300).contains(&parsed) {
                            return Err(
                                "Il periodo OTP deve essere compreso tra 10 e 300 secondi"
                                    .to_string(),
                            );
                        }
                        period = parsed;
                    }
                }
                "issuer" => {
                    let clean = v.trim();
                    if !clean.is_empty() {
                        issuer = Some(clean.to_string());
                    }
                }
                _ => {}
            }
        }

        let secret_raw = secret_param
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .ok_or_else(|| "Parametro 'secret' mancante nell'URI otpauth://".to_string())?;

        let (secret_base32, secret_bytes) = decode_base32(&secret_raw)?;

        return Ok(TotpConfig {
            secret_base32,
            secret_bytes,
            algorithm,
            digits,
            period,
            issuer,
            label,
        });
    }

    if trimmed.contains("://") {
        return Err(
            "URI OTP non valido: usa 'otpauth://totp/...' oppure una chiave Base32".to_string(),
        );
    }

    let (secret_base32, secret_bytes) = decode_base32(trimmed)?;

    Ok(TotpConfig {
        secret_base32,
        secret_bytes,
        algorithm: OtpAlgorithm::Sha1,
        digits: 6,
        period: 30,
        issuer: None,
        label: None,
    })
}

/// Validates and normalizes a TOTP value for storage in `fields["totp"]`.
pub fn normalize_totp_storage_value(raw: &str) -> Result<String, String> {
    let config = parse_totp_config(raw)?;
    let trimmed = raw.trim();
    if trimmed.to_ascii_lowercase().starts_with("otpauth://") {
        Ok(trimmed.to_string())
    } else {
        Ok(config.secret_base32)
    }
}

fn compute_hmac(algorithm: OtpAlgorithm, secret: &[u8], counter_bytes: &[u8; 8]) -> Vec<u8> {
    match algorithm {
        OtpAlgorithm::Sha1 => {
            let mut mac = Hmac::<Sha1>::new_from_slice(secret)
                .expect("HMAC accepts keys of any size");
            mac.update(counter_bytes);
            mac.finalize().into_bytes().to_vec()
        }
        OtpAlgorithm::Sha256 => {
            let mut mac = Hmac::<Sha256>::new_from_slice(secret)
                .expect("HMAC accepts keys of any size");
            mac.update(counter_bytes);
            mac.finalize().into_bytes().to_vec()
        }
        OtpAlgorithm::Sha512 => {
            let mut mac = Hmac::<Sha512>::new_from_slice(secret)
                .expect("HMAC accepts keys of any size");
            mac.update(counter_bytes);
            mac.finalize().into_bytes().to_vec()
        }
    }
}

/// Generates an RFC 6238 TOTP code at a specific Unix timestamp (in seconds).
pub fn generate_totp_at(config: &TotpConfig, unix_seconds: u64) -> GeneratedTotp {
    let counter = unix_seconds / config.period;
    let counter_bytes = counter.to_be_bytes();
    let hash = compute_hmac(config.algorithm, &config.secret_bytes, &counter_bytes);

    let offset = (hash[hash.len() - 1] & 0x0f) as usize;
    let bin_code = (((hash[offset] & 0x7f) as u32) << 24)
        | ((hash[offset + 1] as u32) << 16)
        | ((hash[offset + 2] as u32) << 8)
        | (hash[offset + 3] as u32);

    let modulo = 10_u32.pow(config.digits);
    let otp = bin_code % modulo;
    let code = format!("{:0width$}", otp, width = config.digits as usize);

    let elapsed = unix_seconds % config.period;
    let remaining_seconds = config.period - elapsed;
    let expires_unix = ((counter + 1) * config.period) as i64;
    let expires_at = DateTime::from_timestamp(expires_unix, 0).unwrap_or_else(Utc::now);

    GeneratedTotp {
        code,
        remaining_seconds,
        period: config.period,
        digits: config.digits,
        algorithm: config.algorithm,
        expires_at,
    }
}

/// Generates the current TOTP DTO for a credential.
pub fn generate_totp_now(credential_id: &str, config: &TotpConfig) -> TotpCodeDto {
    let unix_seconds = u64::try_from(Utc::now().timestamp()).unwrap_or(0);
    let generated = generate_totp_at(config, unix_seconds);
    TotpCodeDto {
        credential_id: credential_id.to_string(),
        code: generated.code,
        remaining_seconds: generated.remaining_seconds,
        period: generated.period,
        digits: generated.digits,
        algorithm: generated.algorithm.as_str().to_string(),
        expires_at: generated.expires_at,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rfc_config(secret_bytes: &[u8], algorithm: OtpAlgorithm) -> TotpConfig {
        TotpConfig {
            secret_base32: String::new(),
            secret_bytes: secret_bytes.to_vec(),
            algorithm,
            digits: 8,
            period: 30,
            issuer: None,
            label: None,
        }
    }

    #[test]
    fn rfc6238_appendix_b_test_vectors() {
        let sha1_secret = b"12345678901234567890";
        let sha256_secret = b"12345678901234567890123456789012";
        let sha512_secret =
            b"1234567890123456789012345678901234567890123456789012345678901234";

        let cases: &[(u64, &str, &str, &str)] = &[
            (59, "94287082", "46119246", "90693936"),
            (1_111_111_109, "07081804", "68084774", "25091201"),
            (1_111_111_111, "14050471", "67062674", "99943326"),
            (1_234_567_890, "89005924", "91819424", "93441116"),
            (2_000_000_000, "69279037", "90698825", "38618901"),
            (20_000_000_000, "65353130", "77737706", "47863826"),
        ];

        for &(ts, expected_sha1, expected_sha256, expected_sha512) in cases {
            assert_eq!(
                generate_totp_at(&rfc_config(sha1_secret, OtpAlgorithm::Sha1), ts).code,
                expected_sha1,
                "SHA1 mismatch at ts={ts}"
            );
            assert_eq!(
                generate_totp_at(&rfc_config(sha256_secret, OtpAlgorithm::Sha256), ts).code,
                expected_sha256,
                "SHA256 mismatch at ts={ts}"
            );
            assert_eq!(
                generate_totp_at(&rfc_config(sha512_secret, OtpAlgorithm::Sha512), ts).code,
                expected_sha512,
                "SHA512 mismatch at ts={ts}"
            );
        }
    }

    #[test]
    fn standard_6_digit_base32_and_formatting_work() {
        // JBSWY3DPEHPK3PXP == b"Hello!\xde\xad\xbe\xef"
        let cfg = parse_totp_config(" jbsw-y3dp ehpk 3pxp== ").unwrap();
        assert_eq!(cfg.secret_base32, "JBSWY3DPEHPK3PXP");
        assert_eq!(cfg.secret_bytes, b"Hello!\xde\xad\xbe\xef");
        assert_eq!(cfg.algorithm, OtpAlgorithm::Sha1);
        assert_eq!(cfg.digits, 6);
        assert_eq!(cfg.period, 30);

        let gen0 = generate_totp_at(&cfg, 0);
        assert_eq!(gen0.code, "282760");
        assert_eq!(gen0.remaining_seconds, 30);

        let gen29 = generate_totp_at(&cfg, 29);
        assert_eq!(gen29.code, "282760");
        assert_eq!(gen29.remaining_seconds, 1);

        let gen30 = generate_totp_at(&cfg, 30);
        assert_eq!(gen30.code, "996554");
        assert_eq!(gen30.remaining_seconds, 30);

        assert_eq!(
            normalize_totp_storage_value(" jbsw-y3dp ehpk 3pxp ").unwrap(),
            "JBSWY3DPEHPK3PXP"
        );
    }

    #[test]
    fn otpauth_uri_parsing_and_normalization_work() {
        let uri = "otpauth://totp/GitHub:alice%40starward.io?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&algorithm=SHA256&digits=8&period=60";
        let cfg = parse_totp_config(uri).unwrap();
        assert_eq!(cfg.secret_base32, "JBSWY3DPEHPK3PXP");
        assert_eq!(cfg.algorithm, OtpAlgorithm::Sha256);
        assert_eq!(cfg.digits, 8);
        assert_eq!(cfg.period, 60);
        assert_eq!(cfg.issuer.as_deref(), Some("GitHub"));
        assert_eq!(cfg.label.as_deref(), Some("GitHub:alice@starward.io"));

        assert_eq!(
            normalize_totp_storage_value(&format!("  {uri}  ")).unwrap(),
            uri
        );

        let upper_uri = "OTPAUTH://TOTP/GitHub?secret=JBSWY3DPEHPK3PXP&algorithm=sha256";
        let upper_cfg = parse_totp_config(upper_uri).unwrap();
        assert_eq!(upper_cfg.algorithm, OtpAlgorithm::Sha256);
    }

    #[test]
    fn rejects_invalid_otp_inputs() {
        assert!(parse_totp_config("").is_err());
        assert!(parse_totp_config("   ").is_err());
        assert!(parse_totp_config("INVALID!1890").is_err());
        assert!(parse_totp_config("JBSW").is_err()); // too short (< 5 bytes)
        assert!(parse_totp_config("JBSW=Y3DP").is_err()); // internal '='
        assert!(parse_totp_config("otpauth://hotp/Test?secret=JBSWY3DPEHPK3PXP").is_err());
        assert!(parse_totp_config("OTPAUTH://HOTP/Test?secret=JBSWY3DPEHPK3PXP").is_err());
        assert!(parse_totp_config("otpauth://totp/Test").is_err()); // missing secret
        assert!(
            parse_totp_config("otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP&digits=9").is_err()
        );
        assert!(
            parse_totp_config("otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP&period=5").is_err()
        );
        assert!(
            parse_totp_config("otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP&algorithm=MD5")
                .is_err()
        );
        assert!(parse_totp_config("https://example.com").is_err());
    }
}
