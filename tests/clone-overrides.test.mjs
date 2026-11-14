import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyCloneOverrides,
  computeNewBudget,
  currencyMinorUnits,
  hasCloneOverrides,
  localDateTimeToIso,
  parseAmount,
  toApiAmount,
} from "../src/domain/clone-overrides.mjs";
import { ReportActions } from "../src/reports/report-actions.mjs";

const cboPackage = () => ({
  source: { currency: "USD" },
  campaign: { name: "C", daily_budget: "5000" },
  adsets: [
    { id: "1", bid_amount: "300", start_time: "2026-11-01T00:00:00+0000" },
    { id: "2", end_time: "2026-11-10T00:00:00+0000" },
  ],
});

const aboPackage = () => ({
  source: { currency: "USD" },
  campaign: { name: "C" },
  adsets: [
    { id: "1", daily_budget: "2000" },
    { id: "2", lifetime_budget: "90000" },
  ],
});

test("amounts are parsed and converted to API units", () => {
  assert.equal(parseAmount("50,5"), 50.5);
  assert.equal(parseAmount(" 0 "), null);
  assert.equal(parseAmount("abc"), null);
  assert.equal(currencyMinorUnits("usd"), 100);
  assert.equal(currencyMinorUnits("JPY"), 1);
  assert.equal(toApiAmount(50.5, "USD"), 5050);
  assert.equal(toApiAmount(500, "JPY"), 500);
});

test("a local date and time becomes an instant in the target zone", () => {
  assert.equal(
    localDateTimeToIso("2026-11-15T09:30", "Europe/Kiev"),
    "2026-11-15T07:30:00.000Z",
  );
  assert.equal(
    localDateTimeToIso("2026-11-15T00:00", "America/Los_Angeles"),
    "2026-11-15T08:00:00.000Z",
  );
  assert.equal(localDateTimeToIso("soon", "Europe/Kiev"), "");
  assert.equal(localDateTimeToIso("2026-11-15T09:30", ""), "");
});

test("empty overrides leave the package untouched", () => {
  const source = cboPackage();
  assert.equal(hasCloneOverrides({ budget: "", bid: " ", start: "" }), false);
  const { packageData, notes } = applyCloneOverrides(source, {
    budget: "",
    bid: "",
    start: "",
  });
  assert.equal(packageData, source);
  assert.deepEqual(notes, []);
});

test("budget goes to the campaign when the campaign holds it", () => {
  const source = cboPackage();
  const { packageData, notes } = applyCloneOverrides(source, { budget: "75" });
  assert.equal(packageData.campaign.daily_budget, "7500");
  assert.equal(source.campaign.daily_budget, "5000", "source is not mutated");
  assert.equal(notes[0].where, "campaign");
});

test("budget goes to ad sets with a daily budget, lifetime is left alone", () => {
  const { packageData, notes } = applyCloneOverrides(aboPackage(), {
    budget: "30",
  });
  assert.equal(packageData.adsets[0].daily_budget, "3000");
  assert.equal(packageData.adsets[1].lifetime_budget, "90000");
  assert.equal(packageData.adsets[1].daily_budget, undefined);
  assert.deepEqual(
    { where: notes[0].where, count: notes[0].count },
    { where: "adsets", count: 1 },
  );
});

test("budget override warns when there is no daily budget anywhere", () => {
  const { notes } = applyCloneOverrides(
    { campaign: {}, adsets: [{ lifetime_budget: "1000" }] },
    { budget: "30" },
  );
  assert.equal(notes[0].level, "warn");
});

test("bid changes only ad sets that already bid", () => {
  const { packageData, notes } = applyCloneOverrides(cboPackage(), {
    bid: "4.2",
  });
  assert.equal(packageData.adsets[0].bid_amount, "420");
  assert.equal(packageData.adsets[1].bid_amount, undefined);
  assert.equal(notes[0].count, 1);
  const none = applyCloneOverrides(aboPackage(), { bid: "4" });
  assert.equal(none.notes[0].level, "warn");
});

test("start time is set on every ad set and stale ends are dropped", () => {
  const { packageData, notes } = applyCloneOverrides(
    cboPackage(),
    { start: "2026-11-15T09:30" },
    { timeZone: "Europe/Kiev" },
  );
  assert.equal(packageData.adsets[0].start_time, "2026-11-15T07:30:00.000Z");
  assert.equal(packageData.adsets[1].start_time, "2026-11-15T07:30:00.000Z");
  assert.equal(packageData.adsets[1].end_time, undefined);
  assert.equal(notes[0].droppedEnds, 1);
});

