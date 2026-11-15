import assert from "node:assert/strict";
import { test } from "node:test";
import { buildNameTemplateVars } from "../src/domain/name-template.mjs";
import {
  getReferencedProductSetIds,
  materializeCatalogMappedPackage,
} from "../src/domain/package.mjs";
import {
  changedCore,
  chooseProductSet,
  clearProductSets,
  productSetChoices,
  renamePairs,
  renameSetToken,
  setRenameSummary,
  swapProductSets,
} from "../src/domain/product-set-swap.mjs";
import { t } from "../src/ui/i18n.mjs";

const CATALOG = "2000000000001";
const ALL = "1000000000001";
const V4 = "1000000000004";
const V5 = "1000000000005";
const V10 = "1000000000010";
const V5_COPY = "3000000000005";
const set = (id, name) => ({ id, name, product_catalog: { id: CATALOG } });

/** A catalog campaign on the set Gina_V4, named after it like the operator does. */
function catalogPackage() {
  return {
    source: {
      accountId: "1840",
      campaignId: "c1",
      campaignName: "VD47AU Gina_V4",
    },
    campaign: { id: "c1", name: "VD47AU Gina_V4", objective: "OUTCOME_SALES" },
    adsets: [
      {
        id: "as1",
        name: "AU 25+ Gina_V4",
        promoted_object: { product_set_id: V4, pixel_id: "px" },
      },
    ],
    ads: [
      { id: "ad1", name: "Gina_V4", adset_id: "as1" },
      { id: "ad2", name: "Gina_V45 test", adset_id: "as1" },
    ],
    creatives: [
      {
        id: "cr1",
        name: "Gina_V4",
        raw: {
          name: "Gina_V4",
          product_set_id: V4,
          product_catalog_id: CATALOG,
        },
      },
    ],
    catalogs: [{ id: CATALOG, name: "Shop" }],
    productSets: [set(V4, "Gina_V4")],
    catalogExports: [
      {
        catalog: { id: CATALOG, name: "Shop" },
        productSets: [
          set(ALL, "All products"),
          set(V4, "Gina_V4"),
          set(V5, "Gina_V5"),
          set(V10, "Gina_V10"),
        ],
      },
    ],
  };
}

test("a set's name is replaced only where it stands as a whole", () => {
  assert.equal(
    renameSetToken("VD47AU Gina_V4", "Gina_V4", "Gina_V5"),
    "VD47AU Gina_V5",
  );
  assert.equal(
    renameSetToken("PEAK_1840_AU_Gina_V4", "Gina_V4", "Gina_V5"),
    "PEAK_1840_AU_Gina_V5",
  );
  assert.equal(
    renameSetToken("Gina_V45 test", "Gina_V4", "Gina_V5"),
    "Gina_V45 test",
  );
  assert.equal(renameSetToken("XGina_V4", "Gina_V4", "Gina_V5"), "XGina_V4");
  assert.equal(
    renameSetToken("a (b) c", "(b)", "[x]"),
    "a [x] c",
    "special characters are literal",
  );
});

test("the campaign's set comes with every set of its catalog to choose from", () => {
  const choices = productSetChoices(catalogPackage());
  assert.equal(choices.length, 1);
  assert.equal(choices[0].id, V4);
  assert.equal(choices[0].name, "Gina_V4");
  assert.deepEqual(
    choices[0].options.map((option) => option.name),
    ["All products", "Gina_V4", "Gina_V5", "Gina_V10"],
    "numbers sort as numbers",
  );
  assert.deepEqual(
    productSetChoices({ campaign: {}, adsets: [], ads: [], creatives: [] }),
    [],
  );
  assert.deepEqual(productSetChoices(null), []);
});

