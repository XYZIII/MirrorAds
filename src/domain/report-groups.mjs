/**
 * The Groups view of Reports: account lines (or their ads) gathered by one
 * trait — the creative they run, their geo, agent, time zone, status and so
 * on — with spend, leads and purchases added up per group.
 */

import { rulesState } from "./ad-rules.mjs";
import {
  agentOf,
  packageCountries,
  stripCopySuffix,
} from "./name-template.mjs";
import {
  accountDelivers,
  formatUtcOffset,
  summarizeInsights,
  toUsd,
} from "./report-time.mjs";

/** The traits to group by, in the order they are offered. */
export const GROUP_DIMENSIONS = [
  "creative",
  "geo",
  "agent",
  "zone",
  "status",
  "campaigns",
  "rules",
  "currency",
  "age",
];

/** Traits of single ads: an account running two creatives is in two groups. */
export const AD_DIMENSIONS = new Set(["creative", "geo", "agent"]);

/** Traits with an order of their own, shown in it rather than by spend. */
export const RANKED_DIMENSIONS = new Set([
  "zone",
  "status",
  "campaigns",
  "rules",
  "age",
]);

const DAY_MS = 24 * 60 * 60 * 1000;
const STATUS_ORDER = ["live", "billing", "review", "banned", "closed"];
const CAMPAIGN_ORDER = ["running", "stopped", "none"];
const RULE_ORDER = ["on", "off", "none"];
const AGE_ORDER = ["week", "month", "quarter", "older"];

/**
 * One account's ads with their numbers: insights rows (hourly or daily,
 * several per ad) summed per ad and joined with the ads list, which tells
 * the targeted countries and whether the ad runs now. An ad that spent and
 * is no longer listed keeps the names its insights carry. Ads that neither
 * run nor spent are left out.
 */
export function summarizeAdRows({
  insights = [],
  ads = [],
  currency = "",
  ratio = 0,
  delivers = true,
} = {}) {
  const byId = new Map();
  const entry = (id) => {
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        name: "",
        campaignName: "",
        countries: [],
        running: false,
        rows: [],
      });
    }
    return byId.get(id);
  };
  for (const ad of ads || []) {
    const id = String(ad?.id || "");
    if (!id) continue;
    const item = entry(id);
    item.name = String(ad?.name || "");
    item.campaignName = String(ad?.campaign?.name || "");
    item.countries = packageCountries({ adsets: [ad?.adset || {}] });
    item.running =
      delivers && String(ad?.effective_status || "").toUpperCase() === "ACTIVE";
  }
  for (const row of insights || []) {
    const id = String(row?.ad_id || "");
    if (!id) continue;
    const item = entry(id);
    item.rows.push(row);
    if (!item.name) item.name = String(row?.ad_name || "");
    if (!item.campaignName)
      item.campaignName = String(row?.campaign_name || "");
  }
  return [...byId.values()]
    .map(({ rows, ...item }) => {
      const total = summarizeInsights(rows);
      return {
        ...item,
        spend: total.spend,
        spendUsd: toUsd(total.spend, currency, ratio),
        leads: total.leads,
        purchases: total.purchases,
      };
    })
    .filter((ad) => ad.running || ad.spend > 0 || ad.leads || ad.purchases);
}

/** "creo_V4 – Copy 2" and "Creo_V4" are the same creative. */
export function creativeKey(name) {
  return stripCopySuffix(String(name || ""))
    .trim()
    .replace(/\s+/g, " ");
}

const tail = (key) => ({ key, label: "", order: Infinity, tail: true });
const ranked = (key, order) =>
  order.includes(key) ? { key, label: "", order: order.indexOf(key) } : null;

