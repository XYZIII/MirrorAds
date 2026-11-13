import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildValueRuleSetPayload,
  materializeValueRuleMappedPackage,
  normalizeValueRuleSet,
  pickValueRuleSetName,
  valueRuleSetSignature,
} from "../src/domain/value-rules.mjs";
import { ValueRuleService } from "../src/value-rules/value-rule-service.mjs";
import { DraftWriter } from "../src/writers/draft-writer.mjs";
import { DirectWriter } from "../src/writers/direct-writer.mjs";

const GRAPH_RULE_SET = {
  id: "rs-src",
  name: "Women 25-44",
  rules: {
    data: [
      {
        id: "r1",
        name: "Women",
        adjust_sign: "INCREASE",
        adjust_value: 30,
        status: "ACTIVE",
        criterias: {
          data: [
            {
              id: "c1",
              criteria_type: "GENDER",
              operator: "CONTAINS",
              criteria_values: ["female"],
              criteria_value_types: ["NONE"],
            },
            {
              id: "c2",
              criteria_type: "AGE",
              operator: "CONTAINS",
              criteria_values: ["25-34", "35-44"],
              criteria_value_types: ["NONE", "NONE"],
            },
          ],
        },
      },
      {
        id: "r2",
        name: "Android",
        adjust_sign: "DECREASE",
        adjust_value: 20,
        criterias: {
          data: [
            {
              id: "c3",
              criteria_type: "OS_TYPE",
              operator: "CONTAINS",
              criteria_values: ["ANDROID"],
              criteria_value_types: ["NONE"],
            },
          ],
        },
      },
    ],
  },
};
const DEFINITION = normalizeValueRuleSet(GRAPH_RULE_SET);

function packageWith(sourceAccountId, valueRuleSets = [DEFINITION]) {
  return {
    source: { accountId: sourceAccountId },
    adsets: [
      {
        id: "a1",
        name: "A1",
        value_rule_set_id: "rs-src",
        value_rules_applied: true,
      },
      { id: "a2", name: "A2" },
    ],
    valueRuleSets,
  };
}

function createService({ targetSets = [], failCreate = false } = {}) {
  const posts = [];
  const logs = [];
  const notices = [];
  const service = new ValueRuleService({
    state: {
      operationReport: {
        notice: (message) => notices.push(message),
        issue: () => assert.fail("value rules must never raise an issue"),
      },
    },
    logging: { log: (...args) => logs.push(args) },
    graphClient: {
      graphGetAll: async (path) => {
        if (path.endsWith("/value_rule_set")) return targetSets;
        if (path.endsWith("/adsets"))
          return [
            {
              id: "a1",
              value_rule_set_id: "rs-src",
              value_rules_applied: true,
            },
            { id: "a2" },
          ];
        throw new Error(`unexpected ${path}`);
      },
      graphFetch: async (path, options = {}) => {
        if (options.method === "POST") {
          posts.push({ path, body: options.body });
          if (failCreate) throw new Error("limit reached");
          return { id: "rs-new" };
        }
        if (path === "rs-src") return GRAPH_RULE_SET;
        throw new Error(`unexpected ${path}`);
      },
    },
  });
  return { service, posts, logs, notices };
}

test("Graph rule sets normalize to a portable definition without ids", () => {
  assert.deepEqual(DEFINITION.rules[0], {
    name: "Women",
    adjust_sign: "INCREASE",
    adjust_value: 30,
    criterias: [
      {
        criteria_type: "GENDER",
        operator: "CONTAINS",
        criteria_values: ["FEMALE"],
        criteria_value_types: ["NONE"],
      },
      {
        criteria_type: "AGE",
        operator: "CONTAINS",
        criteria_values: ["25-34", "35-44"],
        criteria_value_types: ["NONE", "NONE"],
      },
    ],
  });
  assert.equal(JSON.stringify(DEFINITION).includes('"c1"'), false);
});

test("signature ignores names, case and criteria order but not rule order", () => {
  const renamed = structuredClone(DEFINITION);
  renamed.name = "Other";
  renamed.rules[0].name = "X";
  renamed.rules[0].criterias.reverse();
  renamed.rules[0].criterias[1].criteria_values = ["Female"];
  assert.equal(
    valueRuleSetSignature(renamed),
    valueRuleSetSignature(DEFINITION),
  );
  const reordered = structuredClone(DEFINITION);
  reordered.rules.reverse();
  assert.notEqual(
    valueRuleSetSignature(reordered),
    valueRuleSetSignature(DEFINITION),
  );
  const changed = structuredClone(DEFINITION);
  changed.rules[0].adjust_value = 31;
  assert.notEqual(
    valueRuleSetSignature(changed),
    valueRuleSetSignature(DEFINITION),
  );
});

