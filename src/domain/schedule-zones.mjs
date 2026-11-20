/**
 * Scheduled starts read as account clock time. A campaign set to start at
 * 06:00 in its account starts at 06:00 in every account it is cloned into,
 * whatever their time zones, the way a start typed by hand works.
 */

import {
  clockInZone,
  dateInZone,
  isKnownTimeZone,
  localHourToUtcMs,
} from "./report-time.mjs";
import { deepClone } from "../utils/object.mjs";

/** The same wall-clock time of `iso` (read in `fromZone`) in `toZone`. */
export function sameClockInZone(iso, fromZone, toZone) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const date = dateInZone(ms, fromZone);
  const [hour, minute] = clockInZone(ms, fromZone).split(":").map(Number);
  const seconds = new Date(ms).getUTCSeconds();
  return new Date(
    localHourToUtcMs(date, hour, toZone) + minute * 60000 + seconds * 1000,
  ).toISOString();
}

/**
 * The package with every start still ahead moved to the same clock time in
 * the target account's zone; ends move with their starts, so durations stay.
 * A start whose clock time has already passed in the target keeps the source's
 * moment. Returns { packageData, moved: [{ name, from, to }] }.
 */
export function retimeScheduledStarts(
  packageData,
  { fromZone, toZone, nowMs = Date.now() } = {},
) {
  const unchanged = { packageData, moved: [] };
  if (
    !packageData ||
    !isKnownTimeZone(fromZone) ||
    !isKnownTimeZone(toZone) ||
    fromZone === toZone
  ) {
    return unchanged;
  }
  // Five minutes of margin: a start this close is as good as now.
  const soon = nowMs + 5 * 60000;
  const copy = deepClone(packageData);
  const moved = [];
  const retime = (entity, startKey, endKey, name) => {
    const start = Date.parse(entity?.[startKey] || "");
    if (!Number.isFinite(start) || start <= soon) return;
    const next = sameClockInZone(entity[startKey], fromZone, toZone);
    const nextMs = Date.parse(next);
    if (!Number.isFinite(nextMs) || nextMs <= soon || nextMs === start) return;
    const shift = nextMs - start;
    entity[startKey] = next;
    const end = Date.parse(entity?.[endKey] || "");
    if (Number.isFinite(end) && end > start) {
      entity[endKey] = new Date(end + shift).toISOString();
    }
    moved.push({ name, from: new Date(start).toISOString(), to: next });
  };
  retime(copy.campaign, "start_time", "stop_time", copy.campaign?.name || "");
  for (const adset of copy.adsets || []) {
    retime(adset, "start_time", "end_time", adset?.name || "");
  }
  return moved.length ? { packageData: copy, moved } : unchanged;
}

/** A start that is still ahead, if the package has one: the earliest. */
export function scheduledStart(packageData, nowMs = Date.now()) {
  const soon = nowMs + 5 * 60000;
  const starts = [
    packageData?.campaign?.start_time,
    ...(packageData?.adsets || []).map((adset) => adset?.start_time),
  ]
    .map((value) => Date.parse(value || ""))
    .filter((ms) => Number.isFinite(ms) && ms > soon);
  return starts.length ? new Date(Math.min(...starts)).toISOString() : "";
}
