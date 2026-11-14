#!/usr/bin/env node
// Builds the hosted site into dist/: the install page with the one-line
// bookmark, and the pages Facebook reads to deliver updates.
//
//   node tools/build-site.mjs [--base-url=https://example.com] [--out=dist]
//
// It needs no dependencies and uses the committed mirrorads.js, so a static
// host can run it as its build command. The site address comes from
// --base-url, MIRRORADS_BASE_URL, hosting/site.json, or Cloudflare Pages.
import { createHash } from "node:crypto";
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

/** Everything the site consists of, as `{ "relative/path": content }`. */
export function buildSite({ source, loaderSource, baseUrl, landing }) {
  const build = source.match(/VERSION:\s*"([^"]+)"/)?.[1];
  if (!build) throw new Error("Cannot find the build version in mirrorads.js.");
  if (!/^https:\/\//.test(baseUrl)) {
    throw new Error(
      "The site address is unknown. Pass --base-url=https://… or set MIRRORADS_BASE_URL.",
    );
  }
  const encoded = Buffer.from(source, "utf8").toString("base64");
  const chunks = [];
  for (let at = 0; at < encoded.length; at += CHUNK_SIZE) {
    chunks.push(encoded.slice(at, at + CHUNK_SIZE));
  }
  const name = (index) => `chunk-${String(index + 1).padStart(3, "0")}`;
  const manifestUrl = `${baseUrl}/mirrorads/latest/manifest`;
  const manifest = {
    app: APP,
    version: build,
    payload: {
      sha256: createHash("sha256").update(source).digest("hex"),
      byteLength: Buffer.byteLength(source, "utf8"),
    },
    chunks: chunks.map((_, index) => ({
      index: index + 1,
      url: `${baseUrl}/mirrorads/latest/og/${name(index)}`,
    })),
  };
  const loader = loaderSource.replace("__MANIFEST_URL__", manifestUrl);
  if (loader === loaderSource) {
    throw new Error("hosting/loader.js has no __MANIFEST_URL__ placeholder.");
  }
  const bookmark = `javascript:${encodeURIComponent(minify(loader))}`;
  const files = {
    "index.html": landing
      .replaceAll("__BOOKMARK__", escapeHtml(bookmark))
      .replaceAll("__BUILD__", escapeHtml(build)),
    "mirrorads/latest/manifest.html": ogPage(
      `${APP} ${build} manifest`,
      Buffer.from(JSON.stringify(manifest), "utf8").toString("base64"),
    ),
    "mirrorads/latest/info.json": `${JSON.stringify({ ...manifest, manifestUrl }, null, 2)}\n`,
    // The pages change with every build and must never be served stale.
    _headers: "/*\n  Cache-Control: no-store\n  X-Robots-Tag: noindex\n",
  };
  chunks.forEach((chunk, index) => {
    files[`mirrorads/latest/og/${name(index)}.html`] = ogPage(
      `${APP} ${build} chunk ${index + 1}/${chunks.length}`,
      chunk,
    );
  });
  return { files, build, manifestUrl, bookmark, chunks: chunks.length };
}

function main() {
  const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
  let config = {};
  try {
    config = JSON.parse(read("hosting/site.json"));
  } catch (_error) {
    // No site.json: the address comes from the flag or the environment.
  }
  const site = buildSite({
    source: read("mirrorads.js"),
    loaderSource: read("hosting/loader.js"),
    landing: read("hosting/index.html"),
    baseUrl: resolveBaseUrl({
      flag: arg("base-url"),
      env: process.env,
      config,
    }),
  });
  const out = path.resolve(ROOT, arg("out") || "dist");
  fs.rmSync(out, { recursive: true, force: true });
  for (const [file, content] of Object.entries(site.files)) {
    const target = path.join(out, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  console.log(
    `${APP} ${site.build}: site built in ${path.relative(ROOT, out) || "."} (${site.chunks} chunk(s)).`,
  );
  console.log(`Manifest: ${site.manifestUrl}`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
