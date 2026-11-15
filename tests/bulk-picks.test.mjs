import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { AUTO, BulkPicks } from "../src/ui/bulk-picks.mjs";
import { MassCloneView } from "../src/ui/mass-clone-view.mjs";

const usable = (id, name) => ({
  id,
  name,
  raw: { account_status: 1, currency: "USD", funding_source: `fs-${id}` },
});
const ACCOUNTS = [
  usable("101", "VD | 1"),
  usable("102", "VD | 2"),
  usable("103", "VD | 3"),
];
const page = (id, name) => ({ id, name, picture: "" });

function setup() {
  const state = {
    accounts: ACCOUNTS,
    massTargets: { 101: { selected: true }, 102: { selected: true } },
    massPages: {
      101: [page("p-main", "Main page"), page("p-a", "Only A")],
      102: [page("p-main", "Main page")],
      103: [page("p-main", "Main page")],
    },
    massPixels: {
      101: [{ id: "px-shared", name: "BM pixel" }],
      102: [
        { id: "px-shared", name: "BM pixel" },
        { id: "px-b", name: "B pixel" },
      ],
    },
    massCatalogs: { 101: [{ id: "cat-1", name: "Shop" }], 102: [] },
    massCatalogBusiness: { 101: { id: "bm-1", name: "BM" } },
  };
  const view = new MassCloneView({ state, dom: {} });
  let renders = 0;
  view.render = () => {
    renders += 1;
  };
  const bulk = new BulkPicks({
    state,
    massCloneView: view,
    appId: "mirrorads-root",
  });
  return { state, view, bulk, renders: () => renders };
}

test("the choices are what the selected accounts have, most common first", () => {
  const { bulk } = setup();
  assert.deepEqual(bulk.choices("page"), {
    total: 2,
    items: [
      { id: "p-main", name: "Main page", count: 2 },
      { id: "p-a", name: "Only A", count: 1 },
    ],
  });
  assert.deepEqual(
    bulk.choices("pixel").items.map((item) => [item.id, item.count]),
    [
      ["px-shared", 2],
      ["px-b", 1],
    ],
  );
  assert.deepEqual(
    bulk.choices("catalog").items.map((item) => item.id),
    ["__copy__", "cat-1"],
    "copying into the account's BM comes first where there is a BM",
  );
  const html = bulk.optionsHtml("page");
  assert.match(html, /Main page<\/option>/, "available everywhere: no counter");
  assert.match(html, /Only A \(1\/2\)/);
  assert.match(html, new RegExp(`value="${AUTO}"`));
});

test("a choice lands only where the account has it, and the others are named", () => {
  const { state, bulk, renders } = setup();
  let result = bulk.apply("page", "p-a");
  assert.equal(state.massTargets["101"].pageId, "p-a");
  assert.equal(state.massTargets["102"].pageId, undefined);
  assert.deepEqual(result, {
    applied: 1,
    missing: ["VD | 2"],
    total: 2,
    everyListed: false,
  });
  assert.equal(renders(), 1, "one render for the whole change");
  assert.match(
    bulk.resultText("page", "p-a", result),
    /Page “Only A”: set in 1 of 2\. Not available in: VD \| 2\./,
  );

  result = bulk.apply("page", "p-main");
  assert.equal(result.applied, 2);
  assert.equal(state.massTargets["101"].pageId, "p-main");
  assert.equal(state.massTargets["102"].pageId, "p-main");
  assert.equal(
    state.massTargets["103"],
    undefined,
    "not selected, not touched",
  );
  assert.equal(state.massTargets["101"].selected, true, "the selection stays");

  bulk.apply("page", AUTO);
  assert.equal(state.massTargets["101"].pageId, "");
  assert.equal(state.massTargets["102"].pageId, "");

  bulk.apply("catalog", "__copy__");
  assert.equal(state.massTargets["101"].catalogId, "__copy__");
  assert.equal(
    state.massTargets["102"].catalogId,
    undefined,
    "no BM to copy into",
  );
  bulk.apply("pixel", "px-shared");
  assert.equal(state.massTargets["102"].pixelId, "px-shared");
});

test("with nothing selected every listed account gets the choice, and many misses are shortened", () => {
  const { state, bulk } = setup();
  state.massTargets = {};
  let result = bulk.apply("page", "p-main");
  assert.equal(result.applied, 3);
  assert.equal(result.everyListed, true);
  assert.match(
    bulk.resultText("page", "p-main", result),
    /every listed account/,
  );
  result = {
    applied: 0,
    missing: ["A", "B", "C", "D", "E", "F", "G"],
    total: 7,
    everyListed: false,
  };
  assert.match(
    bulk.resultText("pixel", "px", result),
    /A, B, C, D, E and 2 more/,
  );
});

test("the row sits above the accounts table, fills its lists when opened and reports the result", () => {
  const { window } = new JSDOM(
    `<div id="root"><section><div class="ma-scroll"><table><tbody id="mirrorads-root-clone-targets-body"></tbody></table></div></section></div>`,
  );
  const root = window.document.getElementById("root");
  const { state, bulk } = setup();
  bulk.attach(root);
  bulk.attach(root);
  assert.equal(
    root.querySelectorAll("[data-bulk-bar]").length,
    1,
    "attached once",
  );
  const bar = root.querySelector("[data-bulk-bar]");
  assert.ok(bar.nextElementSibling.classList.contains("ma-scroll"));
  const picker = bar.querySelector('[data-bulk="page"]');
  assert.equal(
    picker.options.length,
    1,
    "nothing is built before it is opened",
  );
  picker.dispatchEvent(new window.Event("focusin", { bubbles: true }));
  assert.ok(picker.options.length >= 4);
  picker.value = "p-main";
  picker.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(picker.value, "", "the select goes back to its title");
  assert.equal(state.massTargets["102"].pageId, "p-main");
  assert.match(
    bar.querySelector("[data-bulk-note]").textContent,
    /set in 2 of 2/,
  );

  state.massRunning = true;
  picker.dispatchEvent(new window.Event("focusin", { bubbles: true }));
  picker.value = "p-a";
  picker.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(
    state.massTargets["101"].pageId,
    "p-main",
    "nothing changes during a run",
  );
});
