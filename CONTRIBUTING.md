# Contributing to UsageWatch

Thanks for helping! New provider integrations, parser fixes for changed APIs,
accessibility improvements and clearer docs are all welcome.

**Before anything else:** never paste real tokens, API keys, account IDs or
e-mail addresses into issues, PRs, logs or test fixtures.

## Ground rules

- **Small, focused PRs.** One provider or one fix per PR. Open an issue first
  for anything bigger than a bug fix so we can agree on the approach.
- **Keep it simple.** Match the existing code style; no new dependency when a
  few lines of code will do; no abstractions for a single use.
- **Server-side data only, read-only, in-app sign-in.** See the ground rules in
  [docs/PROVIDERS.md](docs/PROVIDERS.md). PRs that read local usage logs,
  reuse other apps' credential files at runtime or call quota-spending
  endpoints will not be merged.
- **Tests for parsers.** Every response parser gets a test with sanitized data.
- **English** for code, comments, UI strings and docs.

## Development setup

Windows is the only supported platform today.

- Node.js 20+ and npm
- Rust stable (MSVC toolchain) — <https://rustup.rs>
- Visual Studio Build Tools 2022 with *Desktop development with C++*
- WebView2 Runtime (included in Windows 11)

```sh
npm ci
npm run tauri dev   # full app; first Rust build takes a few minutes
npm run dev:mock    # UI only, in the browser, with demo data and no network
```

The app starts hidden; click the tray icon to open the popup.

### Checks (same as CI)

```sh
npm run build
npm test
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

The Rust checks only matter when you touch `src-tauri/`.

## Project layout

```
src/
  core/           config, scheduler, tracker runtime, shared types (PROVIDERS list)
  providers/      one folder per provider + the Provider contract (types.ts)
  platform/       Tauri bridges: HTTP, encrypted credentials, OAuth loopback
  components/     React UI (cards, widget, settings)
  fixtures/       demo data for `npm run dev:mock`
  assets/         icons and provider logos
src-tauri/        Rust shell: tray, windows, DPAPI secret store, loopback server
web/              static landing page (independent of the app)
docs/             provider notes, releasing, website
```

A **provider** is an integration (e.g. `kimi`). A **tracker** is one account of
a provider added by the user; each tracker gets its own `ProviderClient` and
its own encrypted credential slot, so multi-account support is free.

## Adding a provider

Use [Kimi](src/providers/kimi) (API key) or [Codex](src/providers/codex)
(OAuth loopback) as a template.

### 1. Register the ID

Add `{ id: "<id>", name: "<Display Name>" }` to `PROVIDERS` in
[src/core/types.ts](src/core/types.ts). Run `npm run build`; TypeScript will
now point at the places that still need a value (the logo map).

### 2. Write the provider folder

```
src/providers/<id>/
  api.ts          request functions + response types (use httpJson from platform/http)
  parse.ts        pure function: response JSON -> ProviderSnapshot
  parse.test.ts   tests with sanitized responses
  index.ts        exports the ProviderDefinition
  auth.ts         only for OAuth providers
```

- **API-key providers**: use `createApiKeyAuth` from
  [src/providers/apiKeyAuth.ts](src/providers/apiKeyAuth.ts) and return
  `{ kind: "apiKey", helpUrl, save }` from `beginSignIn()`. Validate the key
  with one real request before saving it.
- **OAuth providers**: return a `paste` or `loopback` flow (see
  [src/providers/types.ts](src/providers/types.ts)). Use PKCE helpers from
  `core/pkce.ts` and `startLoopback` from `platform/loopback.ts`. Store tokens
  only through the `CredentialStore` passed to `create()`.

`fetchSnapshot()` contract:

- Throw `AuthError(message, "expired" | "signed_out" | "unsupported")` when the
  user must sign in again or the account cannot be supported.
- Throw `FetchError(message, retryAfterMs, status)` for transport/HTTP errors;
  pass `retryAfterMs` from the response so the scheduler backs off.
- Return a `ProviderSnapshot` (see [src/core/types.ts](src/core/types.ts)):
  - `meters[].percentLeft` is **remaining** quota, 0–100, or `null` if unknown.
    Use `meterState(percentLeft)` from `core/usage.ts` for `state`.
  - Meter `id`s must be **stable** (users can hide meters by ID).
  - `resetsAt` is ISO 8601 or `null`. Never invent a reset time or a balance.
  - `infoRows` for extra facts (balance, request counts).

Set `minIntervalSec` to what the endpoint tolerates (60 is the minimum).

### 3. Wire it up

- Register the definition in [src/providers/index.ts](src/providers/index.ts)
  in the same order as `PROVIDERS` (a test checks this).
- Allow the provider's hosts in
  [src-tauri/capabilities/default.json](src-tauri/capabilities/default.json)
  (`http:default` → `allow`). Requests to unlisted hosts are blocked.
- Add a 24×24 single-path logo to [src/assets/logos.tsx](src/assets/logos.tsx).
  Use a license-compatible source (e.g. simple-icons, CC0) or a neutral glyph.
- Optional: add a demo snapshot to [src/fixtures/index.ts](src/fixtures/index.ts)
  so the card shows up in `npm run dev:mock`.

### 4. Document and verify

- Add a section to [docs/PROVIDERS.md](docs/PROVIDERS.md): endpoint, auth,
  meaning of the fields, known limitations, sources.
- Add the provider to the list in [README.md](README.md).
- Check with a real account: sign in, card, widget, sign out, invalid key,
  expired token and rate-limit behaviour. Say in the PR what you tested.

## Other changes

- **Parser broke because an API changed?** Add the new (sanitized) response
  shape as a test case, then fix the parser. Keep accepting the old shape if
  it is cheap.
- **UI work**: use `npm run dev:mock`; attach before/after screenshots.
- **Native code** (`src-tauri/`): keep platform-specific code under
  `src-tauri/src/platform/`.
- **Website** (`web/`): see [docs/WEBSITE.md](docs/WEBSITE.md).

## Pull requests

- Branch from `main`; CI must pass.
- Describe what changed, why, and how you tested it.
- By contributing you agree that your contribution is licensed under the
  project's license.
