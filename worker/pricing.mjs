/** Why a promo code cannot be used for this plan right now; "" when it can. */
export function promoProblem(promo, { planId, now }) {
  if (!promo || !Number(promo.active)) return "not_found";
  if (promo.expires_at && Number(promo.expires_at) < now) return "expired";
  if (promo.max_uses && Number(promo.uses) >= Number(promo.max_uses))
    return "used_up";
  if (promo.plan_ids) {
    const plans = String(promo.plan_ids)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (plans.length && !plans.includes(String(planId))) return "plan";
  }
  return "";
}

/** Price of a plan with an optional promo code, in cents. */
export function quote(plan, promo, now) {
  const price = Math.max(0, Math.round(Number(plan.price_cents) || 0));
  const problem = promo ? promoProblem(promo, { planId: plan.id, now }) : "";
  let discount = 0;
  if (promo && !problem) {
    discount =
      promo.kind === "amount"
        ? Math.min(price, Math.max(0, Math.round(Number(promo.value))))
        : Math.round(
            (price * Math.min(100, Math.max(0, Number(promo.value)))) / 100,
          );
  }
  return {
    price_cents: price,
    discount_cents: discount,
    amount_cents: Math.max(0, price - discount),
    promo: promo && !problem ? promo.code : null,
    problem,
  };
}

export function formatUsd(cents) {
  const value = Math.round(Number(cents) || 0) / 100;
  return `$${Number.isInteger(value) ? value : value.toFixed(2)}`;
}

/** "12.5" or "12,50" dollars → 1250 cents; NaN for anything else. */
export function parseUsd(text) {
  const clean = String(text ?? "")
    .trim()
    .replace(/^\$/, "")
    .replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return NaN;
  return Math.round(Number(clean) * 100);
}
