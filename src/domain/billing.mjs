/**
 * Unpaid balances of ad accounts. Meta has no API call that pays one: the
 * script finds them, says what is owed, and opens Meta's own payment page,
 * where "Pay now" charges the card (and asks for its confirmation if the
 * bank wants one).
 */

import { currencyMinorUnits } from "./clone-overrides.mjs";

/**
 * What Meta reports as owed and what the account pays with. `balance` is in
 * the currency's smallest unit (cents for USD); the card is Meta's own label
 * ("Visa *1234").
 */
export function billingInfo(row, currency) {
  const raw = row?.balance;
  const balance = Number(raw);
  const known = raw !== undefined && raw !== null && raw !== "";
  return {
    amountDue:
      known && Number.isFinite(balance)
        ? balance / currencyMinorUnits(currency)
        : null,
    card: String(row?.funding_source_details?.display_string || "").trim(),
  };
}

/**
 * An account Meta holds for an unpaid balance (status 3, unsettled): the
 * one "Pay now" settles. Status 8 means a payment is already being
 * processed, so paying again is not offered.
 */
export function payable(row) {
  return row?.health === "billing" && Number(row?.statusCode) === 3;
}

/** A payment Meta is still processing (status 8). */
export function settling(row) {
  return row?.health === "billing" && Number(row?.statusCode) === 8;
}

/** Meta's payment page of an ad account, with "Amount due" and "Pay now". */
export function billingUrl(accountId) {
  const id = encodeURIComponent(String(accountId || "").replace(/^act_/, ""));
  return `https://business.facebook.com/billing_hub/payment_settings/?asset_id=${id}&payment_account_id=${id}`;
}
