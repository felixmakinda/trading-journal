/**
 * AES-256-GCM envelope for secrets at rest (broker tokens). Uses WebCrypto so
 * it runs on Node and on Cloudflare Workers alike.
 * Format: "v1.<iv>.<ciphertext+tag>", both base64url.
 */

const VERSION = "v1";

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

async function importKey(base64Key: string): Promise<CryptoKey> {
  const raw = new Uint8Array(Buffer.from(base64Key, "base64"));
  if (raw.length !== 32) throw new Error("Encryption key must be 32 bytes");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** `context` is bound as additional data, so a ciphertext cannot be moved to another row. */
export async function encryptSecret(plaintext: string, base64Key: string, context: string): Promise<string> {
  const key = await importKey(base64Key);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(context) },
    key,
    new TextEncoder().encode(plaintext),
  );
  return [VERSION, toBase64Url(iv), toBase64Url(new Uint8Array(data))].join(".");
}

export async function decryptSecret(envelope: string, base64Key: string, context: string): Promise<string> {
  const [version, iv, data] = envelope.split(".");
  if (version !== VERSION || !iv || !data) throw new Error("Unrecognised secret format");
  const key = await importKey(base64Key);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(iv), additionalData: new TextEncoder().encode(context) },
    key,
    fromBase64Url(data),
  );
  return new TextDecoder().decode(plain);
}

/** Constant-time comparison for shared secrets such as the cron bearer token. */
export function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
