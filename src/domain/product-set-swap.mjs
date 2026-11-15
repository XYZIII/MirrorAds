import { deepClone } from "../utils/object.mjs";
import { DEFAULT_NAME_TEMPLATE } from "./name-template.mjs";
import {
  getPackageProductSetById,
  getReferencedProductSetIds,
  replaceMappedCatalogReferences,
  resolveSourceProductSetCatalogId,
} from "./package.mjs";

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SEPARATORS = /[\s_.-]+/;
const SEPARATOR_RUNS = /[\s_.-]+/g;
const OPTIONAL_SEPARATOR = "[\\s_.-]*";

function separatorsOf(text) {
  return String(text).match(SEPARATOR_RUNS) || [];
}

/**
 * The new name written the way the found one is: "creo v4" becomes
 * "creo v5", "CreoV4" becomes "CreoV5". Written like the set's own name,
 * the new name goes in as it is.
 */
function styled(found, from, replacement) {
  const foundSeparators = separatorsOf(found);
  const fromSeparators = separatorsOf(from);
  const chunks = replacement.split(SEPARATORS).filter(Boolean);
  let result;
  if (
    !chunks.length ||
    foundSeparators.join("\u0000") === fromSeparators.join("\u0000")
  ) {
    result = replacement;
  } else if (chunks.length - 1 === foundSeparators.length) {
    result = chunks.reduce(
      (text, chunk, index) => text + foundSeparators[index - 1] + chunk,
    );
  } else {
    result = chunks.join(foundSeparators[0] ?? "");
  }
  if (/\p{L}/u.test(found)) {
    if (found === found.toLowerCase()) result = result.toLowerCase();
    else if (found === found.toUpperCase()) result = result.toUpperCase();
  }
  return result;
}

/**
 * Replaces a set's name where it stands as a whole word: "creo_V4" in
 * "AGENT_1840AU creo_V4", "AGENT_1840_AU_creo_V4", "creo v4", "CREO-V4" or
 * "creoV4", but not inside "creo_V45". Separators and letter case may
 * differ; the new name follows the style of the one it replaces.
 */
