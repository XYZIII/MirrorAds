/**
 * Day arithmetic for spend reports across ad accounts in different time zones.
 *
 * Meta counts a day in the ad account's own time zone. To show one "today" for
 * every account, hourly rows are placed on the UTC timeline and cut by the
 * viewer's day instead.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export const REPORT_PERIODS = ["today", "yesterday", "last7", "custom"];

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

/** A custom period is usable: real dates in order, at most `maxDays` long. */
export function validateCustomPeriod(custom, maxDays = 62) {
  const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
  if (!isDate(custom?.since) || !isDate(custom?.until)) return "dates";
  const start =
    Date.parse(`${custom.since}T00:00:00Z`) +
    (custom.withTime ? Number(custom.sinceHour) || 0 : 0) * 3600000;
  const end =
    Date.parse(`${custom.until}T00:00:00Z`) +
    (custom.withTime ? (Number(custom.untilHour) || 0) + 1 : 24) * 3600000;
  if (!(end > start)) return "order";
  if (end - start > maxDays * DAY_MS) return "long";
  return "";
}

/**
 * A period as wall-clock bounds: the first hour included and the first hour
 * after the end. Presets are whole days ending on `today`; a custom period is
 * a date range, optionally with hours ("13.11 00:00 – 14.11 23:59" is hours
 * 0 through 23, so it ends at 00:00 on the 15th).
 */
export function periodBounds(period, today, custom) {
  if (period === "custom" && custom) {
    if (custom.withTime) {
      const lastHour = Math.min(23, Math.max(0, Number(custom.untilHour) || 0));
      return {
        since: {
          date: custom.since,
          hour: Math.min(23, Math.max(0, Number(custom.sinceHour) || 0)),
        },
        until:
          lastHour === 23
            ? { date: addDays(custom.until, 1), hour: 0 }
            : { date: custom.until, hour: lastHour + 1 },
      };
    }
    return {
      since: { date: custom.since, hour: 0 },
      until: { date: addDays(custom.until, 1), hour: 0 },
    };
  }
  const dates = periodDates(period, today);
  return {
    since: { date: dates.since, hour: 0 },
    until: { date: addDays(dates.until, 1), hour: 0 },
  };
}

/**
 * A period read on the clock of `zone`, as a UTC window plus the account
 * dates that cover it.
 *
 * `wholeAccountDays` is true when the window is exactly a run of the
 * account's own days: then Meta's daily numbers are already the answer.
 * Otherwise hourly rows for `accountRange` are cut to `[startMs, endMs)`.
 */
