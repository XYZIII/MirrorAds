import {
  formatUtcOffset,
  reportZoneChoices,
  zoneOffsetMinutes,
} from "../domain/report-time.mjs";
import { browserZone, pickedViewerZone } from "../state/zone-settings.mjs";
import { escapeHtml } from "../utils/string.mjs";
import { t } from "./i18n.mjs";

/** "Kiev (UTC+2)": a zone's city and its offset now. */
export function zoneLabel(zone, nowMs = Date.now()) {
  return `${String(zone)
    .replace(/^.*\//, "")
    .replace(/_/g, " ")} (${formatUtcOffset(zoneOffsetMinutes(nowMs, zone))})`;
}

/**
 * The picker of "my time": the browser's zone, common cities and fixed
 * offsets. `attribute` names the select for its change handler.
 */
export function viewerZoneSelect(state, attribute) {
  const picked = pickedViewerZone(state);
  const choices = reportZoneChoices();
  const option = (zone, label) =>
    `<option value="${escapeHtml(zone)}" ${zone === picked ? "selected" : ""}>${escapeHtml(label)}</option>`;
  return `<select ${attribute}>
      <option value="" ${picked ? "" : "selected"}>${escapeHtml(
        t("reports.zoneAuto", { zone: zoneLabel(browserZone()) }),
      )}</option>
      <optgroup label="${escapeHtml(t("reports.zoneCities"))}">${choices.cities
        .map((zone) => option(zone, zoneLabel(zone)))
        .join("")}</optgroup>
      <optgroup label="${escapeHtml(t("reports.zoneOffsets"))}">${choices.offsets
        .map((item) => option(item.zone, item.label))
        .join("")}</optgroup>
    </select>`;
}
