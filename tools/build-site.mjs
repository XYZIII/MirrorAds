#!/usr/bin/env node
// Builds the hosted site into dist/: the install page with the one-line
// bookmark, and the pages Facebook reads to deliver updates. It also writes
// worker/generated/build.mjs, which tells the licence server which script is
// published and the key that opens it.
//
//   node tools/build-site.mjs [--base-url=https://example.com] [--out=dist]
//
// It needs no dependencies and uses the committed mirrorads.js, so the host
// can run it as its build command. The site address comes from --base-url,
// MIRRORADS_BASE_URL, hosting/site.json, or Cloudflare Pages.
//
// What the bookmark loads, in order:
//   1. the manifest, then the gate (hosting/gate.js) — public, plain;
//   2. the gate checks the licence through Facebook and gets the script key;
//   3. the script itself, published only encrypted (AES-256-GCM).
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP = "MirrorAds";
/** Facebook keeps a page description up to roughly this many characters. */
const CHUNK_SIZE = 350000;

const arg = (name) =>
  process.argv
    .find((item) => item.startsWith(`--${name}=`))
    ?.slice(name.length + 3) || "";

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/**
 * The stable address of the site. Cloudflare Pages reports the address of
 * the single deployment (https://<hash>.<project>.pages.dev); the project's
 * own address is that without the first label.
 */
export function resolveBaseUrl({ flag = "", env = {}, config = {} } = {}) {
  const explicit = flag || env.MIRRORADS_BASE_URL || config.baseUrl || "";
  if (explicit) return explicit.replace(/\/+$/, "");
  const pages = String(env.CF_PAGES_URL || "");
  const match = pages.match(/^https:\/\/[^./]+\.([^/]+\.pages\.dev)\/?$/);
  if (match) return `https://${match[1]}`;
  return pages.replace(/\/+$/, "");
}

function ogPage(title, description) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="robots" content="noindex,nofollow" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <title>${escapeHtml(title)}</title>
</head>
<body><pre>${escapeHtml(title)}</pre></body>
</html>
`;
}

/** The bookmark holds the whole loader, so it is shrunk when a minifier is installed. */
let minify = (code) => code;
try {
  const { transformSync } = await import("esbuild");
  minify = (code) => transformSync(code, { minify: true }).code.trim();
} catch (_error) {
  // No esbuild (a host that skipped the install): the loader goes in as is.
}

const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const base64Url = (bytes) => Buffer.from(bytes).toString("base64url");
const pad = (index) => String(index + 1).padStart(3, "0");

function split(text) {
  const parts = [];
  for (let at = 0; at < text.length; at += CHUNK_SIZE) {
    parts.push(text.slice(at, at + CHUNK_SIZE));
  }
  return parts;
}

/** The script encrypted with a fresh key: only a passed licence check opens it. */
export function encryptScript(source, contentKey, iv) {
  const cipher = createCipheriv("aes-256-gcm", contentKey, iv);
  return Buffer.concat([
    cipher.update(source, "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
}

/** Everything the site consists of, as `{ "relative/path": content }`. */
export function buildSite({
  source,
  loaderSource,
  gateSource,
  baseUrl,
  landing,
  contentKey = randomBytes(32),
  iv = randomBytes(12),
}) {
  const build = source.match(/VERSION:\s*"([^"]+)"/)?.[1];
  if (!build) throw new Error("Cannot find the build version in mirrorads.js.");
  if (!/^https:\/\//.test(baseUrl)) {
    throw new Error(
      "The site address is unknown. Pass --base-url=https://… or set MIRRORADS_BASE_URL.",
    );
  }
  const og = `${baseUrl}/mirrorads/latest/og`;
  const manifestUrl = `${baseUrl}/mirrorads/latest/manifest`;

  // The script: encrypted; its pieces are named by their checksum, so
  // Facebook never holds an old copy under a current name.
  // URL-safe base64 without "=" padding: Facebook tidies descriptions and
  // drops trailing "=", so only letters that survive it are published. The
  // checksum covers the bytes, not their spelling.
  const sealed = encryptScript(source, contentKey, iv);
  const mainText = sealed.toString("base64url");
  const mainSha = sha256(sealed);
  const mainParts = split(mainText);
  const mainName = (index) => `main-${mainSha.slice(0, 12)}-${pad(index)}`;

  // The gate: plain, with this site and build written in.
  const gate = minify(
    gateSource
      .replaceAll("__BASE_URL__", baseUrl)
      .replaceAll("__BUILD__", build),
  );
  if (/__BASE_URL__|__BUILD__/.test(gate)) {
    throw new Error("hosting/gate.js still has a placeholder after the build.");
  }
  const gateSha = sha256(gate);
  const gateParts = split(Buffer.from(gate, "utf8").toString("base64"));
  const gateName = (index) => `gate-${gateSha.slice(0, 12)}-${pad(index)}`;

  // The manifest keeps the first loader's format: what it calls the
  // payload is the gate now, so bookmarks installed before keys still work.
  const manifest = {
    app: APP,
    version: build,
    payload: { sha256: gateSha, byteLength: Buffer.byteLength(gate, "utf8") },
    chunks: gateParts.map((_, index) => ({
      index: index + 1,
      url: `${og}/${gateName(index)}`,
    })),
  };

  const loader = minify(loaderSource.replace("__MANIFEST_URL__", manifestUrl));
  if (
    loader.includes("__MANIFEST_URL__") ||
    !loaderSource.includes("__MANIFEST_URL__")
  ) {
    throw new Error("hosting/loader.js has no __MANIFEST_URL__ placeholder.");
  }
  if (loader.split("__LICENSE_KEY__").length !== 2) {
    throw new Error(
      "hosting/loader.js must hold the __LICENSE_KEY__ placeholder once.",
    );
  }
  // The install page's bookmark has no key; the cabinet writes one into
  // loader.txt to make a personal bookmark.
  const bookmark = `javascript:${encodeURIComponent(loader.replace("__LICENSE_KEY__", ""))}`;
  const files = {
    "index.html": landing
      .replaceAll("__BOOKMARK__", escapeHtml(bookmark))
      .replaceAll("__BUILD__", escapeHtml(build))
      .replaceAll("__BASE_URL__", escapeHtml(baseUrl)),
    "mirrorads/latest/manifest.html": ogPage(
      `${APP} ${build} manifest`,
      Buffer.from(JSON.stringify(manifest), "utf8").toString("base64"),
    ),
    "mirrorads/latest/loader.txt": loader,
    "mirrorads/latest/info.json": `${JSON.stringify(
      {
        app: APP,
        version: build,
        manifestUrl,
        gate: { sha256: gateSha, parts: gateParts.length },
        main: { sha256: mainSha, parts: mainParts.length },
      },
      null,
      2,
    )}\n`,
    "404.html": "<!doctype html><title>404</title><p>Not found.</p>\n",
    // The pages change with every build and must never be served stale.
    _headers: "/*\n  Cache-Control: no-store\n",
  };
  gateParts.forEach((part, index) => {
    files[`mirrorads/latest/og/${gateName(index)}.html`] = ogPage(
      `${APP} ${build} gate ${index + 1}/${gateParts.length}`,
      part,
    );
  });
  mainParts.forEach((part, index) => {
    files[`mirrorads/latest/og/${mainName(index)}.html`] = ogPage(
      `${APP} ${build} part ${index + 1}/${mainParts.length}`,
      part,
    );
  });
  const release = {
    version: build,
    contentKey: base64Url(contentKey),
    main: {
      sha: mainSha,
      iv: base64Url(iv),
      parts: mainParts.length,
      size: sealed.length,
      lengths: mainParts.map((part) => part.length),
    },
  };
  return {
    files,
    build,
    manifestUrl,
    bookmark,
    chunks: gateParts.length,
    parts: mainParts.length,
    release,
    buildModule: buildModule(release),
  };
}

/** worker/generated/build.mjs: bundled into the Worker, never published. */
export function buildModule(release) {
  return `// Written by tools/build-site.mjs for each build. Do not edit or commit.\nexport const BUILD = ${JSON.stringify(release)};\n`;
}

