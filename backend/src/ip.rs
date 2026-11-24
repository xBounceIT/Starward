//! IP / CIDR utilities for Service Account IP allowlists.
//!
//! Self-contained (no external crates): parses plain IPs and CIDR ranges for
//! IPv4 and IPv6 and checks whether a client IP falls inside a range.

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::str::FromStr;

/// Maximum number of entries accepted in a single allowlist.
pub const MAX_ALLOWLIST_ENTRIES: usize = 100;
/// Maximum length of a single entry (IP or CIDR string).
pub const MAX_ENTRY_LEN: usize = 64;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Cidr {
    V4 { network: u32, prefix: u8 },
    V6 { network: u128, prefix: u8 },
}

impl Cidr {
    pub fn parse(input: &str) -> Option<Cidr> {
        let input = input.trim();
        if input.is_empty() || input.len() > MAX_ENTRY_LEN {
            return None;
        }

        let (addr_part, prefix) = match input.split_once('/') {
            Some((addr, prefix)) => {
                let prefix: u8 = prefix.trim().parse().ok()?;
                (addr.trim(), Some(prefix))
            }
            None => (input, None),
        };

        let ip = IpAddr::from_str(addr_part).ok()?;
        match ip {
            IpAddr::V4(v4) => {
                let prefix = prefix.unwrap_or(32);
                if prefix > 32 {
                    return None;
                }
                Some(Cidr::V4 {
                    network: u32::from(v4),
                    prefix,
                })
            }
            IpAddr::V6(v6) => {
                let prefix = prefix.unwrap_or(128);
                if prefix > 128 {
                    return None;
                }
                // Treat IPv4-mapped IPv6 addresses (::ffff:a.b.c.d) as IPv4 so
                // that "1.2.3.4" also matches "::ffff:1.2.3.4" peers.
                if let Some(v4) = v6.to_ipv4_mapped() {
                    let v4_prefix = prefix.saturating_sub(96).min(32);
                    return Some(Cidr::V4 {
                        network: u32::from(v4),
                        prefix: v4_prefix,
                    });
                }
                Some(Cidr::V6 {
                    network: u128::from(v6),
                    prefix,
                })
            }
        }
    }

    pub fn contains(&self, ip: IpAddr) -> bool {
        match (self, ip) {
            (Cidr::V4 { network, prefix }, IpAddr::V4(addr)) => {
                let addr = u32::from(addr);
                if *prefix == 0 {
                    return true;
                }
                let mask = u32::MAX << (32 - prefix);
                (addr & mask) == (network & mask)
            }
            (Cidr::V6 { network, prefix }, IpAddr::V6(addr)) => {
                let addr = u128::from(addr);
                if *prefix == 0 {
                    return true;
                }
                let mask = u128::MAX << (128 - prefix);
                (addr & mask) == (network & mask)
            }
            // IPv4-mapped IPv6 client address against an IPv4 rule.
            (Cidr::V4 { network, prefix }, IpAddr::V6(addr)) => {
                if let Some(v4) = addr.to_ipv4_mapped() {
                    let addr = u32::from(v4);
                    if *prefix == 0 {
                        return true;
                    }
                    let mask = u32::MAX << (32 - prefix);
                    return (addr & mask) == (network & mask);
                }
                false
            }
            _ => false,
        }
    }
}

/// Normalizes an IPv4 address to its canonical form (used for dedupe).
fn canonical_ip(ip: IpAddr) -> String {
    match ip {
        IpAddr::V4(v4) => v4.to_string(),
        IpAddr::V6(v6) => {
            if let Some(v4) = v6.to_ipv4_mapped() {
                v4.to_string()
            } else {
                // Compress per RFC 5952-ish (std Display already compresses).
                v6.to_string()
            }
        }
    }
}

/// Validates and normalizes a raw allowlist coming from the admin API.
///
/// Each entry must be a plain IP (`1.2.3.4`, `2001:db8::1`) or a CIDR
/// (`10.0.0.0/8`, `2001:db8::/32`). Returns a deduplicated, canonicalized
/// list. An empty input means "no restriction" and is valid.
pub fn validate_ip_allowlist(raw: &[String]) -> Result<Vec<String>, String> {
    if raw.len() > MAX_ALLOWLIST_ENTRIES {
        return Err(format!(
            "L'allowlist IP non può contenere più di {MAX_ALLOWLIST_ENTRIES} voci"
        ));
    }

    let mut out: Vec<String> = Vec::with_capacity(raw.len());
    for entry in raw {
        let entry = entry.trim();
        if entry.is_empty() {
            continue;
        }
        let cidr = Cidr::parse(entry).ok_or_else(|| {
            let preview = &entry[..MAX_ENTRY_LEN.min(entry.len())];
            format!("Voce non valida (atteso IP o CIDR, es. 10.0.0.0/8): '{preview}'")
        })?;
        // Canonical form: plain IP without a full-length prefix, CIDR otherwise.
        let canonical = match cidr {
            Cidr::V4 { network, prefix } => {
                let ip = IpAddr::V4(Ipv4Addr::from(network));
                if prefix == 32 {
                    canonical_ip(ip)
                } else {
                    format!("{}/{}", canonical_ip(ip), prefix)
                }
            }
            Cidr::V6 { network, prefix } => {
                let ip = IpAddr::V6(Ipv6Addr::from(network));
                if prefix == 128 {
                    canonical_ip(ip)
                } else {
                    format!("{}/{}", canonical_ip(ip), prefix)
                }
            }
        };
        if !out.contains(&canonical) {
            out.push(canonical);
        }
    }
    Ok(out)
}

