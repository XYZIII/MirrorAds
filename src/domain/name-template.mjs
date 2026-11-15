/**
 * Campaign names of clones, built from macros: AGENT_ID_GEO_CREO by
 * default. Every part comes from something that does not depend on how
 * the source campaign was named — the target account's id, the targeted
 * countries, the ads' names — except the agent, the name's first word.
 * The older {auto} (the source name with its account marker swapped) still
 * works when typed, but is no longer offered.
 */

export const DEFAULT_NAME_TEMPLATE = "{agent}_{id}_{geo}_{creo}";
export const ACCOUNT_PREFIX_LENGTH = 4;
const SEPARATOR = "_";

function digitsOf(accountId) {
  return String(accountId ?? "").replace(/\D+/g, "");
}

/** First four digits of an ad account id; `act_` and other noise are ignored. */
export function accountIdPrefix(accountId) {
  return digitsOf(accountId).slice(0, ACCOUNT_PREFIX_LENGTH);
}

/** AGENT_ID4_GEO_CREO -> its parts. The creative part may itself contain `_`. */
export function splitCampaignName(sourceName) {
  const segments = String(sourceName ?? "").split(SEPARATOR);
  return {
    segments,
    agent: segments[0] || "",
    id4: segments[1] || "",
    geo: segments[2] || "",
    creo: segments.slice(3).join(SEPARATOR),
  };
}

/** " – Copy 14": the suffix Ads Manager adds when a campaign is duplicated. */
const COPY_SUFFIX = /\s+[-\u2013\u2014]\s+(?:copy|копия)(?:\s+\d+)?\s*$/i;

export function stripCopySuffix(name) {
  return String(name ?? "").replace(COPY_SUFFIX, "");
}

/** Leading name parts the operator no longer uses; {auto} drops them. */
export const DROPPED_NAME_PREFIXES = ["VV_"];

