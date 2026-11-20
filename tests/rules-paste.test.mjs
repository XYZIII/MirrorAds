import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { setLang } from "../src/ui/i18n.mjs";
import { RulesView, matchPastedTargets } from "../src/ui/rules-view.mjs";

const ACCOUNTS = [
  { id: "1111111111", name: "Source", raw: { account_status: 1 } },
  { id: "2222222222", name: "Target B", raw: { account_status: 1 } },
  { id: "3333333333", name: "Target C", raw: { account_status: 1 } },
  { id: "4444444444", name: "Banned D", raw: { account_status: 2 } },
  { id: "5555555555", name: "Target E", raw: { account_status: 1 } },
];

const rule = {
  id: "r1",
  name: "Stop on spend",
  status: "ENABLED",
  evaluation_spec: { filters: [] },
  execution_spec: { execution_type: "PAUSE" },
  schedule_spec: { schedule_type: "SEMI_HOURLY" },
};

test("a pasted list is matched against the accounts of the profile", () => {
  const accounts = [
    { accountId: "1111111111", usable: true },
    { accountId: "2222222222", usable: true },
    { accountId: "4444444444", usable: false },
  ];
  const result = matchPastedTargets(
    "act_2222222222\n1111111111, 4444444444 9999999999 2222222222",
    accounts,
    "1111111111",
  );
  assert.deepEqual(result.picked, ["2222222222"]);
  assert.deepEqual(result.source, ["1111111111"]);
  assert.deepEqual(result.unusable, ["4444444444"]);
  assert.deepEqual(result.notFound, ["9999999999"]);
});

test("the Rules tab takes its targets from a pasted list", async () => {
  const { window } = new JSDOM(
    `<div id="root"><div id="mirrorads-root-panel-rules"></div></div>`,
  );
  setLang("en");
  const root = window.document.getElementById("root");
  const state = {
    sessionReady: true,
    accounts: ACCOUNTS,
    rulesSource: "1111111111",
    rulesTargets: { 3333333333: true },
    rulesSearch: "Target C",
  };
  const view = new RulesView({
    state,
    dom: { root },
    appId: "mirrorads-root",
    adRuleService: { listRules: async () => [rule] },
    logging: { log: () => {} },
  });
  view.bind(root);
  await view.load();
  const panel = root.querySelector("#mirrorads-root-panel-rules");
  const chip = panel.querySelector('[data-rules="paste"]');
  assert.ok(chip, "the paste button sits by the search");
  assert.equal(chip.getAttribute("aria-expanded"), "false");
  chip.click();
  const box = panel.querySelector("[data-rules-paste-text]");
  assert.ok(box, "the paste box opens");
  box.value = "2222222222\n5555555555\n4444444444\n1111111111\n7777777777";
  box.dispatchEvent(new window.Event("input", { bubbles: true }));
  panel.querySelector('[data-rules="paste-apply"]').click();

  assert.deepEqual(state.rulesTargets, { 2222222222: true, 5555555555: true });
  assert.equal(
    state.rulesSearch,
    "",
    "no picked account hides behind a search",
  );
  const checked = [...panel.querySelectorAll("[data-rule-target]:checked")].map(
    (input) => input.dataset.ruleTarget,
  );
  assert.deepEqual(checked, ["2222222222", "5555555555"]);
  const result = panel.querySelector(".ma-paste-result").textContent;
  assert.match(result, /Selected 2 of 5\./);
  assert.match(result, /source account.*\(1\): 1111111111/);
  assert.match(result, /Not working.*\(1\): 4444444444/);
  assert.match(result, /Not available in this profile \(1\): 7777777777/);
  assert.match(
    panel.querySelector('[data-rules="ask"]').textContent,
    /2/,
    "the copy button counts the pasted accounts",
  );
  // The text stays while the box is open; closing hides it.
  assert.equal(
    panel.querySelector("[data-rules-paste-text]").value.split("\n").length,
    5,
  );
  panel.querySelector('[data-rules="paste-close"]').click();
  assert.equal(panel.querySelector("[data-rules-paste-text]"), null);
});

test("ticking an account keeps the list where it was scrolled", async () => {
  const { window } = new JSDOM(
    `<div id="root"><div id="mirrorads-root-panel-rules"></div></div>`,
  );
  setLang("en");
  const root = window.document.getElementById("root");
  const accounts = Array.from({ length: 40 }, (_, index) => ({
    id: String(1000000000 + index),
    name: `Account ${index}`,
    raw: { account_status: 1 },
  }));
  const state = {
    sessionReady: true,
    accounts,
    rulesSource: accounts[0].id,
    rulesTargets: {},
  };
  const view = new RulesView({
    state,
    dom: { root },
    appId: "mirrorads-root",
    adRuleService: { listRules: async () => [rule] },
    logging: { log: () => {} },
  });
  view.bind(root);
  await view.load();
  const panel = root.querySelector("#mirrorads-root-panel-rules");
  panel.querySelector(".ma-rule-accts").scrollTop = 420;
  panel.scrollTop = 120;
  const box = panel.querySelector(`[data-rule-target="${accounts[30].id}"]`);
  box.checked = true;
  box.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(state.rulesTargets[accounts[30].id], true);
  assert.equal(panel.querySelector(".ma-rule-accts").scrollTop, 420);
  assert.equal(panel.scrollTop, 120);
  const again = panel.querySelector(`[data-rule-target="${accounts[30].id}"]`);
  assert.notEqual(again, box, "the tab was redrawn");
  assert.equal(window.document.activeElement, again, "focus stays on the box");
});
