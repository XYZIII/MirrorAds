import assert from "node:assert/strict";
import { test } from "node:test";
import { buildNameTemplateVars } from "../src/domain/name-template.mjs";
import {
  getReferencedProductSetIds,
  materializeCatalogMappedPackage,
} from "../src/domain/package.mjs";
import {
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

/** A catalog campaign on the set creo_V4, named after it like the operator does. */
function catalogPackage() {
  return {
    source: {
      accountId: "1840",
      campaignId: "c1",
      campaignName: "AB12AU creo_V4",
    },
    campaign: { id: "c1", name: "AB12AU creo_V4", objective: "OUTCOME_SALES" },
    adsets: [
      {
        id: "as1",
        name: "AU 25+ creo_V4",
        promoted_object: { product_set_id: V4, pixel_id: "px" },
      },
    ],
    ads: [
      { id: "ad1", name: "creo_V4", adset_id: "as1" },
      { id: "ad2", name: "creo_V45 test", adset_id: "as1" },
    ],
    creatives: [
      {
        id: "cr1",
        name: "creo_V4",
        raw: {
          name: "creo_V4",
          product_set_id: V4,
          product_catalog_id: CATALOG,
        },
      },
    ],
    catalogs: [{ id: CATALOG, name: "Shop" }],
    productSets: [set(V4, "creo_V4")],
    catalogExports: [
      {
        catalog: { id: CATALOG, name: "Shop" },
        productSets: [
          set(ALL, "All products"),
          set(V4, "creo_V4"),
          set(V5, "creo_V5"),
          set(V10, "creo_V10"),
        ],
      },
    ],
  };
}

test("a set's name is replaced only where it stands as a whole", () => {
  assert.equal(
    renameSetToken("AB12AU creo_V4", "creo_V4", "creo_V5"),
    "AB12AU creo_V5",
  );
  assert.equal(
    renameSetToken("AGENT_1840_AU_creo_V4", "creo_V4", "creo_V5"),
    "AGENT_1840_AU_creo_V5",
  );
  assert.equal(
    renameSetToken("creo_V45 test", "creo_V4", "creo_V5"),
    "creo_V45 test",
  );
  assert.equal(renameSetToken("Xcreo_V4", "creo_V4", "creo_V5"), "Xcreo_V4");
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
  assert.equal(choices[0].name, "creo_V4");
  assert.deepEqual(
    choices[0].options.map((option) => option.name),
    ["All products", "creo_V4", "creo_V5", "creo_V10"],
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
  assert.deepEqual(renamed, [{ from: "creo_V4", to: "creo_V5", used: true }]);
  assert.equal(packageData.adsets[0].promoted_object.product_set_id, V5);
  assert.equal(packageData.creatives[0].raw.product_set_id, V5);
  assert.deepEqual([...getReferencedProductSetIds(packageData)], [V5]);
  assert.equal(packageData.productSets[0].id, V5);
  assert.equal(packageData.productSets[0].name, "creo_V5");
  assert.equal(packageData.campaign.name, "AB12AU creo_V5");
  assert.equal(packageData.source.campaignName, "AB12AU creo_V5");
  assert.equal(packageData.adsets[0].name, "AU 25+ creo_V5");
  assert.deepEqual(
    packageData.ads.map((ad) => ad.name),
    ["creo_V5", "creo_V45 test"],
  );
  assert.equal(packageData.creatives[0].name, "creo_V5");
  assert.equal(packageData.creatives[0].raw.name, "creo_V5");
  // The campaign name macro {creo} follows the ads.
  const { vars } = buildNameTemplateVars({
    sourceName: packageData.source.campaignName,
    adNames: ["creo_V5"],
  });
  assert.equal(vars.creo, "creo_V5");
  // The source package is untouched.
  assert.equal(original.adsets[0].promoted_object.product_set_id, V4);
  assert.equal(original.ads[0].name, "creo_V4");
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
  assert.equal(state.clonePackage.ads[0].name, "creo_V5");
  assert.equal(state.massSetBase, original);
  assert.deepEqual(state.massSetSwaps, { [V4]: V5 });
  // Changing the choice starts again from the original, not from the swapped copy.
  chooseProductSet(state, V4, V10);
  assert.equal(state.clonePackage.ads[0].name, "creo_V10");
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
  assert.equal(renameSetToken("creo_v4", "creo_V4", "creo_V5"), "creo_v5");
  assert.equal(
    renameSetToken("CREO_V4 1x1", "creo_V4", "creo_V5"),
    "CREO_V5 1x1",
  );
  assert.equal(
    renameSetToken("AGENT_AB12AU creo V4", "creo_V4", "creo_V5"),
    "AGENT_AB12AU creo V5",
  );
  assert.equal(
    renameSetToken("creo-V4.mp4", "creo V4", "creo V5"),
    "creo-V5.mp4",
  );
  assert.equal(renameSetToken("creo_V45", "creo v4", "creo v5"), "creo_V45");
  // Written without separators, the new name is too.
  assert.equal(
    renameSetToken("creoV4 9x16", "creo_V4", "creo_V5"),
    "creoV5 9x16",
  );
  assert.equal(renameSetToken("creov4", "creo_V4", "creo_V5"), "creov5");
  // Written as the set's own name, the new name goes in exactly.
  assert.equal(
    renameSetToken("creo_V4 AU | 1x1", "creo_V4 AU", "creo_V5 AU"),
    "creo_V5 AU | 1x1",
  );
  assert.equal(
    renameSetToken("creo v4 au", "creo_V4 AU", "creo_V5 AU"),
    "creo v5 au",
  );
  assert.equal(renameSetToken("creo_V4", "creo_V4", "___"), "___");
});

test("a set with extra words still renames the creative's name", () => {
  const core = (from, to) => ({ from, to, core: true });
  // One word each: the whole name is the creative.
  assert.deepEqual(renamePairs("creo_V4", "creo_V5"), [
    { from: "creo_V4", to: "creo_V5" },
  ]);
  assert.deepEqual(renamePairs("creo_V9", "creo_V10"), [
    { from: "creo_V9", to: "creo_V10" },
  ]);
  assert.deepEqual(renamePairs("Same", "Same"), []);
  // Extra words on the old set: its whole name, then the creative alone.
  assert.deepEqual(renamePairs("creo_V4 NEW NEW", "creo_V5"), [
    { from: "creo_V4 NEW NEW", to: "creo_V5" },
    core("creo_V4", "creo_V5"),
  ]);
  assert.deepEqual(renamePairs("creo_V4 AU", "creo_V5 AU"), [
    { from: "creo_V4 AU", to: "creo_V5 AU" },
    core("creo_V4", "creo_V5"),
  ]);
  assert.deepEqual(renamePairs("AU | creo_V4", "AU | creo_V5"), [
    { from: "AU | creo_V4", to: "AU | creo_V5" },
    core("creo_V4", "creo_V5"),
  ]);
  // Extra words on the new set stay out of the names.
  assert.deepEqual(renamePairs("creo_V4", "creo_V5 NEW"), [
    core("creo_V4", "creo_V5"),
  ]);
  // Bare numbers are never renamed on their own; unrelated names only whole.
  assert.deepEqual(renamePairs("creo 4", "creo 5"), [
    { from: "creo 4", to: "creo 5" },
  ]);
  assert.deepEqual(renamePairs("Set A", "Other"), [
    { from: "Set A", to: "Other" },
  ]);
  assert.deepEqual(renamePairs("creo AU", "promo AU"), [
    { from: "creo AU", to: "promo AU" },
    core("creo", "promo"),
  ]);
});

test("switching from a set with extra words renames ads, ad sets and the campaign", () => {
  const original = catalogPackage();
  original.source.campaignName = "VV_AGENT_1840AU creo_V4 – Copy 17";
  original.campaign.name = original.source.campaignName;
  original.ads = [
    { id: "ad1", name: "creo_V4", adset_id: "as1" },
    { id: "ad2", name: "creo_V4", adset_id: "as1" },
  ];
  original.catalogExports[0].productSets = [
    set(V4, "creo_V4 NEW NEW"),
    set(V5, "creo_V5"),
  ];
  original.productSets = [set(V4, "creo_V4 NEW NEW")];
  const { packageData, changes, renamed } = swapProductSets(original, {
    [V4]: V5,
  });
  assert.equal(packageData.ads[0].name, "creo_V5");
  assert.equal(packageData.adsets[0].name, "AU 25+ creo_V5");
  assert.equal(
    packageData.source.campaignName,
    "VV_AGENT_1840AU creo_V5 – Copy 17",
  );
  assert.deepEqual(changes, {
    campaign: true,
    adsets: 1,
    ads: 2,
    creatives: 1,
  });
  assert.deepEqual(
    renamed.find((pair) => pair.used),
    { from: "creo_V4", to: "creo_V5", core: true, used: true },
  );
  const state = { clonePackage: original };
  chooseProductSet(state, V4, V5);
  assert.equal(
    setRenameSummary(state, t),
    "“creo_V4” → “creo_V5” in the names: campaign, ad sets: 1, ads: 2.",
  );
  // The campaign name built by the default template carries the new creative.
  const { vars } = buildNameTemplateVars({
    sourceName: state.clonePackage.source.campaignName,
    adNames: state.clonePackage.ads.map((ad) => ad.name),
  });
  assert.equal(vars.creo, "creo_V5");
});

test("the panel says what will be renamed, or why nothing will", () => {
  const state = { clonePackage: catalogPackage() };
  chooseProductSet(state, V4, V5);
  assert.equal(
    setRenameSummary(state, t),
    "“creo_V4” → “creo_V5” in the names: campaign, ad sets: 1, ads: 1.",
  );

  const other = catalogPackage();
  other.source.campaignName = "AGENT_AB12AU promo";
  other.campaign.name = "AGENT_AB12AU promo";
  other.adsets[0].name = "AU 25+";
  other.ads = [{ id: "ad1", name: "promo 1x1" }];
  other.creatives[0].name = "promo";
  other.creatives[0].raw.name = "promo";
  const plain = { clonePackage: other };
  chooseProductSet(plain, V4, V5);
  assert.equal(
    setRenameSummary(plain, t),
    "No name contains “creo_V4”, so names stay as they are. Now: campaign “AGENT_AB12AU promo”, ad “promo 1x1”.",
  );
  chooseProductSet(plain, V4, V4);
  assert.equal(
    setRenameSummary(plain, t),
    "",
    "nothing chosen, nothing to say",
  );
});
