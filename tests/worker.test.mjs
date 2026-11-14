import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import { test } from "node:test";
import { WORKER_ROUTES, handle, isWorkerPath } from "../worker/app.mjs";
import {
  licenseCipherKey,
  openJson,
  safeEqual,
  sealJson,
} from "../worker/crypto.mjs";
import {
  DAY_MS,
  createLicense,
  ensureSchema,
  getLicense,
  getOrder,
  setSettings,
} from "../worker/db.mjs";
import { formatKey, newLicenseKey, parseKey } from "../worker/keys.mjs";
import { readPlain } from "../worker/license-check.mjs";
import { parseUsd, quote } from "../worker/pricing.mjs";
import { sqlDatabase } from "../worker/store.mjs";
import { createStorage } from "./helpers/do-storage.mjs";

const ORIGIN = "https://mirrorads.example.workers.dev";
const NOW = Date.UTC(2026, 10, 15, 12, 0, 0);
const RELEASE = {
  version: "161126b1",
  contentKey: "Y29udGVudC1rZXk",
  main: { sha: "ab".repeat(32), iv: "aXYtaXYtaXYtaXY", parts: 2 },
};
const PASSWORD = "correct horse";
const MERCHANT = "merchant-key-123";

function setup({ env = {}, now = NOW, oxapay } = {}) {
  const storage = createStorage();
  const db = sqlDatabase(storage);
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    const reply = oxapay ? oxapay(url, init) : { status: 200, data: {} };
    return { ok: true, status: 200, json: async () => reply };
  };
  const clock = { now };
  const fullEnv = {
    ADMIN_PASSWORD: PASSWORD,
    OXAPAY_MERCHANT_KEY: MERCHANT,
    ...env,
  };
  const call = (
    path,
    { method = "GET", body, headers = {}, admin = false } = {},
  ) => {
    const allHeaders = { ...headers };
    if (admin) {
      allHeaders.authorization = `Basic ${Buffer.from(`owner:${PASSWORD}`).toString("base64")}`;
      allHeaders["x-mirrorads"] = "admin";
    }
    if (body !== undefined && typeof body !== "string")
      allHeaders["content-type"] = "application/json";
    const request = new Request(`${ORIGIN}${path}`, {
      method,
      headers: allHeaders,
      body:
        body === undefined
          ? undefined
          : typeof body === "string"
            ? body
            : JSON.stringify(body),
    });
    return handle(request, fullEnv, RELEASE, { db, now: clock.now, fetchImpl });
  };
  const json = async (path, options) => {
    const response = await call(path, options);
    return { status: response.status, body: await response.json() };
  };
  return { storage, db, call, json, calls, clock };
}

