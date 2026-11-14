import { KEY_ALPHABET, randomCode } from "./crypto.mjs";

/**
 * A licence key is MA-<id>-<secret>. The id is public — it names the licence
 * in URLs and the admin — while the secret proves ownership and encrypts the
 * licence check, so it is never sent anywhere.
 */
export function newLicenseKey() {
  const id = randomCode(8);
  const secret = randomCode(20);
  return { id, secret, key: formatKey(id, secret) };
}

export function formatKey(id, secret) {
  return `MA-${id}-${secret}`;
}

const VALID = new RegExp(`^MA-([${KEY_ALPHABET}]{8})-([${KEY_ALPHABET}]{20})$`);

/** "ma-abcd…" with stray spaces → { id, secret, key }, or null. */
export function parseKey(text) {
  const clean = String(text || "")
    .replace(/\s+/g, "")
    .toUpperCase();
  const match = clean.match(VALID);
  return match ? { id: match[1], secret: match[2], key: clean } : null;
}

/** Shown in lists: the id and the first characters of the secret. */
export function maskKey(id) {
  return `MA-${id}-•••••`;
}
