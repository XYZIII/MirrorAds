import assert from "node:assert/strict";
import { createDecipheriv, createHash } from "node:crypto";
import fs from "node:fs";
import { test } from "node:test";
import {
  buildPlaceholder,
  buildSite,
  resolveBaseUrl,
} from "../tools/build-site.mjs";
import { handle } from "../worker/app.mjs";
import { ensureSchema } from "../worker/db.mjs";
import { sqlDatabase } from "../worker/store.mjs";
import { bookmarkFrom, clickBookmark } from "./helpers/ads-manager.mjs";
import { createStorage } from "./helpers/do-storage.mjs";
import { fakeFacebook } from "./helpers/facebook.mjs";

const BASE = "https://mirrorads-demo.example.workers.dev";
const read = (file) => fs.readFileSync(file, "utf8");
const sources = {
  loaderSource: read("hosting/loader.js"),
  gateSource: read("hosting/gate.js"),
  landing: read("hosting/index.html"),
};
const payload = (build) =>
  `/* MirrorAds */ const APP = { VERSION: "${build}" }; window.__ran = (window.__ran || []).concat("${build}");\n// ${"я".repeat(300000)}`;
const description = (html) =>
  html.match(/og:description" content="([^"]*)"/)[1].replace(/&amp;/g, "&");
const fromBase64 = (text) => Buffer.from(text, "base64").toString("utf8");

async function world(build = "141126b13") {
  const db = sqlDatabase(createStorage());
  await ensureSchema(db);
  const built = buildSite({
    source: payload(build),
    baseUrl: BASE,
    ...sources,
  });
  const facebook = fakeFacebook({
    base: BASE,
    worker: (url) => handle(new Request(url), {}, built.release, { db }),
  });
  facebook.publish(built);
  return { built, facebook, bookmark: bookmarkFrom(built.files["index.html"]) };
}

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

test("the built pages: a manifest for the gate, the script in encrypted pieces that add up to it", async () => {
  const { built } = await world("141126b13");
  const manifest = JSON.parse(
    fromBase64(description(built.files["mirrorads/latest/manifest.html"])),
  );
  assert.equal(manifest.app, "MirrorAds");
  assert.equal(manifest.version, "141126b13");
  const page = (url) => built.files[`${url.slice(BASE.length + 1)}.html`];
  const gate = fromBase64(
    manifest.chunks.map((chunk) => description(page(chunk.url))).join(""),
  );
  assert.ok(gate.includes(BASE) && gate.includes("141126b13"));
  assert.equal(
    createHash("sha256").update(gate).digest("hex"),
    manifest.payload.sha256,
  );

  const { main, contentKey } = built.release;
  const names = Array.from(
    { length: main.parts },
    (_, index) =>
      `mirrorads/latest/og/main-${main.sha.slice(0, 12)}-${String(index + 1).padStart(3, "0")}.html`,
  );
  const text = names
    .map((name) => {
      assert.ok(description(built.files[name]).length <= 350000);
      return description(built.files[name]);
    })
    .join("");
  assert.ok(main.parts >= 2, "a real script needs several pieces");
  assert.equal(createHash("sha256").update(text).digest("hex"), main.sha);
  const sealed = Buffer.from(text, "base64");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(contentKey, "base64url"),
    Buffer.from(main.iv, "base64url"),
  );
  decipher.setAuthTag(sealed.subarray(sealed.length - 16));
  const source = Buffer.concat([
    decipher.update(sealed.subarray(0, sealed.length - 16)),
    decipher.final(),
  ]).toString("utf8");
  assert.equal(source, payload("141126b13"));

  // The install page holds the bookmark with this site's manifest address.
  const href = built.files["index.html"].match(
    /id="bookmark" href="([^"]+)"/,
  )[1];
  assert.ok(href.startsWith("javascript:"));
  assert.ok(
    decodeURIComponent(href).includes(`${BASE}/mirrorads/latest/manifest`),
  );
  assert.ok(!/__[A-Z_]+__/.test(built.files["index.html"]));
  assert.throws(() =>
    buildSite({ source: payload("x"), baseUrl: "", ...sources }),
  );
});

test("first launch: Facebook reads the pages, the licence is checked, the script runs", async () => {
  const { facebook, bookmark } = await world();
  const result = await clickBookmark({ facebook, bookmark });
  assert.deepEqual(result.alerts, []);
  assert.deepEqual(result.ran, ["141126b13"]);
  assert.equal(result.loader.source, "remote");
  assert.equal(result.gate.source, "remote");
  assert.ok(
    JSON.parse(result.storage["mirrorads.loader.cache.v1"]).source.includes(
      "mirrorads.license.state.v1",
    ),
    "the loader keeps the gate, not the script",
  );
});