/**
 * The site before its address is known. A host builds the project once to
 * give it an address at all; that first build must not fail, and it must not
 * publish a bookmark that points nowhere.
 */
export function buildPlaceholder() {
  return {
    "index.html": `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <title>${APP} — сайт создан</title>
</head>
<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#f6f7f9;color:#111827;font:16px/1.6 system-ui,sans-serif">
  <main style="width:min(560px,calc(100vw - 32px));padding:28px;border:1px solid #e5e7eb;border-radius:22px;background:#fff">
    <h1 style="margin:0 0 8px;font-size:24px">Сайт создан</h1>
    <p style="margin:0;color:#6b7280">Осталось указать его адрес в настройках проекта: скопируйте адрес этой страницы из строки браузера и передайте его разработчику. После этого здесь появится страница установки.</p>
  </main>
</body>
</html>
`,
    "404.html": "<!doctype html><title>404</title><p>Not found.</p>\n",
    _headers: "/*\n  Cache-Control: no-store\n",
  };
}

function main() {
  const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
  let config = {};
  try {
    config = JSON.parse(read("hosting/site.json"));
  } catch (_error) {
    // No site.json: the address comes from the flag or the environment.
  }
  const baseUrl = resolveBaseUrl({
    flag: arg("base-url"),
    env: process.env,
    config,
  });
  const site = baseUrl
    ? buildSite({
        source: read("mirrorads.js"),
        loaderSource: read("hosting/loader.js"),
        gateSource: read("hosting/gate.js"),
        landing: read("hosting/index.html"),
        baseUrl,
      })
    : {
        files: buildPlaceholder(),
        buildModule: buildModule({ version: "", contentKey: "", main: null }),
      };
  const out = path.resolve(ROOT, arg("out") || "dist");
  fs.rmSync(out, { recursive: true, force: true });
  for (const [file, content] of Object.entries(site.files)) {
    const target = path.join(out, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  const generated = path.join(ROOT, "worker", "generated", "build.mjs");
  fs.mkdirSync(path.dirname(generated), { recursive: true });
  fs.writeFileSync(generated, site.buildModule);
  if (!baseUrl) {
    console.log(
      `${APP}: the site address is not set yet; a placeholder page was built. Put {"baseUrl": "https://…"} into hosting/site.json.`,
    );
    return;
  }
  console.log(
    `${APP} ${site.build}: site built in ${path.relative(ROOT, out) || "."} (gate: ${site.chunks} piece(s), script: ${site.parts} encrypted piece(s)).`,
  );
  console.log(`Manifest: ${site.manifestUrl}`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
