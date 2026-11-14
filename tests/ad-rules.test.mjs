import assert from "node:assert/strict";
import { test } from "node:test";
import { currencyMinorUnits } from "../src/domain/clone-overrides.mjs";
import {
  buildRulePayload,
  convertRuleMoney,
  moneyFactor,
  ruleTargetsObjects,
  ruleUsesMoney,
  summarizeRule,
} from "../src/domain/ad-rules.mjs";
import { AdRuleService } from "../src/rules/ad-rule-service.mjs";

const pauseRule = () => ({
  id: "r1",
  name: "Stop CPL > 15",
  status: "ENABLED",
  evaluation_spec: {
    evaluation_type: "SCHEDULE",
    filters: [
      { field: "entity_type", value: "ADSET", operator: "EQUAL" },
      { field: "time_preset", value: "TODAY", operator: "EQUAL" },
      { field: "cost_per_lead_fb", value: 1500, operator: "GREATER_THAN" },
      { field: "impressions", value: 1000, operator: "GREATER_THAN" },
    ],
  },
  execution_spec: {
    execution_type: "PAUSE",
    execution_options: [
      { field: "user_ids", value: ["100"], operator: "EQUAL" },
    ],
  },
  schedule_spec: { schedule_type: "SEMI_HOURLY" },
});

const pinnedRule = () => ({
  id: "r2",
  name: "Scale winners",
  status: "DISABLED",
  evaluation_spec: {
    evaluation_type: "SCHEDULE",
    filters: [
      { field: "entity_type", value: "CAMPAIGN", operator: "EQUAL" },
      { field: "campaign.id", value: ["1", "2"], operator: "IN" },
      { field: "clicks", value: 50, operator: "GREATER_THAN" },
    ],
  },
  execution_spec: {
    execution_type: "CHANGE_BUDGET",
    execution_options: [
      {
        field: "change_spec",
        value: { amount: 20, unit: "PERCENTAGE" },
        operator: "EQUAL",
      },
    ],
  },
  schedule_spec: { schedule_type: "DAILY" },
});

test("a rule is summarised for the list", () => {
  assert.deepEqual(summarizeRule(pauseRule()), {
    id: "r1",
    name: "Stop CPL > 15",
    enabled: true,
    action: "PAUSE",
    level: "adset",
    schedule: "SEMI_HOURLY",
    conditions: 2,
    targetsObjects: false,
    usesMoney: true,
  });
  const pinned = summarizeRule(pinnedRule());
  assert.equal(pinned.targetsObjects, true);
  assert.equal(pinned.enabled, false);
  assert.equal(pinned.usesMoney, false);
  assert.equal(pinned.conditions, 1);
});

test("the copy keeps the specs and drops ids of the source account", () => {
  const source = pauseRule();
  const plain = buildRulePayload(source);
  assert.equal(plain.widened, false);
  assert.deepEqual(plain.body, {
    name: "Stop CPL > 15",
    evaluation_spec: source.evaluation_spec,
    execution_spec: source.execution_spec,
    status: "ENABLED",
    schedule_spec: { schedule_type: "SEMI_HOURLY" },
  });
  assert.notEqual(plain.body.evaluation_spec, source.evaluation_spec);
  assert.equal(plain.body.id, undefined);

  const pinned = buildRulePayload(pinnedRule());
  assert.equal(pinned.widened, true);
  assert.deepEqual(
    pinned.body.evaluation_spec.filters.map((item) => item.field),
    ["entity_type", "clicks"],
  );
  assert.equal(pinned.body.status, "DISABLED");
  assert.equal(
    buildRulePayload(pauseRule(), { disabled: true }).body.status,
    "DISABLED",
  );
  assert.equal(ruleTargetsObjects(pinnedRule()), true);
  assert.equal(ruleUsesMoney(pinnedRule()), false);
});

function serviceHarness({
  existing = {},
  failRule = "",
  failAccount = "",
  money = {},
} = {}) {
  const posts = [];
  const service = new AdRuleService({
    logging: { log() {} },
    reportService: {
      loadAccountMeta: async (accountId) =>
        money[String(accountId).replace(/^act_/, "")] || {
          currency: "USD",
          ratio: 1,
        },
    },
    graphClient: {
      graphGetAll: async (path) => {
        const id = path.slice(4, path.indexOf("/"));
        if (id === failAccount) throw new Error("(#200) no access");
        return existing[id] || [];
      },
      graphFetch: async (path, options) => {
        if (options.body.name === failRule) throw new Error("(#100) bad spec");
        posts.push({
          path,
          name: options.body.name,
          status: options.body.status,
          body: options.body,
        });
        return { id: `new-${posts.length}` };
      },
    },
  });
  return { service, posts };
}

test("rules are created in every target, existing names are skipped", async () => {
  const { service, posts } = serviceHarness({
    existing: { 22: [{ name: "stop cpl > 15 " }] },
  });
  const progress = [];
  const results = await service.cloneRules({
    rules: [pauseRule(), pinnedRule()],
    targets: [
      { accountId: "11", name: "A" },
      { accountId: "act_22", name: "B" },
    ],
    sourceAccountId: "1",
    onProgress: (done, total) => progress.push(`${done}/${total}`),
  });
  assert.deepEqual(
    posts.map((post) => `${post.path}:${post.name}`),
    [
      "act_11/adrules_library:Stop CPL > 15",
      "act_11/adrules_library:Scale winners",
      "act_22/adrules_library:Scale winners",
    ],
  );
  assert.deepEqual(
    results.map((item) => [item.created, item.skipped, item.failed]),
    [
      [2, 0, 0],
      [1, 1, 0],
    ],
  );
  assert.deepEqual(results[0].notes, [
    { kind: "widened", rule: "Scale winners" },
  ]);
  // Same currency: the amounts go over untouched.
  assert.equal(posts[0].body.evaluation_spec.filters[2].value, 1500);
  assert.deepEqual(progress, ["1/2", "2/2"]);
});

