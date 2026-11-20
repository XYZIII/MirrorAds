/**
 * Spend over time for the Reports chart: buckets by the hour for a period
 * of up to two days, else by the day, on the same clock as the report.
 */

import {
  clockInZone,
  dateInZone,
  formatUtcOffset,
  localHourToUtcMs,
  parseHourBucket,
  resolveWindow,
} from "./report-time.mjs";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Periods up to this long are drawn by the hour. */
const HOURLY_UP_TO_MS = 2 * DAY_MS;

/** Breakdowns of the chart. */
export const TREND_BREAKDOWNS = ["total", "accounts", "zones", "status"];
/**
 * Named series when they do not all fit: the biggest four and "other".
 * Up to five series are all named.
 */
export const TREND_SERIES_LIMIT = 4;

/**
 * The buckets of a report's chart: { unit, count, labels, starts }. Labels
 * are read on the report's clock: the viewer's zone, or for "each
 * account's own time" the reference zone (the viewer's), whose wall clock
 * every account's window follows.
 */
export function trendFrame({ period, custom, nowMs, zone }) {
  const window = resolveWindow({
    period,
    custom,
    nowMs,
    zone,
    accountZone: zone,
  });
  const length = Math.max(HOUR_MS, window.endMs - window.startMs);
  const unit = length <= HOURLY_UP_TO_MS ? "hour" : "day";
  const size = unit === "hour" ? HOUR_MS : DAY_MS;
  const count = Math.max(1, Math.ceil(length / size));
  const starts = Array.from(
    { length: count },
    (_, index) => window.startMs + index * size,
  );
  const labels = starts.map((at) => {
    if (unit === "day") {
      const [, month, day] = dateInZone(at, zone).split("-");
      return `${day}.${month}`;
    }
    return clockInZone(at, zone).slice(0, 2);
  });
  // A two-day hourly chart names the day where it starts.
  const days = starts.map((at) => {
    const [, month, day] = dateInZone(at, zone).split("-");
    return `${day}.${month}`;
  });
  return { unit, count, labels, days, starts };
}

/**
 * Hourly insight rows (advertiser time zone) added into buckets of `unit`
 * from `startMs`; hours outside [startMs, endMs) are left out.
 */
export function bucketHourlyRows(
  rows,
  { accountZone, startMs, endMs, unit, count },
) {
  const buckets = new Array(count).fill(0);
  const size = unit === "hour" ? HOUR_MS : DAY_MS;
  for (const row of rows || []) {
    const hour = parseHourBucket(
      row?.hourly_stats_aggregated_by_advertiser_time_zone,
    );
    if (hour === null || !row?.date_start) continue;
    const at = localHourToUtcMs(row.date_start, hour, accountZone);
    if (at < startMs || at >= endMs) continue;
    const index = Math.floor((at - startMs) / size);
    if (index >= 0 && index < count) buckets[index] += Number(row.spend) || 0;
  }
  return buckets;
}

/**
 * Daily insight rows added into day buckets from `startMs`: each account
 * day goes to the bucket it starts nearest to.
 */
export function bucketDailyRows(rows, { accountZone, startMs, count }) {
  const buckets = new Array(count).fill(0);
  for (const row of rows || []) {
    if (!row?.date_start) continue;
    const at = localHourToUtcMs(row.date_start, 0, accountZone);
    const index = Math.round((at - startMs) / DAY_MS);
    if (index >= 0 && index < count) buckets[index] += Number(row.spend) || 0;
  }
  return buckets;
}

const sum = (values) => values.reduce((total, value) => total + value, 0);

function addInto(target, values) {
  values.forEach((value, index) => {
    target[index] += value;
  });
}

/**
 * The series of a breakdown from the report lines and each account's
 * buckets (in USD): [{ key, label, values, total, other }]. Lines without
 * buckets are left out. Named series are the biggest `limit`; the rest is
 * one "other" series at the end.
 */
export function trendSeries(rows, buckets, breakdown, count) {
  const lines = (rows || []).filter((row) =>
    Array.isArray(buckets.get(row.accountId)),
  );
  const groups = new Map();
  const group = (key, label) => {
    if (!groups.has(key)) {
      groups.set(key, { key, label, values: new Array(count).fill(0) });
    }
    return groups.get(key);
  };
  for (const row of lines) {
    const values = buckets.get(row.accountId);
    let entry;
    if (breakdown === "accounts") entry = group(row.accountId, row.name);
    else if (breakdown === "zones") {
      entry =
        row.offsetMinutes === null || row.offsetMinutes === undefined
          ? group("zone:?", "?")
          : group(
              `zone:${row.offsetMinutes}`,
              formatUtcOffset(row.offsetMinutes),
            );
    } else if (breakdown === "status") {
      const live = row.health === "live" || row.health === "unknown";
      entry = group(live ? "live" : "dead", "");
    } else entry = group("total", "");
    addInto(entry.values, values);
  }
  let series = [...groups.values()]
    .map((entry) => ({ ...entry, total: sum(entry.values), other: false }))
    .filter((entry) => entry.total > 0);
  if (breakdown === "status") {
    // Live first, always: the two keep their places.
    series.sort((a, b) => (a.key === "live" ? -1 : b.key === "live" ? 1 : 0));
    return series;
  }
  series.sort((a, b) => b.total - a.total);
  if (series.length > TREND_SERIES_LIMIT + 1) {
    const kept = series.slice(0, TREND_SERIES_LIMIT);
    const rest = series.slice(TREND_SERIES_LIMIT);
    const other = {
      key: "other",
      label: "",
      values: new Array(count).fill(0),
      other: true,
      size: rest.length,
    };
    for (const entry of rest) addInto(other.values, entry.values);
    other.total = sum(other.values);
    series = [...kept, other];
  }
  if (breakdown === "zones") {
    // Zones read west to east; "other" stays last.
    const offset = (entry) => Number(entry.key.split(":")[1]);
    series.sort((a, b) =>
      a.other ? 1 : b.other ? -1 : (offset(a) || 0) - (offset(b) || 0),
    );
  }
  return series;
}

/**
 * Colour slots that follow the series, not their rank: a series keeps the
 * slot it had while it stays on the chart; new ones take the free slots.
 * `memory` (Map key -> slot) is updated in place.
 */
export function assignSlots(keys, memory, slots) {
  const result = new Map();
  const used = new Set();
  for (const key of keys) {
    const slot = memory.get(key);
    if (slot !== undefined && slot < slots && !used.has(slot)) {
      result.set(key, slot);
      used.add(slot);
    }
  }
  for (const key of keys) {
    if (result.has(key)) continue;
    let slot = 0;
    while (used.has(slot) && slot < slots - 1) slot += 1;
    result.set(key, slot);
    used.add(slot);
    memory.set(key, slot);
  }
  return result;
}

/** Round axis steps: 1, 2, 2.5 or 5 times a power of ten. */
export function niceTicks(max, target = 4) {
  if (!(max > 0)) return [0, 1];
  const rough = max / target;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step =
    [1, 2, 2.5, 5, 10]
      .map((factor) => factor * power)
      .find((s) => s >= rough) || 10 * power;
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let value = 0; value <= top + step / 2; value += step) {
    ticks.push(Math.round(value * 100) / 100);
  }
  return ticks;
}