const description = async (response) =>
  (await response.text()).match(/og:description" content="([^"]*)"/)[1];

test("licence keys: readable, tolerant to how they were pasted, strict about the rest", () => {
  const { id, secret, key } = newLicenseKey();
  assert.match(key, /^MA-[A-Z2-9]{8}-[A-Z2-9]{20}$/);
  assert.doesNotMatch(key.slice(3), /[01ILO]/, "no look-alike characters");
  assert.deepEqual(parseKey(`  ${key.toLowerCase().replace(/-/g, " - ")} \n`), {
    id,
    secret,
    key,
  });
  assert.equal(parseKey("MA-12345678-ABC"), null);
  assert.equal(parseKey(""), null);
  assert.equal(formatKey(id, secret), key);
  assert.ok(safeEqual("abc", "abc"));
  assert.ok(!safeEqual("abc", "abd"));
  assert.ok(!safeEqual("abc", "abcd"));
});

test("sealed answers open only with the same licence secret", async () => {
  const key = await licenseCipherKey("SECRET-ONE");
  const sealed = await sealJson(key, { ok: true, ck: "x" });
  assert.deepEqual(await openJson(key, sealed), { ok: true, ck: "x" });
  await assert.rejects(openJson(await licenseCipherKey("SECRET-TWO"), sealed));
  assert.notEqual(
    sealed,
    await sealJson(key, { ok: true, ck: "x" }),
    "a fresh nonce each time",
  );
});

test("prices: percent and fixed promo codes, limits, dates and plan restrictions", () => {
  const plan = { id: "month", price_cents: 4900 };
  assert.deepEqual(quote(plan, null, NOW), {
    price_cents: 4900,
    discount_cents: 0,
    amount_cents: 4900,
    promo: null,
    problem: "",
  });
  const percent = {
    code: "P20",
    kind: "percent",
    value: 20,
    active: 1,
    uses: 0,
  };
  assert.equal(quote(plan, percent, NOW).amount_cents, 3920);
  const amount = {
    code: "MINUS10",
    kind: "amount",
    value: 1000,
    active: 1,
    uses: 0,
  };
  assert.equal(quote(plan, amount, NOW).amount_cents, 3900);
  assert.equal(quote(plan, { ...amount, value: 99999 }, NOW).amount_cents, 0);
  assert.equal(
    quote(plan, { ...percent, expires_at: NOW - 1 }, NOW).problem,
    "expired",
  );
  assert.equal(
    quote(plan, { ...percent, max_uses: 3, uses: 3 }, NOW).problem,
    "used_up",
  );
  assert.equal(
    quote(plan, { ...percent, plan_ids: "year" }, NOW).problem,
    "plan",
  );
  assert.equal(
    quote(plan, { ...percent, active: 0 }, NOW).problem,
    "not_found",
  );
  assert.equal(
    quote(plan, { ...percent, plan_ids: "year,month" }, NOW).problem,
    "",
  );
  assert.equal(parseUsd("49"), 4900);
  assert.equal(parseUsd("$12,5"), 1250);
  assert.ok(Number.isNaN(parseUsd("12.345")));
  assert.ok(Number.isNaN(parseUsd("abc")));
});

test("the Durable Object adapter: transactions roll back as a whole", async () => {
  const { db } = setup();
  await ensureSchema(db);
  await assert.rejects(
    db.batch([
      db
        .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
        .bind("a", "1"),
      db.prepare("INSERT INTO nowhere (x) VALUES (?)").bind(1),
    ]),
  );
  assert.equal(
    await db.prepare("SELECT * FROM settings WHERE key = 'a'").first(),
    null,
  );
  // undefined and booleans become values SQLite accepts.
  const license = await createLicense(db, {
    days: 30,
    note: undefined,
    now: NOW,
  });
  await db
    .prepare("UPDATE licenses SET note = ? WHERE id = ?")
    .bind(undefined, license.id)
    .run();
  await db
    .prepare("UPDATE plans SET active = ? WHERE id = ?")
    .bind(true, "x")
    .run();
  assert.equal((await getLicense(db, license.id)).note, null);
});

test("only the Worker's own addresses run it, the same list as in wrangler.jsonc", () => {
  const config = JSON.parse(
    fs
      .readFileSync("wrangler.jsonc", "utf8")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/,(\s*[}\]])/g, "$1"),
  );
  assert.deepEqual(config.assets.run_worker_first, WORKER_ROUTES);
  assert.equal(config.main, "worker/index.mjs");
  assert.equal(config.durable_objects.bindings[0].class_name, "MirrorAdsStore");
  assert.deepEqual(config.migrations[0].new_sqlite_classes, ["MirrorAdsStore"]);
  for (const path of [
    "/l/free/x",
    "/api/plans",
    "/buy",
    "/cabinet",
    "/order/a/b",
    "/admin",
  ]) {
    assert.ok(isWorkerPath(path), path);
  }
  for (const path of [
    "/",
    "/mirrorads/latest/manifest",
    "/buyer",
    "/administrator",
    "/l",
  ]) {
    assert.ok(!isWorkerPath(path), path);
  }
});

