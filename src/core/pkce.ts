// OAuth 2.0 PKCE helpers (RFC 7636), using Web Crypto in the webview.

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomBytes(n: number): Uint8Array {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
}

/** High-entropy code verifier (43-char base64url). */
export function generateVerifier(): string {
  return base64url(randomBytes(32));
}

/** S256 challenge = base64url(SHA-256(verifier)). */
export async function challengeS256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

/** Opaque anti-CSRF state value. */
export function generateState(): string {
  return base64url(randomBytes(32));
}
