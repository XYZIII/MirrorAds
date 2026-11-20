/**
 * The viewer's own time zone ("my time") and how a typed clone start is
 * read, kept in the browser and shared by Reports and Clone.
 */

import { isKnownTimeZone } from "../domain/report-time.mjs";

const VIEWER_ZONE_KEY = "mirrorads.report.zone";
const START_ZONE_KEY = "mirrorads.clone.startZone";
export const START_ZONE_MODES = ["account", "viewer"];

function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/** The browser's zone. Anti-detect profiles and proxies often change it. */
export function browserZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** The zone picked by hand ("" = follow the browser), read once per session. */
export function pickedViewerZone(state) {
  if (state.reportViewerZone === null || state.reportViewerZone === undefined) {
    let saved = "";
    try {
      saved = storage()?.getItem(VIEWER_ZONE_KEY) || "";
    } catch {
      saved = "";
    }
    state.reportViewerZone = isKnownTimeZone(saved) ? saved : "";
  }
  return state.reportViewerZone;
}

/** The zone "my time" means: the one picked by hand, else the browser's. */
export function viewerZone(state) {
  return pickedViewerZone(state) || browserZone();
}

export function saveViewerZone(state, zone) {
  state.reportViewerZone = isKnownTimeZone(zone) ? zone : "";
  try {
    if (state.reportViewerZone) {
      storage()?.setItem(VIEWER_ZONE_KEY, state.reportViewerZone);
    } else {
      storage()?.removeItem(VIEWER_ZONE_KEY);
    }
  } catch {
    // The choice still holds for this session.
  }
}

/**
 * How a typed clone start is read: "account" (that clock time in every
 * account) or "viewer" (one moment for all, in my time).
 */
export function startZoneMode(state) {
  if (!START_ZONE_MODES.includes(state.massStartZoneMode)) {
    let saved = "";
    try {
      saved = storage()?.getItem(START_ZONE_KEY) || "";
    } catch {
      saved = "";
    }
    state.massStartZoneMode = START_ZONE_MODES.includes(saved)
      ? saved
      : "account";
  }
  return state.massStartZoneMode;
}

export function saveStartZoneMode(state, mode) {
  if (!START_ZONE_MODES.includes(mode)) return;
  state.massStartZoneMode = mode;
  try {
    storage()?.setItem(START_ZONE_KEY, mode);
  } catch {
    // The choice still holds for this session.
  }
}