test("create payload keeps rule order and can switch the criteria key", () => {
  const payload = buildValueRuleSetPayload(DEFINITION, { name: "Copy" });
  assert.equal(payload.name, "Copy");
  assert.deepEqual(
    payload.rules.map((rule) => [
      rule.name,
      rule.adjust_sign,
      rule.adjust_value,
    ]),
    [
      ["Women", "INCREASE", 30],
      ["Android", "DECREASE", 20],
    ],
  );
  assert.equal(payload.rules[0].criterias.length, 2);
  const alt = buildValueRuleSetPayload(DEFINITION, { criteriaKey: "criteria" });
  assert.equal(alt.rules[0].criteria.length, 2);
  assert.equal("criterias" in alt.rules[0], false);
});

test("free rule set names get a numeric suffix", () => {
  assert.equal(pickValueRuleSetName("A", ["B"]), "A");
  assert.equal(pickValueRuleSetName("A", ["A", "A (2)"]), "A (3)");
});

test("export reads definitions through the account edge", async () => {
  const { service } = createService({ targetSets: [{ ...GRAPH_RULE_SET }] });
  // The node read is what Ads Manager's token is denied.
  service.dependencies.graphClient.graphFetch = async () => {
    throw new Error("(#10) Permission Denied");
  };
  const adsets = [{ id: "a1" }, { id: "a2" }];
  const ruleSets = await service.attachValueRulesToExport(
    "camp",
    adsets,
    "111",
  );
  assert.equal(adsets[0].value_rule_set_id, "rs-src");
  assert.equal(adsets[0].value_rules_applied, true);
  assert.equal("value_rule_set_id" in adsets[1], false);
  assert.equal(ruleSets.length, 1);
  assert.equal(ruleSets[0].id, "rs-src");
  assert.equal(ruleSets[0].rules.length, 2);
});

test("export falls back to the node read when the account edge is empty", async () => {
  const { service } = createService();
  const ruleSets = await service.attachValueRulesToExport(
    "camp",
    [{ id: "a1" }],
    "111",
  );
  assert.equal(ruleSets.length, 1);
  assert.equal(ruleSets[0].rules.length, 2);
});

test("export survives accounts where value rule fields cannot be read", async () => {
  const logs = [];
  const service = new ValueRuleService({
    state: {},
    logging: { log: (...args) => logs.push(args) },
    graphClient: {
      graphGetAll: async () => {
        throw new Error("(#100) nonexisting field");
      },
      graphFetch: async () => assert.fail("no further reads expected"),
    },
  });
  const adsets = [{ id: "a1" }];
  assert.deepEqual(await service.attachValueRulesToExport("camp", adsets), []);
  assert.deepEqual(adsets, [{ id: "a1" }]);
  assert.equal(logs[0][0], "warn");
});

test("same account: the source rule set is reused as is", async () => {
  const { service, posts } = createService({
    targetSets: [{ ...GRAPH_RULE_SET }],
  });
  assert.deepEqual(
    await service.resolveValueRuleSetMap("111", packageWith("111")),
    { "rs-src": "rs-src" },
  );
  assert.equal(posts.length, 0);
});

test("other account: an identical existing rule set is reused", async () => {
  const { service, posts } = createService({
    targetSets: [{ ...GRAPH_RULE_SET, id: "rs-twin", name: "Renamed" }],
  });
  assert.deepEqual(
    await service.resolveValueRuleSetMap("222", packageWith("111")),
    { "rs-src": "rs-twin" },
  );
  assert.equal(posts.length, 0);
});

test("other account: a missing rule set is created with a free name", async () => {
  const different = structuredClone(GRAPH_RULE_SET);
  different.id = "rs-other";
  different.rules.data[0].adjust_value = 99;
  const { service, posts, notices } = createService({
    targetSets: [different],
  });
  assert.deepEqual(
    await service.resolveValueRuleSetMap("act_222", packageWith("111")),
    { "rs-src": "rs-new" },
  );
  assert.equal(posts.length, 1);
  assert.equal(posts[0].path, "act_222/value_rule_set");
  assert.equal(posts[0].body.name, "Women 25-44 (2)");
  assert.equal(posts[0].body.rules.length, 2);
  assert.match(notices[0], /created/);
});

test("a rule set that cannot be created is reported, never thrown", async () => {
  const { service, posts, notices } = createService({ failCreate: true });
  assert.deepEqual(
    await service.resolveValueRuleSetMap("222", packageWith("111")),
    {},
  );
  // `criterias` first, then one retry with `criteria`.
  assert.equal(posts.length, 2);
  assert.match(notices[0], /NOT copied/);
});

