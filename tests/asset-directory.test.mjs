import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import {
  accountsWithout,
  buildAssetDirectory,
  searchAssets,
} from "../src/domain/asset-directory.mjs";
import { AssetsView } from "../src/ui/assets-view.mjs";
import { setLang } from "../src/ui/i18n.mjs";

const ENTRIES = [
  {
    accountId: "1",
    name: "One",
    ok: true,
    pixels: [
      { id: "p1", name: "Main pixel" },
      { id: "p2", name: "p2" },
    ],
    catalogs: [{ id: "k1", name: "Shop" }],
  },
  {
    accountId: "2",
    name: "Two",
    ok: true,
    pixels: [
      { id: "p1", name: "Main pixel" },
      { id: "p2", name: "Second pixel" },
    ],
    catalogs: [],
  },
  {
    accountId: "3",
    name: "Three",
    ok: true,
    pixels: [{ id: "p1", name: "Main pixel" }],
    catalogs: [{ id: "k1", name: "Shop" }],
  },
  { accountId: "4", name: "Broken", ok: false, error: "(#10) denied" },
];

test("each pixel and catalog lists the accounts that can use it", () => {
  const directory = buildAssetDirectory(ENTRIES);
  assert.deepEqual(
    directory.pixels.map((asset) => [asset.id, asset.name, asset.accounts]),
    [
      ["p1", "Main pixel", ["1", "2", "3"]],
      ["p2", "Second pixel", ["1", "2"]],
    ],
  );
  assert.deepEqual(
    directory.catalogs.map((asset) => [asset.id, asset.accounts]),
    [["k1", ["1", "3"]]],
  );
  // An account that could not be read is never counted as missing it.
  assert.deepEqual(
    accountsWithout(directory.pixels[1], ENTRIES).map((entry) => entry.name),
    ["Three"],
  );
  assert.deepEqual(
    searchAssets(directory.pixels, "second").map((asset) => asset.id),
    ["p2"],
  );
  assert.deepEqual(
    searchAssets(directory.pixels, "p1").map((asset) => asset.id),
    ["p1"],
  );
});

test("the Pixels tab reads live accounts once and shows where each is missing", async () => {
  setLang("en");
  const { window } = new JSDOM(
    `<div id="root"><div id="mirrorads-root-panel-assets"></div></div>`,
  );
  const root = window.document.getElementById("root");
  const reads = [];
  const contexts = {
    1: { pixels: ENTRIES[0].pixels, catalogs: ENTRIES[0].catalogs },
    2: { pixels: ENTRIES[1].pixels, catalogs: [] },
    3: { pixels: ENTRIES[2].pixels, catalogs: ENTRIES[2].catalogs },
    5: { pixels: [{ id: "p9", name: "Old pixel" }], catalogs: [] },
  };
  const state = {
    sessionReady: true,
    accounts: [
      { id: "1", name: "One", raw: { account_status: 1 } },
      { id: "2", name: "Two", raw: { account_status: 1 } },
      { id: "3", name: "Three", raw: { account_status: 1 } },
      { id: "4", name: "Broken", raw: { account_status: 1 } },
      { id: "5", name: "Banned", raw: { account_status: 2 } },
    ],
  };
  const view = new AssetsView({
    state,
    dom: { root },
    appId: "mirrorads-root",
    accountContextService: {
      fetchAccountContext: async (accountId) => {
        reads.push(accountId);
        if (accountId === "4") throw new Error("(#10) denied");
        return contexts[accountId];
      },
      invalidateAccountContextCache: () => {},
    },
  });
  view.bind(root);
  await view.load();
  assert.deepEqual(reads.sort(), ["1", "2", "3", "4"], "banned left out");
  const panel = root.querySelector("#mirrorads-root-panel-assets");
  const items = () =>
    [...panel.querySelectorAll(".ma-asset")].map((item) => [
      item.querySelector(".ma-asset-name b").textContent,
      item.querySelector(".ma-asset-cover span").textContent,
      (
        item.querySelector(".ma-asset-miss") ||
        item.querySelector(".ma-asset-all")
      ).textContent.trim(),
    ]);
  assert.deepEqual(items(), [
    ["Main pixel", "3 of 3 accounts", "in every account"],
    ["Second pixel", "2 of 3 accounts", "missing in 1 ▾"],
  ]);
  assert.match(
    panel.querySelector(".ma-asset-note").textContent,
    /Accounts checked: 3 · could not be read: 1/,
  );
  panel.querySelector(".ma-asset-miss").click();
  assert.deepEqual(
    [...panel.querySelectorAll(".ma-asset-acct b")].map(
      (name) => name.textContent,
    ),
    ["Three"],
  );
  panel.querySelector('[data-assets="kind:catalogs"]').click();
  assert.deepEqual(items(), [["Shop", "2 of 3 accounts", "missing in 1 ▾"]]);

  // Every account, banned ones too: only the new one is read.
  panel.querySelector('[data-assets="live"]').click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await view.load();
  assert.deepEqual(
    reads.filter((id) => id === "5"),
    ["5"],
  );
  assert.equal(reads.length, 5);
  panel.querySelector('[data-assets="kind:pixels"]').click();
  assert.deepEqual(
    items().map((item) => item.slice(0, 2)),
    [
      ["Main pixel", "3 of 4 accounts"],
      ["Second pixel", "2 of 4 accounts"],
      ["Old pixel", "1 of 4 accounts"],
    ],
  );
  // The search filters the list in place.
  const search = panel.querySelector("[data-assets-search]");
  search.value = "old";
  search.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.deepEqual(
    items().map((item) => item[0]),
    ["Old pixel"],
  );
});
