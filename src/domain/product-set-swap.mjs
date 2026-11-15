import { deepClone } from "../utils/object.mjs";
import {
  getPackageProductSetById,
  getReferencedProductSetIds,
  replaceMappedCatalogReferences,
  resolveSourceProductSetCatalogId,
} from "./package.mjs";

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replaces a set's name where it stands as a whole: "Gina_V4" in
 * "VD47AU Gina_V4" or "PEAK_1840_AU_Gina_V4", but not inside "Gina_V45".
 */
export function renameSetToken(text, from, to) {
  if (!from || !to || from === to) return String(text ?? "");
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegExp(from)}(?![\\p{L}\\p{N}])`,
    "gu",
  );
  return String(text ?? "").replace(pattern, to);
}

/**
 * The product sets the campaign uses, each with the other sets of its
 * catalog to choose from. The export keeps every set of the source catalog,
 * so a set made after the campaign (Gina_V5 next to Gina_V4) is offered too.
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
  if (!packageData || !entries.length) return { packageData, renamed: [] };
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
  const renamed = entries
    .map(([from, to]) => ({
      from: getPackageProductSetById(packageData, from)?.name || "",
      to: getPackageProductSetById(packageData, to)?.name || "",
    }))
    .filter((item) => item.from && item.to && item.from !== item.to);
  const rename = (text) =>
    renamed.reduce(
      (value, item) => renameSetToken(value, item.from, item.to),
      text,
    );
  const renameField = (object, key) => {
    if (object && typeof object[key] === "string")
      object[key] = rename(object[key]);
  };
  renameField(copy.campaign, "name");
  renameField(copy.source, "campaignName");
  for (const adset of copy.adsets || []) renameField(adset, "name");
  for (const ad of copy.ads || []) renameField(ad, "name");
  for (const creative of copy.creatives || []) {
    renameField(creative, "name");
    renameField(creative?.raw, "name");
  }
  return { packageData: copy, renamed };
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
  state.clonePackage = Object.keys(swaps).length
    ? swapProductSets(base, swaps).packageData
    : base;
  state.massSetResult = state.clonePackage;
}

/** Forgets the choices of an earlier package once another one is loaded. */
export function syncProductSetBase(state) {
  if (state.clonePackage && state.clonePackage === state.massSetResult) return;
  state.massSetBase = state.clonePackage || null;
  state.massSetResult = state.clonePackage || null;
  state.massSetSwaps = {};
}

export function clearProductSets(state) {
  syncProductSetBase(state);
  if (state.massSetBase) state.clonePackage = state.massSetBase;
  state.massSetResult = state.clonePackage || null;
  state.massSetSwaps = {};
}