test("admin: password, the extra header, and a page that explains a missing password", async () => {
  let site = setup({ env: { ADMIN_PASSWORD: "" } });
  let response = await site.call("/admin");
  assert.equal(response.status, 503);
  assert.match(await response.text(), /ADMIN_PASSWORD/);

  site = setup();
  response = await site.call("/admin");
  assert.equal(response.status, 401);
  assert.match(response.headers.get("www-authenticate"), /^Basic/);
  const wrong = `Basic ${Buffer.from("owner:nope").toString("base64")}`;
  assert.equal(
    (await site.call("/admin", { headers: { authorization: wrong } })).status,
    401,
  );
  const right = `Basic ${Buffer.from(`owner:${PASSWORD}`).toString("base64")}`;
  response = await site.call("/admin", { headers: { authorization: right } });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Админка/);
  // The API also needs the header a foreign page cannot send.
  response = await site.call("/api/admin/state", {
    headers: { authorization: right },
  });
  assert.equal(response.status, 403);
  const state = await site.json("/api/admin/state", { admin: true });
  assert.equal(state.status, 200);
  assert.equal(state.body.build, "161126b1");
  assert.equal(state.body.oxapay, true);
  assert.equal(state.body.settings.enforce, "0");
  assert.ok(
    !JSON.stringify(state.body).includes(RELEASE.contentKey),
    "no script key in the admin",
  );
});

test("admin: plans, promo codes, keys and settings", async () => {
  const site = setup();
  let result = await site.json("/api/admin/plan", {
    method: "POST",
    admin: true,
    body: { name: "Месяц", days: 30, price: "49", sort: 1, active: true },
  });
  assert.equal(result.status, 200);
  const planId = result.body.id;
  result = await site.json("/api/admin/plan", {
    method: "POST",
    admin: true,
    body: { name: "", days: 30, price: "x" },
  });
  assert.equal(result.status, 400);

  result = await site.json("/api/admin/promo", {
    method: "POST",
    admin: true,
    body: {
      code: " partner-10 ",
      kind: "amount",
      value: "10",
      until: "2026-12-31",
      max_uses: "5",
    },
  });
  assert.equal(result.body.code, "PARTNER-10");
  result = await site.json("/api/admin/promo", {
    method: "POST",
    admin: true,
    body: { code: "TOO-MUCH", kind: "percent", value: "150" },
  });
  assert.equal(result.status, 400);

  result = await site.json("/api/admin/license/create", {
    method: "POST",
    admin: true,
    body: { days: 0, note: "Я сам" },
  });
  assert.ok(parseKey(result.body.key));
  assert.equal(result.body.cabinet, `${ORIGIN}/cabinet#${result.body.key}`);
  const ownId = parseKey(result.body.key).id;
  assert.equal(
    (await getLicense(site.db, ownId)).expires_at,
    null,
    "0 days means no end",
  );

  await site.json("/api/admin/settings", {
    method: "POST",
    admin: true,
    body: { enforce: "1", sandbox: "1", support: "https://t.me/support" },
  });
  const state = (await site.json("/api/admin/state", { admin: true })).body;
  assert.deepEqual(
    [state.settings.enforce, state.settings.sandbox, state.settings.support],
    ["1", "1", "https://t.me/support"],
  );
  assert.equal(state.plans[0].id, planId);
  assert.equal(state.plans[0].price_cents, 4900);
  const promo = state.promos.find((item) => item.code === "PARTNER-10");
  assert.equal(promo.value, 1000, "a fixed discount is kept in cents");
  assert.equal(
    new Date(promo.expires_at - 1).toISOString().slice(0, 10),
    "2026-12-31",
  );
  assert.equal(state.licenses[0].note, "Я сам");
  assert.ok(!("secret" in state.licenses[0]), "the list never carries secrets");

  // Block, unblock and extend.
  const trial = await site.json("/api/admin/license/create", {
    method: "POST",
    admin: true,
    body: { days: 3 },
  });
  const trialId = parseKey(trial.body.key).id;
  await site.json("/api/admin/license/action", {
    method: "POST",
    admin: true,
    body: { id: trialId, action: "extend", days: 30 },
  });
  assert.equal(
    (await getLicense(site.db, trialId)).expires_at,
    NOW + 33 * DAY_MS,
  );
  await site.json("/api/admin/license/action", {
    method: "POST",
    admin: true,
    body: { id: trialId, action: "block" },
  });
  assert.equal((await getLicense(site.db, trialId)).status, "blocked");
});

