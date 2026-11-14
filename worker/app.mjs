import { fromBase64Url, safeEqual } from "./crypto.mjs";
import {
  DAY_MS,
  createLicense,
  ensureSchema,
  extendLicense,
  getLicense,
  getOrder,
  getSettings,
  listLicenses,
  listOrders,
  listPlans,
  listPromos,
  normalizePromoCode,
  savePlan,
  savePromo,
  seatStats,
  setSettings,
  updateLicense,
} from "./db.mjs";
import { formatKey } from "./keys.mjs";
import { licenseCheck } from "./license-check.mjs";
import { messageFor } from "./messages.mjs";
import { adminPage } from "./pages/admin.mjs";
import { htmlResponse } from "./pages/layout.mjs";
import {
  buyPage,
  cabinetPage,
  messagePage,
  orderPage,
} from "./pages/public.mjs";
import {
  UserError,
  handleWebhook,
  licenseFromKey,
  priceFor,
  refreshOrder,
  startOrder,
} from "./payments.mjs";
import { parseUsd } from "./pricing.mjs";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const fail = (code, status = 400) =>
  json({ error: code, message: messageFor(code) }, status);

async function readJson(request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch (_error) {
    return {};
  }
}

/** HTTP Basic with ADMIN_PASSWORD; API calls must also carry a custom header. */
function adminGate(request, env, { api }) {
  if (!env.ADMIN_PASSWORD) {
    return htmlResponse(
      messagePage({
        title: "Задайте пароль админки",
        text: "Cloudflare → Workers & Pages → mirrorads → Settings → Variables and Secrets → Add: тип Secret, имя ADMIN_PASSWORD, значение — ваш пароль. Потом обновите страницу.",
      }),
      503,
    );
  }
  const [scheme, encoded] = String(
    request.headers.get("authorization") || "",
  ).split(" ");
  let password = "";
  if (String(scheme).toLowerCase() === "basic" && encoded) {
    try {
      const pair = new TextDecoder().decode(
        fromBase64Url(encoded.replace(/=+$/, "")),
      );
      password = pair.slice(pair.indexOf(":") + 1);
    } catch (_error) {
      password = "";
    }
  }
  if (!safeEqual(password, env.ADMIN_PASSWORD)) {
    return new Response("Нужен пароль администратора.", {
      status: 401,
      headers: {
        "www-authenticate": 'Basic realm="MirrorAds admin", charset="UTF-8"',
      },
    });
  }
  // A page on another site cannot add this header without our permission,
  // so the browser's saved password cannot be used against the admin API.
  if (api && request.headers.get("x-mirrorads") !== "admin")
    return fail("bad_request", 403);
  return null;
}

async function adminApi({ request, env, db, origin, path, build, now }) {
  if (path === "/api/admin/state") {
    const [settings, plans, promos, licenses, orders] = await Promise.all([
      getSettings(db),
      listPlans(db),
      listPromos(db),
      listLicenses(db, { limit: 500, now }),
      listOrders(db, { limit: 300 }),
    ]);
    return json({
      settings,
      plans,
      promos,
      licenses,
      orders,
      oxapay: Boolean(env.OXAPAY_MERCHANT_KEY),
      origin,
      build: build.version,
    });
  }
  if (request.method !== "POST") return fail("bad_request", 405);
  const body = await readJson(request);
  if (path === "/api/admin/settings") {
    await setSettings(db, {
      enforce: body.enforce === "1" ? "1" : "0",
      sandbox: body.sandbox === "1" ? "1" : "0",
      support: String(body.support || "").slice(0, 200),
    });
    return json({ ok: true });
  }
  if (path === "/api/admin/plan") {
    const price = parseUsd(body.price);
    const days = Math.round(Number(body.days));
    if (!String(body.name || "").trim() || !(days >= 1) || !(price >= 0)) {
      return json(
        {
          error: "bad_request",
          message: "Заполните название, дни (от 1) и цену в долларах.",
        },
        400,
      );
    }
    const id = await savePlan(
      db,
      {
        id: body.id || "",
        name: String(body.name).trim(),
        days,
        price_cents: price,
        active: body.active !== false,
        sort: body.sort,
      },
      now,
    );
    return json({ ok: true, id });
  }
  if (path === "/api/admin/promo") {
    const kind = body.kind === "amount" ? "amount" : "percent";
    const value =
      kind === "amount" ? parseUsd(body.value) : Math.round(Number(body.value));
    const code = normalizePromoCode(body.code);
    if (!code || !(value > 0) || (kind === "percent" && value > 100)) {
      return json(
        {
          error: "bad_request",
          message:
            "Нужны код и скидка: процент от 1 до 100 или сумма в долларах.",
        },
        400,
      );
    }
    const until = /^\d{4}-\d{2}-\d{2}$/.test(String(body.until || ""))
      ? Date.parse(`${body.until}T23:59:59Z`)
      : null;
    await savePromo(
      db,
      {
        code,
        kind,
        value,
        max_uses: Number(body.max_uses) > 0 ? Number(body.max_uses) : null,
        expires_at: until,
        plan_ids: String(body.plan_ids || ""),
        note: body.note,
        active: body.active !== false,
      },
      now,
    );
    return json({ ok: true, code });
  }
  if (path === "/api/admin/license/create") {
    const days = Math.max(0, Math.round(Number(body.days) || 0));
    const license = await createLicense(db, {
      days: days || null,
      note: body.note || "",
      contact: body.contact || "",
      now,
    });
    return json({
      ok: true,
      key: license.key,
      cabinet: `${origin}/cabinet#${license.key}`,
    });
  }
  if (path === "/api/admin/license/action") {
    const license = await getLicense(db, String(body.id || ""));
    if (!license) return fail("bad_key", 404);
    if (body.action === "extend")
      await extendLicense(
        db,
        license.id,
        Math.max(1, Number(body.days) || 30),
        now,
      );
    else if (body.action === "block")
      await updateLicense(db, license.id, { status: "blocked" });
    else if (body.action === "unblock")
      await updateLicense(db, license.id, { status: "active" });
    else if (body.action === "note")
      await updateLicense(db, license.id, {
        note: String(body.note || "").slice(0, 200),
      });
    const key = formatKey(license.id, license.secret);
    return json({ ok: true, key, cabinet: `${origin}/cabinet#${key}` });
  }
  return fail("bad_request", 404);
}

