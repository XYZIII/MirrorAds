import assert from "node:assert/strict";
import { test } from "node:test";
import { campaignCatalogObject } from "../src/domain/catalog.mjs";
import {
  describeCatalogPlacement,
  inheritAdsetProductSets,
  readClonePackageFromJson,
} from "../src/domain/package.mjs";
import { productSetChoices } from "../src/domain/product-set-swap.mjs";
import { buildShiftedScheduleWindow } from "../src/domain/schedule.mjs";
import {
  retimeScheduledStarts,
  sameClockInZone,
  scheduledStart,
} from "../src/domain/schedule-zones.mjs";
import { MirrorAdsState } from "../src/state/mirror-ads-state.mjs";
import { ScheduleService } from "../src/workflows/schedule-service.mjs";
import { DirectWriter } from "../src/writers/direct-writer.mjs";
import { DraftWriter } from "../src/writers/draft-writer.mjs";

const HOUR = 60 * 60 * 1000;
// 20 Nov 2026, 12:00 UTC.
const NOW = Date.UTC(2026, 10, 20, 12);

test("a start that is still ahead is kept; one in the past moves to now", () => {
  const anchor = new Date(NOW + 5 * 60000);
  const ahead = buildShiftedScheduleWindow(
    "2026-11-21T06:00:00+0700",
    "2026-11-28T06:00:00+0700",
    { anchor },
  );
  assert.deepEqual(ahead, {
    start: "2026-11-20T23:00:00.000Z",
    end: "2026-11-27T23:00:00.000Z",
  });
  // A lifetime budget needs an end: 30 days after the scheduled start.
  assert.equal(
    buildShiftedScheduleWindow("2026-11-21T06:00:00+0700", "", {
      anchor,
      requireEnd: true,
    }).end,
    "2026-12-20T23:00:00.000Z",
  );
  // A campaign that started last week starts again now, as before.
  const past = buildShiftedScheduleWindow("2026-11-13T06:00:00+0000", "", {
    anchor,
  });
  assert.equal(past.start, anchor.toISOString());
});

test("the clone keeps the scheduled start of its ad sets", () => {
  const state = new MirrorAdsState();
  state.importPreserveSchedule = true;
  const schedule = new ScheduleService({ state, logging: { log() {} } });
  const later = new Date(Date.now() + 20 * HOUR).toISOString();
  const shifted = schedule.shiftPackageScheduleForImport({
    campaign: { start_time: new Date(Date.now() - 48 * HOUR).toISOString() },
    adsets: [{ id: "s1", start_time: later }],
  });
  assert.equal(shifted.adsets[0].start_time, new Date(later).toISOString());
});

test("a scheduled start keeps its clock time in the target account's zone", () => {
  // 06:00 in Bangkok is 06:00 in Moscow, four hours later.
  assert.equal(
    sameClockInZone(
      "2026-11-21T06:00:00+0700",
      "Asia/Bangkok",
      "Europe/Moscow",
    ),
    "2026-11-21T03:00:00.000Z",
  );
  const packageData = {
    campaign: { name: "C", start_time: "2026-11-13T00:00:00+0700" },
    adsets: [
      {
        name: "Set 1",
        start_time: "2026-11-21T06:00:00+0700",
        end_time: "2026-11-23T06:00:00+0700",
      },
      { name: "Set 2", start_time: "2026-11-01T06:00:00+0700" },
    ],
  };
  const { packageData: moved, moved: notes } = retimeScheduledStarts(
    packageData,
    { fromZone: "Asia/Bangkok", toZone: "Europe/Moscow", nowMs: NOW },
  );
  assert.equal(moved.adsets[0].start_time, "2026-11-21T03:00:00.000Z");
  assert.equal(
    moved.adsets[0].end_time,
    "2026-11-23T03:00:00.000Z",
    "the end moves with the start",
  );
  assert.equal(moved.adsets[1].start_time, "2026-11-01T06:00:00+0700");
  assert.equal(
    moved.campaign.start_time,
    "2026-11-13T00:00:00+0700",
    "a start in the past is not a schedule",
  );
  assert.deepEqual(
    notes.map((note) => note.name),
    ["Set 1"],
  );
  assert.equal(
    packageData.adsets[0].start_time,
    "2026-11-21T06:00:00+0700",
    "the source package stays as it was",
  );
  // The same clock time already passed in the target: the moment is kept.
  const early = retimeScheduledStarts(
    { adsets: [{ start_time: "2026-11-20T13:00:00-0500" }] },
    { fromZone: "America/New_York", toZone: "Asia/Bangkok", nowMs: NOW },
  );
  assert.equal(early.moved.length, 0);
  assert.equal(
    early.packageData.adsets[0].start_time,
    "2026-11-20T13:00:00-0500",
  );
  // Same or unknown zones change nothing.
  for (const zones of [
    { fromZone: "Asia/Bangkok", toZone: "Asia/Bangkok" },
    { fromZone: "", toZone: "Europe/Moscow" },
  ]) {
    assert.equal(
      retimeScheduledStarts(packageData, { ...zones, nowMs: NOW }).packageData,
      packageData,
    );
  }
  assert.equal(scheduledStart(packageData, NOW), "2026-11-20T23:00:00.000Z");
  assert.equal(scheduledStart({ adsets: [] }, NOW), "");
});