test("failures stay local to their rule and account", async () => {
  const { service, posts } = serviceHarness({
    failRule: "Scale winners",
    failAccount: "33",
  });
  const results = await service.cloneRules({
    rules: [pauseRule(), pinnedRule()],
    targets: [
      { accountId: "33", name: "Dead" },
      { accountId: "44", name: "Live" },
    ],
    sourceAccountId: "1",
    disabled: true,
  });
  assert.equal(results[0].failed, 2);
  assert.match(results[0].errors[0], /no access/);
  assert.deepEqual([results[1].created, results[1].failed], [1, 1]);
  assert.match(results[1].errors[0], /Scale winners: .*bad spec/);
  assert.deepEqual(
    posts.map((post) => post.status),
    ["DISABLED"],
  );
});

const spendRule = () => ({
  id: "r3",
  name: "Stop at $100 without a lead",
  status: "ENABLED",
  evaluation_spec: {
    evaluation_type: "SCHEDULE",
    filters: [
      { field: "entity_type", value: "CAMPAIGN", operator: "EQUAL" },
      { field: "spent", value: 10000, operator: "GREATER_THAN" },
      { field: "leadgen", value: 1, operator: "LESS_THAN" },
      { field: "cost_per_lead_fb", value: [500, "2000"], operator: "IN_RANGE" },
      { field: "website_purchase_roas", value: 1.5, operator: "LESS_THAN" },
      { field: "frequency", value: 3, operator: "GREATER_THAN" },
    ],
  },
  execution_spec: {
    execution_type: "CHANGE_BUDGET",
    execution_options: [
      {
        field: "change_spec",
        value: { amount: -500, unit: "ACCOUNT_CURRENCY", limit: 20000 },
        operator: "EQUAL",
      },
    ],
  },
  schedule_spec: { schedule_type: "SEMI_HOURLY" },
});

test("the factor covers the rate and the API units of both currencies", () => {
  const usd = { currency: "USD", ratio: 1 };
  assert.equal(
    moneyFactor(usd, { currency: "USD", ratio: 1 }, currencyMinorUnits),
    1,
  );
  // 1 USD = 26,000 VND; USD is in cents, VND has no minor unit.
  assert.equal(
    moneyFactor(usd, { currency: "VND", ratio: 26000 }, currencyMinorUnits),
    260,
  );
  // 1 USD = 0.9 EUR, both in cents.
  assert.equal(
    moneyFactor(usd, { currency: "EUR", ratio: 0.9 }, currencyMinorUnits),
    0.9,
  );
  // EUR -> VND goes through USD.
  assert.equal(
    Math.round(
      moneyFactor(
        { currency: "EUR", ratio: 0.9 },
        { currency: "VND", ratio: 26000 },
        currencyMinorUnits,
      ),
    ),
    289,
  );
  assert.equal(
    moneyFactor(usd, { currency: "VND", ratio: 0 }, currencyMinorUnits),
    null,
  );
});

test("money amounts are converted, ratios and counts are not", () => {
  const { body } = buildRulePayload(spendRule());
  assert.equal(convertRuleMoney(body, 260), 4);
  const values = Object.fromEntries(
    body.evaluation_spec.filters.map((item) => [item.field, item.value]),
  );
  assert.equal(values.spent, 2600000, "$100 -> 2,600,000 VND");
  assert.deepEqual(values.cost_per_lead_fb, [130000, "520000"]);
  assert.equal(values.leadgen, 1);
  assert.equal(values.website_purchase_roas, 1.5);
  assert.equal(values.frequency, 3);
  const change = body.execution_spec.execution_options[0].value;
  assert.deepEqual(change, {
    amount: -130000,
    unit: "ACCOUNT_CURRENCY",
    limit: 5200000,
  });
  // A percentage change is not money; the same currency changes nothing.
  const percent = buildRulePayload(pinnedRule()).body;
  assert.equal(convertRuleMoney(percent, 260), 0);
  assert.equal(percent.execution_spec.execution_options[0].value.amount, 20);
  assert.equal(convertRuleMoney(buildRulePayload(spendRule()).body, 1), 0);
});

test("a copy into a VND account is worth the same; no rate, no money rule", async () => {
  const { service, posts } = serviceHarness({
    money: {
      1: { currency: "USD", ratio: 1 },
      55: { currency: "VND", ratio: 26000 },
      66: { currency: "KZT", ratio: 0 },
    },
  });
  const results = await service.cloneRules({
    rules: [spendRule(), pinnedRule()],
    targets: [
      { accountId: "55", name: "Dong" },
      { accountId: "66", name: "No rate" },
    ],
    sourceAccountId: "1",
  });
  const dong = posts.find(
    (post) => post.path.startsWith("act_55") && post.name.startsWith("Stop"),
  );
  assert.equal(dong.body.evaluation_spec.filters[1].value, 2600000);
  assert.deepEqual(results[0].notes, [
    { kind: "converted", rule: "Stop at $100 without a lead" },
    { kind: "widened", rule: "Scale winners" },
  ]);
  // Without a rate the money rule is not created; the other one still is.
  assert.deepEqual([results[1].created, results[1].failed], [1, 1]);
  assert.match(results[1].errors[0], /no exchange rate/);
  assert.equal(
    posts.filter((post) => post.path.startsWith("act_66")).length,
    1,
  );
});
