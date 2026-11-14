import { randomCode } from "./crypto.mjs";
import { newLicenseKey } from "./keys.mjs";

export const DAY_MS = 24 * 60 * 60 * 1000;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, days INTEGER NOT NULL,
    price_cents INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS licenses (
    id TEXT PRIMARY KEY, secret TEXT NOT NULL, note TEXT, contact TEXT,
    expires_at INTEGER, places INTEGER, status TEXT NOT NULL DEFAULT 'active',
    source TEXT NOT NULL DEFAULT 'manual', created_at INTEGER NOT NULL,
    last_seen INTEGER)`,
  `CREATE TABLE IF NOT EXISTS seats (
    license_id TEXT NOT NULL, seat TEXT NOT NULL, first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL, launches INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (license_id, seat))`,
  `CREATE TABLE IF NOT EXISTS promos (
    code TEXT PRIMARY KEY, kind TEXT NOT NULL, value INTEGER NOT NULL,
    max_uses INTEGER, uses INTEGER NOT NULL DEFAULT 0, expires_at INTEGER,
    plan_ids TEXT, note TEXT, active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY, view TEXT NOT NULL, plan_id TEXT NOT NULL,
    plan_name TEXT, days INTEGER NOT NULL, price_cents INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL, promo TEXT, contact TEXT, license_id TEXT,
    renew INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, track_id TEXT,
    pay_url TEXT, created_at INTEGER NOT NULL, paid_at INTEGER,
    checked_at INTEGER, note TEXT)`,
  `CREATE INDEX IF NOT EXISTS orders_track ON orders (track_id)`,
  `CREATE INDEX IF NOT EXISTS seats_seen ON seats (license_id, last_seen)`,
];

const schemaReady = new WeakSet();

/** Creates the tables on first use; cheap afterwards. */
export async function ensureSchema(db) {
  if (schemaReady.has(db)) return;
  await db.batch(SCHEMA.map((sql) => db.prepare(sql)));
  schemaReady.add(db);
}

/* ---------------- settings ---------------- */

export const DEFAULT_SETTINGS = Object.freeze({
  enforce: "0",
  sandbox: "0",
  support: "",
  brand: "MirrorAds",
});

export async function getSettings(db) {
  const { results } = await db.prepare("SELECT key, value FROM settings").all();
  const settings = { ...DEFAULT_SETTINGS };
  for (const row of results) settings[row.key] = row.value;
  return settings;
}

export async function setSettings(db, values) {
  const statements = Object.entries(values)
    .filter(([key]) => key in DEFAULT_SETTINGS)
    .map(([key, value]) =>
      db
        .prepare(
          "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )
        .bind(key, String(value ?? "")),
    );
  if (statements.length) await db.batch(statements);
}

/* ---------------- plans ---------------- */

export async function listPlans(db, { activeOnly = false } = {}) {
  const { results } = await db
    .prepare(
      `SELECT * FROM plans ${activeOnly ? "WHERE active = 1" : ""} ORDER BY sort, price_cents`,
    )
    .all();
  return results;
}

export function getPlan(db, id) {
  return db
    .prepare("SELECT * FROM plans WHERE id = ?")
    .bind(String(id))
    .first();
}

export async function savePlan(db, plan, now) {
  const id = plan.id || randomCode(6).toLowerCase();
  await db
    .prepare(
      `INSERT INTO plans (id, name, days, price_cents, active, sort, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, days = excluded.days,
         price_cents = excluded.price_cents, active = excluded.active, sort = excluded.sort`,
    )
    .bind(
      id,
      String(plan.name).slice(0, 80),
      Math.round(Number(plan.days)),
      Math.round(Number(plan.price_cents)),
      plan.active === false || plan.active === 0 ? 0 : 1,
      Math.round(Number(plan.sort) || 0),
      now,
    )
    .run();
  return id;
}

/* ---------------- licences ---------------- */

export async function createLicense(
  db,
  { days, note = "", contact = "", source = "manual", now },
) {
  const { id, secret, key } = newLicenseKey();
  const expiresAt = days ? now + Math.round(Number(days) * DAY_MS) : null;
  await db
    .prepare(
      `INSERT INTO licenses (id, secret, note, contact, expires_at, status, source, created_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
    )
    .bind(
      id,
      secret,
      String(note).slice(0, 200),
      String(contact).slice(0, 200),
      expiresAt,
      source,
      now,
    )
    .run();
  return { id, secret, key, expires_at: expiresAt };
}

export function getLicense(db, id) {
  return db
    .prepare("SELECT * FROM licenses WHERE id = ?")
    .bind(String(id))
    .first();
}

/** Adds days to a licence, counting from today if it has already run out. */
export async function extendLicense(db, id, days, now) {
  const add = Math.round(Number(days) * DAY_MS);
  await db
    .prepare(
      `UPDATE licenses SET expires_at = MAX(COALESCE(expires_at, 0), ?) + ?
       WHERE id = ? AND expires_at IS NOT NULL`,
    )
    .bind(now, add, String(id))
    .run();
  return getLicense(db, id);
}

export async function updateLicense(db, id, fields) {
  const allowed = ["note", "contact", "status", "expires_at"];
  const entries = Object.entries(fields).filter(([key]) =>
    allowed.includes(key),
  );
  if (!entries.length) return getLicense(db, id);
  await db
    .prepare(
      `UPDATE licenses SET ${entries.map(([key]) => `${key} = ?`).join(", ")} WHERE id = ?`,
    )
    .bind(...entries.map(([, value]) => value), String(id))
    .run();
  return getLicense(db, id);
}

