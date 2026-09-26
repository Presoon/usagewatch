//! Secure secret storage via Windows DPAPI (per-user scope). Tokens / API keys
//! are DPAPI-encrypted blobs under `%APPDATA%\UsageWatch\secrets\<name>.bin` —
//! never in config.json. Credential Manager is avoided because of
//! its ~2.5 KB blob limit.

use std::fs;
use std::path::PathBuf;

use windows_sys::Win32::Foundation::LocalFree;
use windows_sys::Win32::Security::Cryptography::{
    CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB,
};

// CRYPTPROTECT_UI_FORBIDDEN — never show UI (we run headless in a service loop).
const CRYPTPROTECT_UI_FORBIDDEN: u32 = 0x1;

fn secrets_dir() -> Result<PathBuf, String> {
    let appdata = std::env::var("APPDATA").map_err(|_| "APPDATA is not set".to_string())?;
    let dir = PathBuf::from(appdata).join("UsageWatch").join("secrets");
    fs::create_dir_all(&dir).map_err(|e| format!("create secrets dir: {e}"))?;
    Ok(dir)
}

/// Map a secret name to a file, rejecting anything that could escape the dir.
fn secret_path(name: &str) -> Result<PathBuf, String> {
    crate::secrets::validate_name(name)?;
    Ok(secrets_dir()?.join(format!("{name}.bin")))
}

fn protect(plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let in_blob = CRYPT_INTEGER_BLOB {
        cbData: plaintext.len() as u32,
        pbData: plaintext.as_ptr() as *mut u8,
    };
    let mut out_blob = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };
    // SAFETY: valid input blob; out_blob is written by the API and freed below.
    let ok = unsafe {
        CryptProtectData(
            &in_blob,
            std::ptr::null(), // szDataDescr
            std::ptr::null(), // pOptionalEntropy
            std::ptr::null(), // pvReserved
            std::ptr::null(), // pPromptStruct
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut out_blob,
        )
    };
    if ok == 0 {
        return Err("CryptProtectData failed".to_string());
    }
    // SAFETY: on success pbData/cbData describe a LocalAlloc'd buffer.
    let bytes =
        unsafe { std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize).to_vec() };
    unsafe { LocalFree(out_blob.pbData as _) };
    Ok(bytes)
}

fn unprotect(ciphertext: &[u8]) -> Result<Vec<u8>, String> {
    let in_blob = CRYPT_INTEGER_BLOB {
        cbData: ciphertext.len() as u32,
        pbData: ciphertext.as_ptr() as *mut u8,
    };
    let mut out_blob = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };
    // SAFETY: valid input blob; out_blob is written by the API and freed below.
    let ok = unsafe {
        CryptUnprotectData(
            &in_blob,
            std::ptr::null_mut(), // ppszDataDescr
            std::ptr::null(),     // pOptionalEntropy
            std::ptr::null(),     // pvReserved
            std::ptr::null(),     // pPromptStruct
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut out_blob,
        )
    };
    if ok == 0 {
        return Err("CryptUnprotectData failed".to_string());
    }
    // SAFETY: on success pbData/cbData describe a LocalAlloc'd buffer.
    let bytes =
        unsafe { std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize).to_vec() };
    unsafe { LocalFree(out_blob.pbData as _) };
    Ok(bytes)
}

pub fn set(name: &str, value: &str) -> Result<(), String> {
    let path = secret_path(name)?;
    let blob = protect(value.as_bytes())?;
    fs::write(&path, blob).map_err(|e| format!("write secret: {e}"))
}

pub fn get(name: &str) -> Result<Option<String>, String> {
    let path = secret_path(name)?;
    if !path.exists() {
        return Ok(None);
    }
    let blob = fs::read(&path).map_err(|e| format!("read secret: {e}"))?;
    let plain = unprotect(&blob)?;
    String::from_utf8(plain)
        .map(Some)
        .map_err(|_| "secret is not valid UTF-8".to_string())
}

pub fn delete(name: &str) -> Result<(), String> {
    let path = secret_path(name)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("delete secret: {e}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{protect, secret_path, unprotect};

    #[test]
    fn dpapi_roundtrips() {
        let secret = b"sk-ant-oat01-\x00\x01 unicode \xf0\x9f\x94\x92 and newlines\n";
        let sealed = protect(secret).expect("protect");
        assert_ne!(
            sealed.as_slice(),
            secret,
            "ciphertext must differ from plaintext"
        );
        let opened = unprotect(&sealed).expect("unprotect");
        assert_eq!(
            opened.as_slice(),
            secret,
            "roundtrip must recover the input"
        );
    }

    #[test]
    fn secret_names_are_validated() {
        assert!(secret_path("claude_credentials").is_ok());
        assert!(secret_path("").is_err());
        assert!(secret_path("../escape").is_err());
        assert!(secret_path("has space").is_err());
        assert!(secret_path("dots.bad").is_err());
    }
}
