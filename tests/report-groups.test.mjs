import assert from "node:assert/strict";
import { test } from "node:test";
import { describeRule, rulesState } from "../src/domain/ad-rules.mjs";
import {
  accountGroup,
  adGroup,
  creativeKey,
  groupReport,
  sortGroups,
  summarizeAdRows,
} from "../src/domain/report-groups.mjs";

const NOW = Date.parse("2026-11-15T12:00:00Z");
const lead = (value) => ({ action_type: "lead", value: String(value) });

test("ads are summed from their insights and joined with the ads list", () => {
  const ads = summarizeAdRows({
    insights: [
      { ad_id: "1", ad_name: "creo_V4", spend: "9", actions: [lead(1)] },
      { ad_id: "1", ad_name: "creo_V4", spend: "9", actions: [lead(2)] },
      // Gone from the list (archived), but it spent: its names come along.
      {
        ad_id: "3",
        ad_name: "old_V1",
        campaign_name: "AGENT_1_AU_old_V1",
        spend: "4.5",
      },
    ],
    ads: [
      {
        id: "1",
        name: "creo_V4",
        effective_status: "ACTIVE",
        campaign: { name: "AGENT_123_AU_creo_V4" },
        adset: { targeting: { geo_locations: { countries: ["AU"] } } },
      },
      // Paused and silent: left out.
      { id: "2", name: "promo_V1", effective_status: "PAUSED" },
      // Running before its first spend: kept.
      {
        id: "4",
        name: "promo_V2",
        effective_status: "ACTIVE",
        adset: {
          targeting: { geo_locations: { regions: [{ country: "NZ" }] } },
        },
      },
    ],
    currency: "EUR",
    ratio: 0.9,
  });
  assert.deepEqual(
    ads.map((ad) => [
      ad.id,
      ad.name,
      ad.campaignName,
      ad.countries,
      ad.running,
      ad.spend,
      ad.spendUsd,
      ad.leads,
    ]),
    [
      ["1", "creo_V4", "AGENT_123_AU_creo_V4", ["AU"], true, 18, 20, 3],
      ["4", "promo_V2", "", ["NZ"], true, 0, 0, null],
      ["3", "old_V1", "AGENT_1_AU_old_V1", [], false, 4.5, 5, null],
    ],
  );
  // An account that cannot deliver runs nothing, whatever its ads say.
  const dead = summarizeAdRows({
    ads: [{ id: "1", name: "x", effective_status: "ACTIVE" }],
    delivers: false,
  });
  assert.deepEqual(dead, []);
});

test("account traits put each line in one group", () => {
  const row = {
    offsetMinutes: 420,
    health: "live",
    activeCampaigns: 2,
    inactiveCampaigns: 1,
    rules: [{ enabled: true }],
    currency: "USD",
    createdTime: "2026-11-01T10:00:00+0000",
  };
  const key = (dimension, line = row) => accountGroup(dimension, line, NOW).key;
  assert.equal(accountGroup("zone", row, NOW).label, "UTC+7");
  assert.equal(key("zone", { offsetMinutes: null }), "unknown");
  assert.equal(key("status"), "live");
  assert.equal(key("status", { health: "unknown" }), "unknown");
  assert.equal(key("campaigns"), "running");
  assert.equal(
    key("campaigns", { ...row, health: "banned" }),
    "stopped",
    "switched on in a banned account is not running",
  );
  assert.equal(
    key("campaigns", { activeCampaigns: 0, inactiveCampaigns: 0 }),
    "none",
  );
  assert.equal(key("campaigns", { activeCampaigns: null }), "unknown");
  assert.equal(key("rules"), "on");
  assert.equal(key("rules", { rules: [{ enabled: false }] }), "off");
  assert.equal(key("rules", { rules: [] }), "none");
  assert.equal(key("rules", { rules: null }), "unknown");
  assert.equal(key("currency"), "USD");
  assert.equal(key("age"), "month");
  assert.equal(key("age", { createdTime: "2026-11-12T00:00:00Z" }), "week");
  assert.equal(key("age", { createdTime: "2025-01-01T00:00:00Z" }), "older");
  assert.equal(key("age", { createdTime: "" }), "unknown");
});

test("ad traits: the creative without copy marks, the countries, the agent", () => {
  assert.equal(creativeKey("creo_V4 – Copy 2"), "creo_V4");
  assert.equal(creativeKey("  creo_V4  -  Copy "), "creo_V4");
  assert.equal(
    adGroup("creative", { name: "Creo_V4" }).key,
    adGroup("creative", { name: "creo_v4 - Copy" }).key,
  );
  assert.equal(adGroup("creative", { name: "" }).key, "unknown");
  assert.equal(adGroup("geo", { countries: ["AU", "NZ"] }).label, "AU, NZ");
  assert.equal(adGroup("geo", { countries: [] }).key, "unknown");
  assert.equal(
    adGroup("agent", { campaignName: "VV_AGENT_1840AU creo_V4" }).label,
    "AGENT",
  );
});

function line(accountId, extra = {}) {
  return {
    accountId,
    name: `Account ${accountId}`,
    health: "live",
    currency: "USD",
    offsetMinutes: 180,
    activeCampaigns: 1,
    inactiveCampaigns: 0,
    spend: 0,
    spendUsd: 0,
    leads: null,
    purchases: null,
    error: "",
    ...extra,
  };
}

