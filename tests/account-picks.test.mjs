import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import {
  AccountPicks,
  LIVE_CAMPAIGN_STATUSES,
  campaignChip,
  fetchCampaignPresence,
  parseAccountIds,
} from "../src/ui/account-picks.mjs";
import { setLang } from "../src/ui/i18n.mjs";
import { MassCloneController } from "../src/ui/mass-clone-controller.mjs";
import { MassCloneView } from "../src/ui/mass-clone-view.mjs";

const usable = (id, name) => ({
  id,
  name,
  raw: { account_status: 1, currency: "USD", funding_source: `fs-${id}` },
});
const ACCOUNTS = [
  usable("1111111111111", "Empty A"),
  usable("2222222222222", "Busy B"),
  usable("3333333333333", "Empty C"),
  {
    id: "4444444444444",
    name: "No card",
    raw: { account_status: 1, currency: "USD" },
  },
  { id: "5555555555555", name: "Disabled", raw: { account_status: 2 } },
];

/** Graph answers: account 2 has three campaigns (one active), the rest none. */
function fakeGraph(failFor = []) {
  const calls = [];
  return {
    calls,
    graphFetch: async (path, { query }) => {
      calls.push({ path, query });
      const accountId = path.match(/^act_(\d+)\/campaigns$/)[1];
      if (failFor.includes(accountId)) throw new Error("Graph refused");
      const rows =
        accountId === "2222222222222"
          ? [
              { effective_status: "ACTIVE" },
              { effective_status: "PAUSED" },
              { effective_status: "WITH_ISSUES" },
            ]
          : [];
      return { data: rows };
    },
  };
}

function setup({ failFor = [] } = {}) {
  const state = { accounts: ACCOUNTS, massTargets: {}, massRunning: false };
  const graphClient = fakeGraph(failFor);
  const view = new MassCloneView({ state, dom: {} });
  let renders = 0;
  view.render = () => {
    renders += 1;
  };
  const logs = [];
  const picks = new AccountPicks({
    state,
    appId: "mirrorads-root",
    graphClient,
    massCloneView: view,
    logging: { log: (level, message) => logs.push(message) },
  });
  return { state, view, picks, graphClient, logs, renders: () => renders };
}

const ids = (accounts) => accounts.map((account) => account.id);

test("ids pasted the way agents send them, or any other way", () => {
  assert.deepEqual(
    parseAccountIds(
      "111111111111\n72727272828\r\n828272772819\n\n828373728828 ",
    ),
    ["111111111111", "72727272828", "828272772819", "828373728828"],
  );
  assert.deepEqual(
    parseAccountIds("act_1234567, 1234567; 7654321\t1234 99"),
    ["1234567", "7654321"],
    "act_ prefixes, separators, repeats and short numbers",
  );
  assert.deepEqual(parseAccountIds("нет цифр"), []);
});

test("campaigns are counted without archived and deleted ones", async () => {
  const graph = fakeGraph();
  const presence = await fetchCampaignPresence(
    graph.graphFetch,
    "act_2222222222222",
  );
  assert.deepEqual(presence, { total: 3, active: 1, more: false });
  assert.equal(graph.calls[0].path, "act_2222222222222/campaigns");
  assert.deepEqual(
    JSON.parse(graph.calls[0].query.effective_status),
    LIVE_CAMPAIGN_STATUSES,
  );
  assert.ok(!LIVE_CAMPAIGN_STATUSES.includes("ARCHIVED"));
  assert.ok(!LIVE_CAMPAIGN_STATUSES.includes("DELETED"));
  const many = await fetchCampaignPresence(
    async () => ({ data: [{}, {}], paging: { next: "https://next" } }),
    "1",
  );
  assert.equal(many.more, true);
});

test("each account says whether it has campaigns, in both languages", () => {
  assert.equal(campaignChip(undefined), "");
  assert.match(campaignChip({ loading: true }), /…/);
  assert.match(campaignChip({ failed: true }), /\?/);
  assert.match(campaignChip({ total: 0, active: 0 }), /no campaigns/);
  assert.match(campaignChip({ total: 1, active: 1 }), />1 campaign</);
  assert.match(
    campaignChip({ total: 100, active: 0, more: true }),
    />100\+ campaigns</,
  );
  setLang("ru");
  try {
    assert.match(campaignChip({ total: 0, active: 0 }), /нет кампаний/);
    assert.match(campaignChip({ total: 1, active: 0 }), />1 кампания</);
    assert.match(campaignChip({ total: 3, active: 1 }), />3 кампании</);
    assert.match(campaignChip({ total: 5, active: 1 }), />5 кампаний</);
    assert.match(campaignChip({ total: 12, active: 1 }), />12 кампаний</);
    assert.match(campaignChip({ total: 21, active: 1 }), />21 кампания</);
    assert.match(campaignChip({ total: 3, active: 1 }), /активных: 1/);
  } finally {
    setLang("en");
  }
});

test("the filter hides accounts with campaigns and drops them from the selection", async () => {
  const { state, view, picks } = setup();
  assert.deepEqual(ids(view.usableAccounts()), [
    "1111111111111",
    "2222222222222",
    "3333333333333",
  ]);
  state.massTargets = {
    1111111111111: { selected: true },
    2222222222222: { selected: true },
  };
  await picks.loadPresence();
  // Without the filter everything stays as it was.
  assert.equal(ids(view.targetAccounts()).length, 3);
  assert.equal(state.massTargets["2222222222222"].selected, true);
  assert.equal(view.hiddenWithCampaigns(), 0);

  picks.toggleOnlyEmpty();
  assert.equal(state.massOnlyEmpty, true);
  assert.deepEqual(ids(view.targetAccounts()), [
    "1111111111111",
    "3333333333333",
  ]);
  assert.equal(view.hiddenWithCampaigns(), 1);
  assert.equal(
    state.massTargets["2222222222222"].selected,
    false,
    "a hidden selection would still be cloned into",
  );
  assert.equal(state.massTargets["1111111111111"].selected, true);
});

