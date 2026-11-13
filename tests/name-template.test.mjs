import assert from "node:assert/strict";
import { test } from "node:test";
import {
  accountIdPrefix,
  buildNameTemplateVars,
  rebindAccountSegment,
  renderCampaignName,
  sourceAccountLabel,
} from "../src/domain/name-template.mjs";
import { MassCloneWorkflow } from "../src/workflows/mass-clone-workflow.mjs";

const SOURCE = "1840865430583018";
const TARGET = "1745662286529117";

function workflow(logs = [], state = {}) {
  return new MassCloneWorkflow({
    state,
    logging: { log: (...args) => logs.push(args) },
  });
}

test("account prefix is the first four digits, with or without act_", () => {
  assert.equal(accountIdPrefix("act_1234567890"), "1234");
  assert.equal(accountIdPrefix(9876543210), "9876");
  assert.equal(accountIdPrefix(""), "");
});

test("{auto} puts the full target id where the source prefix stands", () => {
  assert.deepEqual(
    rebindAccountSegment("LUCKY_1840AU Gina_V4", SOURCE, TARGET),
    { name: `LUCKY_${TARGET}AU Gina_V4`, replaced: true },
  );
  // Underscore-separated prefix, and the same digits later in the creative.
  assert.equal(
    rebindAccountSegment("Soc_1840_DE_vid_1840_b", SOURCE, TARGET).name,
    `Soc_${TARGET}_DE_vid_1840_b`,
  );
  // A longer number that merely starts with the prefix is not the marker.
  assert.deepEqual(rebindAccountSegment("LUCKY_18405AU Gina", SOURCE, TARGET), {
    name: "LUCKY_18405AU Gina",
    replaced: false,
  });
});

test("{auto} replaces a full source id, so renamed campaigns keep working", () => {
  assert.equal(
    rebindAccountSegment(`PEAK_${SOURCE}AU Matt_V2 S`, SOURCE, TARGET).name,
    `PEAK_${TARGET}AU Matt_V2 S`,
  );
  // Same-account clone of an old-style name is upgraded to the full id.
  assert.equal(
    rebindAccountSegment("PEAK_1840AU Matt_V2 S", SOURCE, SOURCE).name,
    `PEAK_${SOURCE}AU Matt_V2 S`,
  );
});

test("{auto} recognises the agent's account label in the name", () => {
  for (const name of [
    "PEAK_VD47AU Gina_V1-3",
    "PEAK_VD 47AU Gina_V1-3",
    "PEAK_vd-47AU Gina_V1-3",
  ]) {
    assert.deepEqual(
      rebindAccountSegment(name, "1999000000000001", TARGET, "VD | 47"),
      { name: `PEAK_${TARGET}AU Gina_V1-3`, replaced: true },
      name,
    );
  }
  // VD470 is another account, and a label without a digit is too generic.
  assert.equal(
    rebindAccountSegment("PEAK_VD470AU", "1999000000000001", TARGET, "VD | 47")
      .replaced,
    false,
  );
  assert.equal(
    rebindAccountSegment("PEAK_MainAU", "1999000000000001", TARGET, "Main")
      .replaced,
    false,
  );
});

test("{auto} drops the Ads Manager copy suffix and the retired VV_ prefix", () => {
  assert.equal(
    rebindAccountSegment("VV_LUCKY_1840AU Gina_V4 – Copy 14", SOURCE, TARGET)
      .name,
    `LUCKY_${TARGET}AU Gina_V4`,
  );
  // Only a leading VV_ goes; the same letters elsewhere stay.
  assert.equal(
    rebindAccountSegment("LUCKY_1840AU VV_V4 - Copy", SOURCE, TARGET).name,
    `LUCKY_${TARGET}AU VV_V4`,
  );
});

test("an unknown source account falls back to a four-digit second segment", () => {
  assert.equal(
    rebindAccountSegment("Soc_1234_DE_vid7", "", TARGET).name,
    `Soc_${TARGET}_DE_vid7`,
  );
});

test("a name without an account marker is left untouched and reported", () => {
  assert.deepEqual(rebindAccountSegment("Summer sale 2026", SOURCE, TARGET), {
    name: "Summer sale 2026",
    replaced: false,
  });
  const logs = [];
  const name = workflow(logs).buildCampaignName(
    "",
    "Summer sale 2026",
    { accountId: TARGET },
    { sourceAccountId: SOURCE },
  );
  assert.equal(name, "Summer sale 2026");
  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], "warn");
});

test("an empty template defaults to {auto}", () => {
  const logs = [];
  assert.equal(
    workflow(logs).buildCampaignName(
      "",
      "LUCKY_1840AU Gina_V4",
      { accountId: TARGET, name: "Target" },
      { sourceAccountId: `act_${SOURCE}` },
    ),
    `LUCKY_${TARGET}AU Gina_V4`,
  );
  assert.equal(logs.length, 0);
});

test("part macros rebuild the name explicitly", () => {
  const { vars } = buildNameTemplateVars({
    sourceName: "Soc_1840_DE_vid_7",
    sourceAccountId: SOURCE,
    targetAccountId: TARGET,
  });
  assert.equal(vars.agent, "Soc");
  assert.equal(vars.geo, "DE");
  assert.equal(vars.creo, "vid_7");
  assert.equal(vars.id4, "1745");
  assert.equal(vars.src_id4, "1840");
  assert.equal(
    workflow().buildCampaignName(
      "{agent}_{account_id}_{geo}_{creo}_{n}",
      "Soc_1840_DE_vid_7",
      { accountId: TARGET },
      { sourceAccountId: SOURCE, index: 3 },
    ),
    `Soc_${TARGET}_DE_vid_7_3`,
  );
});

test("renderCampaignName previews the exact name and flags a miss", () => {
  const result = renderCampaignName({
    template: "",
    sourceName: "PEAK_VD47AU Gina_V1-3",
    sourceAccountId: "1999000000000001",
    sourceAccountName: "VD | 47",
    account: { id: TARGET, name: "VD | 48" },
  });
  assert.equal(result.name, `PEAK_${TARGET}AU Gina_V1-3`);
  assert.equal(result.autoMissed, false);
  const missed = renderCampaignName({
    template: "{auto}",
    sourceName: "Summer sale",
    sourceAccountId: SOURCE,
    account: { id: TARGET },
  });
  assert.equal(missed.name, "Summer sale");
  assert.equal(missed.autoMissed, true);
});

test("the source account label is looked up by id", () => {
  const accounts = [
    { id: "1999000000000001", name: "VD | 47" },
    { id: TARGET, name: "VD | 48" },
  ];
  assert.equal(sourceAccountLabel(accounts, "act_1999000000000001"), "VD | 47");
  assert.equal(sourceAccountLabel(accounts, "5"), "");
  assert.equal(sourceAccountLabel(accounts, ""), "");
});

test("a name typed for one account travels with that target only", () => {
  const flow = workflow([], {
    accounts: [
      { id: "111", name: "A" },
      { id: "222", name: "B" },
    ],
    massTargets: {
      111: { selected: true, campaignName: "  My own name {n} " },
      222: { selected: true },
    },
  });
  const targets = flow.selectedTargets();
  assert.deepEqual(
    targets.map((target) => [target.accountId, target.campaignName]),
    [
      ["111", "My own name {n}"],
      ["222", ""],
    ],
  );
  // The typed name is a template too: macros still work in it.
  assert.equal(
    flow.buildCampaignName(targets[0].campaignName, "Src", targets[0], {
      index: 2,
    }),
    "My own name 2",
  );
});