const catalogPackage = () => ({
  campaign: {
    id: "c1",
    name: "Catalog campaign",
    objective: "OUTCOME_SALES",
    promoted_object: { product_catalog_id: "900001" },
  },
  adsets: [
    { id: "s1", promoted_object: { product_set_id: "500004", pixel_id: "px" } },
    { id: "s2", promoted_object: { pixel_id: "px" } },
  ],
  ads: [
    { id: "a1", adset: { id: "s1" }, creative: { id: "cr1" } },
    { id: "a2", adset: { id: "s2" }, creative: { id: "cr2" } },
    { id: "a3", adset: { id: "s1" }, creative: { id: "cr3" } },
  ],
  creatives: [
    {
      id: "cr1",
      raw: { object_story_spec: { page_id: "p", template_data: {} } },
    },
    {
      id: "cr2",
      raw: { object_story_spec: { page_id: "p", template_data: {} } },
    },
    {
      id: "cr3",
      raw: { object_story_spec: { page_id: "p", link_data: {} } },
    },
  ],
});

test("catalog creatives without a set take the set of their ad set", () => {
  const data = catalogPackage();
  assert.equal(inheritAdsetProductSets(data), 1);
  assert.equal(data.creatives[0].raw.product_set_id, "500004");
  assert.equal(
    data.creatives[1].raw.product_set_id,
    undefined,
    "its ad set promotes no set",
  );
  assert.equal(
    data.creatives[2].raw.product_set_id,
    undefined,
    "not a catalog creative",
  );
  // A set the creative already has stays.
  const own = catalogPackage();
  own.creatives[0].raw.product_set_id = "500005";
  inheritAdsetProductSets(own);
  assert.equal(own.creatives[0].raw.product_set_id, "500005");
  // One creative in ad sets of two different sets: no guess.
  const shared = catalogPackage();
  shared.adsets[1].promoted_object.product_set_id = "500005";
  shared.ads[1].creative.id = "cr1";
  inheritAdsetProductSets(shared);
  assert.equal(shared.creatives[0].raw.product_set_id, undefined);
  // Files exported before this fix get it on reading.
  const file = readClonePackageFromJson(JSON.stringify(catalogPackage()));
  assert.equal(file.creatives[0].raw.product_set_id, "500004");
  assert.deepEqual(describeCatalogPlacement(file), {
    campaignCatalog: "900001",
    adsetSets: ["500004"],
    creativeSets: ["500004"],
    withoutSet: 1,
  });
});

test("the campaign of a catalog campaign keeps its catalog in both clone modes", async () => {
  assert.deepEqual(campaignCatalogObject(catalogPackage().campaign), {
    product_catalog_id: "900001",
  });
  assert.equal(campaignCatalogObject({ promoted_object: {} }), null);
  const state = new MirrorAdsState();
  const calls = [];
  const direct = new DirectWriter({
    state,
    graphClient: {
      graphFetch: async (path, options) => {
        calls.push({ path, body: options.body });
        return { id: "new-campaign" };
      },
    },
  });
  await direct.createCampaign("200001", catalogPackage().campaign);
  assert.deepEqual(calls[0].body.promoted_object, {
    product_catalog_id: "900001",
  });
  await direct.createCampaign("200001", { name: "Plain", objective: "X" });
  assert.equal(calls[1].body.promoted_object, undefined);

  const bodies = [];
  const draft = new DraftWriter({
    state,
    logging: { log() {} },
    sessionService: { getDraftApplicationId: () => "app" },
    draftRecovery: {
      createDraftFragmentWithRecovery: async (draftId, body) => {
        bodies.push(body);
        return { id: "fragment", ad_object_id: "draft-campaign" };
      },
    },
  });
  const valuesOf = (body) =>
    new Map(body.values.map((item) => [item.field, item.new_value]));
  await draft.createCampaignDraft("200001", "d1", catalogPackage().campaign);
  assert.deepEqual(valuesOf(bodies[0]).get("promoted_object"), {
    product_catalog_id: "900001",
  });
  // A leads campaign: the catalog when it has one, else nothing, as before.
  await draft.createCampaignDraft("200001", "d1", {
    ...catalogPackage().campaign,
    objective: "OUTCOME_LEADS",
  });
  assert.deepEqual(valuesOf(bodies[1]).get("promoted_object"), {
    product_catalog_id: "900001",
  });
  await draft.createCampaignDraft("200001", "d1", {
    name: "Leads",
    objective: "OUTCOME_LEADS",
  });
  assert.equal(valuesOf(bodies[2]).get("promoted_object"), null);
});

test("the set list always shows the campaign's own set as the one in use", () => {
  const data = {
    ...catalogPackage(),
    productSets: [
      { id: "500004", name: "creo_V4", product_catalog: { id: "900001" } },
    ],
    catalogExports: [
      {
        catalog: { id: "900001" },
        productSets: [
          { id: "500000", name: "All products" },
          { id: "500005", name: "creo_V5" },
        ],
      },
    ],
  };
  inheritAdsetProductSets(data);
  const [choice] = productSetChoices(data);
  assert.equal(choice.id, "500004");
  assert.deepEqual(choice.options[0], { id: "500004", name: "creo_V4" });
});
