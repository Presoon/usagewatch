# Releasing UsageWatch

GitHub Actions publishes a Windows NSIS installer for version tags.

## Release checklist

1. Update the version in `package.json`, `package-lock.json`,
   `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`.
2. Run `npm run build`, `npm test`, `cargo check --manifest-path
   src-tauri/Cargo.toml`, and `cargo test --manifest-path
   src-tauri/Cargo.toml --lib`.
3. Commit the release and push `main`.
4. Create and push a matching tag, for example:

   ```powershell
   git tag -a v0.1.0 -m "UsageWatch v0.1.0"
   git push origin v0.1.0
   ```

The `Release Windows` workflow builds on `windows-latest`, creates the GitHub
Release, and uploads `UsageWatch_<version>_x64-setup.exe`.

## Code signing

The initial release is unsigned. Configure a Windows code-signing certificate
as encrypted GitHub secrets before public distribution to avoid SmartScreen's
unknown-publisher warning. Never commit certificate files or passwords.
