/** Time zones of ad accounts, as Meta lists them with the accounts. */

import { formatUtcOffset } from "./report-time.mjs";

/** The account's offset from UTC in minutes, or null when Meta did not say. */
export function accountOffsetMinutes(account) {
  const raw = account?.raw?.timezone_offset_hours_utc;
  if (raw === undefined || raw === null || raw === "") return null;
  const hours = Number(raw);
  return Number.isFinite(hours) ? Math.round(hours * 60) : null;
}

/** "UTC+7", or "" when the zone is not known. */
export function accountZoneLabel(account) {
  const offset = accountOffsetMinutes(account);
  return offset === null ? "" : formatUtcOffset(offset);
}

/**
 * The time zones of a list of accounts with how many accounts each has,
 * west to east: [{ offset, label, count }].
 */
export function zoneCounts(accounts) {
  const counts = new Map();
  for (const account of accounts || []) {
    const offset = accountOffsetMinutes(account);
    if (offset === null) continue;
    counts.set(offset, (counts.get(offset) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([offset, count]) => ({
      offset,
      label: formatUtcOffset(offset),
      count,
    }));
}