export function stripDroppedPrefix(name) {
  const text = String(name ?? "");
  const prefix = DROPPED_NAME_PREFIXES.find(
    (item) => text.startsWith(item) && text.length > item.length,
  );
  return prefix ? text.slice(prefix.length) : text;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A pattern for the way a campaign name may spell the source account's label:
 * "VD | 47" matches VD47, VD 47, VD_47 and VD-47. Labels without a digit are
 * too generic to be an account marker and give no pattern.
 */
function accountLabelPattern(accountName) {
  const chunks = String(accountName ?? "").match(/[\p{L}\p{N}]+/gu) || [];
  const label = chunks.join("");
  if (label.length < 3 || !/\d/.test(label)) return null;
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${chunks.map(escapeRegExp).join("[\\s|_\\-]*")}(?!\\d)`,
    "iu",
  );
}

/**
 * Puts the target account's full id where a campaign name marks its account,
 * and keeps every other character as it was. With the full id in the name the
 * account can be opened straight from it (`act=<id>` in the Ads Manager URL).
 *
 * The account marker is found by value, in this order: the source account's
 * full id, its four-digit prefix standing as its own run of digits
 * (`AGENT_1840AU CREO`), then the source account's label as an agent wrote it
 * (`AGENT_VD47AU CREO` for the account "VD | 47"). When the source account is
 * unknown, a four-digit second `_` segment is accepted. Ads Manager's
 * "– Copy N" suffix and the retired `VV_` prefix are dropped. `replaced` is
 * false when no marker was found, so the caller can tell the operator.
 */
export function rebindAccountSegment(
  sourceName,
  sourceAccountId,
  targetAccountId,
  sourceAccountName = "",
) {
  const name = stripDroppedPrefix(stripCopySuffix(sourceName));
  const targetId = digitsOf(targetAccountId);
  const sourceId = digitsOf(sourceAccountId);
  const sourcePrefix = accountIdPrefix(sourceAccountId);
  if (targetId.length < ACCOUNT_PREFIX_LENGTH) {
    return { name, replaced: false };
  }
  const patterns = [];
  if (sourceId.length > ACCOUNT_PREFIX_LENGTH) {
    patterns.push(new RegExp(`(?<!\\d)${sourceId}(?!\\d)`));
  }
  if (sourcePrefix.length === ACCOUNT_PREFIX_LENGTH) {
    patterns.push(new RegExp(`(?<!\\d)${sourcePrefix}(?!\\d)`));
  }
  const label = accountLabelPattern(sourceAccountName);
  if (label) patterns.push(label);
  for (const pattern of patterns) {
    if (pattern.test(name)) {
      return { name: name.replace(pattern, targetId), replaced: true };
    }
  }
  const segments = name.split(SEPARATOR);
  if (!sourceId && /^\d{4}$/.test((segments[1] || "").trim())) {
    segments[1] = segments[1].replace(/\d{4}/, targetId);
    return { name: segments.join(SEPARATOR), replaced: true };
  }
  return { name, replaced: false };
}

/** The display name of the source account, as agents label it ("VD | 47"). */
export function sourceAccountLabel(accounts, sourceAccountId) {
  const wanted = digitsOf(sourceAccountId);
  if (!wanted) return "";
  const account = (accounts || []).find(
    (item) => digitsOf(item?.id || item?.accountId) === wanted,
  );
  return String(account?.name || "");
}

/**
 * The agent for {agent}: the first word of the source campaign name, once
 * the retired VV_ prefix and Ads Manager's "– Copy N" are gone — "AGENT" in
 * "VV_AGENT_1840AU creo_V4 – Copy 3", whatever follows it.
 */
export function agentOf(sourceName) {
  const name = stripDroppedPrefix(stripCopySuffix(sourceName)).trim();
  return name.match(/^[\p{L}\p{N}]+/u)?.[0] || "";
}

/**
 * The countries the campaign targets, from its ad sets: the clone keeps
 * the targeting, so this is its geo whatever the source name says.
 */
export function packageCountries(packageData) {
  const found = [];
  const add = (code) => {
    const country = String(code || "")
      .trim()
      .toUpperCase();
    if (/^[A-Z]{2}$/.test(country) && !found.includes(country)) {
      found.push(country);
    }
  };
  for (const adset of packageData?.adsets || []) {
    const geo = adset?.targeting?.geo_locations || {};
    const countries = Array.isArray(geo.countries) ? geo.countries : [];
    countries.forEach(add);
    if (countries.length) continue;
    // Regions and cities name their country.
    for (const key of ["regions", "cities", "zips"]) {
      for (const place of Array.isArray(geo[key]) ? geo[key] : []) {
        add(place?.country || place?.country_code);
      }
    }
  }
  return found;
}

/** A two-letter code standing on its own or after digits: "AU" in "1840AU". */
function geoInName(sourceName) {
  const name = stripDroppedPrefix(stripCopySuffix(sourceName));
  return name.match(/(?<!\p{L})\d*([A-Z]{2})(?![\p{L}\p{N}])/u)?.[1] || "";
}

/**
 * The geo for {geo}: the targeted countries, "AU" or "AU-NZ". With no
 * country in the targeting, or more than three, the code the source name
 * carries is used, if it has one.
 */
function geoOf(countries, sourceName) {
  const list = Array.isArray(countries) ? countries : [];
  if (list.length && list.length <= 3) return list.join("-");
  const named = geoInName(sourceName);
  if (named || !list.length) return named;
  return `${list.slice(0, 3).join("-")}+${list.length - 3}`;
}

/**
 * The creative name for {creo}. The operator writes the full creative name
 * into the ad, so the ads are the source of truth:
 * - one name on every ad: that name;
 * - names that differ only in a trailing number: the shared part with the
 *   range, "creo_V1" + "creo_V3" -> "creo_V1-3";
 * - names that differ otherwise: the part they share, "creo";
 * - nothing shared: the first ad name.
 * Only a package without ads falls back to the tail of the campaign name.
 */
export function pickCreativeName(sourceName, adNames, fallback = "") {
  const names = [
    ...new Set(
      (adNames || []).map((name) => String(name || "").trim()).filter(Boolean),
    ),
  ];
  if (!names.length) return fallback;
  if (names.length === 1) return names[0];
  let prefix = names[0];
  for (const name of names) {
    let length = 0;
    while (
      length < prefix.length &&
      length < name.length &&
      prefix[length] === name[length]
    ) {
      length += 1;
    }
    prefix = prefix.slice(0, length);
  }
  // A shared digit belongs to the numbers: V10 and V12 share "V", not "V1".
  prefix = prefix.replace(/\d+$/, "");
  const tails = names.map((name) => name.slice(prefix.length));
  if (prefix && tails.every((tail) => /^\d+$/.test(tail))) {
    const numbers = tails.map(Number);
    return `${prefix}${Math.min(...numbers)}-${Math.max(...numbers)}`;
  }
  // Cut back to a whole word, then drop the separator left at the end.
  const cut = Math.max(
    prefix.lastIndexOf("_"),
    prefix.lastIndexOf("-"),
    prefix.lastIndexOf(" "),
  );
  const whole =
    /[_\-\s]$/.test(prefix) || cut < 0 ? prefix : prefix.slice(0, cut);
  const shared = whole.replace(/[_\-\s.]+$/, "");
  return shared.length >= 2 ? shared : names[0];
}

export function buildNameTemplateVars({
  sourceName = "",
  sourceAccountId = "",
  sourceAccountName = "",
  targetAccountId = "",
  adNames = [],
  countries = [],
} = {}) {
  const parts = splitCampaignName(sourceName);
  const rebound = rebindAccountSegment(
    sourceName,
    sourceAccountId,
    targetAccountId,
    sourceAccountName,
  );
  const vars = {
    auto: rebound.name,
    id: digitsOf(targetAccountId),
    id4: accountIdPrefix(targetAccountId),
    src_id4: accountIdPrefix(sourceAccountId),
    agent: agentOf(sourceName),
    geo: geoOf(countries, sourceName),
    creo: pickCreativeName(sourceName, adNames, parts.creo),
  };
  parts.segments.forEach((segment, index) => {
    vars[String(index + 1)] = segment;
  });
  return { vars, autoReplaced: rebound.replaced };
}

/** Stands for a macro with no value until its separator is dropped. */
const EMPTY = "\u0000";
const EMPTY_AT_START = /^(?:\u0000[\s_.|-]*)+/;
const EMPTY_WITH_SEPARATOR = /[\s_.|-]*\u0000/g;

/**
 * Renders the campaign name template for one target account. Pure, so the
 * targets table can preview the exact name the clone will get. Unknown macros
 * stay untouched; an empty template means the default one. A macro with
 * nothing to put in takes its separator with it: no geo in
 * {agent}_{id}_{geo}_{creo} gives AGENT_ID_CREO, not AGENT_ID__CREO.
 */
export function renderCampaignName({
  template = "",
  sourceName = "",
  sourceAccountId = "",
  sourceAccountName = "",
  account = null,
  currency = "",
  mode = "",
  index = 0,
  date = "",
  adNames = [],
  countries = [],
} = {}) {
  const fallback = sourceName || "Cloned campaign";
  const raw = String(template || "").trim() || DEFAULT_NAME_TEMPLATE;
  const targetAccountId = String(account?.accountId || account?.id || "");
  const naming = buildNameTemplateVars({
    sourceName: fallback,
    sourceAccountId,
    sourceAccountName,
    targetAccountId,
    adNames,
    countries,
  });
  const vars = {
    ...naming.vars,
    source: fallback,
    account: account?.name || account?.accountId || "",
    account_id: targetAccountId,
    currency,
    mode,
    n: index ? String(index) : "",
    date: date || new Date().toISOString().slice(0, 10),
  };
  const rendered = raw
    .replace(/\{(\w+)\}/g, (match, key) =>
      Object.prototype.hasOwnProperty.call(vars, key)
        ? String(vars[key] ?? "").trim() || EMPTY
        : match,
    )
    .replace(EMPTY_AT_START, "")
    .replace(EMPTY_WITH_SEPARATOR, "")
    .trim();
  return {
    name: rendered || fallback,
    // {auto} was asked for but the source prefix is not in the name.
    autoMissed:
      /\{auto\}/.test(raw) &&
      !naming.autoReplaced &&
      digitsOf(sourceAccountId) !== digitsOf(targetAccountId),
    sourcePrefix: naming.vars.src_id4,
    targetAccountId,
  };
}
