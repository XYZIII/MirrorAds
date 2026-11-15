import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { test } from "node:test";
import { buildSite } from "../tools/build-site.mjs";
import { handle } from "../worker/app.mjs";
import {
  DAY_MS,
  createLicense,
  ensureSchema,
  extendLicense,
  setSettings,
} from "../worker/db.mjs";
import { sqlDatabase } from "../worker/store.mjs";
import { bookmarkFrom, clickBookmark } from "./helpers/ads-manager.mjs";
import { createStorage } from "./helpers/do-storage.mjs";
import { fakeFacebook } from "./helpers/facebook.mjs";

const BASE = "https://mirrorads.example.workers.dev";
const read = (file) => fs.readFileSync(file, "utf8");
const sources = {
  loaderSource: read("hosting/loader.js"),
  gateSource: read("hosting/gate.js"),
  landing: read("hosting/index.html"),
};
const MARKER = "window.__ran = (window.__ran || []).concat";
const app = (build) =>
  `// MirrorAds VERSION: "${build}"\n${MARKER}("${build}");\n// ${"я".repeat(150000)}`;
const STATE = "mirrorads.license.state.v1";
const HOUR = 60 * 60 * 1000;

/** A published site, its licence server and the Facebook in between. */
async function world() {
  const db = sqlDatabase(createStorage());
  await ensureSchema(db);
  let release = null;
  let built = null;
  const worker = (url) => handle(new Request(url), {}, release, { db });
  const facebook = fakeFacebook({ base: BASE, worker });
  const publish = (build) => {
    built = buildSite({ source: app(build), baseUrl: BASE, ...sources });
    release = built.release;
    facebook.publish(built);
    return built;
  };
  return {
    db,
    facebook,
    publish,
    get built() {
      return built;
    },
    generic: () => bookmarkFrom(built.files["index.html"]),
    personal: (key) =>
      `javascript:${encodeURIComponent(
        built.files["mirrorads/latest/loader.txt"].replace(
          "__LICENSE_KEY__",
          key,
        ),
      )}`,
    enforce: (on) => setSettings(db, { enforce: on ? "1" : "0" }),
  };
}

const lookedUpLicence = (facebook) =>
  facebook.scraped.some((url) => url.startsWith(`${BASE}/l/`));
const age = (storage, changes) => ({
  ...storage,
  [STATE]: JSON.stringify({ ...JSON.parse(storage[STATE]), ...changes }),
});

test("the script is published only encrypted; the gate and the bookmark carry no secrets", async () => {
  const site = await world();
  const built = site.publish("161126b1");
  for (const [file, content] of Object.entries(built.files)) {
    assert.ok(
      !content.includes(MARKER),
      `${file} must not hold the script in the clear`,
    );
    assert.ok(
      !content.includes(built.release.contentKey),
      `${file} must not hold the script key`,
    );
  }
  assert.ok(built.parts >= 2);
  assert.match(built.buildModule, /export const BUILD = /);
  assert.ok(built.buildModule.includes(built.release.contentKey));
  assert.doesNotMatch(
    decodeURIComponent(site.generic()),
    /MA-[A-Z2-9]{8}-/,
    "the install page's bookmark has no key",
  );
  assert.equal(
    built.files["mirrorads/latest/loader.txt"].split("__LICENSE_KEY__").length,
    2,
  );
});

test("check off: the install page's bookmark works without a key, then starts from this browser", async () => {
  const site = await world();
  site.publish("161126b1");
  const first = await clickBookmark({
    facebook: site.facebook,
    bookmark: site.generic(),
  });
  assert.deepEqual(first.alerts, []);
  assert.deepEqual(first.ran, ["161126b1"]);
  assert.equal(first.gate.source, "remote");
  assert.equal(first.license.mode, "free");
  assert.equal(first.dialog, null);
  assert.ok(
    !first.storage["mirrorads.app.cache.v2"].includes(MARKER),
    "saved encrypted",
  );

  site.facebook.scraped.length = 0;
  const second = await clickBookmark({
    facebook: site.facebook,
    bookmark: site.generic(),
    storage: first.storage,
  });
  assert.deepEqual(second.ran, ["161126b1"]);
  assert.equal(second.gate.source, "cache");
  assert.ok(
    !lookedUpLicence(site.facebook),
    "no licence check within 12 hours",
  );
});

