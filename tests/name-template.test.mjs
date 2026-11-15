import assert from "node:assert/strict";
import { test } from "node:test";
import {
  accountIdPrefix,
  agentOf,
  buildNameTemplateVars,
  DEFAULT_NAME_TEMPLATE,
  packageCountries,
  pickCreativeName,
  rebindAccountSegment,
  renderCampaignName,
  sourceAccountLabel,
} from "../src/domain/name-template.mjs";
import { MassCloneWorkflow } from "../src/workflows/mass-clone-workflow.mjs";

const SOURCE = "1840000000000018";
const TARGET = "1745000000000117";

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

test("the default name is AGENT_ID_GEO_CREO from macros", () => {
  assert.equal(DEFAULT_NAME_TEMPLATE, "{agent}_{id}_{geo}_{creo}");
  const logs = [];
  assert.equal(
    workflow(logs).buildCampaignName(
      "",
      "VV_AGENT_1840AU creo_V4 – Copy 17",
      { accountId: TARGET, name: "Target" },
      {
        sourceAccountId: `act_${SOURCE}`,
        adNames: ["creo_V4", "creo_V4"],
        countries: ["AU"],
      },
    ),
    `AGENT_${TARGET}_AU_creo_V4`,
  );
  assert.equal(logs.length, 0, "no account marker is needed any more");
  // However the source was named, the parts come out the same.
  for (const sourceName of [
    "AGENT_1840AU creo_V1",
    "AGENT 1840 AU creo",
    "AGENT-AB12-AU test",
  ]) {
    assert.equal(
      renderCampaignName({
        sourceName,
        sourceAccountId: SOURCE,
        account: { accountId: `act_${TARGET}` },
        adNames: ["creo_V5"],
        countries: ["AU"],
      }).name,
      `AGENT_${TARGET}_AU_creo_V5`,
      sourceName,
    );
  }
});

test("{agent} is the first word of the source name", () => {
  assert.equal(agentOf("VV_AGENT_1840AU creo_V4 – Copy 17"), "AGENT");
  assert.equal(agentOf("AGENT 1840 AU"), "AGENT");
  assert.equal(agentOf("  Team1-AU"), "Team1");
  assert.equal(agentOf(""), "");
});

test("{geo} is the targeted countries; the source name only when they say nothing", () => {
  const packageData = {
    adsets: [
      { targeting: { geo_locations: { countries: ["AU", "nz"] } } },
      { targeting: { geo_locations: { countries: ["AU"] } } },
      {
        targeting: {
          geo_locations: { regions: [{ key: "1", country: "US" }] },
        },
      },
      {},
    ],
  };
  assert.deepEqual(packageCountries(packageData), ["AU", "NZ", "US"]);
  assert.deepEqual(packageCountries(null), []);
  const geo = (countries, sourceName = "AGENT_1840DE creo") =>
    buildNameTemplateVars({ sourceName, countries }).vars.geo;
  assert.equal(geo(["AU"]), "AU");
  assert.equal(geo(["AU", "NZ"]), "AU-NZ");
  // No country in the targeting: the code the name carries.
  assert.equal(geo([]), "DE");
  assert.equal(geo([], "AGENT_AB12AU creo"), "AU", "AB12 is an account label");
  assert.equal(geo([], "AGENT creo"), "");
  // Many countries: the name's code, else the first three and a count.
  assert.equal(geo(["AT", "BE", "DE", "FR"], "AGENT_1840EU creo"), "EU");
  assert.equal(geo(["AT", "BE", "DE", "FR"], "AGENT creo"), "AT-BE-DE+1");
});

test("{id} is the target account's full id, {id4} its first four digits", () => {
  const { vars } = buildNameTemplateVars({
    sourceName: "AGENT_1840AU creo",
    sourceAccountId: SOURCE,
    targetAccountId: `act_${TARGET}`,
  });
  assert.equal(vars.id, TARGET);
  assert.equal(vars.id4, "1745");
  assert.equal(vars.src_id4, "1840");
});

test("a macro with nothing to put in takes its separator with it", () => {
  const render = (template, extra = {}) =>
    renderCampaignName({
      template,
      sourceName: "AGENT creo",
      account: { accountId: TARGET },
      adNames: ["creo_V4"],
      ...extra,
    }).name;
  assert.equal(render("{agent}_{id}_{geo}_{creo}"), `AGENT_${TARGET}_creo_V4`);
  assert.equal(render("{geo}_{agent}"), "AGENT");
  assert.equal(render("{agent} - {geo}"), "AGENT");
  assert.equal(render("{agent}_{n}"), "AGENT");
  assert.equal(render("{agent}_{n}", { index: 2 }), "AGENT_2");
  assert.equal(render("{n}"), "AGENT creo", "nothing at all: the source name");
  assert.equal(render("{agent}_{unknown}"), "AGENT_{unknown}");
});

