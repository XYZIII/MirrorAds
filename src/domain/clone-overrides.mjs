import { localHourToUtcMs } from "./report-time.mjs";
import { hasPositiveBudget } from "./schedule.mjs";

/**
 * Currencies Meta keeps without minor units: a budget of 500 JPY is stored as
 * 500, while 5.00 USD is stored as 500.
 */
const ZERO_DECIMAL = new Set([
  "CLP",
  "COP",
  "CRC",
  "HUF",
  "ISK",
  "IDR",
  "JPY",
  "KRW",
  "PYG",
  "TWD",
  "VND",
]);

/** How many API units make one unit of the currency (100 for USD, 1 for JPY). */
export function currencyMinorUnits(currency) {
  return ZERO_DECIMAL.has(String(currency || "").toUpperCase()) ? 1 : 100;
}

/** "50", "50.5", "50,5" -> a positive number, else null. */
export function parseAmount(value) {
  const text = String(value ?? "")
    .trim()
    .replace(",", ".");
  if (!text) return null;
  const numeric = Number(text);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

/** An amount in whole currency units as Meta's API integer. */
export function toApiAmount(amount, currency) {
  return Math.max(1, Math.round(amount * currencyMinorUnits(currency)));
}

/**
 * "2026-11-15T09:30" on the clock of `timeZone` as an ISO instant, or "" for a
 * value that is not a date and time.
 */
export function localDateTimeToIso(value, timeZone) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(
    String(value || ""),
  );
  if (!match || !timeZone) return "";
  const [, date, hour, minute] = match;
  const utc =
    localHourToUtcMs(date, Number(hour), timeZone) + Number(minute) * 60000;
  return new Date(utc).toISOString();
}

/** True when any override is filled in. */
export function hasCloneOverrides(overrides) {
  return Boolean(
    parseAmount(overrides?.budget) ||
    parseAmount(overrides?.bid) ||
    String(overrides?.start || "").trim(),
  );
}

/**
 * A copy of the clone package with the operator's changes applied: daily
 * budget, bid and start time. Amounts are in the source account's currency,
 * so the usual currency conversion still applies afterwards.
 *
 * Nothing is invented: the budget goes where the source keeps it (campaign or
 * ad sets), and the bid is changed only on ad sets that already have one,
 * because a bid needs a bid strategy the source did not choose. `notes` says
 * what was applied and what could not be.
 */
export function applyCloneOverrides(packageData, overrides, options = {}) {
  const notes = [];
  if (!packageData || !hasCloneOverrides(overrides)) {
    return { packageData, notes };
  }
  const currency = options.currency || packageData.source?.currency || "";
  const copy = {
    ...packageData,
    campaign: { ...(packageData.campaign || {}) },
    adsets: (packageData.adsets || []).map((adset) => ({ ...adset })),
  };

  const budget = parseAmount(overrides.budget);
  if (budget) {
    const value = String(toApiAmount(budget, currency));
    if (hasPositiveBudget(copy.campaign.daily_budget)) {
      copy.campaign.daily_budget = value;
      notes.push({
        kind: "budget",
        level: "info",
        where: "campaign",
        count: 1,
      });
    } else {
      const daily = copy.adsets.filter((adset) =>
        hasPositiveBudget(adset.daily_budget),
      );
      for (const adset of daily) adset.daily_budget = value;
      notes.push(
        daily.length
          ? {
              kind: "budget",
              level: "info",
              where: "adsets",
              count: daily.length,
            }
          : { kind: "budget", level: "warn", where: "none", count: 0 },
      );
    }
  }

  const bid = parseAmount(overrides.bid);
  if (bid) {
    const value = String(toApiAmount(bid, currency));
    const withBid = copy.adsets.filter((adset) =>
      hasPositiveBudget(adset.bid_amount),
    );
    for (const adset of withBid) adset.bid_amount = value;
    notes.push(
      withBid.length
        ? { kind: "bid", level: "info", where: "adsets", count: withBid.length }
        : { kind: "bid", level: "warn", where: "none", count: 0 },
    );
  }

  const start = localDateTimeToIso(overrides.start, options.timeZone);
  if (String(overrides.start || "").trim()) {
    if (!start) {
      notes.push({ kind: "start", level: "warn", where: "none", count: 0 });
    } else {
      if (copy.campaign.start_time) copy.campaign.start_time = start;
      let droppedEnds = 0;
      for (const adset of copy.adsets) {
        adset.start_time = start;
        // An end that is not after the new start would make the ad set invalid.
        if (
          adset.end_time &&
          !(Date.parse(adset.end_time) > Date.parse(start))
        ) {
          delete adset.end_time;
          droppedEnds += 1;
        }
      }
      notes.push({
        kind: "start",
        level: "info",
        where: "adsets",
        count: copy.adsets.length,
        iso: start,
        droppedEnds,
      });
    }
  }
  return { packageData: copy, notes };
}

/**
 * The new daily budget for a bulk change, in API units.
 * `change` is `{ mode: "percent", value }` (+20, -30) or
 * `{ mode: "set", value }` in USD, converted with Meta's account ratio.
 * Returns null when the change cannot be computed.
 */
export function computeNewBudget(current, change, account = {}) {
  const old = Number(current);
  const value = Number(change?.value);
  if (!Number.isFinite(value)) return null;
  if (change?.mode === "percent") {
    if (!Number.isFinite(old) || old <= 0 || value <= -100) return null;
    return Math.max(1, Math.round(old * (1 + value / 100)));
  }
  if (change?.mode === "set") {
    if (value <= 0) return null;
    const currency = String(account.currency || "").toUpperCase();
    const ratio = currency === "USD" ? 1 : Number(account.ratio);
    if (!(ratio > 0)) return null;
    return toApiAmount(value * ratio, currency);
  }
  return null;
}

/** One log line for a note from applyCloneOverrides. */
export function describeOverrideNote(note) {
  const subject = { budget: "Daily budget", bid: "Bid", start: "Start time" }[
    note.kind
  ];
  if (note.level === "warn") {
    const reason = {
      budget:
        "the source has no daily budget (a lifetime budget is left as it is)",
      bid: "the source ad sets have no bid, so there is no bid strategy to apply it to",
      start: "the target account's time zone is unknown",
    }[note.kind];
    return `${subject} override was NOT applied: ${reason}.`;
  }
  if (note.kind === "start") {
    return `${subject} override applied to ${note.count} ad set(s): ${note.iso}${note.droppedEnds ? `; ${note.droppedEnds} end time(s) before it were removed` : ""}.`;
  }
  return `${subject} override applied to ${note.where === "campaign" ? "the campaign" : `${note.count} ad set(s)`}.`;
}