test("a personal bookmark carries the key: each Facebook profile is counted, the panel learns the end date", async () => {
  const site = await world();
  site.publish("161126b1");
  const license = await createLicense(site.db, { days: 30, now: Date.now() });
  const bookmark = site.personal(license.key);
  const result = await clickBookmark({ facebook: site.facebook, bookmark });
  assert.deepEqual(result.ran, ["161126b1"]);
  assert.equal(result.license.mode, "key");
  assert.equal(result.license.key, `MA-${license.id}`);
  assert.equal(result.license.expiresAt, license.expires_at);
  assert.equal(
    result.license.renewUrl,
    `${BASE}/buy#renew=${encodeURIComponent(license.key)}`,
  );
  assert.equal(result.license.cabinetUrl, `${BASE}/cabinet#${license.key}`);
  assert.ok(
    !result.storage["mirrorads.license.key.v1"],
    "a bookmark key is not copied anywhere",
  );

  await clickBookmark({
    facebook: site.facebook,
    bookmark,
    cUser: "100099999999",
  });
  const seats = await site.db
    .prepare("SELECT seat FROM seats ORDER BY first_seen")
    .all();
  const hashed = createHash("sha256")
    .update(`mirrorads-seat:${license.id}:100012345678`)
    .digest("hex")
    .slice(0, 32);
  assert.equal(seats.results.length, 2);
  assert.equal(
    seats.results[0].seat,
    hashed,
    "only a hash of the profile reaches the server",
  );
  const sealedUrls = site.facebook.scraped.filter((url) =>
    url.startsWith(`${BASE}/l/${license.id}/`),
  );
  assert.ok(
    sealedUrls.every(
      (url) => !url.includes("100012345678") && !url.includes(license.secret),
    ),
  );
});

