import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildRulePayload,
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
} = {}) {
  const posts = [];
  const service = new AdRuleService({
    logging: { log() {} },
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
      { accountId: "11", name: "A", currency: "USD" },
      { accountId: "act_22", name: "B", currency: "EUR" },
    ],
    sourceCurrency: "USD",
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
  assert.deepEqual(progress, ["1/2", "2/2"]);
});

test("money conditions are flagged for another currency; failures stay local", async () => {
  const { service, posts } = serviceHarness({
    failRule: "Scale winners",
    failAccount: "33",
  });
  const results = await service.cloneRules({
    rules: [pauseRule(), pinnedRule()],
    targets: [
      { accountId: "33", name: "Dead", currency: "USD" },
      { accountId: "44", name: "Euro", currency: "EUR" },
    ],
    sourceCurrency: "USD",
    disabled: true,
  });
  assert.equal(results[0].failed, 2);
  assert.match(results[0].errors[0], /no access/);
  assert.deepEqual([results[1].created, results[1].failed], [1, 1]);
  assert.match(results[1].errors[0], /Scale winners: .*bad spec/);
  assert.deepEqual(results[1].notes, [
    { kind: "currency", rule: "Stop CPL > 15" },
  ]);
  assert.deepEqual(
    posts.map((post) => post.status),
    ["DISABLED"],
  );
});