/** OxaPay: invoices TRK1, TRK2…; asked about one, it says it is paid. */
function oxapayFake() {
  let next = 0;
  return (url) => {
    if (url.endsWith("/payment/invoice")) {
      next += 1;
      return {
        status: 200,
        data: {
          track_id: `TRK${next}`,
          payment_url: `https://pay.oxapay.com/TRK${next}`,
        },
      };
    }
    return {
      status: 200,
      data: { status: "paid", track_id: url.split("/").pop() },
    };
  };
}

const sign = (body) =>
  createHmac("sha512", MERCHANT).update(body).digest("hex");

async function seedPlan(site, price = "49") {
  const result = await site.json("/api/admin/plan", {
    method: "POST",
    admin: true,
    body: { name: "Месяц", days: 30, price, active: true },
  });
  return result.body.id;
}

test("buying: invoice, signed webhook, a key once — however often OxaPay calls", async () => {
  const site = setup({ oxapay: oxapayFake() });
  const plan = await seedPlan(site);
  await site.json("/api/admin/promo", {
    method: "POST",
    admin: true,
    body: { code: "HALF", kind: "percent", value: "50" },
  });
  const quoteAnswer = await site.json("/api/quote", {
    method: "POST",
    body: { plan, promo: "half" },
  });
  assert.equal(quoteAnswer.body.amount_cents, 2450);
  const wrongPromo = await site.json("/api/quote", {
    method: "POST",
    body: { plan, promo: "NOPE" },
  });
  assert.equal(wrongPromo.body.problem, "not_found");
  assert.match(wrongPromo.body.message, /нет/);

  const order = await site.json("/api/order", {
    method: "POST",
    body: { plan, promo: "HALF", contact: "@buyer" },
  });
  assert.equal(order.status, 200);
  assert.equal(order.body.payUrl, "https://pay.oxapay.com/TRK1");
  const invoice = site.calls[0];
  assert.equal(invoice.url, "https://api.oxapay.com/v1/payment/invoice");
  assert.equal(invoice.init.headers.merchant_api_key, MERCHANT);
  assert.equal(invoice.body.amount, 24.5);
  assert.equal(invoice.body.currency, "USD");
  assert.equal(invoice.body.callback_url, `${ORIGIN}/api/oxapay/webhook`);
  const [, orderId, view] = order.body.orderUrl.match(
    /\/order\/([a-z0-9]+)\/([a-z0-9]+)$/,
  );
  assert.equal(invoice.body.order_id, orderId);

  // The order page sees no key before payment; a wrong view code sees nothing.
  site.clock.now += 5000;
  let status = await site.json("/api/order/status", {
    method: "POST",
    body: { id: orderId, view: "x" },
  });
  assert.equal(status.status, 404);

  const body = JSON.stringify({
    track_id: "TRK1",
    order_id: orderId,
    status: "Paid",
    type: "invoice",
  });
  let response = await site.call("/api/oxapay/webhook", {
    method: "POST",
    body,
    headers: { hmac: "0".repeat(128) },
  });
  assert.equal(response.status, 401, "unsigned calls change nothing");
  assert.equal((await getOrder(site.db, orderId)).status, "pending");

  response = await site.call("/api/oxapay/webhook", {
    method: "POST",
    body,
    headers: { hmac: sign(body) },
  });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "ok");
  response = await site.call("/api/oxapay/webhook", {
    method: "POST",
    body,
    headers: { hmac: sign(body) },
  });
  assert.equal(await response.text(), "ok");
  const licenses = (await site.json("/api/admin/state", { admin: true })).body
    .licenses;
  assert.equal(
    licenses.length,
    1,
    "a repeated webhook does not make a second key",
  );

  status = await site.json("/api/order/status", {
    method: "POST",
    body: { id: orderId, view },
  });
  assert.equal(status.body.status, "paid");
  const key = parseKey(status.body.key);
  assert.ok(key);
  assert.equal(status.body.expires_at, NOW + 5000 + 30 * DAY_MS);
  const promos = (await site.json("/api/admin/state", { admin: true })).body
    .promos;
  assert.equal(promos[0].uses, 1);

  // The cabinet opens with the key, and renewing adds days to the same key.
  const cabinet = await site.json("/api/cabinet", {
    method: "POST",
    body: { key: status.body.key },
  });
  assert.equal(cabinet.body.status, "active");
  assert.equal(
    (
      await site.json("/api/cabinet", {
        method: "POST",
        body: { key: "MA-AAAAAAAA-BBBBBBBBBBBBBBBBBBBB" },
      })
    ).status,
    400,
  );
  site.calls.length = 0;
  const renewal = await site.json("/api/order", {
    method: "POST",
    body: { plan, renew_key: status.body.key },
  });
  assert.equal(site.calls[0].body.amount, 49);
  const [, renewId] = renewal.body.orderUrl.match(/\/order\/([a-z0-9]+)\//);
  // A payment of another invoice does not pay this order.
  const mixed = JSON.stringify({
    track_id: "TRK1",
    order_id: renewId,
    status: "paid",
  });
  await site.call("/api/oxapay/webhook", {
    method: "POST",
    body: mixed,
    headers: { hmac: sign(mixed) },
  });
  assert.equal((await getOrder(site.db, renewId)).status, "pending");
  const paid = JSON.stringify({
    track_id: "TRK2",
    order_id: renewId,
    status: "paid",
  });
  await site.call("/api/oxapay/webhook", {
    method: "POST",
    body: paid,
    headers: { hmac: sign(paid) },
  });
  assert.equal((await getOrder(site.db, renewId)).status, "paid");
  assert.equal(
    (await getLicense(site.db, key.id)).expires_at,
    NOW + 5000 + 60 * DAY_MS,
    "renewal adds 30 days to the same key",
  );
  assert.equal(
    (await site.json("/api/admin/state", { admin: true })).body.licenses.length,
    1,
  );
});