export async function listLicenses(db, { query = "", limit = 200, now }) {
  const like = `%${String(query).trim().toUpperCase()}%`;
  const weekAgo = now - 7 * DAY_MS;
  const { results } = await db
    .prepare(
      `SELECT l.id, l.note, l.contact, l.expires_at, l.status, l.source, l.created_at, l.last_seen,
         (SELECT COUNT(*) FROM seats s WHERE s.license_id = l.id AND s.last_seen > ?) AS seats_week,
         (SELECT COUNT(*) FROM seats s WHERE s.license_id = l.id) AS seats_total
       FROM licenses l
       WHERE ? = '%%' OR UPPER(l.id) LIKE ? OR UPPER(COALESCE(l.note, '')) LIKE ? OR UPPER(COALESCE(l.contact, '')) LIKE ?
       ORDER BY l.created_at DESC LIMIT ?`,
    )
    .bind(weekAgo, like, like, like, like, limit)
    .all();
  return results;
}

/** Remembers that a licence was used on one Facebook profile (hashed). */
export async function touchSeat(db, licenseId, seat, now) {
  await db.batch([
    db
      .prepare(
        `INSERT INTO seats (license_id, seat, first_seen, last_seen, launches) VALUES (?, ?, ?, ?, 1)
         ON CONFLICT(license_id, seat) DO UPDATE SET last_seen = excluded.last_seen, launches = launches + 1`,
      )
      .bind(licenseId, String(seat || "unknown").slice(0, 64), now, now),
    db
      .prepare("UPDATE licenses SET last_seen = ? WHERE id = ?")
      .bind(now, licenseId),
  ]);
}

export async function seatStats(db, licenseId, now) {
  return db
    .prepare(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN last_seen > ? THEN 1 ELSE 0 END) AS week
       FROM seats WHERE license_id = ?`,
    )
    .bind(now - 7 * DAY_MS, licenseId)
    .first();
}

/* ---------------- promo codes ---------------- */

export function normalizePromoCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 32);
}

export function getPromo(db, code) {
  return db
    .prepare("SELECT * FROM promos WHERE code = ?")
    .bind(normalizePromoCode(code))
    .first();
}

export async function listPromos(db) {
  const { results } = await db
    .prepare("SELECT * FROM promos ORDER BY created_at DESC")
    .all();
  return results;
}

export async function savePromo(db, promo, now) {
  const code = normalizePromoCode(promo.code);
  if (!code) throw new Error("Promo code is empty.");
  await db
    .prepare(
      `INSERT INTO promos (code, kind, value, max_uses, expires_at, plan_ids, note, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET kind = excluded.kind, value = excluded.value,
         max_uses = excluded.max_uses, expires_at = excluded.expires_at, plan_ids = excluded.plan_ids,
         note = excluded.note, active = excluded.active`,
    )
    .bind(
      code,
      promo.kind === "amount" ? "amount" : "percent",
      Math.round(Number(promo.value)),
      promo.max_uses ? Math.round(Number(promo.max_uses)) : null,
      promo.expires_at ? Math.round(Number(promo.expires_at)) : null,
      promo.plan_ids ? String(promo.plan_ids) : null,
      String(promo.note || "").slice(0, 120),
      promo.active === false || promo.active === 0 ? 0 : 1,
      now,
    )
    .run();
  return code;
}

/* ---------------- orders ---------------- */

export async function createOrder(db, order) {
  const id = randomCode(12).toLowerCase();
  const view = randomCode(16).toLowerCase();
  await db
    .prepare(
      `INSERT INTO orders (id, view, plan_id, plan_name, days, price_cents, amount_cents, promo,
         contact, license_id, renew, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    )
    .bind(
      id,
      view,
      order.plan_id,
      order.plan_name,
      order.days,
      order.price_cents,
      order.amount_cents,
      order.promo || null,
      String(order.contact || "").slice(0, 200),
      order.license_id || null,
      order.renew ? 1 : 0,
      order.now,
    )
    .run();
  return { id, view };
}

export function getOrder(db, id) {
  return db
    .prepare("SELECT * FROM orders WHERE id = ?")
    .bind(String(id))
    .first();
}

export function getOrderByTrack(db, trackId) {
  return db
    .prepare("SELECT * FROM orders WHERE track_id = ?")
    .bind(String(trackId))
    .first();
}

export async function setOrderInvoice(db, id, { trackId, payUrl }) {
  await db
    .prepare("UPDATE orders SET track_id = ?, pay_url = ? WHERE id = ?")
    .bind(String(trackId), String(payUrl), id)
    .run();
}

export async function setOrderFields(db, id, fields) {
  const allowed = ["status", "checked_at", "note", "license_id"];
  const entries = Object.entries(fields).filter(([key]) =>
    allowed.includes(key),
  );
  if (!entries.length) return;
  await db
    .prepare(
      `UPDATE orders SET ${entries.map(([key]) => `${key} = ?`).join(", ")} WHERE id = ?`,
    )
    .bind(...entries.map(([, value]) => value), id)
    .run();
}

/** Marks a pending order paid; true only for the call that actually did it. */
export async function claimOrderPayment(db, id, now) {
  const row = await db
    .prepare(
      "UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ? AND status != 'paid' RETURNING id",
    )
    .bind(now, id)
    .first();
  return Boolean(row);
}

export async function listOrders(db, { limit = 200 } = {}) {
  const { results } = await db
    .prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT ?")
    .bind(limit)
    .all();
  return results;
}

export async function incrementPromoUse(db, code) {
  await db
    .prepare("UPDATE promos SET uses = uses + 1 WHERE code = ?")
    .bind(normalizePromoCode(code))
    .run();
}
