import { safeEqual } from "./crypto.mjs";
import {
  claimOrderPayment,
  createLicense,
  createOrder,
  extendLicense,
  getLicense,
  getOrder,
  getOrderByTrack,
  getPlan,
  getPromo,
  getSettings,
  incrementPromoUse,
  setOrderFields,
  setOrderInvoice,
} from "./db.mjs";
import { parseKey } from "./keys.mjs";
import {
  PAID_STATUSES,
  createInvoice,
  getPayment,
  readWebhook,
  verifyWebhook,
} from "./oxapay.mjs";
import { quote } from "./pricing.mjs";

/** An error whose code the pages translate for the buyer. */
export class UserError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export const orderUrl = (origin, order) =>
  `${origin}/order/${order.id}/${order.view}`;

/** The licence a renewal is for, proven by its full key. */
export async function licenseFromKey(db, keyText) {
  const parsed = parseKey(keyText);
  const license = parsed ? await getLicense(db, parsed.id) : null;
  if (!license || !safeEqual(license.secret, parsed.secret))
    throw new UserError("bad_key");
  return license;
}

export async function priceFor(db, { planId, promoCode, now }) {
  const plan = await getPlan(db, planId);
  if (!plan || !Number(plan.active)) throw new UserError("plan");
  const promo = promoCode ? await getPromo(db, promoCode) : null;
  const result = quote(plan, promo || (promoCode ? { active: 0 } : null), now);
  return { plan, ...result };
}

/**
 * Creates an order and its OxaPay invoice. A promo code that makes the price
 * zero completes the order at once, without an invoice.
 */
export async function startOrder({
  db,
  env,
  origin,
  input,
  now,
  fetchImpl = fetch,
}) {
  const promoCode = String(input.promo || "").trim();
  const priced = await priceFor(db, { planId: input.plan, promoCode, now });
  if (promoCode && priced.problem)
    throw new UserError(`promo_${priced.problem}`);
  let license = null;
  if (input.renew_key) {
    license = await licenseFromKey(db, input.renew_key);
    if (license.status === "blocked") throw new UserError("blocked");
    if (license.expires_at === null) throw new UserError("lifetime");
  }
  const contact = String(input.contact || "")
    .trim()
    .slice(0, 200);
  const order = await createOrder(db, {
    plan_id: priced.plan.id,
    plan_name: priced.plan.name,
    days: Number(priced.plan.days),
    price_cents: priced.price_cents,
    amount_cents: priced.amount_cents,
    promo: priced.promo,
    contact: contact || license?.contact || "",
    license_id: license?.id || null,
    renew: Boolean(license),
    now,
  });
  if (priced.amount_cents === 0) {
    await fulfillOrder(db, order.id, now);
    return { orderUrl: orderUrl(origin, order) };
  }
  const apiKey = env.OXAPAY_MERCHANT_KEY;
  if (!apiKey) throw new UserError("payments_off");
  const settings = await getSettings(db);
  try {
    const invoice = await createInvoice({
      apiKey,
      fetchImpl,
      amountCents: priced.amount_cents,
      orderId: order.id,
      description: `${settings.brand || "MirrorAds"}: ${priced.plan.name}`,
      callbackUrl: `${origin}/api/oxapay/webhook`,
      returnUrl: orderUrl(origin, order),
      email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact) ? contact : "",
      sandbox: settings.sandbox === "1",
    });
    await setOrderInvoice(db, order.id, invoice);
    return { payUrl: invoice.payUrl, orderUrl: orderUrl(origin, order) };
  } catch (error) {
    await setOrderFields(db, order.id, {
      status: "failed",
      note: String(error.message).slice(0, 300),
    });
    throw new UserError("invoice");
  }
}

/** Grants what an order paid for, exactly once however often it is called. */
export async function fulfillOrder(db, orderId, now) {
  const order = await getOrder(db, orderId);
  if (!order) return null;
  if (!(await claimOrderPayment(db, orderId, now)))
    return getOrder(db, orderId);
  try {
    if (order.renew && order.license_id) {
      await extendLicense(db, order.license_id, order.days, now);
    } else {
      const license = await createLicense(db, {
        days: order.days,
        contact: order.contact,
        note: order.plan_name,
        source: "order",
        now,
      });
      await setOrderFields(db, orderId, { license_id: license.id });
    }
    if (order.promo) await incrementPromoUse(db, order.promo);
  } catch (error) {
    await setOrderFields(db, orderId, {
      status: "pending",
      note: `Fulfilment failed: ${String(error.message).slice(0, 250)}`,
    });
    throw error;
  }
  return getOrder(db, orderId);
}

/**
 * Asks OxaPay about a pending order, at most every 15 seconds: the fallback
 * for a webhook that never arrives.
 */
export async function refreshOrder({ db, env, order, now, fetchImpl = fetch }) {
  if (order.status !== "pending" || !order.track_id || !env.OXAPAY_MERCHANT_KEY)
    return order;
  if (order.checked_at && now - Number(order.checked_at) < 15000) return order;
  await setOrderFields(db, order.id, { checked_at: now });
  try {
    const payment = await getPayment({
      apiKey: env.OXAPAY_MERCHANT_KEY,
      fetchImpl,
      trackId: order.track_id,
    });
    if (PAID_STATUSES.has(payment.status))
      return fulfillOrder(db, order.id, now);
    if (payment.status === "expired")
      await setOrderFields(db, order.id, { status: "expired" });
  } catch (_error) {
    // OxaPay unreachable: the webhook or the next check will settle it.
  }
  return getOrder(db, order.id);
}

/** Handles OxaPay's call; returns the HTTP status and text to answer with. */
export async function handleWebhook({ db, env, rawBody, signature, now }) {
  if (!(await verifyWebhook(rawBody, signature, env.OXAPAY_MERCHANT_KEY))) {
    return { status: 401, text: "bad signature" };
  }
  let body = null;
  try {
    body = JSON.parse(rawBody);
  } catch (_error) {
    return { status: 400, text: "bad json" };
  }
  const event = readWebhook(body);
  const order =
    (event.orderId && (await getOrder(db, event.orderId))) ||
    (event.trackId && (await getOrderByTrack(db, event.trackId)));
  // Unknown or mismatched orders are acknowledged so OxaPay stops retrying.
  if (
    !order ||
    (order.track_id && event.trackId && order.track_id !== event.trackId)
  ) {
    return { status: 200, text: "ok" };
  }
  if (PAID_STATUSES.has(event.status)) await fulfillOrder(db, order.id, now);
  else if (event.status === "expired" && order.status === "pending") {
    await setOrderFields(db, order.id, { status: "expired" });
  }
  return { status: 200, text: "ok" };
}