/**
 * The addresses the Worker answers itself; wrangler.jsonc sends exactly these
 * to it (run_worker_first), everything else is the static site.
 */
export const WORKER_ROUTES = [
  "/l/*",
  "/api/*",
  "/buy",
  "/cabinet",
  "/order/*",
  "/admin",
];

export function isWorkerPath(pathname) {
  const path = String(pathname || "");
  return WORKER_ROUTES.some((route) =>
    route.endsWith("/*") ? path.startsWith(route.slice(0, -1)) : path === route,
  );
}

/**
 * Answers one request to a Worker address. `options.db` is the licence
 * database; `build` describes the published script (version, key, pieces).
 */
export async function handle(request, env, build, options = {}) {
  const now = options.now ?? Date.now();
  const fetchImpl = options.fetchImpl || fetch;
  const url = new URL(request.url);
  const origin = url.origin;
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method === "HEAD" ? "GET" : request.method;
  const db = options.db;
  if (!db)
    return new Response("The licence database is missing.", { status: 500 });
  try {
    await ensureSchema(db);
    const check = path.match(
      /^\/l\/([A-Za-z0-9]{4,12})\/([A-Za-z0-9_-]{1,2000})$/,
    );
    if (check && method === "GET") {
      const licenseId =
        check[1].toLowerCase() === "free" ? "free" : check[1].toUpperCase();
      return licenseCheck({
        db,
        build,
        origin,
        licenseId,
        blob: check[2],
        now,
      });
    }
    if (path === "/api/oxapay/webhook" && method === "POST") {
      const result = await handleWebhook({
        db,
        env,
        rawBody: await request.text(),
        signature: request.headers.get("hmac"),
        now,
      });
      return new Response(result.text, { status: result.status });
    }
    if (path.startsWith("/api/admin/")) {
      const denied = adminGate(request, env, { api: true });
      return (
        denied ||
        (await adminApi({ request, env, db, origin, path, build, now }))
      );
    }
    if (path === "/admin" && method === "GET") {
      return (
        adminGate(request, env, { api: false }) || htmlResponse(adminPage())
      );
    }
    const settings = await getSettings(db);
    if (path === "/buy" && method === "GET")
      return htmlResponse(buyPage(settings));
    if (path === "/cabinet" && method === "GET")
      return htmlResponse(cabinetPage(settings));
    const orderPath = path.match(
      /^\/order\/([a-z0-9]{6,24})\/([a-z0-9]{6,32})$/,
    );
    if (orderPath && method === "GET") {
      return htmlResponse(
        orderPage({
          orderId: orderPath[1],
          view: orderPath[2],
          support: settings.support,
        }),
      );
    }
    if (path === "/api/plans" && method === "GET") {
      const plans = await listPlans(db, { activeOnly: true });
      return json({
        plans: plans.map(({ id, name, days, price_cents }) => ({
          id,
          name,
          days,
          price_cents,
        })),
        payments: Boolean(env.OXAPAY_MERCHANT_KEY),
        support: settings.support,
      });
    }
    if (method === "POST" && path.startsWith("/api/")) {
      const body = await readJson(request);
      if (path === "/api/quote") {
        const priced = await priceFor(db, {
          planId: body.plan,
          promoCode: String(body.promo || "").trim(),
          now,
        });
        return json({
          price_cents: priced.price_cents,
          discount_cents: priced.discount_cents,
          amount_cents: priced.amount_cents,
          problem: priced.problem,
          message: priced.problem ? messageFor(`promo_${priced.problem}`) : "",
        });
      }
      if (path === "/api/order") {
        return json(
          await startOrder({ db, env, origin, input: body, now, fetchImpl }),
        );
      }
      if (path === "/api/order/status") {
        let order = await getOrder(db, String(body.id || ""));
        if (!order || !safeEqual(order.view, String(body.view || "")))
          return fail("not_found", 404);
        order = await refreshOrder({ db, env, order, now, fetchImpl });
        const license =
          order.status === "paid" && order.license_id
            ? await getLicense(db, order.license_id)
            : null;
        return json({
          status: order.status,
          plan_name: order.plan_name,
          amount_cents: order.amount_cents,
          pay_url: order.status === "pending" ? order.pay_url : "",
          renew: Boolean(order.renew),
          key: license ? formatKey(license.id, license.secret) : "",
          expires_at: license?.expires_at ?? null,
        });
      }
      if (path === "/api/cabinet") {
        const license = await licenseFromKey(db, body.key);
        const stats = await seatStats(db, license.id, now);
        return json({
          key: formatKey(license.id, license.secret),
          status: license.status,
          expires_at: license.expires_at,
          seats_week: Number(stats?.week || 0),
          days_left: license.expires_at
            ? Math.ceil((license.expires_at - now) / DAY_MS)
            : null,
        });
      }
    }
    return new Response("Not found", { status: 404 });
  } catch (error) {
    if (error instanceof UserError) return fail(error.code, 400);
    return json(
      { error: "server", message: "Ошибка сервера. Попробуйте ещё раз." },
      500,
    );
  }
}
