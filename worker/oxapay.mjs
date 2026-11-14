import { hmacHex, safeEqual } from "./crypto.mjs";

const API = "https://api.oxapay.com/v1";

/** Invoice statuses that mean the money arrived. */
export const PAID_STATUSES = new Set(["paid", "manual_accept"]);

async function call(fetchImpl, path, { apiKey, method = "GET", body } = {}) {
  const response = await fetchImpl(`${API}${path}`, {
    method,
    headers: { merchant_api_key: apiKey, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await response.json();
  } catch (_error) {
    json = null;
  }
  if (!response.ok || (json?.status && Number(json.status) !== 200)) {
    const reason =
      json?.error?.message || json?.message || `HTTP ${response.status}`;
    throw new Error(`OxaPay: ${reason}`);
  }
  return json?.data || {};
}

/** Creates a hosted invoice in US dollars; returns where to send the buyer. */
export async function createInvoice({
  apiKey,
  fetchImpl = fetch,
  amountCents,
  orderId,
  description,
  callbackUrl,
  returnUrl,
  email,
  sandbox = false,
}) {
  const data = await call(fetchImpl, "/payment/invoice", {
    apiKey,
    method: "POST",
    body: {
      amount: Number((amountCents / 100).toFixed(2)),
      currency: "USD",
      lifetime: 60,
      order_id: orderId,
      description,
      callback_url: callbackUrl,
      return_url: returnUrl,
      ...(email ? { email } : {}),
      ...(sandbox ? { sandbox: true } : {}),
    },
  });
  if (!data.track_id || !data.payment_url)
    throw new Error("OxaPay: no invoice in the answer.");
  return { trackId: String(data.track_id), payUrl: String(data.payment_url) };
}

/** The current state of an invoice. */
export async function getPayment({ apiKey, fetchImpl = fetch, trackId }) {
  const data = await call(
    fetchImpl,
    `/payment/${encodeURIComponent(trackId)}`,
    { apiKey },
  );
  return {
    status: String(data.status || "").toLowerCase(),
    orderId: String(data.order_id || ""),
    trackId: String(data.track_id || trackId),
  };
}

/** OxaPay signs the raw body with HMAC-SHA512 keyed by the merchant API key. */
export async function verifyWebhook(rawBody, signature, apiKey) {
  if (!apiKey || !signature) return false;
  const expected = await hmacHex("SHA-512", apiKey, rawBody);
  return safeEqual(expected, String(signature).trim().toLowerCase());
}

/** The fields of a webhook that matter, whatever the API version calls them. */
export function readWebhook(body) {
  return {
    trackId: String(body?.track_id ?? body?.trackId ?? ""),
    orderId: String(body?.order_id ?? body?.orderId ?? ""),
    status: String(body?.status || "").toLowerCase(),
    type: String(body?.type || ""),
  };
}