test("check on: a missing key is asked for, a wrong one explained, the right one remembered", async () => {
  const site = await world();
  site.publish("161126b1");
  await site.enforce(true);
  const license = await createLicense(site.db, { days: 30, now: Date.now() });
  const messages = [];
  const result = await clickBookmark({
    facebook: site.facebook,
    bookmark: site.generic(),
    storage: { "mirrorads.panel.lang": "ru" },
    interact: async ({ dialog }) => {
      const root = dialog();
      messages.push(root.querySelector("h2").textContent);
      const message = root.querySelector("[data-msg]");
      root.querySelector("input").value = "MA-ABCDEFGH-123";
      root.querySelector('[data-act="activate"]').click();
      messages.push(message.textContent);
      root.querySelector("input").value = "MA-ABCDEFGH-JKMNPQRSTUVWXYZ23456";
      root.querySelector('[data-act="activate"]').click();
      for (
        let i = 0;
        i < 500 && !message.textContent.includes("подошёл");
        i += 1
      ) {
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
      messages.push(message.textContent);
      root.querySelector("input").value = ` ${license.key.toLowerCase()} `;
      root.querySelector('[data-act="activate"]').click();
    },
  });
  assert.equal(messages[0], "Нужен ключ лицензии");
  assert.match(messages[1], /MA-XXXXXXXX/);
  assert.match(messages[2], /Ключ не подошёл/);
  assert.deepEqual(result.ran, ["161126b1"]);
  assert.equal(result.storage["mirrorads.license.key.v1"], license.key);
  assert.equal(result.dialog, null);

  const next = await clickBookmark({
    facebook: site.facebook,
    bookmark: site.generic(),
    storage: result.storage,
  });
  assert.deepEqual(next.ran, ["161126b1"]);
  assert.equal(next.dialog, null);
  assert.equal(next.license.key, `MA-${license.id}`);
});

test("an ended subscription stops the script and offers renewal; renewing brings it back", async () => {
  const site = await world();
  site.publish("161126b1");
  const license = await createLicense(site.db, { days: 30, now: Date.now() });
  const bookmark = site.personal(license.key);
  const ok = await clickBookmark({ facebook: site.facebook, bookmark });
  assert.deepEqual(ok.ran, ["161126b1"]);

  // The subscription ends while the owner requires keys.
  await site.enforce(true);
  await site.db
    .prepare("UPDATE licenses SET expires_at = ? WHERE id = ?")
    .bind(Date.now() - DAY_MS, license.id)
    .run();
  // Within 12 hours the saved pass still starts the script; after that the
  // check runs in the background and its refusal counts next time.
  const stale = age(ok.storage, { checkedAt: Date.now() - 13 * HOUR });
  const background = await clickBookmark({
    facebook: site.facebook,
    bookmark,
    storage: stale,
  });
  assert.deepEqual(background.ran, ["161126b1"]);
  assert.equal(
    background.storage[STATE],
    undefined,
    "the refusal removed the saved pass",
  );

  const stopped = await clickBookmark({
    facebook: site.facebook,
    bookmark,
    storage: background.storage,
    interact: async ({ dialog }) => {
      dialog().querySelector('[data-act="renew"]').click();
      dialog().querySelector('[data-act="close"]').click();
    },
  });
  assert.deepEqual(stopped.ran, []);
  assert.deepEqual(stopped.opened, [
    `${BASE}/buy#renew=${encodeURIComponent(license.key)}`,
  ]);

  await extendLicense(site.db, license.id, 30, Date.now());
  const renewed = await clickBookmark({
    facebook: site.facebook,
    bookmark,
    storage: stopped.storage,
  });
  assert.deepEqual(renewed.ran, ["161126b1"]);
  assert.ok(renewed.license.expiresAt > Date.now() + 29 * DAY_MS);
});

test("a new build: a fresh check brings its key, and only the new pieces are read", async () => {
  const site = await world();
  site.publish("161126b1");
  const first = await clickBookmark({
    facebook: site.facebook,
    bookmark: site.generic(),
  });
  site.publish("161126b2");
  // The loader notices the new manifest after its background re-read.
  const storage = { ...first.storage, "mirrorads.loader.refresh.v1": "0" };
  const quiet = await clickBookmark({
    facebook: site.facebook,
    bookmark: site.generic(),
    storage,
  });
  assert.deepEqual(quiet.ran, ["161126b1"]);
  await new Promise((resolve) => setTimeout(resolve, 20));
  site.facebook.scraped.length = 0;
  const updated = await clickBookmark({
    facebook: site.facebook,
    bookmark: site.generic(),
    storage: quiet.storage,
  });
  assert.deepEqual(updated.ran, ["161126b2"]);
  assert.ok(lookedUpLicence(site.facebook));
  const sha = site.built.release.main.sha.slice(0, 12);
  const parts = site.facebook.scraped.filter((url) =>
    url.includes("/og/main-"),
  );
  assert.ok(parts.length && parts.every((url) => url.includes(`main-${sha}-`)));
  assert.equal(
    JSON.parse(updated.storage["mirrorads.app.cache.v2"]).sha,
    site.built.release.main.sha,
  );
});

test("after a start the gate looks for a new build: it is announced, and the next click runs it", async () => {
  const site = await world();
  site.publish("161126b1");
  const first = await clickBookmark({
    facebook: site.facebook,
    bookmark: site.generic(),
  });
  site.publish("161126b2");
  // Two minutes later: the loader's own 20-minute wait has not passed.
  const storage = {
    ...first.storage,
    "mirrorads.loader.refresh.v1": String(Date.now() - 2 * 60 * 1000),
  };
  const second = await clickBookmark({
    facebook: site.facebook,
    bookmark: site.generic(),
    storage,
  });
  assert.deepEqual(second.ran, ["161126b1"]);
  const note = second.window.document.getElementById("mirrorads-update");
  assert.ok(note, "the new build is announced");
  assert.match(note.shadowRoot.textContent, /161126b2/);
  const third = await clickBookmark({
    facebook: site.facebook,
    bookmark: site.generic(),
    storage: second.storage,
  });
  assert.deepEqual(third.ran, ["161126b2"]);
  assert.equal(
    third.window.document.getElementById("mirrorads-update"),
    null,
    "nothing to announce when the build is current",
  );
});

test("a saved pass naming pieces that are gone asks the server again once", async () => {
  const site = await world();
  site.publish("161126b1");
  const first = await clickBookmark({
    facebook: site.facebook,
    bookmark: site.generic(),
  });
  const old = JSON.parse(first.storage[STATE]).main.sha.slice(0, 12);
  // The same build is published again with new pieces; the old ones are gone,
  // and this browser never managed to save the script.
  site.publish("161126b1");
  for (const map of [site.facebook.live, site.facebook.copies]) {
    for (const url of Object.keys(map))
      if (url.includes(`main-${old}-`)) delete map[url];
  }
  const storage = { ...first.storage };
  delete storage["mirrorads.app.cache.v2"];
  const result = await clickBookmark({
    facebook: site.facebook,
    bookmark: site.generic(),
    storage,
  });
  assert.deepEqual(result.ran, ["161126b1"]);
  assert.equal(result.dialog, null);
  assert.equal(
    JSON.parse(result.storage[STATE]).main.sha,
    site.built.release.main.sha,
  );
});

test("without Facebook the last pass keeps the script running for a week, then asks to retry", async () => {
  const site = await world();
  site.publish("161126b1");
  const online = await clickBookmark({
    facebook: site.facebook,
    bookmark: site.generic(),
  });
  const offline = {
    fetch: async () => {
      throw new TypeError("Failed to fetch");
    },
  };
  const daysAgo = (days) =>
    age(online.storage, {
      checkedAt: Date.now() - days * DAY_MS,
      okAt: Date.now() - days * DAY_MS,
    });
  let result = await clickBookmark({
    facebook: offline,
    bookmark: site.generic(),
    storage: daysAgo(2),
  });
  assert.deepEqual(result.ran, ["161126b1"]);
  assert.equal(result.loader.source, "cache-offline");

  let retried = false;
  result = await clickBookmark({
    facebook: offline,
    bookmark: site.generic(),
    storage: daysAgo(8),
    interact: async ({ dialog }) => {
      assert.match(dialog().querySelector("p").textContent, /Failed to fetch/);
      retried = Boolean(dialog().querySelector('[data-act="retry"]'));
      dialog().querySelector('[data-act="close"]').click();
    },
  });
  assert.ok(retried);
  assert.deepEqual(result.ran, []);
});

test("an old answer passed off as a new one is refused", async () => {
  const site = await world();
  site.publish("161126b1");
  const license = await createLicense(site.db, { days: 30, now: Date.now() });
  await clickBookmark({
    facebook: site.facebook,
    bookmark: site.personal(license.key),
  });
  const firstAnswer = Object.entries(site.facebook.copies).find(([url]) =>
    url.startsWith(`${BASE}/l/`),
  )[1];
  // A Facebook that hands out the first answer for every licence page.
  const replaying = {
    fetch: async (url, init) => {
      const response = await site.facebook.fetch(url, init);
      const pageUrl = new URL(url).searchParams.get("id") || "";
      if (pageUrl.startsWith(`${BASE}/l/`))
        site.facebook.copies[pageUrl] = firstAnswer;
      return response;
    },
  };
  let shown = "";
  const result = await clickBookmark({
    facebook: replaying,
    bookmark: site.personal(license.key),
    interact: async ({ dialog }) => {
      shown = dialog().querySelector("p").textContent;
      dialog().querySelector('[data-act="close"]').click();
    },
  });
  assert.deepEqual(result.ran, []);
  assert.match(shown, /unreadable/);
});

test("bookmarks installed before licence keys still work, and ask for a key when one is needed", async () => {
  const site = await world();
  const built = site.publish("161126b1");
  const oldLoader = read("tests/fixtures/loader-v1.js").replace(
    "__MANIFEST_URL__",
    built.manifestUrl,
  );
  const oldBookmark = `javascript:${encodeURIComponent(oldLoader)}`;
  const free = await clickBookmark({
    facebook: site.facebook,
    bookmark: oldBookmark,
  });
  assert.deepEqual(free.ran, ["161126b1"]);

  await site.enforce(true);
  const license = await createLicense(site.db, { days: 30, now: Date.now() });
  const keyed = await clickBookmark({
    facebook: site.facebook,
    bookmark: oldBookmark,
    storage: age(free.storage, { checkedAt: 0, okAt: 0 }),
    interact: async ({ dialog }) => {
      dialog().querySelector("input").value = license.key;
      dialog().querySelector('[data-act="activate"]').click();
    },
  });
  assert.deepEqual(keyed.ran, ["161126b1"]);
  assert.equal(keyed.license.key, `MA-${license.id}`);
});