test("swapping the set changes every reference and the names, never the original", () => {
  const original = catalogPackage();
  const { packageData, renamed } = swapProductSets(original, { [V4]: V5 });
  assert.deepEqual(renamed, [{ from: "Gina_V4", to: "Gina_V5" }]);
  assert.equal(packageData.adsets[0].promoted_object.product_set_id, V5);
  assert.equal(packageData.creatives[0].raw.product_set_id, V5);
  assert.deepEqual([...getReferencedProductSetIds(packageData)], [V5]);
  assert.equal(packageData.productSets[0].id, V5);
  assert.equal(packageData.productSets[0].name, "Gina_V5");
  assert.equal(packageData.campaign.name, "VD47AU Gina_V5");
  assert.equal(packageData.source.campaignName, "VD47AU Gina_V5");
  assert.equal(packageData.adsets[0].name, "AU 25+ Gina_V5");
  assert.deepEqual(
    packageData.ads.map((ad) => ad.name),
    ["Gina_V5", "Gina_V45 test"],
  );
  assert.equal(packageData.creatives[0].name, "Gina_V5");
  assert.equal(packageData.creatives[0].raw.name, "Gina_V5");
  // The campaign name macro {creo} follows the ads.
  const { vars } = buildNameTemplateVars({
    sourceName: packageData.source.campaignName,
    adNames: ["Gina_V5"],
  });
  assert.equal(vars.creo, "Gina_V5");
  // The source package is untouched.
  assert.equal(original.adsets[0].promoted_object.product_set_id, V4);
  assert.equal(original.ads[0].name, "Gina_V4");
  // A copied catalog maps the new set like any other set of the campaign.
  const mapped = materializeCatalogMappedPackage(
    packageData,
    { [CATALOG]: "2000000000002" },
    { [V5]: V5_COPY },
  );
  assert.equal(mapped.adsets[0].promoted_object.product_set_id, V5_COPY);
  assert.equal(mapped.creatives[0].raw.product_catalog_id, "2000000000002");
  // Nothing to swap: the same package back.
  assert.equal(swapProductSets(original, { [V4]: V4 }).packageData, original);
  assert.equal(swapProductSets(original, {}).packageData, original);
});

test("the choice works on the loaded package, can be undone, and resets with a new campaign", () => {
  const original = catalogPackage();
  const state = { clonePackage: original };
  chooseProductSet(state, V4, V5);
  assert.equal(state.clonePackage.ads[0].name, "Gina_V5");
  assert.equal(state.massSetBase, original);
  assert.deepEqual(state.massSetSwaps, { [V4]: V5 });
  // Changing the choice starts again from the original, not from the swapped copy.
  chooseProductSet(state, V4, V10);
  assert.equal(state.clonePackage.ads[0].name, "Gina_V10");
  assert.equal(
    state.clonePackage.adsets[0].promoted_object.product_set_id,
    V10,
  );
  chooseProductSet(state, V4, V4);
  assert.equal(state.clonePackage, original, "back to the source set");
  assert.deepEqual(state.massSetSwaps, {});
  chooseProductSet(state, V4, V5);
  clearProductSets(state);
  assert.equal(state.clonePackage, original);
  // Another source campaign: its package is the new original, no choices carried over.
  chooseProductSet(state, V4, V5);
  const next = catalogPackage();
  state.clonePackage = next;
  chooseProductSet(state, "other", "x");
  assert.equal(state.massSetBase, next);
  assert.deepEqual(state.massSetSwaps, { other: "x" });
});