test("start time is refused without the target time zone", () => {
  const source = cboPackage();
  const { packageData, notes } = applyCloneOverrides(source, {
    start: "2026-11-15T09:30",
  });
  assert.equal(notes[0].level, "warn");
  assert.equal(packageData.adsets[0].start_time, source.adsets[0].start_time);
});

test("bulk budget: percent and fixed USD amounts", () => {
  assert.equal(computeNewBudget("5000", { mode: "percent", value: 20 }), 6000);
  assert.equal(computeNewBudget("5000", { mode: "percent", value: -30 }), 3500);
  assert.equal(
    computeNewBudget("5000", { mode: "percent", value: -100 }),
    null,
  );
  assert.equal(
    computeNewBudget("5000", { mode: "set", value: 50 }, { currency: "USD" }),
    5000,
  );
  // 1 USD = 0.9 EUR.
  assert.equal(
    computeNewBudget(
      "1",
      { mode: "set", value: 50 },
      { currency: "EUR", ratio: 0.9 },
    ),
    4500,
  );
  assert.equal(
    computeNewBudget(
      "1",
      { mode: "set", value: 50 },
      { currency: "JPY", ratio: 150 },
    ),
    7500,
  );
  assert.equal(
    computeNewBudget(
      "1",
      { mode: "set", value: 50 },
      { currency: "EUR", ratio: 0 },
    ),
    null,
  );
});

function actionsHarness({ campaigns, adsets = {}, failOn = new Set(), meta }) {
  const writes = [];
  const actions = new ReportActions({
    logging: { log() {} },
    reportService: {
      loadAccountMeta: async () => meta || { currency: "USD", ratio: 1 },
    },
    graphClient: {
      graphGetAll: async (path) => {
        if (path.endsWith("/campaigns")) {
          const id = path.slice(4, path.indexOf("/"));
          if (campaigns[id] instanceof Error) throw campaigns[id];
          return campaigns[id] || [];
        }
        return adsets[path.split("/")[0]] || [];
      },
      graphFetch: async (id, options) => {
        if (failOn.has(id)) throw new Error("(#100) nope");
        writes.push({ id, body: options.body });
        return { success: true };
      },
    },
  });
  return { actions, writes };
}

test("bulk pause switches off active campaigns and skips dead accounts", async () => {
  const { actions, writes } = actionsHarness({
    campaigns: { 11: [{ id: "c1" }, { id: "c2" }], 22: [{ id: "c3" }] },
  });
  const progress = [];
  const results = await actions.pauseCampaigns(
    [
      { accountId: "11", name: "A", health: "live" },
      { accountId: "act_22", name: "B", health: "disabled" },
    ],
    (done, total) => progress.push(`${done}/${total}`),
  );
  assert.deepEqual(writes, [
    { id: "c1", body: { status: "PAUSED" } },
    { id: "c2", body: { status: "PAUSED" } },
  ]);
  assert.equal(results[0].changed, 2);
  assert.equal(results[1].skipped, "not-working");
  assert.deepEqual(progress, ["1/2", "2/2"]);
});

test("a failing account or campaign does not stop the others", async () => {
  const { actions, writes } = actionsHarness({
    campaigns: {
      11: new Error("rate limit"),
      22: [{ id: "c1" }, { id: "c2" }],
    },
    failOn: new Set(["c1"]),
  });
  const results = await actions.pauseCampaigns([
    { accountId: "11", name: "A", health: "live" },
    { accountId: "22", name: "B", health: "live" },
  ]);
  assert.equal(results[0].failed, 1);
  assert.match(results[0].errors[0], /rate limit/);
  assert.deepEqual(
    { changed: results[1].changed, failed: results[1].failed },
    { changed: 1, failed: 1 },
  );
  assert.deepEqual(writes, [{ id: "c2", body: { status: "PAUSED" } }]);
});

test("bulk budget changes the campaign or its ad sets, never lifetime", async () => {
  const { actions, writes } = actionsHarness({
    campaigns: {
      11: [
        { id: "cbo", daily_budget: "5000" },
        { id: "life", lifetime_budget: "90000" },
        { id: "abo" },
      ],
    },
    adsets: {
      abo: [
        { id: "s1", daily_budget: "2000" },
        { id: "s2", lifetime_budget: "7000" },
      ],
    },
  });
  const results = await actions.changeBudgets(
    [{ accountId: "11", name: "A", health: "live" }],
    { mode: "percent", value: 50 },
  );
  assert.deepEqual(writes, [
    { id: "cbo", body: { daily_budget: 7500 } },
    { id: "s1", body: { daily_budget: 3000 } },
  ]);
  assert.equal(results[0].changed, 2);
});

