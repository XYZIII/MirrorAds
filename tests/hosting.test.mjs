import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import fs from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { buildSite, resolveBaseUrl } from "../tools/build-site.mjs";

const loaderSource = fs.readFileSync("hosting/loader.js", "utf8");
const landing = fs.readFileSync("hosting/index.html", "utf8");
const BASE = "https://mirrorads-demo.pages.dev";
const payload = (build, filler = 900000) =>
  `/* MirrorAds */ const APP = { VERSION: "${build}" }; window.__ran = "${build}";\n// ${"я".repeat(filler / 2)}`;
const site = (build) =>
  buildSite({ source: payload(build), loaderSource, landing, baseUrl: BASE });
const description = (html) =>
  html.match(/og:description" content="([^"]*)"/)[1].replace(/&amp;/g, "&");
const title = (html) => html.match(/og:title" content="([^"]*)"/)[1];

test("the site address is taken from the flag, the config or Cloudflare Pages", () => {
  assert.equal(
    resolveBaseUrl({ flag: "https://a.example/" }),
    "https://a.example",
  );
  assert.equal(
    resolveBaseUrl({ env: { MIRRORADS_BASE_URL: "https://b.example" } }),
    "https://b.example",
  );
  assert.equal(
    resolveBaseUrl({
      env: { CF_PAGES_URL: "https://3f2a91bc.mirrorads.pages.dev" },
      config: { baseUrl: "https://ads.example" },
    }),
    "https://ads.example",
  );
  // A single deployment's address becomes the project's stable address.
  assert.equal(
    resolveBaseUrl({
      env: { CF_PAGES_URL: "https://3f2a91bc.mirrorads.pages.dev" },
    }),
    "https://mirrorads.pages.dev",
  );
  assert.equal(resolveBaseUrl({}), "");
});

test("the built pages carry the script in pieces that add up to it", () => {
  const built = site("141126b13");
  const manifest = JSON.parse(
    Buffer.from(
      description(built.files["mirrorads/latest/manifest.html"]),
      "base64",
    ).toString("utf8"),
  );
  assert.equal(manifest.version, "141126b13");
  assert.ok(manifest.chunks.length >= 2, "a real script needs several pieces");
  const encoded = manifest.chunks
    .map((chunk) => {
      const file = `${chunk.url.slice(BASE.length + 1)}.html`;
      assert.ok(description(built.files[file]).length <= 350000);
      return description(built.files[file]);
    })
    .join("");
  const source = Buffer.from(encoded, "base64").toString("utf8");
  assert.equal(source, payload("141126b13"));
  assert.equal(
    createHash("sha256").update(source).digest("hex"),
    manifest.payload.sha256,
  );
  // The install page holds the bookmark with this site's manifest address.
  const href = built.files["index.html"].match(
    /id="bookmark" href="([^"]+)"/,
  )[1];
  assert.ok(href.startsWith("javascript:"));
  assert.ok(
    decodeURIComponent(href).includes(`${BASE}/mirrorads/latest/manifest`),
  );
  assert.ok(!built.files["index.html"].includes("__BOOKMARK__"));
  assert.throws(() =>
    buildSite({ source: payload("x"), loaderSource, landing, baseUrl: "" }),
  );
});

/**
 * A fake Facebook: it holds its own copy of every published page and only
 * refreshes a copy when asked to scrape it, like the real link preview.
 */
function fakeFacebook() {
  const live = {};
  const copies = {};
  const scraped = [];
  let nextId = 1;
  const ids = {};
  const publish = (built) => {
    for (const [file, html] of Object.entries(built.files)) {
      if (!file.endsWith(".html") || file === "index.html") continue;
      live[`${BASE}/${file.replace(/\.html$/, "")}`] = html;
    }
  };
  const fetch = async (url, init = {}) => {
    const parsed = new URL(url);
    const reply = (json) => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(json),
    });
    const pageUrl = parsed.searchParams.get("id");
    if (pageUrl) {
      if (parsed.searchParams.get("scrape") === "true") {
        assert.equal(init.method, "POST");
        scraped.push(pageUrl);
        if (live[pageUrl]) {
          copies[pageUrl] = live[pageUrl];
          ids[pageUrl] ||= String(nextId++);
        }
      }
      return reply(ids[pageUrl] ? { og_object: { id: ids[pageUrl] } } : {});
    }
    const id = parsed.pathname.split("/").pop();
    const found = Object.keys(ids).find((key) => ids[key] === id);
    return reply({
      title: title(copies[found]),
      description: description(copies[found]),
    });
  };
  return { fetch, publish, scraped, copies };
}