test("names are found whatever their case and separators, and keep their own style", () => {
  assert.equal(renameSetToken("gina_v4", "Gina_V4", "Gina_V5"), "gina_v5");
  assert.equal(
    renameSetToken("GINA_V4 1x1", "Gina_V4", "Gina_V5"),
    "GINA_V5 1x1",
  );
  assert.equal(
    renameSetToken("PEAK_VD47AU Gina V4", "Gina_V4", "Gina_V5"),
    "PEAK_VD47AU Gina V5",
  );
  assert.equal(
    renameSetToken("Gina-V4.mp4", "Gina V4", "Gina V5"),
    "Gina-V5.mp4",
  );
  assert.equal(renameSetToken("Gina_V45", "gina v4", "gina v5"), "Gina_V45");
  // Written without separators, the new name is too.
  assert.equal(
    renameSetToken("GinaV4 9x16", "Gina_V4", "Gina_V5"),
    "GinaV5 9x16",
  );
  assert.equal(renameSetToken("ginav4", "Gina_V4", "Gina_V5"), "ginav5");
  // Written as the set's own name, the new name goes in exactly.
  assert.equal(
    renameSetToken("Gina_V4 AU | 1x1", "Gina_V4 AU", "Gina_V5 AU"),
    "Gina_V5 AU | 1x1",
  );
  assert.equal(
    renameSetToken("gina v4 au", "Gina_V4 AU", "Gina_V5 AU"),
    "gina v5 au",
  );
  assert.equal(renameSetToken("Gina_V4", "Gina_V4", "___"), "___");
});

test("a set with an extra word still renames the creative's name in ads", () => {
  assert.deepEqual(changedCore("Gina_V4 AU", "Gina_V5 AU"), {
    from: "Gina_V4",
    to: "Gina_V5",
  });
  assert.deepEqual(changedCore("AU | Gina_V4", "AU | Gina_V5"), {
    from: "Gina_V4",
    to: "Gina_V5",
  });
  assert.deepEqual(changedCore("Gina_V9", "Gina_V10"), {
    from: "Gina_V9",
    to: "Gina_V10",
  });
  assert.deepEqual(renamePairs("Gina_V4", "Gina_V5"), [
    { from: "Gina_V4", to: "Gina_V5" },
  ]);
  assert.deepEqual(renamePairs("Same", "Same"), []);

  const original = catalogPackage();
  original.catalogExports[0].productSets = [
    set(V4, "Gina_V4 AU"),
    set(V5, "Gina_V5 AU"),
  ];
  original.productSets = [set(V4, "Gina_V4 AU")];
  const { packageData, changes, renamed } = swapProductSets(original, {
    [V4]: V5,
  });
  assert.equal(packageData.ads[0].name, "Gina_V5");
  assert.equal(packageData.source.campaignName, "VD47AU Gina_V5");
  assert.deepEqual(changes, {
    campaign: true,
    adsets: 1,
    ads: 1,
    creatives: 1,
  });
  // The pair that matched is the one the panel shows.
  assert.deepEqual(renamed[0], { from: "Gina_V4", to: "Gina_V5" });
  const state = { clonePackage: original };
  chooseProductSet(state, V4, V5);
  assert.match(setRenameSummary(state, t), /^“Gina_V4” → “Gina_V5”/);
});

test("the panel says what will be renamed, or why nothing will", () => {
  const state = { clonePackage: catalogPackage() };
  chooseProductSet(state, V4, V5);
  assert.equal(
    setRenameSummary(state, t),
    "“Gina_V4” → “Gina_V5” in the names: campaign, ad sets: 1, ads: 1.",
  );

  const other = catalogPackage();
  other.source.campaignName = "PEAK_VD47AU Mila";
  other.campaign.name = "PEAK_VD47AU Mila";
  other.adsets[0].name = "AU 25+";
  other.ads = [{ id: "ad1", name: "Mila 1x1" }];
  other.creatives[0].name = "Mila";
  other.creatives[0].raw.name = "Mila";
  const plain = { clonePackage: other };
  chooseProductSet(plain, V4, V5);
  assert.equal(
    setRenameSummary(plain, t),
    "No name contains “Gina_V4”, so names stay as they are. Now: campaign “PEAK_VD47AU Mila”, ad “Mila 1x1”.",
  );
  chooseProductSet(plain, V4, V4);
  assert.equal(
    setRenameSummary(plain, t),
    "",
    "nothing chosen, nothing to say",
  );
});