test("a webhook that never comes: the order page asks OxaPay itself", async () => {
  const site = setup({ oxapay: oxapayFake() });
  const plan = await seedPlan(site, "19.99");
  const order = await site.json("/api/order", {
    method: "POST",
    body: { plan },
  });
  const [, id, view] = order.body.orderUrl.match(
    /\/order\/([a-z0-9]+)\/([a-z0-9]+)$/,
  );
  const status = await site.json("/api/order/status", {
    method: "POST",
    body: { id, view },
  });
  assert.equal(status.body.status, "paid");
  assert.ok(parseKey(status.body.key));
  assert.equal(site.calls.at(-1).url, "https://api.oxapay.com/v1/payment/TRK1");
});

test("a promo code for the whole price gives the key without an invoice; no OxaPay key means no sales", async () => {
  const site = setup({ oxapay: oxapayFake() });
  const plan = await seedPlan(site);
  await site.json("/api/admin/promo", {
    method: "POST",
    admin: true,
    body: { code: "GIFT", kind: "percent", value: "100", max_uses: "1" },
  });
  const order = await site.json("/api/order", {
    method: "POST",
    body: { plan, promo: "GIFT" },
  });
  assert.equal(order.body.payUrl, undefined);
  assert.equal(site.calls.length, 0);
  const [, id, view] = order.body.orderUrl.match(
    /\/order\/([a-z0-9]+)\/([a-z0-9]+)$/,
  );
  const status = await site.json("/api/order/status", {
    method: "POST",
    body: { id, view },
  });
  assert.ok(parseKey(status.body.key));
  const again = await site.json("/api/order", {
    method: "POST",
    body: { plan, promo: "GIFT" },
  });
  assert.equal(again.status, 400);
  assert.match(again.body.message, /максимальное число/);

  const closed = setup({ env: { OXAPAY_MERCHANT_KEY: "" } });
  const closedPlan = await seedPlan(closed);
  const refused = await closed.json("/api/order", {
    method: "POST",
    body: { plan: closedPlan },
  });
  assert.equal(refused.status, 400);
  assert.match(refused.body.message, /Оплата временно недоступна/);
  assert.equal((await closed.json("/api/plans")).body.payments, false);
});