/// Returns true when `ip` is allowed by `allowlist`. An empty allowlist
/// allows everything.
pub fn ip_allowed(allowlist: &[String], ip: IpAddr) -> bool {
    if allowlist.is_empty() {
        return true;
    }
    allowlist.iter().any(|entry| {
        Cidr::parse(entry)
            .map(|cidr| cidr.contains(ip))
            .unwrap_or(false)
    })
}

/// Extracts the client IP from request parts.
///
/// By default the peer socket address (via `ConnectInfo`) is used — it cannot
/// be spoofed by the client. When `trust_proxy_headers` is enabled (the
/// backend sits behind a reverse proxy that overwrites these headers), the
/// leftmost `X-Forwarded-For` entry wins, then `X-Real-IP`, falling back to
/// the peer address when the headers are absent or unparseable.
pub fn resolve_client_ip(
    peer: Option<IpAddr>,
    x_forwarded_for: Option<&str>,
    x_real_ip: Option<&str>,
    trust_proxy_headers: bool,
) -> Option<IpAddr> {
    if trust_proxy_headers {
        if let Some(xff) = x_forwarded_for {
            let leftmost = xff.split(',').next().map(str::trim).unwrap_or("");
            if let Ok(ip) = IpAddr::from_str(leftmost) {
                return Some(ip);
            }
        }
        if let Some(real_ip) = x_real_ip
            && let Ok(ip) = IpAddr::from_str(real_ip.trim()) {
                return Some(ip);
            }
    }
    peer
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_plain_ipv4_as_host_route() {
        let cidr = Cidr::parse("192.168.1.10").unwrap();
        assert!(cidr.contains(IpAddr::from_str("192.168.1.10").unwrap()));
        assert!(!cidr.contains(IpAddr::from_str("192.168.1.11").unwrap()));
    }

    #[test]
    fn parses_ipv4_cidr() {
        let cidr = Cidr::parse("10.0.0.0/8").unwrap();
        assert!(cidr.contains(IpAddr::from_str("10.255.255.255").unwrap()));
        assert!(!cidr.contains(IpAddr::from_str("11.0.0.1").unwrap()));
        assert!(Cidr::parse("10.0.0.0/33").is_none());
    }

    #[test]
    fn parses_ipv6_cidr() {
        let cidr = Cidr::parse("2001:db8::/32").unwrap();
        assert!(cidr.contains(IpAddr::from_str("2001:db8::1").unwrap()));
        assert!(cidr.contains(IpAddr::from_str("2001:db8:ffff::1").unwrap()));
        assert!(!cidr.contains(IpAddr::from_str("2001:db9::1").unwrap()));
        assert!(Cidr::parse("2001:db8::/129").is_none());
    }

    #[test]
    fn ipv4_mapped_ipv6_matches_ipv4_rule() {
        let cidr = Cidr::parse("1.2.3.4").unwrap();
        let mapped: IpAddr = "::ffff:1.2.3.4".parse().unwrap();
        assert!(cidr.contains(mapped));
    }

    #[test]
    fn rejects_garbage() {
        assert!(Cidr::parse("not-an-ip").is_none());
        assert!(Cidr::parse("10.0.0.0/").is_none());
        assert!(Cidr::parse("").is_none());
        assert!(Cidr::parse("10.0.0.0/8/9").is_none());
    }

    #[test]
    fn validate_normalizes_and_dedupes() {
        let input = vec![
            "10.0.0.0/8".to_string(),
            " 10.0.0.0/8 ".to_string(),
            "192.168.0.1".to_string(),
            "192.168.0.1/32".to_string(),
            "".to_string(),
        ];
        let out = validate_ip_allowlist(&input).unwrap();
        assert_eq!(out, vec!["10.0.0.0/8".to_string(), "192.168.0.1".to_string()]);
    }

    #[test]
    fn validate_rejects_bad_entries() {
        assert!(validate_ip_allowlist(&["nope".to_string()]).is_err());
        let too_many = vec!["1.1.1.1".to_string(); MAX_ALLOWLIST_ENTRIES + 1];
        assert!(validate_ip_allowlist(&too_many).is_err());
    }

    #[test]
    fn empty_allowlist_allows_everything() {
        assert!(ip_allowed(&[], IpAddr::from_str("8.8.8.8").unwrap()));
        let list = validate_ip_allowlist(&["8.8.8.0/24".to_string()]).unwrap();
        assert!(ip_allowed(&list, IpAddr::from_str("8.8.8.8").unwrap()));
        assert!(!ip_allowed(&list, IpAddr::from_str("9.9.9.9").unwrap()));
    }

    #[test]
    fn resolve_client_ip_prefers_proxy_headers_only_when_trusted() {
        let peer = IpAddr::from_str("127.0.0.1").unwrap();
        let xff = "203.0.113.9, 10.0.0.1";
        let real_ip = "198.51.100.7";
        // Untrusted: always the peer address, headers ignored.
        assert_eq!(resolve_client_ip(Some(peer), Some(xff), Some(real_ip), false), Some(peer));
        // Trusted: leftmost XFF wins, then X-Real-IP, then the peer address.
        assert_eq!(
            resolve_client_ip(Some(peer), Some(xff), Some(real_ip), true),
            Some(IpAddr::from_str("203.0.113.9").unwrap())
        );
        assert_eq!(
            resolve_client_ip(Some(peer), None, Some(real_ip), true),
            Some(IpAddr::from_str("198.51.100.7").unwrap())
        );
        assert_eq!(resolve_client_ip(Some(peer), None, None, true), Some(peer));
        assert_eq!(resolve_client_ip(Some(peer), Some("garbage"), Some("garbage"), true), Some(peer));
    }
}
