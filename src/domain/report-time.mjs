/**
 * Day arithmetic for spend reports across ad accounts in different time zones.
 *
 * Meta counts a day in the ad account's own time zone. To show one "today" for
 * every account, hourly rows are placed on the UTC timeline and cut by the
 * viewer's day instead.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export const REPORT_PERIODS = ["today", "yesterday", "last7"];

export function addDays(date, days) {
  const [year, month, day] = String(date).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function zoneParts(utcMs, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type) => Number(parts.find((part) => part.type === type).value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/** True when the runtime knows this IANA zone name. */
export function isKnownTimeZone(timeZone) {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Minutes the zone is ahead of UTC at that instant (DST-aware). */
export function zoneOffsetMinutes(utcMs, timeZone) {
  const local = zoneParts(utcMs, timeZone);
  const asUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
  );
  return Math.round((asUtc - Math.floor(utcMs / 60000) * 60000) / 60000);
}

/** Calendar date (YYYY-MM-DD) of an instant in a zone. */
export function dateInZone(utcMs, timeZone) {
  const local = zoneParts(utcMs, timeZone);
  const pad = (value) => String(value).padStart(2, "0");
  return `${local.year}-${pad(local.month)}-${pad(local.day)}`;
}

/** Wall-clock time (HH:MM) of an instant in a zone. */
export function clockInZone(utcMs, timeZone) {
  const local = zoneParts(utcMs, timeZone);
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(local.hour)}:${pad(local.minute)}`;
}

/** "UTC+7", "UTC-3:30" for an offset in minutes. */
export function formatUtcOffset(offsetMinutes) {
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absolute = Math.abs(offsetMinutes);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  return `UTC${sign}${hours}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""}`;
}

/** The UTC instant of a local date and hour in a zone. */
export function localHourToUtcMs(date, hour, timeZone) {
  const [year, month, day] = String(date).split("-").map(Number);
  const wall = Date.UTC(year, month - 1, day, hour);
  // Two passes settle the offset on days when the clocks change.
  let utc = wall - zoneOffsetMinutes(wall, timeZone) * 60000;
  utc = wall - zoneOffsetMinutes(utc, timeZone) * 60000;
  return utc;
}

/** First and last calendar date of a period that ends on `today`. */
export function periodDates(period, today) {
  if (period === "yesterday") {
    const day = addDays(today, -1);
    return { since: day, until: day };
  }
  if (period === "last7") return { since: addDays(today, -6), until: today };
  return { since: today, until: today };
}

/**
 * The viewer's period as a UTC window, and the account dates that cover it.
 * Hourly rows for `accountRange` are then cut to `[startMs, endMs)`.
 */
export function viewerWindow(period, nowMs, viewerZone, accountZone) {
  const dates = periodDates(period, dateInZone(nowMs, viewerZone));
  const startMs = localHourToUtcMs(dates.since, 0, viewerZone);
  const endMs = localHourToUtcMs(addDays(dates.until, 1), 0, viewerZone);
  return {
    startMs,
    endMs,
    accountRange: {
      since: dateInZone(startMs, accountZone),
      until: dateInZone(endMs - 1, accountZone),
    },
  };
}

/** "13:00:00 - 13:59:59" -> 13. */
export function parseHourBucket(value) {
  const match = /^(\d{1,2}):/.exec(String(value || ""));
  return match ? Number(match[1]) : null;
}

const LEAD_TYPES = [
  "lead",
  "offsite_conversion.fb_pixel_lead",
  "onsite_conversion.lead_grouped",
];
const PURCHASE_TYPES = [
  "omni_purchase",
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
];

/**
 * One count per goal. Meta reports the same lead or purchase under several
 * action types (the total and its channel parts), so the types are a priority
 * list, never a sum.
 */
function pickAction(actions, types) {
  if (!Array.isArray(actions)) return null;
  for (const type of types) {
    const found = actions.find((item) => item?.action_type === type);
    if (found) return Number(found.value) || 0;
  }
  return 0;
}

/**
 * Adds insights rows up. `leads` and `purchases` are null when no row carried
 * an `actions` list at all, which is how Meta answers hourly requests.
 */
export function summarizeInsights(rows) {
  const total = {
    spend: 0,
    impressions: 0,
    clicks: 0,
    leads: null,
    purchases: null,
  };
  for (const row of rows || []) {
    total.spend += Number(row?.spend) || 0;
    total.impressions += Number(row?.impressions) || 0;
    total.clicks += Number(row?.clicks) || 0;
    if (Array.isArray(row?.actions)) {
      total.leads = (total.leads || 0) + pickAction(row.actions, LEAD_TYPES);
      total.purchases =
        (total.purchases || 0) + pickAction(row.actions, PURCHASE_TYPES);
    }
  }
  return total;
}

/** Keeps the hourly rows whose hour starts inside the UTC window. */
export function filterHourlyRows(rows, accountZone, startMs, endMs) {
  return (rows || []).filter((row) => {
    const hour = parseHourBucket(
      row?.hourly_stats_aggregated_by_advertiser_time_zone,
    );
    if (hour === null || !row?.date_start) return false;
    const at = localHourToUtcMs(row.date_start, hour, accountZone);
    return at >= startMs && at < endMs;
  });
}

/** Spend in USD; `ratio` is account-currency units per 1 USD. */
export function toUsd(amount, currency, ratio) {
  if (String(currency || "").toUpperCase() === "USD") return amount;
  return ratio > 0 ? amount / ratio : null;
}

/** Totals over account rows; accounts without a USD rate are left out. */
export function totalReport(rows) {
  const total = {
    spendUsd: 0,
    leads: 0,
    purchases: 0,
    accounts: 0,
    unconverted: 0,
    leadsKnown: false,
    purchasesKnown: false,
  };
  for (const row of rows || []) {
    if (row.error) continue;
    if (row.spendUsd === null) {
      if (row.spend > 0) total.unconverted += 1;
    } else {
      total.spendUsd += row.spendUsd;
    }
    if (row.spend > 0) total.accounts += 1;
    if (row.leads !== null) {
      total.leads += row.leads;
      total.leadsKnown = true;
    }
    if (row.purchases !== null) {
      total.purchases += row.purchases;
      total.purchasesKnown = true;
    }
  }
  return total;
}