/** The group of an account line for a trait of the account itself. */
export function accountGroup(dimension, row, nowMs = Date.now()) {
  if (dimension === "zone") {
    const offset = row?.offsetMinutes;
    return offset === null || offset === undefined
      ? tail("unknown")
      : { key: `z${offset}`, label: formatUtcOffset(offset), order: offset };
  }
  if (dimension === "status") {
    return ranked(row?.health, STATUS_ORDER) || tail("unknown");
  }
  if (dimension === "campaigns") {
    const active = row?.activeCampaigns;
    if (active === null || active === undefined) return tail("unknown");
    const key =
      accountDelivers(row.health) && active > 0
        ? "running"
        : active + (Number(row.inactiveCampaigns) || 0) > 0
          ? "stopped"
          : "none";
    return ranked(key, CAMPAIGN_ORDER);
  }
  if (dimension === "rules") {
    return ranked(rulesState(row?.rules).state, RULE_ORDER) || tail("unknown");
  }
  if (dimension === "currency") {
    return row?.currency
      ? { key: row.currency, label: row.currency, order: 0 }
      : tail("unknown");
  }
  if (dimension === "age") {
    const created = Date.parse(row?.createdTime || "");
    if (!Number.isFinite(created)) return tail("unknown");
    const days = (nowMs - created) / DAY_MS;
    const key =
      days < 7 ? "week" : days < 30 ? "month" : days < 90 ? "quarter" : "older";
    return ranked(key, AGE_ORDER);
  }
  return tail("unknown");
}

/** The group of one ad for a trait of ads. */
export function adGroup(dimension, ad) {
  if (dimension === "creative") {
    const label = creativeKey(ad?.name);
    return label
      ? { key: `c:${label.toLowerCase()}`, label, order: 0 }
      : tail("unknown");
  }
  if (dimension === "geo") {
    const countries = Array.isArray(ad?.countries) ? ad.countries : [];
    return countries.length
      ? {
          key: `g:${countries.join("+")}`,
          label: countries.join(", "),
          countries,
          order: 0,
        }
      : tail("unknown");
  }
  if (dimension === "agent") {
    const agent = agentOf(ad?.campaignName);
    return agent
      ? { key: `a:${agent.toLowerCase()}`, label: agent, order: 0 }
      : tail("unknown");
  }
  return tail("unknown");
}

function emptyGroup(group) {
  return {
    ...group,
    members: new Map(),
    spendUsd: 0,
    unconverted: 0,
    leads: 0,
    purchases: 0,
    leadsKnown: false,
    purchasesKnown: false,
  };
}

function addTo(group, row, numbers, running) {
  let member = group.members.get(row.accountId);
  if (!member) {
    member = {
      accountId: row.accountId,
      name: row.name,
      health: row.health,
      currency: row.currency,
      offsetMinutes: row.offsetMinutes,
      spend: 0,
      spendUsd: 0,
      unconverted: false,
      leads: null,
      purchases: null,
      running: false,
      error: row.error || "",
    };
    group.members.set(row.accountId, member);
  }
  member.spend += Number(numbers.spend) || 0;
  if (numbers.spendUsd === null || numbers.spendUsd === undefined) {
    if (numbers.spend > 0) member.unconverted = true;
  } else {
    member.spendUsd += numbers.spendUsd;
  }
  if (numbers.leads !== null && numbers.leads !== undefined) {
    member.leads = (member.leads || 0) + numbers.leads;
  }
  if (numbers.purchases !== null && numbers.purchases !== undefined) {
    member.purchases = (member.purchases || 0) + numbers.purchases;
  }
  member.running ||= Boolean(running);
}

function finish(group) {
  const members = [...group.members.values()].sort(
    (a, b) =>
      Number(b.running) - Number(a.running) ||
      b.spendUsd - a.spendUsd ||
      a.name.localeCompare(b.name),
  );
  const result = { ...group, members };
  for (const member of members) {
    result.spendUsd += member.spendUsd;
    if (member.unconverted) result.unconverted += 1;
    if (member.leads !== null) {
      result.leads += member.leads;
      result.leadsKnown = true;
    }
    if (member.purchases !== null) {
      result.purchases += member.purchases;
      result.purchasesKnown = true;
    }
  }
  result.accounts = members.length;
  result.running = members.filter((member) => member.running).length;
  return result;
}