test("a damaged copy at Facebook is never run: the pieces are read again", async () => {
  const { facebook, bookmark, built } = await world();
  await clickBookmark({ facebook, bookmark });
  // Facebook's copies of every piece go bad; the live pages are fine.
  for (const url of Object.keys(facebook.copies)) {
    if (url.includes("/og/")) {
      facebook.copies[url] = facebook.copies[url].replace(
        /og:description" content="[^"]{10}/,
        'og:description" content="AAAAAAAAAA',
      );
    }
  }
  facebook.scraped.length = 0;
  const result = await clickBookmark({ facebook, bookmark });
  assert.deepEqual(result.ran, ["141126b13"]);
  assert.deepEqual(result.alerts, []);
  const gateUrl = JSON.parse(
    fromBase64(description(built.files["mirrorads/latest/manifest.html"])),
  ).chunks[0].url;
  assert.ok(
    facebook.scraped.includes(gateUrl),
    "the gate piece was read again",
  );
  assert.ok(
    facebook.scraped.some((url) => url.includes("/og/main-")),
    "the script pieces were read again",
  );
});

test("a host the page may not call is skipped; the message names the step", async () => {
  const { facebook, bookmark } = await world();
  const calls = [];
  const picky = {
    fetch: async (url, init = {}) => {
      const host = new URL(url).hostname;
      calls.push(`${init.method || "GET"} ${host}`);
      // The Ads Manager host refuses lookups by URL, the public one refuses
      // everything else, the way a page's rules can split them.
      const byUrl = new URL(url).searchParams.has("id");
      if ((host === "adsmanager-graph.facebook.com") === byUrl) {
        throw new TypeError("Failed to fetch");
      }
      return facebook.fetch(url, init);
    },
  };
  const result = await clickBookmark({ facebook: picky, bookmark });
  assert.deepEqual(result.alerts, []);
  assert.deepEqual(result.ran, ["141126b13"]);
  assert.ok(calls.includes("POST graph.facebook.com"));

  const blocked = {
    fetch: async () => {
      throw new TypeError("Failed to fetch");
    },
  };
  const failed = await clickBookmark({ facebook: blocked, bookmark });
  assert.match(
    failed.alerts[0],
    /поиск страницы — adsmanager-graph: Failed to fetch; graph: Failed to fetch/,
  );
  assert.deepEqual(failed.ran, []);
});

test("a page Facebook reads a few seconds after being asked is waited for", async () => {
  const { facebook, bookmark } = await world();
  let lookups = 0;
  const slow = {
    fetch: async (url, init = {}) => {
      const parsed = new URL(url);
      const response = await facebook.fetch(url, init);
      if (!parsed.searchParams.has("id")) return response;
      // The scrape answer carries no object, and the first lookups after it
      // still find nothing.
      const late = init.method === "POST" || (lookups += 1) < 4;
      return late
        ? {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({ id: parsed.searchParams.get("id") }),
          }
        : response;
    },
  };
  const result = await clickBookmark({ facebook: slow, bookmark });
  assert.deepEqual(result.alerts, []);
  assert.deepEqual(result.ran, ["141126b13"]);

  // A page Facebook never manages to read: the message shows its answer.
  const never = {
    fetch: async (url) => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ id: new URL(url).searchParams.get("id") || "x" }),
    }),
  };
  const failed = await clickBookmark({ facebook: never, bookmark });
  assert.match(
    failed.alerts[0],
    /не смог прочитать страницу .*manifest \(ответ: \{"id"/,
  );
});

test("when Facebook is unreachable the saved script still starts; an operation blocks a reload", async () => {
  const { facebook, bookmark } = await world();
  const first = await clickBookmark({ facebook, bookmark });
  const offline = {
    fetch: async () => {
      throw new Error("network down");
    },
  };
  let result = await clickBookmark({
    facebook: offline,
    bookmark,
    storage: first.storage,
  });
  assert.deepEqual(result.ran, ["141126b13"]);
  assert.equal(result.loader.source, "cache-offline");
  assert.equal(result.gate.source, "cache");

  // Nothing saved and nothing reachable: a clear message, nothing runs.
  result = await clickBookmark({ facebook: offline, bookmark });
  assert.deepEqual(result.ran, []);
  assert.match(result.alerts[0], /network down/);

  result = await clickBookmark({
    facebook,
    bookmark,
    storage: first.storage,
    busy: true,
  });
  assert.deepEqual(result.ran, []);
  assert.equal(result.alerts.length, 1);
});

test("before the address is known the site is a placeholder without a bookmark", () => {
  const files = buildPlaceholder();
  assert.deepEqual(Object.keys(files).sort(), [
    "404.html",
    "_headers",
    "index.html",
  ]);
  assert.ok(!files["index.html"].includes("javascript:"));
});