async function runLoader(facebook, storage, built, { busy = false } = {}) {
  const ran = [];
  const alerts = [];
  const window = {
    __accessToken: "TOKEN",
    MirrorAds: busy ? { state: { busy: true } } : undefined,
  };
  const context = {
    window,
    location: { hostname: "adsmanager.facebook.com", href: "" },
    performance: { getEntriesByType: () => [] },
    localStorage: {
      getItem: (key) => (key in storage ? storage[key] : null),
      setItem: (key, value) => {
        storage[key] = String(value);
      },
    },
    fetch: facebook.fetch,
    crypto: webcrypto,
    alert: (message) => alerts.push(message),
    console: { log() {}, warn() {}, error() {} },
    setTimeout: (callback) => setTimeout(callback, 0),
    atob,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    URL: class extends URL {
      static createObjectURL(blob) {
        ran.push(blob);
        return "blob:x";
      }
      static revokeObjectURL() {}
    },
    Blob: class {
      constructor(parts) {
        this.text = parts.join("");
      }
    },
    document: {
      head: {
        appendChild(script) {
          setTimeout(() => script.onload(), 0);
        },
      },
      createElement: () => ({ remove() {} }),
    },
    Date,
    Promise,
    JSON,
    Object,
    Number,
    String,
    Array,
    Error,
    encodeURIComponent,
  };
  const href = built.files["index.html"]
    .match(/id="bookmark" href="([^"]+)"/)[1]
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  vm.runInNewContext(
    decodeURIComponent(href.slice("javascript:".length)),
    context,
  );
  await window.__MirrorAdsLoader?.done;
  const version = (text) => text?.match(/VERSION: "([^"]+)"/)?.[1] || "";
  return {
    ran: ran.map((blob) => version(blob.text)),
    alerts,
    guard: window.__MirrorAdsLoader,
  };
}

test("first launch: the loader makes Facebook read the pages and runs the script", async () => {
  const facebook = fakeFacebook();
  const built = site("141126b13");
  facebook.publish(built);
  const storage = {};
  const result = await runLoader(facebook, storage, built);
  assert.deepEqual(result.alerts, []);
  assert.deepEqual(result.ran, ["141126b13"]);
  assert.equal(result.guard.source, "remote");
  assert.equal(
    JSON.parse(storage["mirrorads.loader.cache.v1"]).version,
    "141126b13",
  );
});

test("an update reaches the browser by itself, never as a half-updated script", async () => {
  const facebook = fakeFacebook();
  const first = site("141126b13");
  facebook.publish(first);
  const storage = {};
  await runLoader(facebook, storage, first);

  // A new build is published; Facebook still holds the old copies.
  const second = site("151126b1");
  facebook.publish(second);
  facebook.scraped.length = 0;
  let result = await runLoader(facebook, storage, first);
  assert.deepEqual(
    result.ran,
    ["141126b13"],
    "the saved script starts at once",
  );
  assert.equal(result.guard.source, "cache");
  assert.deepEqual(facebook.scraped, [], "no re-read inside the quiet period");

  // Later the loader asks Facebook to re-read the manifest in the background…
  storage["mirrorads.loader.refresh.v1"] = "0";
  result = await runLoader(facebook, storage, first);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(result.ran, ["141126b13"]);
  assert.deepEqual(facebook.scraped, [`${BASE}/mirrorads/latest/manifest`]);

  // …and the next launch finds the new manifest while the pieces are still
  // old: they are re-read, checked against the checksum, and only then run.
  result = await runLoader(facebook, storage, first);
  assert.deepEqual(result.ran, ["151126b1"]);
  assert.equal(result.guard.source, "remote");
  assert.deepEqual(result.alerts, []);
  assert.equal(
    JSON.parse(storage["mirrorads.loader.cache.v1"]).version,
    "151126b1",
  );
});

test("when Facebook is unreachable the saved script still starts; an operation blocks a reload", async () => {
  const facebook = fakeFacebook();
  const built = site("141126b13");
  facebook.publish(built);
  const storage = {};
  await runLoader(facebook, storage, built);
  const offline = {
    fetch: async () => {
      throw new Error("network down");
    },
  };
  let result = await runLoader(offline, storage, built);
  assert.deepEqual(result.ran, ["141126b13"]);
  assert.equal(result.guard.source, "cache-offline");

  // Nothing saved and nothing reachable: a clear message, nothing runs.
  result = await runLoader(offline, {}, built);
  assert.deepEqual(result.ran, []);
  assert.match(result.alerts[0], /network down/);

  result = await runLoader(facebook, storage, built, { busy: true });
  assert.deepEqual(result.ran, []);
  assert.equal(result.alerts.length, 1);
});

test("before the address is known the site is a placeholder without a bookmark", async () => {
  const { buildPlaceholder } = await import("../tools/build-site.mjs");
  const files = buildPlaceholder();
  assert.deepEqual(Object.keys(files).sort(), [
    "404.html",
    "_headers",
    "index.html",
  ]);
  assert.ok(!files["index.html"].includes("javascript:"));
});