export function renameSetToken(text, from, to) {
  const source = String(text ?? "");
  const chunks = String(from || "")
    .split(SEPARATORS)
    .filter(Boolean)
    .map(escapeRegExp);
  if (!chunks.length || !to || from === to) return source;
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])${chunks.join(OPTIONAL_SEPARATOR)}(?![\\p{L}\\p{N}])`,
    "giu",
  );
  return source.replace(pattern, (found) =>
    styled(found, String(from), String(to)),
  );
}

const WORD_BREAKS = /[\s|/\\,;:()[\]{}]+/;

function wordsOf(name) {
  return String(name || "")
    .split(WORD_BREAKS)
    .filter(Boolean);
}

/** A word without its separators and letter case: "creo_V4" is "creov4". */
function plain(word) {
  return word.toLowerCase().replace(/[_.-]+/g, "");
}

/** A word with its numbers blanked: "creo_V4" and "Creo-V12" share "creov#". */
function stemOf(word) {
  return plain(word.replace(/\d+/g, "#"));
}

const hasLetter = (word) => /\p{L}/u.test(word);

/**
 * The renames to try for one set. Sets are named after the creative, but a
 * set's name may carry more words than the names of the ads and campaigns:
 * "creo_V4 NEW NEW" for ads named "creo_V4". So besides the whole name, a
 * word of the old name is paired with the word of the new name that differs
 * from it only in its numbers — "creo_V4" with "creo_V5" — and that pair
 * renames the names that carry the creative alone. Words both names share
 * ("AU") are left alone, and so are bare numbers.
 */
export function renamePairs(fromName, toName) {
  const from = String(fromName || "").trim();
  const to = String(toName || "").trim();
  if (!from || !to || from === to) return [];
  const whole = { from, to };
  const oldWords = wordsOf(from);
  const newWords = wordsOf(to);
  if (oldWords.length === 1 && newWords.length === 1) return [whole];
  const shared = (word, words) =>
    words.some((other) => plain(other) === plain(word));
  const removed = oldWords.filter(
    (word) => hasLetter(word) && !shared(word, newWords),
  );
  const added = newWords.filter(
    (word) => hasLetter(word) && !shared(word, oldWords),
  );
  const words = [];
  for (const word of removed) {
    const match = added.find((other) => stemOf(other) === stemOf(word));
    if (match && !words.some((pair) => plain(pair.from) === plain(word))) {
      words.push({ from: word, to: match, core: true });
    }
  }
  if (!words.length && removed.length === 1 && added.length === 1) {
    words.push({ from: removed[0], to: added[0], core: true });
  }
  // The whole name goes first: where a name carries all of it, all of it
  // changes. A one-word old name with a longer new one would bring the new
  // set's extra words into the names, so there only the words change.
  const pairs = oldWords.length > 1 ? [whole] : [];
  pairs.push(...words);
  return pairs.length ? pairs : [whole];
}

/**
 * The product sets the campaign uses, each with the other sets of its
 * catalog to choose from. The export keeps every set of the source catalog,
 * so a set made after the campaign (creo_V5 next to creo_V4) is offered too.
 */
export function productSetChoices(packageData) {
  if (!packageData) return [];
  return [...getReferencedProductSetIds(packageData)]
    .map((id) => {
      const catalogId = resolveSourceProductSetCatalogId(packageData, id);
      const snapshot = (packageData.catalogExports || []).find(
        (item) => String(item?.catalog?.id || "") === catalogId,
      );
      const options = (snapshot?.productSets || [])
        .map((set) => ({
          id: String(set.id),
          name: set.name || String(set.id),
        }))
        .sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { numeric: true }),
        );
      return {
        id: String(id),
        name:
          getPackageProductSetById(packageData, id)?.name ||
          `Product set ${id}`,
        catalogId,
        options,
      };
    })
    .filter((item) => item.options.some((option) => option.id !== item.id));
}

/**
 * The package with product sets replaced by other sets of the same catalog,
 * as if the source campaign had used them — so every catalog mode (same
 * catalog, copy, matching sets) works with the new set as usual. Names of
 * the campaign, ad sets, ads and creatives that carry the old set's name get
 * the new one: sets are named after the creative.
 */
export function swapProductSets(packageData, swaps) {
  const entries = Object.entries(swaps || {})
    .map(([from, to]) => [String(from), String(to || "")])
    .filter(([from, to]) => from && to && from !== to);
  if (!packageData || !entries.length) {
    return { packageData, renamed: [], changes: null };
  }
  const mapping = Object.fromEntries(entries);
  const copy = deepClone(packageData);
  replaceMappedCatalogReferences(copy, {}, mapping);
  // The list of the campaign's sets now describes the new ones.
  copy.productSets = (copy.productSets || []).map((set) => {
    const to = mapping[String(set?.id || "")];
    return to
      ? { ...(getPackageProductSetById(packageData, to) || {}), id: to }
      : set;
  });
  const renamed = entries.flatMap(([from, to]) =>
    renamePairs(
      getPackageProductSetById(packageData, from)?.name || "",
      getPackageProductSetById(packageData, to)?.name || "",
    ),
  );
  const changes = { campaign: false, adsets: 0, ads: 0, creatives: 0 };
  const used = new Set();
  const rename = (text) =>
    renamed.reduce((value, item) => {
      const next = renameSetToken(value, item.from, item.to);
      if (next !== value) used.add(item);
      return next;
    }, text);
  const renameField = (object, key) => {
    if (!object || typeof object[key] !== "string") return false;
    const next = rename(object[key]);
    if (next === object[key]) return false;
    object[key] = next;
    return true;
  };
  changes.campaign = renameField(copy.campaign, "name");
  changes.campaign =
    renameField(copy.source, "campaignName") || changes.campaign;
  for (const adset of copy.adsets || [])
    changes.adsets += renameField(adset, "name") ? 1 : 0;
  for (const ad of copy.ads || [])
    changes.ads += renameField(ad, "name") ? 1 : 0;
  for (const creative of copy.creatives || []) {
    const named = renameField(creative, "name");
    changes.creatives += renameField(creative?.raw, "name") || named ? 1 : 0;
  }
  return {
    packageData: copy,
    renamed: renamed.map((pair) => ({ ...pair, used: used.has(pair) })),
    changes,
  };
}

/**
 * Applies the operator's set choices to the loaded clone package. The
 * original package is kept, so a choice can be changed or undone; a package
 * loaded since (another source campaign) starts with no choices.
 */
export function chooseProductSet(state, fromId, toId) {
  syncProductSetBase(state);
  const base = state.massSetBase;
  if (!base) return;
  const swaps = { ...(state.massSetSwaps || {}) };
  if (!toId || String(toId) === String(fromId)) delete swaps[String(fromId)];
  else swaps[String(fromId)] = String(toId);
  state.massSetSwaps = swaps;
  const swapped = Object.keys(swaps).length
    ? swapProductSets(base, swaps)
    : null;
  state.clonePackage = swapped ? swapped.packageData : base;
  state.massSetResult = state.clonePackage;
  state.massSetReport = swapped
    ? { renamed: swapped.renamed, changes: swapped.changes }
    : null;
  return state.massSetReport;
}

/** Forgets the choices of an earlier package once another one is loaded. */
export function syncProductSetBase(state) {
  if (state.clonePackage && state.clonePackage === state.massSetResult) return;
  state.massSetBase = state.clonePackage || null;
  state.massSetResult = state.clonePackage || null;
  state.massSetSwaps = {};
  state.massSetReport = null;
}

export function clearProductSets(state) {
  syncProductSetBase(state);
  if (state.massSetBase) state.clonePackage = state.massSetBase;
  state.massSetResult = state.clonePackage || null;
  state.massSetSwaps = {};
  state.massSetReport = null;
}

/**
 * What the chosen sets do to the names, for the panel and the log: which
 * names change, or — when no name carries the old set's name — what the
 * names are, so the reason is visible before cloning.
 */
export function setRenameSummary(state, t) {
  const report = state.massSetReport;
  if (!report) return "";
  const base = state.massSetBase;
  const { changes, renamed } = report;
  if (!renamed.length) return t("overrides.setSameName");
  // The pair that renamed something; else the creative's own words, which
  // are what names usually carry.
  const first =
    renamed.find((pair) => pair.used) ||
    renamed.find((pair) => pair.core) ||
    renamed[0];
  // The clone's campaign name comes from the template: it changes with the
  // ads through {creo}, with the source name through {source}.
  const template =
    String(state.massNameTemplate || "").trim() || DEFAULT_NAME_TEMPLATE;
  const campaign =
    (changes?.ads > 0 && template.includes("{creo}")) ||
    (changes?.campaign && /\{(?:source|auto|\d+)\}/.test(template));
  const parts = [];
  if (campaign) parts.push(t("overrides.setCampaign"));
  if (changes?.adsets)
    parts.push(t("overrides.setAdsets", { n: changes.adsets }));
  if (changes?.ads) parts.push(t("overrides.setAds", { n: changes.ads }));
  if (parts.length) {
    return t("overrides.setRenamed", {
      from: first.from,
      to: first.to,
      what: parts.join(", "),
    });
  }
  const adName = (base?.ads || []).map((ad) => ad?.name).find(Boolean) || "—";
  return t("overrides.setNoMatch", {
    from: first.from,
    campaign: base?.source?.campaignName || base?.campaign?.name || "—",
    ad: adName,
  });
}
