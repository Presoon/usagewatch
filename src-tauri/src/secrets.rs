//! Stable IPC boundary. Platform backends never expose plaintext files.
use crate::platform::secrets;

pub(crate) fn validate_name(name: &str) -> Result<(), String> {
    if name.is_empty()
        || name.len() > 128
        || !name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err("invalid secret name".into());
    }
    Ok(())
}

#[tauri::command]
pub fn secure_set(name: String, value: String) -> Result<(), String> {
    validate_name(&name)?;
    secrets::set(&name, &value)
}

#[tauri::command]
pub fn secure_get(name: String) -> Result<Option<String>, String> {
    validate_name(&name)?;
    secrets::get(&name)
}

#[tauri::command]
pub fn secure_delete(name: String) -> Result<(), String> {
    validate_name(&name)?;
    secrets::delete(&name)
}

#[cfg(test)]
mod tests {
    use super::validate_name;
    #[test]
    fn validates_names_on_every_platform() {
        assert!(validate_name("tracker_123_credentials").is_ok());
        for name in ["", "../escape", "has space", "dots.bad", "/absolute"] {
            assert!(validate_name(name).is_err());
        }
        assert!(validate_name(&"x".repeat(129)).is_err());
    }
}
