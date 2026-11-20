/**
 * Links into Ads Manager. Opened without a date, Ads Manager shows the last
 * 30 days; every account the panel opens shows today instead.
 */

import { addDays, dateInZone } from "./report-time.mjs";

const ADS_MANAGER = "https://adsmanager.facebook.com";

/**
 * Today as Ads Manager writes it in its own address bar: a half-open range
 * of dates with the preset's name, "2026-11-20_2026-11-21,today". The date
 * is the account's own when its time zone is known, else the viewer's.
 */
export function todayRange(nowMs = Date.now(), timeZone = "") {
  let today;
  try {
    today = dateInZone(
      nowMs,
      timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
  } catch {
    today = new Date(nowMs).toISOString().slice(0, 10);
  }
  return `${today}_${addDays(today, 1)},today`;
}

/** The campaigns of an account in Ads Manager, showing today. */
export function adsManagerAccountUrl(
  accountId,
  { timeZone = "", nowMs = Date.now(), base = ADS_MANAGER } = {},
) {
  const url = new URL("/adsmanager/manage/campaigns", base);
  const id = String(accountId || "").replace(/^act_/, "");
  if (id) url.searchParams.set("act", id);
  url.searchParams.set("date", todayRange(nowMs, timeZone));
  return url.toString();
}
