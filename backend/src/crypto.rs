use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use hkdf::Hkdf;
use rand::RngCore;
use sha2::Sha256;

use crate::error::{AppError, AppResult};

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
        let hk = Hkdf::<Sha256>::new(Some(SALT), master_key.as_bytes());
        let mut key = [0u8; 32];
        hk.expand(INFO, &mut key)
            .expect("32 bytes is a valid HKDF-SHA256 output length");
        Self { key }
    }

    pub fn encrypt(&self, plaintext: &str) -> AppResult<EncryptedField> {
        let cipher = Aes256Gcm::new_from_slice(&self.key)
            .map_err(|e| AppError::Internal(format!("Cipher init error: {e}")))?;

        let mut nonce_bytes = [0u8; 12];
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = cipher
            .encrypt(nonce, plaintext.as_bytes())
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

        if nonce_bytes.len() != 12 {
            return Err(AppError::Internal("Invalid nonce length".to_string()));
        }

        let nonce = Nonce::from_slice(&nonce_bytes);
        let plaintext = cipher
            .decrypt(nonce, ciphertext.as_ref())
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
}
