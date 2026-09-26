//! Fail closed until Keychain / Secret Service implementations are supplied.
const MESSAGE: &str = "Secure credential storage is not implemented on this platform";

pub fn set(_name: &str, _value: &str) -> Result<(), String> {
    Err(MESSAGE.into())
}
pub fn get(_name: &str) -> Result<Option<String>, String> {
    Err(MESSAGE.into())
}
pub fn delete(_name: &str) -> Result<(), String> {
    Err(MESSAGE.into())
}
