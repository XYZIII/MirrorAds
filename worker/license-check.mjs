import {
  fromBase64Url,
  licenseCipherKey,
  openJson,
  sealJson,
  toBase64Url,
} from "./crypto.mjs";
import { getLicense, getSettings, touchSeat } from "./db.mjs";

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/**
 * The licence check travels through Facebook: the script asks Facebook to
 * read /l/… and then reads Facebook's copy, so the answer is a link-preview
 * page whose description carries it. "S1." answers are sealed with the
 * licence secret; "P1." answers are plain and carry the script key only
 * while the owner lets everyone in without a key.
 */
export function answerPage(description) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow">` +
      `<meta property="og:type" content="website"><meta property="og:title" content="MirrorAds licence">` +
      `<meta property="og:description" content="${escapeHtml(description)}"><title>MirrorAds</title></head>` +
      `<body><pre>MirrorAds</pre></body></html>`,
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}

const plain = (value) =>
  `P1.${toBase64Url(new TextEncoder().encode(JSON.stringify(value)))}`;

export function readPlain(description) {
  return JSON.parse(
    new TextDecoder().decode(fromBase64Url(String(description).slice(3))),
  );
}

/** What opens the current script: its version, key and where its pieces are. */
const release = (build) => ({
  build: build.version,
  ck: build.contentKey,
  main: build.main,
});

/**
 * GET /l/free/<nonce> — no key: allowed only while the owner has the check off.
 * GET /l/<id>/<sealed> — a licence: records the profile, answers sealed.
 * Every answer repeats the request's nonce, so an old answer never passes
 * for a new one.
 */
export async function licenseCheck({
  db,
  build,
  origin,
  licenseId,
  blob,
  now,
}) {
  const settings = await getSettings(db);
  const enforce = settings.enforce === "1";
  const links = {
    buy: `${origin}/buy`,
    cabinet: `${origin}/cabinet`,
    support: settings.support || "",
  };
  if (licenseId === "free") {
    if (enforce)
      return answerPage(
        plain({ ok: false, code: "need_key", n: blob, ...links }),
      );
    return answerPage(
      plain({ ok: true, mode: "free", n: blob, ...release(build), ...links }),
    );
  }
  const license = await getLicense(db, licenseId);
  if (!license)
    return answerPage(plain({ ok: false, code: "bad_key", ...links }));
  const key = await licenseCipherKey(license.secret);
  let request = null;
  try {
    request = await openJson(key, blob);
  } catch (_error) {
    return answerPage(plain({ ok: false, code: "bad_key", ...links }));
  }
  await touchSeat(db, license.id, request?.s, now);
  const expired =
    license.expires_at !== null && Number(license.expires_at) < now;
  const base = { n: request?.n ?? "", exp: license.expires_at, ...links };
  let answer;
  if (license.status === "blocked" && enforce)
    answer = { ok: false, code: "blocked", ...base };
  else if (expired && enforce) answer = { ok: false, code: "expired", ...base };
  else answer = { ok: true, mode: "key", ...release(build), ...base };
  return answerPage(`S1.${await sealJson(key, answer)}`);
}
