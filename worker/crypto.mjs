/** Small WebCrypto helpers shared by the server and its tests. */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function toBase64Url(bytes) {
  let binary = "";
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let index = 0; index < view.length; index += 0x8000) {
    binary += String.fromCharCode(...view.subarray(index, index + 0x8000));
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function fromBase64Url(text) {
  const clean = String(text || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const binary = atob(clean + "===".slice((clean.length + 3) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

/** Readable random text: no 0/O, 1/I/L. */
export const KEY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function randomCode(length, alphabet = KEY_ALPHABET) {
  // Rejection sampling keeps every character equally likely.
  const limit = 256 - (256 % alphabet.length);
  let out = "";
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < limit && out.length < length)
        out += alphabet[byte % alphabet.length];
    }
  }
  return out;
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function hmacHex(algorithm, secret, text) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: algorithm },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(text));
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time comparison of two strings. */
export function safeEqual(left, right) {
  const a = encoder.encode(String(left ?? ""));
  const b = encoder.encode(String(right ?? ""));
  let diff = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    diff |= (a[index] || 0) ^ (b[index] || 0);
  }
  return diff === 0;
}

/**
 * The AES key that protects one licence's requests and answers. Both sides
 * derive it from the licence secret, which never travels: Facebook, which
 * relays both, only ever sees the licence id and ciphertext.
 */
export async function licenseCipherKey(secret) {
  const hmac = await crypto.subtle.importKey(
    "raw",
    encoder.encode(String(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const raw = await crypto.subtle.sign(
    "HMAC",
    hmac,
    encoder.encode("mirrorads/license/v1"),
  );
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

/** JSON → base64url(iv ‖ AES-GCM ciphertext). */
export async function sealJson(key, value) {
  const iv = randomBytes(12);
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(JSON.stringify(value)),
  );
  const out = new Uint8Array(12 + data.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(data), 12);
  return toBase64Url(out);
}

/** The inverse of sealJson; throws on a wrong key or tampered data. */
export async function openJson(key, sealed) {
  const bytes = fromBase64Url(sealed);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.subarray(0, 12) },
    key,
    bytes.subarray(12),
  );
  return JSON.parse(decoder.decode(plain));
}
