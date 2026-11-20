import { accountOffsetMinutes } from "../domain/account-zone.mjs";
import { localDateTimeToIso } from "../domain/clone-overrides.mjs";
import {
  clockInZone,
  dateInZone,
  formatUtcOffset,
  isKnownTimeZone,
} from "../domain/report-time.mjs";
import {
  START_ZONE_MODES,
  startZoneMode,
  viewerZone,
} from "../state/zone-settings.mjs";
import { escapeHtml } from "../utils/string.mjs";
import { t } from "./i18n.mjs";
import { viewerZoneSelect, zoneLabel } from "./zone-picker.mjs";

/** Zones listed in the hint at most; the rest are counted. */
const ZONE_LIMIT = 6;

/** A zone the browser knows for a fixed offset, when an account names none. */
function fixedZone(offsetMinutes) {
  if (offsetMinutes % 60) return "";
  const hours = offsetMinutes / 60;
  // Etc/GMT zones count the other way round: UTC+7 is Etc/GMT-7.
  return hours === 0
    ? "UTC"
    : `Etc/GMT${hours > 0 ? "-" : "+"}${Math.abs(hours)}`;
}

/** The time zones of some accounts, west to east: [{ label, zone }]. */
export function accountZones(accounts) {
  const byOffset = new Map();
  for (const account of accounts || []) {
    const offset = accountOffsetMinutes(account);
    if (offset === null || byOffset.has(offset)) continue;
    const named = account?.raw?.timezone_name;
    const zone = isKnownTimeZone(named) ? named : fixedZone(offset);
    if (zone) byOffset.set(offset, { label: formatUtcOffset(offset), zone });
  }
  return [...byOffset.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, item]) => item);
}

/** "21.11 05:00" for a typed "2026-11-21T05:00". */
export function typedClock(value) {
  const match = /^\d{4}-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(
    String(value || ""),
  );
  return match ? `${match[2]}.${match[1]} ${match[3]}` : String(value || "");
}

/** "21.11 05:00": a moment on a zone's clock. */
function clock(ms, zone) {
  const [, month, day] = dateInZone(ms, zone).split("-");
  return `${day}.${month} ${clockInZone(ms, zone)}`;
}

/**
 * What a typed start means for the accounts being cloned into, in words:
 * in "account" mode each account's start on the operator's clock; in
 * "viewer" mode the one moment on each account's clock.
 */
export function startZoneHint(state, accounts, nowMs = Date.now()) {
  const mode = startZoneMode(state);
  const mine = viewerZone(state);
  const start = String(state.massOverrides?.start || "").trim();
  if (!start) {
    return mode === "viewer"
      ? t("overrides.zone.viewerNote", { zone: zoneLabel(mine, nowMs) })
      : t("overrides.zone.accountNote");
  }
  const zones = accountZones(accounts);
  const shown = zones.slice(0, ZONE_LIMIT);
  const more =
    zones.length > shown.length
      ? ` ${t("bulk.andMore", { count: zones.length - shown.length, n: zones.length - shown.length })}`
      : "";
  if (mode === "viewer") {
    const moment = Date.parse(localDateTimeToIso(start, mine));
    if (!Number.isFinite(moment)) return "";
    const parts = shown
      .map((item) => `${item.label} — ${clock(moment, item.zone)}`)
      .join(", ");
    return t(
      parts ? "overrides.zone.viewerHint" : "overrides.zone.viewerOnly",
      {
        time: clock(moment, mine),
        zone: zoneLabel(mine, nowMs),
        parts: `${parts}${more}`,
      },
    );
  }
  const parts = shown
    .map((item) => {
      const moment = Date.parse(localDateTimeToIso(start, item.zone));
      return Number.isFinite(moment)
        ? `${item.label} — ${clock(moment, mine)}`
        : "";
    })
    .filter(Boolean)
    .join(", ");
  return t(
    parts ? "overrides.zone.accountHint" : "overrides.zone.accountNote",
    {
      time: typedClock(start),
      zone: zoneLabel(mine, nowMs),
      parts: `${parts}${more}`,
    },
  );
}

/** The switch between account time and my time, with my time's zone. */
export function startZoneRow(state) {
  const mode = startZoneMode(state);
  const buttons = START_ZONE_MODES.map(
    (value) =>
      `<button type="button" data-always-enabled data-start-zone="${value}" class="${value === mode ? "is-on" : ""}" aria-pressed="${value === mode}">${escapeHtml(
        t(`overrides.zone.${value}`),
      )}</button>`,
  ).join("");
  return `<div class="ma-ovr-zone">
      <span>${escapeHtml(t("overrides.zone.label"))}</span>
      <div class="ma-seg" role="group">${buttons}</div>
      ${mode === "viewer" ? viewerZoneSelect(state, "data-start-viewer-zone data-always-enabled") : ""}
    </div>`;
}

/** Styles of the start time switch. */
export function buildStartZoneStyles(A) {
  return `
      ${A} .ma-ovr-zone { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 2px 0 6px; }
      ${A} .ma-ovr-zone > span { font-size: 12px; font-weight: 600; color: var(--ma-muted); }
      ${A} .ma-ovr-zone .ma-seg button { height: 28px; padding: 0 12px; font-size: 12px; }
      ${A} .ma-ovr-zone select { width: auto; max-width: 240px; height: 32px; padding: 0 8px; font-size: 12px; }
      ${A} .ma-ovr-starthint { margin: 0 0 10px; font-size: 12px; line-height: 1.5; color: var(--ma-ink); }
  `;
}