export function resolveWindow({ period, custom, nowMs, zone, accountZone }) {
  const bounds = periodBounds(period, dateInZone(nowMs, zone), custom);
  const startMs = localHourToUtcMs(bounds.since.date, bounds.since.hour, zone);
  const endMs = localHourToUtcMs(bounds.until.date, bounds.until.hour, zone);
  const accountRange = {
    since: dateInZone(startMs, accountZone),
    until: dateInZone(endMs - 1, accountZone),
  };
  const wholeAccountDays =
    startMs === localHourToUtcMs(accountRange.since, 0, accountZone) &&
    endMs === localHourToUtcMs(addDays(accountRange.until, 1), 0, accountZone);
  return { startMs, endMs, accountRange, wholeAccountDays };
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
    activeCampaigns: 0,
    // Campaigns of the accounts that can deliver: banned, unpaid, held or
    // closed accounts are not counted.
    campaigns: 0,
    inactiveCampaigns: 0,
    spendingCampaigns: 0,
  };
  for (const row of rows || []) {
    // Campaigns switched on in an account that cannot deliver are not running.
    if (accountDelivers(row.health)) {
      const active = Number(row.activeCampaigns) || 0;
      const inactive = Number(row.inactiveCampaigns) || 0;
      total.activeCampaigns += active;
      total.inactiveCampaigns += inactive;
      total.campaigns += active + inactive;
      total.spendingCampaigns += spendingCount(row);
    }
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

/** How many campaigns of an account line spent in the period. */
export function spendingCount(row) {
  return Array.isArray(row?.spendingCampaignIds)
    ? row.spendingCampaignIds.length
    : 0;
}

/**
 * Switched-on campaigns of a line that spent nothing in the period: on, but
 * not delivering. Only for lines whose campaigns could be read.
 */
export function idleActiveCount(row) {
  if (!Array.isArray(row?.activeCampaignIds)) return 0;
  const spending = new Set(row.spendingCampaignIds || []);
  return row.activeCampaignIds.filter((id) => !spending.has(id)).length;
}

/** The campaigns that spent something, from campaign-level insights rows. */
export function spendingCampaignIds(rows) {
  const ids = new Set();
  for (const row of rows || []) {
    if (row?.campaign_id && Number(row.spend) > 0) {
      ids.add(String(row.campaign_id));
    }
  }
  return [...ids];
}

/** The ids of the campaigns that are switched on. */
export function activeCampaignIds(campaigns) {
  return (campaigns || [])
    .filter(
      (campaign) =>
        String(campaign?.effective_status || "").toUpperCase() === "ACTIVE" &&
        campaign?.id,
    )
    .map((campaign) => String(campaign.id));
}

/**
 * Lines for a campaign filter: "all", or the accounts that can deliver and
 * have "active", "inactive" or "spend" (spent in the period) campaigns.
 */
export function filterByCampaigns(rows, filter) {
  if (!["active", "inactive", "spend"].includes(filter)) return rows || [];
  return (rows || []).filter((row) => {
    if (!accountDelivers(row.health)) return false;
    if (filter === "active") return Number(row.activeCampaigns) > 0;
    if (filter === "inactive") return Number(row.inactiveCampaigns) > 0;
    return spendingCount(row) > 0;
  });
}

/** Campaigns that are switched on versus everything else that still exists. */
export function countCampaigns(campaigns) {
  let active = 0;
  let inactive = 0;
  for (const campaign of campaigns || []) {
    const status = String(campaign?.effective_status || "").toUpperCase();
    if (status === "DELETED" || status === "ARCHIVED") continue;
    if (status === "ACTIVE") active += 1;
    else inactive += 1;
  }
  return { active, inactive };
}

/** Time zones offered for "My time": common cities, then fixed offsets. */
export function reportZoneChoices() {
  const cities = [
    "Europe/Kiev",
    "Europe/Warsaw",
    "Europe/London",
    "Europe/Berlin",
    "Europe/Moscow",
    "Asia/Dubai",
    "Asia/Almaty",
    "Asia/Bangkok",
    "Asia/Ho_Chi_Minh",
    "Asia/Singapore",
    "Asia/Hong_Kong",
    "Asia/Tokyo",
    "Australia/Sydney",
    "America/Sao_Paulo",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
  ].filter(isKnownTimeZone);
  const offsets = [];
  for (let hours = -12; hours <= 14; hours += 1) {
    // Etc/GMT signs are inverted: Etc/GMT-7 is UTC+7.
    const zone =
      hours === 0 ? "UTC" : `Etc/GMT${hours > 0 ? "-" : "+"}${Math.abs(hours)}`;
    if (isKnownTimeZone(zone))
      offsets.push({ zone, label: formatUtcOffset(hours * 60) });
  }
  return { cities, offsets };
}

/**
 * Whether an ad account can deliver ads, from Meta's `account_status`:
 * "live" (active or in its grace period), "billing" (unpaid balance),
 * "review" (held for a risk review), "banned" (disabled), "closed", or
 * "unknown" when Meta gave no status.
 */
export function classifyAccountStatus(code) {
  const status = Number(code);
  if (!Number.isFinite(status) || status <= 0) return "unknown";
  if (status === 1 || status === 9 || status === 201) return "live";
  if (status === 3 || status === 8) return "billing";
  if (status === 7) return "review";
  if (status === 100 || status === 101 || status === 202) return "closed";
  return "banned";
}

/** Only a live account runs its campaigns; an unknown status is not held against it. */
export function accountDelivers(health) {
  return health === "live" || health === "unknown";
}

/** Rows for a status filter: "all", "live" or "dead" (anything not delivering). */
export function filterReportRows(rows, filter) {
  if (filter === "live") {
    return (rows || []).filter((row) => accountDelivers(row.health));
  }
  if (filter === "dead") {
    return (rows || []).filter((row) => !accountDelivers(row.health));
  }
  return rows || [];
}