test("an account whose campaigns could not be checked stays in the list", async () => {
  const { state, view, picks, logs } = setup({ failFor: ["3333333333333"] });
  state.massOnlyEmpty = true;
  await picks.loadPresence();
  assert.deepEqual(state.massCampaigns["3333333333333"], { failed: true });
  assert.deepEqual(ids(view.targetAccounts()), [
    "1111111111111",
    "3333333333333",
  ]);
  assert.match(logs[0], /1 account/);
});

test("a pasted list replaces the selection and explains what it could not pick", async () => {
  const { state, picks } = setup();
  await picks.loadPresence();
  state.massTargets = { 3333333333333: { selected: true, copies: 2 } };
  state.massSearch = "Busy";
  const text =
    "1111111111111\n2222222222222\n4444444444444\n5555555555555\n9999999999999\n1111111111111";
  let result = picks.applyPasted(text);
  assert.deepEqual(result.picked, ["1111111111111", "2222222222222"]);
  assert.deepEqual(result.unusable, ["4444444444444", "5555555555555"]);
  assert.deepEqual(result.notFound, ["9999999999999"]);
  assert.deepEqual(result.skipped, []);
  assert.equal(state.massTargets["1111111111111"].selected, true);
  assert.equal(state.massTargets["2222222222222"].selected, true);
  assert.equal(state.massTargets["3333333333333"].selected, false, "replaced");
  assert.equal(state.massTargets["3333333333333"].copies, 2, "settings kept");
  assert.equal(state.massSearch, "", "nothing chosen hides behind a search");
  const message = picks.resultText(result);
  assert.match(message, /Selected 2 of 5\./);
  assert.match(
    message,
    /disabled or without a payment method \(2\): 4444444444444, 5555555555555/,
  );
  assert.match(message, /Not available in this profile \(1\): 9999999999999/);

  // With the filter on, accounts that already have campaigns are skipped.
  state.massOnlyEmpty = true;
  result = picks.applyPasted("2222222222222 3333333333333");
  assert.deepEqual(result.picked, ["3333333333333"]);
  assert.deepEqual(result.skipped, ["2222222222222"]);
  assert.equal(state.massTargets["2222222222222"].selected, false);
  assert.match(
    picks.resultText(result),
    /already have campaigns \(1\): 2222222222222/,
  );
  assert.match(
    picks.resultText(picks.applyPasted("hello")),
    /No ad account IDs/,
  );
});

test("after a run the cloned accounts are checked again and leave the filtered list", async () => {
  const state = {
    accounts: ACCOUNTS,
    massTargets: { 1111111111111: { selected: true } },
    massRunning: false,
    massOnlyEmpty: true,
    massCampaigns: {},
  };
  let cloned = false;
  const graphClient = {
    graphFetch: async (path) => ({
      data:
        cloned && path.startsWith("act_1111111111111/")
          ? [{ effective_status: "PAUSED" }]
          : [],
    }),
  };
  const view = new MassCloneView({ state, dom: {} });
  view.render = () => {};
  const controller = new MassCloneController({
    state,
    dom: {},
    appId: "mirrorads-root",
    graphClient,
    logging: { log: () => {} },
    massCloneView: view,
    massCloneWorkflow: {
      run: async () => {
        cloned = true;
        return true;
      },
    },
  });
  await controller.runMassClone();
  await controller.picks.loading;
  assert.equal(state.massCampaigns["1111111111111"].total, 1);
  assert.equal(state.massTargets["1111111111111"].selected, false);
  assert.ok(!ids(view.targetAccounts()).includes("1111111111111"));
});

test("the filter and the paste box sit in the accounts card header", async () => {
  const { window } = new JSDOM(
    `<div id="root"><section><h3 class="ma-sec ma-sec-split"><span class="ma-sec-title">Accounts</span><input type="search" id="mirrorads-root-clone-search" /></h3><div class="ma-scroll"></div></section></div>`,
  );
  const root = window.document.getElementById("root");
  const { state, picks } = setup();
  await picks.loadPresence();
  picks.attach(root);
  picks.attach(root);
  assert.equal(
    root.querySelectorAll("[data-picks-empty]").length,
    1,
    "attached once",
  );
  const filter = root.querySelector("[data-picks-empty]");
  filter.click();
  assert.equal(filter.getAttribute("aria-pressed"), "true");
  assert.equal(state.massOnlyEmpty, true);

  const box = root.querySelector(".ma-paste");
  assert.ok(box.classList.contains("ma-hidden"));
  root.querySelector("[data-picks-paste]").click();
  assert.ok(!box.classList.contains("ma-hidden"));
  box.querySelector("textarea").value = "1111111111111\n2222222222222";
  root.querySelector("[data-picks-apply]").click();
  const output = root.querySelector("[data-picks-result]");
  assert.match(output.textContent, /Selected 1 of 2\./);
  assert.match(output.textContent, /already have campaigns/);
  assert.equal(state.massTargets["1111111111111"].selected, true);
  root.querySelector("[data-picks-close]").click();
  assert.ok(box.classList.contains("ma-hidden"));
});