test("a package without the definition cannot cross accounts", async () => {
  const { service, posts, notices } = createService();
  assert.deepEqual(
    await service.resolveValueRuleSetMap("222", packageWith("111", [])),
    {},
  );
  assert.equal(posts.length, 0);
  assert.match(notices[0], /no definition/);
});

test("materialize rewrites mapped ad sets and strips unmapped references", () => {
  const source = packageWith("111");
  const mapped = materializeValueRuleMappedPackage(source, {
    "rs-src": "rs-new",
  });
  assert.equal(mapped.adsets[0].value_rule_set_id, "rs-new");
  assert.equal(mapped.adsets[0].value_rules_applied, true);
  assert.equal(source.adsets[0].value_rule_set_id, "rs-src");
  const stripped = materializeValueRuleMappedPackage(source, {});
  assert.equal("value_rule_set_id" in stripped.adsets[0], false);
  const plain = { adsets: [{ id: "a" }] };
  assert.equal(materializeValueRuleMappedPackage(plain, {}), plain);
});

const ADSET = {
  id: "a1",
  name: "A1",
  optimization_goal: "OFFSITE_CONVERSIONS",
  billing_event: "IMPRESSIONS",
  targeting: { geo_locations: { countries: ["DE"] } },
  promoted_object: { pixel_id: "px" },
  value_rule_set_id: "rs-new",
  value_rules_applied: true,
};

function createDraftWriter({ rejectValueRules = false } = {}) {
  const bodies = [];
  const notices = [];
  const writer = new DraftWriter({
    state: {
      importStatus: "PAUSED",
      importPackage: { source: { accountId: "111" } },
      operationReport: {
        record: () => {},
        notice: (message) => notices.push(message),
      },
    },
    logging: { log: () => {} },
    sessionService: { getDraftApplicationId: () => "app" },
    scheduleService: { cleanTargeting: (targeting) => targeting },
    draftRecovery: {
      createDraftFragmentWithRecovery: async (_draftId, body) => {
        bodies.push(body);
        const hasRules = body.values.some(
          (item) => item.field === "value_rule_set_id",
        );
        if (rejectValueRules && hasRules) throw new Error("(#100) bad field");
        return { id: "frag", ad_object_id: "draft-adset" };
      },
    },
  });
  return { writer, bodies, notices };
}

test("draft ad set carries the value rule set", async () => {
  const { writer, bodies, notices } = createDraftWriter();
  const id = await writer.createAdsetDraft("222", "d1", "c1", ADSET, {});
  assert.equal(id, "draft-adset");
  assert.equal(bodies.length, 1);
  const field = (name) =>
    bodies[0].values.find((item) => item.field === name)?.new_value;
  assert.equal(field("value_rule_set_id"), "rs-new");
  assert.equal(field("value_rules_applied"), true);
  assert.equal(notices.length, 0);
});

test("draft ad set falls back to no value rules when Meta rejects them", async () => {
  const { writer, bodies, notices } = createDraftWriter({
    rejectValueRules: true,
  });
  const id = await writer.createAdsetDraft("222", "d1", "c1", ADSET, {});
  assert.equal(id, "draft-adset");
  assert.equal(bodies.length, 2);
  assert.equal(
    bodies[1].values.some((item) => item.field.startsWith("value_rule")),
    false,
  );
  assert.match(notices[0], /WITHOUT value rules/);
});

test("draft ad set without value rules is written once, unchanged", async () => {
  const { writer, bodies } = createDraftWriter();
  const { value_rule_set_id: _id, value_rules_applied: _on, ...plain } = ADSET;
  await writer.createAdsetDraft("222", "d1", "c1", plain, {});
  assert.equal(bodies.length, 1);
  assert.equal(
    bodies[0].values.some((item) => item.field.startsWith("value_rule")),
    false,
  );
});

test("published ad set carries the value rule set", async () => {
  const bodies = [];
  const writer = new DirectWriter({
    state: {
      importPackage: { source: { accountId: "111" } },
      operationReport: { record: () => {}, notice: () => {} },
    },
    logging: { log: () => {} },
    scheduleService: { cleanTargeting: (targeting) => targeting },
    graphClient: {
      graphFetch: async (_path, options) => {
        bodies.push(options.body);
        return { id: "new-adset" };
      },
    },
  });
  assert.equal(await writer.createAdset("222", "c1", ADSET, {}), "new-adset");
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].value_rule_set_id, "rs-new");
  assert.equal(bodies[0].value_rules_applied, true);
});
