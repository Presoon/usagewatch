# Security policy

UsageWatch stores OAuth tokens and API keys for AI providers, so we treat
credential handling bugs as security issues.

## Reporting a vulnerability

Please **do not open a public issue**. Report it privately through
[GitHub security advisories](https://github.com/Presoon/usagewatch/security/advisories/new).
Include steps to reproduce and the affected version. Do not include real
tokens or keys.

## Scope

In scope: credentials leaking to disk, logs, the webview or third parties;
requests sent to hosts other than the provider's; the OAuth loopback server;
the landing page in `web/`.

Out of scope: changes in undocumented provider APIs (please open a normal
issue) and SmartScreen warnings for the unsigned installer.