test("a fixed USD budget is refused without a rate for the account", async () => {
  const { actions, writes } = actionsHarness({
    campaigns: { 11: [{ id: "c1", daily_budget: "5000" }] },
    meta: { currency: "EUR", ratio: 0 },
  });
  const results = await actions.changeBudgets(
    [{ accountId: "11", name: "A", health: "live" }],
    { mode: "set", value: 50 },
  );
  assert.deepEqual(writes, []);
  assert.equal(results[0].failed, 1);
});

test("draft clones are switched on at every level; value rules get a bid strategy", async () => {
  const { draftObjectStatus, valueRuleBidStrategy } =
    await import("../src/domain/draft-defaults.mjs");
  for (const level of ["campaign", "adset", "ad"]) {
    assert.equal(draftObjectStatus(level, { status: "PAUSED" }), "ACTIVE");
  }

  // Campaign budget: the ad set has no strategy of its own, so it gets the campaign's.
  assert.equal(
    valueRuleBidStrategy(
      {},
      {
        hasCampaignBudget: true,
        campaignBidStrategy: "LOWEST_COST_WITHOUT_CAP",
      },
    ),
    "LOWEST_COST_WITHOUT_CAP",
  );
  assert.equal(
    valueRuleBidStrategy({}, { hasCampaignBudget: true }),
    "LOWEST_COST_WITHOUT_CAP",
  );
  assert.equal(
    valueRuleBidStrategy(
      {},
      { hasCampaignBudget: true, campaignBidStrategy: "COST_CAP" },
    ),
    "COST_CAP",
  );
  // Value rules do not exist for bid cap / ROAS, and an ad set that already
  // names its strategy needs nothing.
  assert.equal(
    valueRuleBidStrategy(
      {},
      {
        hasCampaignBudget: true,
        campaignBidStrategy: "LOWEST_COST_WITH_BID_CAP",
      },
    ),
    "",
  );
  assert.equal(valueRuleBidStrategy({ bid_strategy: "COST_CAP" }, {}), "");
});

test("the pool limits concurrency, keeps order and waits for every item", async () => {
  const { runPool } = await import("../src/utils/pool.mjs");
  let running = 0;
  let peak = 0;
  const outcomes = await runPool([1, 2, 3, 4, 5], 2, async (n) => {
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, 5));
    running -= 1;
    if (n === 2) throw new Error("boom");
    return n * 10;
  });
  assert.equal(peak, 2);
  assert.deepEqual(
    outcomes.map((item) => item.value ?? item.error.message),
    [10, "boom", 30, 40, 50],
  );
  assert.deepEqual(await runPool([], 3, async () => 1), []);
});

test("the campaign list arms a button first and switches off on the second click", async () => {
  const { ReportCampaigns } = await import("../src/ui/report-campaigns.mjs");
  const paused = [];
  const state = {
    report: {
      rows: [{ accountId: "11", activeCampaigns: 2, inactiveCampaigns: 1 }],
      total: { activeCampaigns: 2 },
    },
  };
  const list = new ReportCampaigns({
    state,
    render() {},
    reportActions: {
      listActiveCampaigns: async () => [
        { id: "c1", name: "One", dailyBudget: 5000 },
        { id: "c2", name: "Two", dailyBudget: 0 },
      ],
      pauseCampaign: async (id) => {
        if (id === "c2") throw new Error("(#200) no permission");
        paused.push(id);
      },
    },
  });
  assert.equal(list.handle("period", "today"), false);
  list.handle("camps", "11");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(state.reportCamps["11"].items.length, 2);

  list.handle("coff", "c1");
  assert.deepEqual(paused, [], "the first click only arms the button");
  list.handle("coff", "c1");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(paused, ["c1"]);
  assert.equal(state.report.rows[0].activeCampaigns, 1);
  assert.equal(state.report.rows[0].inactiveCampaigns, 2);
  assert.equal(state.report.total.activeCampaigns, 1);

  // "All" skips what is already off; a refusal stays visible on its row.
  list.handle("call", "11");
  list.handle("call", "11");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(paused, ["c1"]);
  assert.match(state.reportCamps["11"].items[1].error, /no permission/);
  assert.equal(state.report.rows[0].activeCampaigns, 1);
});