test("licence check: free while the owner allows it, sealed answers for keys, the profile counted", async () => {
  const site = setup();
  // Everyone is let in while the check is off.
  let answer = readPlain(await description(await site.call("/l/free/NONCE1")));
  assert.deepEqual(
    [answer.ok, answer.mode, answer.n, answer.build, answer.ck],
    [true, "free", "NONCE1", "161126b1", RELEASE.contentKey],
  );
  assert.deepEqual(answer.main, RELEASE.main);

  const created = await createLicense(site.db, { days: 30, now: NOW });
  const cipher = await licenseCipherKey(created.secret);
  const ask = async (payload, id = created.id) =>
    site.call(`/l/${id}/${await sealJson(cipher, payload)}`);
  let text = await description(await ask({ s: "seat-a", n: "N1", t: NOW }));
  assert.ok(text.startsWith("S1."));
  answer = await openJson(cipher, text.slice(3));
  assert.deepEqual(
    [answer.ok, answer.mode, answer.n, answer.ck, answer.exp],
    [true, "key", "N1", RELEASE.contentKey, NOW + 30 * DAY_MS],
  );
  await ask({ s: "seat-a", n: "N2" });
  await ask({ s: "seat-b", n: "N3" });
  const seats = site.storage.sqlite
    .prepare("SELECT seat, launches FROM seats ORDER BY seat")
    .all();
  assert.deepEqual(
    seats.map((row) => [row.seat, row.launches]),
    [
      ["seat-a", 2],
      ["seat-b", 1],
    ],
  );

  // A request sealed with another secret proves nothing.
  const stranger = await licenseCipherKey("WRONGSECRETWRONGSECR");
  text = await description(
    await site.call(
      `/l/${created.id}/${await sealJson(stranger, { s: "x", n: "N4" })}`,
    ),
  );
  assert.deepEqual(readPlain(text), {
    ok: false,
    code: "bad_key",
    buy: `${ORIGIN}/buy`,
    cabinet: `${ORIGIN}/cabinet`,
    support: "",
  });
  assert.equal(
    site.storage.sqlite.prepare("SELECT COUNT(*) AS c FROM seats").get().c,
    2,
  );

  // With the check on: no key, an expired key and a blocked key are refused.
  await setSettings(site.db, { enforce: "1" });
  answer = readPlain(await description(await site.call("/l/free/NONCE2")));
  assert.deepEqual(
    [answer.ok, answer.code, answer.ck],
    [false, "need_key", undefined],
  );
  site.clock.now = NOW + 31 * DAY_MS;
  answer = await openJson(
    cipher,
    (await description(await ask({ s: "seat-a", n: "N5" }))).slice(3),
  );
  assert.deepEqual(
    [answer.ok, answer.code, answer.ck],
    [false, "expired", undefined],
  );
  await site.db
    .prepare("UPDATE licenses SET status = 'blocked', expires_at = NULL")
    .run();
  answer = await openJson(
    cipher,
    (await description(await ask({ s: "seat-a", n: "N6" }))).slice(3),
  );
  assert.deepEqual([answer.ok, answer.code], [false, "blocked"]);
});
