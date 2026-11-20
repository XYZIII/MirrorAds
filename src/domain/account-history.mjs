/**
 * The history of a profile's ad accounts: every open of the panel compares
 * the account list with the one seen last time and notes what changed —
 * new accounts, bans, unpaid balances, accounts that are gone.
 */

import { accountDelivers, classifyAccountStatus } from "./report-time.mjs";

/** Events kept; older ones are dropped. */
export const EVENT_LIMIT = 500;
/** Accounts that left the profile are remembered this long, then forgotten. */
const GONE_KEEP_MS = 90 * 24 * 60 * 60 * 1000;

/** Event kinds a status change can make, by the status it changed to. */
const CHANGE_KINDS = {
  banned: "banned",
  billing: "billing",
  review: "review",
  closed: "closed",
  live: "live",
};

/** The health of an account from the account list: "live", "banned"… */
export function accountHealth(account) {
  return classifyAccountStatus(
    account?.raw?.account_status ?? account?.account_status,
  );
}

/** How many accounts of a snapshot are in each health. */
export function healthCounts(accounts) {
  const counts = {};
  for (const entry of Object.values(accounts || {})) {
    if (entry.g) continue;
    counts[entry.h] = (counts[entry.h] || 0) + 1;
  }
  return counts;
}

/**
 * Compares the account list with the last snapshot. Returns the new
 * snapshot and the events, oldest first:
 * - "start": the first snapshot, with the counts per health;
 * - "new": an account that was not there before;
 * - "returned": an account that was gone and is back;
 * - "banned", "billing", "review", "closed": its status changed to that;
 * - "live": it works again (paid, unbanned);
 * - "gone": a working account is no longer in the list. An account that
 *   was already banned, unpaid or closed leaves without an event.
 * An empty list changes nothing: a failed load is not a mass disappearance.
 */
export function compareAccounts(previous, accounts, nowMs) {
  const list = Array.isArray(accounts) ? accounts : [];
  if (!list.length) return { snapshot: previous || null, events: [] };
  const before = previous?.accounts || null;
  const next = {};
  const events = [];
  const seen = new Set();
  for (const account of list) {
    const id = String(account?.id || "").replace(/^act_/, "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const name = String(account.name || id);
    let health = accountHealth(account);
    const old = before?.[id];
    // An unknown status says nothing new: the last known one stays.
    if (health === "unknown" && old?.h) health = old.h;
    next[id] = { n: name, h: health, f: old?.f ?? nowMs, l: nowMs };
    if (!before) continue;
    const base = { t: nowMs, id, n: name };
    if (!old) events.push({ ...base, k: "new", to: health });
    else if (old.g) events.push({ ...base, k: "returned", to: health });
    else if (old.h !== health && old.h !== "unknown" && CHANGE_KINDS[health]) {
      events.push({
        ...base,
        k: CHANGE_KINDS[health],
        from: old.h,
        to: health,
      });
    }
  }
  for (const [id, old] of Object.entries(before || {})) {
    if (seen.has(id)) continue;
    if (old.g) {
      // Forgotten after a while; until then a return is recognized.
      if (nowMs - old.g < GONE_KEEP_MS) next[id] = old;
      continue;
    }
    next[id] = { ...old, g: nowMs };
    if (accountDelivers(old.h)) {
      events.push({ t: nowMs, id, n: old.n, k: "gone", from: old.h });
    }
  }
  if (!before) {
    events.push({
      t: nowMs,
      k: "start",
      count: Object.keys(next).length,
      counts: healthCounts(next),
    });
  }
  return {
    snapshot: {
      v: 1,
      first: previous?.first ?? nowMs,
      last: nowMs,
      accounts: next,
    },
    events,
  };
}

/** Event kinds per history filter. */
export const HISTORY_FILTERS = {
  all: null,
  new: ["new", "returned"],
  banned: ["banned", "review", "closed"],
  billing: ["billing"],
  gone: ["gone"],
  live: ["live"],
};

/** Events of one filter, newest first. */
export function filterEvents(events, filter) {
  const kinds = HISTORY_FILTERS[filter] || null;
  return (events || [])
    .filter((event) => !kinds || kinds.includes(event.k))
    .sort((a, b) => b.t - a.t);
}

/** How many events each filter has. */
export function filterCounts(events) {
  const counts = {};
  for (const [filter, kinds] of Object.entries(HISTORY_FILTERS)) {
    counts[filter] = (events || []).filter(
      (event) => event.k !== "start" && (!kinds || kinds.includes(event.k)),
    ).length;
  }
  return counts;
}