/**
 * Groups account lines by `dimension`. Traits of ads need `ads`, the ads
 * of each account ({ [accountId]: { ads } | { error } }): an account whose
 * ads could not be read goes to the "error" group with its line's numbers,
 * one with no ad that ran or runs to "none". Returns { groups, total }:
 * groups by spend, the special ones last; the total counts every account
 * once, however many groups it is in.
 */
export function groupReport({ dimension, rows = [], ads = {}, nowMs } = {}) {
  const groups = new Map();
  const into = (group) => {
    if (!groups.has(group.key)) groups.set(group.key, emptyGroup(group));
    return groups.get(group.key);
  };
  const lineRuns = (row) =>
    accountDelivers(row.health) && Number(row.activeCampaigns) > 0;
  for (const row of rows) {
    if (!AD_DIMENSIONS.has(dimension)) {
      addTo(into(accountGroup(dimension, row, nowMs)), row, row, lineRuns(row));
      continue;
    }
    const read = ads?.[row.accountId];
    if (!read) continue;
    if (read.error) {
      addTo(into(tail("error")), row, row, lineRuns(row));
      continue;
    }
    if (!read.ads?.length) {
      addTo(into(tail("none")), row, row, false);
      continue;
    }
    for (const ad of read.ads) {
      addTo(into(adGroup(dimension, ad)), row, ad, ad.running);
    }
  }
  const list = [...groups.values()].map(finish);
  const total = {
    spendUsd: 0,
    unconverted: 0,
    leads: 0,
    purchases: 0,
    leadsKnown: false,
    purchasesKnown: false,
    accounts: 0,
    running: 0,
  };
  const accounts = new Set();
  const running = new Set();
  for (const group of list) {
    total.spendUsd += group.spendUsd;
    total.unconverted += group.unconverted;
    total.leads += group.leads;
    total.purchases += group.purchases;
    total.leadsKnown ||= group.leadsKnown;
    total.purchasesKnown ||= group.purchasesKnown;
    for (const member of group.members) {
      accounts.add(member.accountId);
      if (member.running) running.add(member.accountId);
    }
  }
  total.accounts = accounts.size;
  total.running = running.size;
  for (const group of list) {
    group.share = total.spendUsd > 0 ? group.spendUsd / total.spendUsd : 0;
  }
  return { groups: sortGroups(list, "spend", "desc"), total };
}

function sortValue(group, by) {
  if (by === "label") return null;
  if (by === "accounts") return group.running * 10000 + group.accounts;
  if (by === "leads") return group.leadsKnown ? group.leads : -1;
  if (by === "purchases") return group.purchasesKnown ? group.purchases : -1;
  if (by === "cpl")
    return group.leads > 0 ? group.spendUsd / group.leads : null;
  if (by === "cpa") {
    return group.purchases > 0 ? group.spendUsd / group.purchases : null;
  }
  return group.spendUsd;
}

/**
 * Groups in the asked order: by "spend", "accounts", "leads", "purchases",
 * "cpl", "cpa" or "label". A cost with nothing to divide by goes last;
 * so do the special groups (unknown, none, error) whatever the order.
 */
export function sortGroups(groups, by = "spend", dir = "desc") {
  const sign = dir === "asc" ? 1 : -1;
  return [...(groups || [])].sort((a, b) => {
    if (Boolean(a.tail) !== Boolean(b.tail)) return a.tail ? 1 : -1;
    if (by === "label") {
      // Ranked traits keep their own order (UTC−8 before UTC+7, live before
      // banned); names go alphabetically, numbers within them by value.
      const ordered = a.order - b.order;
      if (Number.isFinite(ordered) && ordered) return sign * ordered;
      return (
        sign *
        String(a.label || a.key).localeCompare(
          String(b.label || b.key),
          undefined,
          { numeric: true },
        )
      );
    }
    const left = sortValue(a, by);
    const right = sortValue(b, by);
    if (left === null || right === null) {
      if (left !== right) return left === null ? 1 : -1;
    } else if (left !== right) {
      return sign * (left - right);
    }
    return b.spendUsd - a.spendUsd;
  });
}