const ad = (name, spendUsd, leads, running = true, extra = {}) => ({
  name,
  spend: spendUsd,
  spendUsd,
  leads,
  purchases: null,
  running,
  countries: ["AU"],
  campaignName: "AGENT_1_AU_x",
  ...extra,
});

test("grouping by creative counts accounts once per group and once in total", () => {
  const rows = [line("1"), line("2"), line("3"), line("4"), line("5")];
  const ads = {
    1: {
      ads: [
        ad("creo_V4", 30, 3),
        ad("creo_V4 – Copy", 10, 1, false),
        ad("promo_V1", 20, 1),
      ],
    },
    2: { ads: [ad("creo_V4", 40, 4, false)] },
    3: { error: "(#10) Permission Denied" },
    4: { ads: [] },
    // 5 not read yet: left out until it is.
  };
  const { groups, total } = groupReport({
    dimension: "creative",
    rows,
    ads,
  });
  assert.deepEqual(
    groups.map((group) => [
      group.key,
      group.label,
      group.accounts,
      group.running,
      group.spendUsd,
      group.leads,
    ]),
    [
      ["c:creo_v4", "creo_V4", 2, 1, 80, 8],
      ["c:promo_v1", "promo_V1", 1, 1, 20, 1],
      ["error", "", 1, 1, 0, 0],
      ["none", "", 1, 0, 0, 0],
    ],
  );
  assert.deepEqual(
    groups[0].members.map((member) => [
      member.accountId,
      member.running,
      member.spendUsd,
    ]),
    [
      ["1", true, 40],
      ["2", false, 40],
    ],
  );
  assert.equal(groups[0].share, 0.8);
  assert.deepEqual(
    [total.accounts, total.running, total.spendUsd, total.leads],
    [4, 2, 100, 9],
  );
});

test("grouping by an account trait uses the account lines", () => {
  const rows = [
    line("1", { offsetMinutes: 420, spend: 50, spendUsd: 50, leads: 5 }),
    line("2", { offsetMinutes: 180, spend: 20, spendUsd: 20, leads: 1 }),
    line("3", { offsetMinutes: 420, spend: 10, spendUsd: 10, leads: 0 }),
    line("4", { offsetMinutes: null }),
  ];
  const { groups } = groupReport({ dimension: "zone", rows });
  assert.deepEqual(
    groups.map((group) => [
      group.label || group.key,
      group.accounts,
      group.spendUsd,
    ]),
    [
      ["UTC+7", 2, 60],
      ["UTC+3", 1, 20],
      ["unknown", 1, 0],
    ],
  );
  // Their own order on request: east of UTC after west of it.
  assert.deepEqual(
    sortGroups(groups, "label", "asc").map((group) => group.key),
    ["z180", "z420", "unknown"],
  );
});

test("groups sort by cost with nothing to divide by last, special groups always last", () => {
  const group = (key, spendUsd, leads, extra = {}) => ({
    key,
    label: key,
    order: 0,
    spendUsd,
    leads,
    leadsKnown: leads !== null,
    purchases: 0,
    purchasesKnown: false,
    accounts: 1,
    running: 1,
    ...extra,
  });
  const groups = [
    group("a", 100, 10),
    group("b", 50, 0),
    group("c", 30, 6),
    group("none", 0, 0, { tail: true, order: Infinity }),
  ];
  assert.deepEqual(
    sortGroups(groups, "cpl", "asc").map((item) => item.key),
    ["c", "a", "b", "none"],
  );
  assert.deepEqual(
    sortGroups(groups, "leads", "desc").map((item) => item.key),
    ["a", "c", "b", "none"],
  );
  assert.deepEqual(
    sortGroups(groups, "label", "desc").map((item) => item.key),
    ["c", "b", "a", "none"],
  );
});

test("a rule is described with its money in the account's own units", () => {
  const rule = {
    id: "9",
    name: "Stop on CPL",
    status: "ENABLED",
    evaluation_spec: {
      filters: [
        { field: "entity_type", value: "CAMPAIGN", operator: "EQUAL" },
        { field: "time_preset", value: "TODAY", operator: "EQUAL" },
        { field: "spent", value: 2000, operator: "GREATER_THAN" },
        { field: "leadgen_grouped", value: 1, operator: "LESS_THAN" },
        { field: "campaign.id", value: ["1"], operator: "IN" },
      ],
    },
    execution_spec: {
      execution_type: "CHANGE_BUDGET",
      execution_options: [
        {
          field: "change_spec",
          value: { amount: -500, unit: "ACCOUNT_CURRENCY", limit: 1000 },
        },
      ],
    },
    schedule_spec: { schedule_type: "SEMI_HOURLY" },
  };
  const info = describeRule(rule, "USD");
  assert.equal(info.enabled, true);
  assert.equal(info.level, "campaign");
  assert.equal(info.preset, "TODAY");
  assert.deepEqual(info.conditions, [
    { field: "spent", operator: "GREATER_THAN", value: 20, money: true },
    {
      field: "leadgen_grouped",
      operator: "LESS_THAN",
      value: 1,
      money: false,
    },
  ]);
  assert.deepEqual(info.change, { amount: -5, unit: "money", limit: 10 });
  // Whole units for a currency without cents.
  assert.equal(describeRule(rule, "VND").conditions[0].value, 2000);
  assert.deepEqual(rulesState([info, { enabled: false }]), {
    state: "on",
    on: 1,
    off: 1,
  });
  assert.deepEqual(rulesState(null), { state: "unknown", on: 0, off: 0 });
});
