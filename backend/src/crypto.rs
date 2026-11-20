use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use hkdf::Hkdf;
use rand::{rand_core::UnwrapErr, rngs::SysRng, RngExt};
use sha2::{Digest, Sha256};

use crate::error::{AppError, AppResult};

pub fn hash_api_key(raw_key: &str) -> String {
    let digest = Sha256::digest(raw_key.trim().as_bytes());
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

pub fn generate_api_key() -> (String, String, String) {
    let random_bytes: [u8; 24] = UnwrapErr(SysRng).random();
    let hex_secret: String = random_bytes.iter().map(|b| format!("{b:02x}")).collect();
    let raw_key = format!("sw_live_{hex_secret}");
    let key_prefix = raw_key[..16].to_string();
    let key_hash = hash_api_key(&raw_key);
    (raw_key, key_prefix, key_hash)
}

const SALT: &[u8] = b"starward-vault-aes256gcm-v1";
const INFO: &[u8] = b"credential-secret-encryption";

#[derive(Clone)]
pub struct VaultCrypto {
    key: [u8; 32],
}

pub struct EncryptedField {
    pub ciphertext: String,
    pub nonce: String,
}

impl VaultCrypto {
    pub fn from_master_key(master_key: &str) -> Self {
        let (mut key, hk) = Hkdf::<Sha256>::extract(Some(SALT), master_key.as_bytes());
        hk.expand(INFO, &mut key)
            .expect("32 bytes is a valid HKDF-SHA256 output length");
        Self { key: key.into() }
    }

    pub fn encrypt(&self, plaintext: &str) -> AppResult<EncryptedField> {
        let cipher = Aes256Gcm::new_from_slice(&self.key)
            .map_err(|e| AppError::Internal(format!("Cipher init error: {e}")))?;

        let nonce_bytes: [u8; 12] = UnwrapErr(SysRng).random();
        let nonce = Nonce::from(nonce_bytes);

        let ciphertext = cipher
            .encrypt(&nonce, plaintext.as_bytes())
            .map_err(|e| AppError::Internal(format!("Encryption failed: {e}")))?;

        Ok(EncryptedField {
            ciphertext: BASE64.encode(ciphertext),
            nonce: BASE64.encode(nonce_bytes),
        })
    }

    pub fn decrypt(&self, ciphertext_b64: &str, nonce_b64: &str) -> AppResult<String> {
        let cipher = Aes256Gcm::new_from_slice(&self.key)
            .map_err(|e| AppError::Internal(format!("Cipher init error: {e}")))?;

        let ciphertext = BASE64
            .decode(ciphertext_b64)
            .map_err(|e| AppError::Internal(format!("Invalid ciphertext base64: {e}")))?;
        let nonce_bytes = BASE64
            .decode(nonce_b64)
            .map_err(|e| AppError::Internal(format!("Invalid nonce base64: {e}")))?;

        let nonce = Nonce::try_from(nonce_bytes.as_slice())
            .map_err(|_| AppError::Internal("Invalid nonce length".to_string()))?;
        let plaintext = cipher
            .decrypt(&nonce, ciphertext.as_ref())
            .map_err(|e| AppError::Internal(format!("Decryption failed: {e}")))?;

        String::from_utf8(plaintext)
            .map_err(|e| AppError::Internal(format!("Invalid UTF-8 plaintext: {e}")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_encryption_and_unique_nonces() {
        let crypto = VaultCrypto::from_master_key("super-secret-master-key");
        let secret = "P@ssw0rd!Str0ng#2026";

        let enc1 = crypto.encrypt(secret).unwrap();
        let enc2 = crypto.encrypt(secret).unwrap();

        assert_ne!(enc1.nonce, enc2.nonce);
        assert_ne!(enc1.ciphertext, enc2.ciphertext);
        assert_eq!(crypto.decrypt(&enc1.ciphertext, &enc1.nonce).unwrap(), secret);
        assert_eq!(crypto.decrypt(&enc2.ciphertext, &enc2.nonce).unwrap(), secret);
    }

    #[test]
    fn wrong_key_fails_decryption() {
        let crypto_a = VaultCrypto::from_master_key("key-a");
        let crypto_b = VaultCrypto::from_master_key("key-b");
        let enc = crypto_a.encrypt("classified").unwrap();
        assert!(crypto_b.decrypt(&enc.ciphertext, &enc.nonce).is_err());
    }

    #[test]
    fn hkdf_key_derivation_matches_rfc5869_vector() {
        let crypto = VaultCrypto::from_master_key("super-secret-master-key");
        let derived_hex: String = crypto.key.iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(
            derived_hex,
            "6ed3d88af34bef87446a5621d2fe3cbdd4cb2ab1cd09cd7f72cf73eafccee22f"
        );
    }

    #[test]
    fn api_key_generation_and_hashing_are_unique_and_consistent() {
        let (key1, prefix1, hash1) = generate_api_key();
        let (key2, prefix2, hash2) = generate_api_key();

        assert!(key1.starts_with("sw_live_"));
        assert_eq!(key1.len(), 56);
        assert_eq!(prefix1.len(), 16);
        assert_eq!(prefix1, &key1[..16]);
        assert_eq!(hash1, hash_api_key(&key1));
        assert_eq!(hash1.len(), 64);

        assert_ne!(key1, key2);
        assert_ne!(prefix1, prefix2);
        assert_ne!(hash1, hash2);
    }
}