test("a typed {auto} still puts the full target id where the source prefix stands", () => {
  assert.deepEqual(
    rebindAccountSegment("AGENT_1840AU creo_V4", SOURCE, TARGET),
    { name: `AGENT_${TARGET}AU creo_V4`, replaced: true },
  );
  // Underscore-separated prefix, and the same digits later in the creative.
  assert.equal(
    rebindAccountSegment("Soc_1840_DE_vid_1840_b", SOURCE, TARGET).name,
    `Soc_${TARGET}_DE_vid_1840_b`,
  );
  // A longer number that merely starts with the prefix is not the marker.
  assert.deepEqual(rebindAccountSegment("AGENT_18405AU creo", SOURCE, TARGET), {
    name: "AGENT_18405AU creo",
    replaced: false,
  });
  // A full source id is replaced too.
  assert.equal(
    rebindAccountSegment(`AGENT_${SOURCE}AU promo_V2 S`, SOURCE, TARGET).name,
    `AGENT_${TARGET}AU promo_V2 S`,
  );
});

test("a typed {auto} recognises the account label and drops copy suffixes", () => {
  for (const name of [
    "AGENT_AB12AU creo_V1-3",
    "AGENT_AB 12AU creo_V1-3",
    "AGENT_ab-12AU creo_V1-3",
  ]) {
    assert.deepEqual(
      rebindAccountSegment(name, "1999000000000001", TARGET, "AB | 12"),
      { name: `AGENT_${TARGET}AU creo_V1-3`, replaced: true },
      name,
    );
  }
  assert.equal(
    rebindAccountSegment("AGENT_AB120AU", "1999000000000001", TARGET, "AB | 12")
      .replaced,
    false,
  );
  assert.equal(
    rebindAccountSegment("VV_AGENT_1840AU creo_V4 – Copy 14", SOURCE, TARGET)
      .name,
    `AGENT_${TARGET}AU creo_V4`,
  );
  assert.equal(
    rebindAccountSegment("Soc_1234_DE_vid7", "", TARGET).name,
    `Soc_${TARGET}_DE_vid7`,
  );
  // No marker: left untouched, and the run says so.
  const logs = [];
  const missed = renderCampaignName({
    template: "{auto}",
    sourceName: "Summer sale",
    sourceAccountId: SOURCE,
    account: { id: TARGET },
  });
  assert.equal(missed.name, "Summer sale");
  assert.equal(missed.autoMissed, true);
  workflow(logs).buildCampaignName(
    "{auto}",
    "Summer sale",
    { accountId: TARGET },
    { sourceAccountId: SOURCE },
  );
  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], "warn");
});

test("the source account label is looked up by id", () => {
  const accounts = [
    { id: "1999000000000001", name: "AB | 12" },
    { id: TARGET, name: "AB | 13" },
  ];
  assert.equal(sourceAccountLabel(accounts, "act_1999000000000001"), "AB | 12");
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

test("{creo} is the creative name written into the ad", () => {
  const pick = (names) => pickCreativeName("", names, "tail");
  assert.equal(pick(["creo_V1", "creo_V1"]), "creo_V1");
  // Differ only in the number: the range.
  assert.equal(pick(["creo_V3", "creo_V3", "creo_V1"]), "creo_V1-3");
  assert.equal(pick(["creo_V10", "creo_V12", "creo_V11"]), "creo_V10-12");
  // Differ otherwise: the shared part, cut at a whole word.
  assert.equal(pick(["creo_V1", "creo_test"]), "creo");
  assert.equal(pick(["creo_Vid", "creo_Var"]), "creo");
  assert.equal(pick(["creo V1", "creo new"]), "creo");
  // Nothing in common: the first ad; no ads: the tail of the campaign name.
  assert.equal(pick(["creo_V1", "promo_V2"]), "creo_V1");
  assert.equal(pick([]), "tail");
  assert.equal(
    renderCampaignName({
      template: "{account}_{creo}",
      sourceName: "AGENT_AB12SA_creo_V1",
      account: { id: "1758000000000217", name: "AB600" },
      adNames: ["creo_V3", "creo_V3", "creo_V1"],
    }).name,
    "AB600_creo_V1-3",
  );
});
