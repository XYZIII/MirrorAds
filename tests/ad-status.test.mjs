import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { campaignItems } from "../src/accounts/campaign-controller.mjs";
import { createServices } from "../src/app/create-services.mjs";
import {
  adKindCounts,
  adStatusKind,
  campaignBlock,
  campaignDelivery,
  campaignStanding,
} from "../src/domain/ad-status.mjs";
import { filterByCampaigns, totalReport } from "../src/domain/report-time.mjs";
import {
  ReportActions,
  reviewFeedbackText,
} from "../src/reports/report-actions.mjs";
import { ReportService } from "../src/reports/report-service.mjs";
import { MirrorAdsState } from "../src/state/mirror-ads-state.mjs";
import { campaignStandingLabel } from "../src/ui/ad-status-view.mjs";
import { setLang } from "../src/ui/i18n.mjs";
import { buildPackageStatsHtml } from "../src/ui/mass-clone-view.mjs";

const on = (id, name = id) => ({ id, name, effective_status: "ACTIVE" });
const ad = (campaign, status) => ({
  campaign_id: campaign,
  effective_status: status,
});

test("an ad's status says whether it runs, and why not", () => {
  assert.equal(adStatusKind("ACTIVE"), "active");
  assert.equal(adStatusKind("DISAPPROVED"), "rejected");
  assert.equal(adStatusKind("pending_review"), "review");
  assert.equal(adStatusKind("WITH_ISSUES"), "issues");
  assert.equal(adStatusKind("ADSET_PAUSED"), "paused");
  assert.equal(adStatusKind("PENDING_BILLING_INFO"), "billing");
  assert.equal(adStatusKind("ARCHIVED"), "gone");
  assert.equal(adStatusKind("SOMETHING_NEW"), "other");
  assert.deepEqual(
    adKindCounts([
      ad("c", "ACTIVE"),
      ad("c", "DISAPPROVED"),
      ad("c", "DISAPPROVED"),
      ad("c", "DELETED"),
    ]),
    { active: 1, rejected: 2 },
  );
});

test("a campaign that is on runs only while one of its ads runs", () => {
  assert.equal(campaignBlock(on("c"), [ad("c", "ACTIVE")]), "");
  assert.equal(
    campaignBlock(on("c"), [ad("c", "DISAPPROVED"), ad("c", "ACTIVE")]),
    "",
  );
  assert.equal(campaignBlock(on("c"), [ad("c", "DISAPPROVED")]), "rejected");
  // The reason the buyer acts on first wins.
  assert.equal(
    campaignBlock(on("c"), [ad("c", "PAUSED"), ad("c", "DISAPPROVED")]),
    "rejected",
  );
  assert.equal(
    campaignBlock(on("c"), [ad("c", "PENDING_REVIEW"), ad("c", "PAUSED")]),
    "review",
  );
  assert.equal(campaignBlock(on("c"), []), "noads");
  assert.equal(campaignBlock(on("c"), [ad("c", "ARCHIVED")]), "noads");
  assert.equal(campaignBlock(on("c"), [ad("c", "DISAPPROVED")], false), "");
  assert.equal(
    campaignBlock({ id: "c", effective_status: "PAUSED" }, []),
    "",
    "a campaign that is off is simply off",
  );
});

test("rejected ads make a switched-on campaign count as inactive", () => {
  const campaigns = [
    on("c1", "Runs"),
    on("c2", "Rejected"),
    { id: "c3", effective_status: "PAUSED" },
    { id: "c4", effective_status: "ARCHIVED" },
  ];
  const ads = [
    ad("c1", "ACTIVE"),
    ad("c2", "DISAPPROVED"),
    ad("c2", "DISAPPROVED"),
    ad("c3", "CAMPAIGN_PAUSED"),
  ];
  assert.deepEqual(campaignDelivery(campaigns, ads), {
    active: 1,
    inactive: 2,
    activeIds: ["c1"],
    blocked: [
      { id: "c2", name: "Rejected", reason: "rejected", ads: { rejected: 2 } },
    ],
  });
  // Without ads, or with a list cut short, nothing is judged by ads.
  const unread = campaignDelivery(campaigns, null);
  assert.equal(unread.active, 2);
  assert.deepEqual(unread.blocked, []);
  assert.equal(campaignDelivery(campaigns, ads, false).active, 2);
});

test("report lines count blocked campaigns and can be filtered by them", () => {
  const rows = [
    {
      accountId: "1",
      health: "live",
      activeCampaigns: 1,
      inactiveCampaigns: 1,
      blockedCampaigns: [{ id: "c2", name: "Rejected", reason: "rejected" }],
    },
    {
      accountId: "2",
      health: "live",
      activeCampaigns: 2,
      inactiveCampaigns: 0,
      blockedCampaigns: [],
    },
    {
      accountId: "3",
      health: "banned",
      activeCampaigns: 0,
      inactiveCampaigns: 1,
      blockedCampaigns: [{ id: "c9", name: "X", reason: "rejected" }],
    },
  ];
  assert.equal(totalReport(rows).blockedCampaigns, 1, "banned not counted");
  assert.deepEqual(
    filterByCampaigns(rows, "blocked").map((row) => row.accountId),
    ["1"],
  );
});

test("the account request carries ad statuses, and asks for less when refused", async () => {
  const asked = [];
  const make = (refuse) =>
    new ReportService({
      graphClient: {
        graphFetch: async (path, { query }) => {
          asked.push(query.fields);
          if (refuse.some((part) => query.fields.includes(part))) {
            throw new Error("(#100) refused");
          }
          // Only what was asked for comes back.
          return {
            currency: "USD",
            timezone_name: "Europe/Moscow",
            account_status: 1,
            ...(query.fields.includes("campaigns.limit")
              ? { campaigns: { data: [on("c1"), on("c2")] } }
              : {}),
            ...(query.fields.includes("ads.limit")
              ? { ads: { data: [ad("c1", "ACTIVE"), ad("c2", "DISAPPROVED")] } }
              : {}),
          };
        },
      },
    });
  let meta = await make([]).loadAccountMeta("1");
  assert.match(asked[0], /ads\.limit\(500\)\{campaign_id,effective_status\}/);
  assert.equal(meta.campaigns.active, 1);
  assert.deepEqual(
    meta.campaigns.blocked.map((item) => item.reason),
    ["rejected"],
  );
  asked.length = 0;
  meta = await make(["ads.limit"]).loadAccountMeta("1");
  assert.equal(asked.length, 2);
  assert.ok(!asked[1].includes("ads.limit"));
  assert.ok(meta.campaigns, "campaigns still read");
  asked.length = 0;
  meta = await make(["campaigns.limit"]).loadAccountMeta("1");
  assert.equal(asked.length, 3);
  assert.equal(meta.campaigns, null);
  assert.equal(meta.currency, "USD");
});

test("the campaign list of a report line shows each campaign's ads", async () => {
  const calls = [];
  let refuseFeedback = false;
  const actions = new ReportActions({
    logging: { log() {} },
    graphClient: {
      graphGetAll: async (path, query) => {
        calls.push(`${path}?${query.fields}`);
        if (path.endsWith("/campaigns")) {
          return [
            { ...on("c1", "Runs"), daily_budget: "2000" },
            { ...on("c2", "Rejected"), daily_budget: "2000" },
            { id: "c3", name: "Off", effective_status: "PAUSED" },
          ];
        }
        if (refuseFeedback && query.fields.includes("ad_review_feedback")) {
          throw new Error("(#100) field refused");
        }
        const feedback = query.fields.includes("ad_review_feedback");
        return [
          {
            id: "a1",
            name: "creo_V1",
            campaign_id: "c1",
            effective_status: "ACTIVE",
          },
          {
            id: "a2",
            name: "creo_V2",
            campaign_id: "c2",
            effective_status: "DISAPPROVED",
            ...(feedback
              ? {
                  ad_review_feedback: {
                    global: {
                      "Circumventing systems": "Ads must not use tricks.",
                    },
                  },
                }
              : {}),
          },
        ];
      },
    },
  });
  const items = await actions.listCampaigns("act_123");
  assert.deepEqual(
    items.map((item) => [item.name, item.on, item.block]),
    [
      ["Runs", true, ""],
      ["Rejected", true, "rejected"],
      ["Off", false, ""],
    ],
  );
  assert.deepEqual(items[1].ads, [
    {
      id: "a2",
      name: "creo_V2",
      kind: "rejected",
      status: "DISAPPROVED",
      feedback: "Ads must not use tricks.",
    },
  ]);
  assert.deepEqual(items[2].ads, []);
  refuseFeedback = true;
  const again = await actions.listCampaigns("123");
  assert.equal(again[1].block, "rejected", "read again without the feedback");
  assert.equal(again[1].ads[0].feedback, "");
  assert.equal(reviewFeedbackText(null), "");
  assert.equal(
    reviewFeedbackText({ global: { A: "x", B: "x" }, placement: { C: "" } }),
    "x · C",
  );
});

test("campaign pickers and the clone preview show how campaigns and ads stand", () => {
  setLang("en");
  const items = campaignItems(
    [
      on("c1", "Runs"),
      on("c2", "Rejected"),
      { id: "c3", name: "Off", effective_status: "PAUSED" },
      { id: "c4", name: "Busy", effective_status: "WITH_ISSUES" },
    ],
    [ad("c1", "ACTIVE"), ad("c2", "DISAPPROVED")],
  );
  assert.deepEqual(
    items.map((item) => campaignStandingLabel(item.standing)),
    ["active", "⚠ not running: rejected", "paused", "with issues"],
  );
  // Without ads the picker still says what the campaign itself does.
  assert.deepEqual(campaignItems([on("c1")], null)[0].standing, {
    kind: "running",
  });
  assert.deepEqual(campaignStanding({ effective_status: "ARCHIVED" }), {
    kind: "gone",
  });
  const html = buildPackageStatsHtml({
    adsets: [{}],
    ads: [{}, {}, {}],
    _adStatuses: [
      { name: "creo_V1", effective_status: "ACTIVE" },
      { name: "creo_V2", effective_status: "DISAPPROVED" },
      { name: "creo_V3", effective_status: "PAUSED" },
    ],
  });
  const { document } = new JSDOM(`<div>${html}</div>`).window;
  const notes = [...document.querySelectorAll(".ma-stat-ads")].map((node) => [
    node.className,
    node.textContent,
  ]);
  assert.deepEqual(notes, [
    ["ma-stat-ads is-rejected", "1 rejected"],
    ["ma-stat-ads is-paused", "1 paused"],
  ]);
  assert.match(
    document.querySelector(".ma-stat-ads").parentElement.title,
    /creo_V2 — rejected/,
  );
});

test("Reports marks accounts whose campaigns are on but rejected", async () => {
  const browser = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=111",
  });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    localStorage: globalThis.localStorage,
  };
  Object.assign(globalThis, {
    window: browser.window,
    document: browser.window.document,
    localStorage: browser.window.localStorage,
  });
  setLang("en");
  try {
    const state = new MirrorAdsState();
    Object.assign(state, {
      sessionReady: true,
      token: "x",
      accounts: [
        { id: "111", name: "Rejected one" },
        { id: "222", name: "Fine one" },
      ],
      reportShowEmpty: true,
    });
    const CAMPAIGNS = {
      111: [on("c11", "Stuck campaign"), on("c12", "Good campaign")],
      222: [on("c21", "Runner")],
    };
    const ADS = {
      111: [
        {
          id: "a1",
          name: "creo_V1",
          campaign_id: "c11",
          effective_status: "DISAPPROVED",
        },
        {
          id: "a2",
          name: "creo_V2",
          campaign_id: "c12",
          effective_status: "ACTIVE",
        },
      ],
      222: [
        {
          id: "a3",
          name: "creo_V3",
          campaign_id: "c21",
          effective_status: "ACTIVE",
        },
      ],
    };
    const id = (path) => path.match(/act_(\d+)/)[1];
    const dom = {};
    const services = createServices({
      state,
      dom,
      logger: { log() {} },
      overrides: {
        graphClient: {
          graphFetch: async (path) => ({
            currency: "USD",
            timezone_name: "Europe/Moscow",
            timezone_offset_hours_utc: 3,
            account_status: 1,
            campaigns: { data: CAMPAIGNS[id(path)] },
            ads: {
              data: ADS[id(path)].map(({ campaign_id, effective_status }) => ({
                campaign_id,
                effective_status,
              })),
            },
          }),
          graphGetAll: async (path, query = {}) => {
            if (path.endsWith("/adrules_library")) return [];
            if (path.endsWith("/campaigns")) return CAMPAIGNS[id(path)];
            if (path.endsWith("/ads")) return ADS[id(path)];
            if (query.breakdowns) return [];
            return [];
          },
        },
        sessionService: { initializeSession: async () => {} },
      },
    });
    services.panelController.mount();
    const panel = () => dom.root.querySelector("#mirrorads-root-panel-reports");
    await services.reportsView.load();
    services.reportsView.render();
    const chip = panel().querySelector(".ma-rep-blocked");
    assert.equal(chip.textContent, "rejected: 1");
    assert.match(chip.title, /Stuck campaign — rejected \(rejected: 1\)/);
    const counts = Object.fromEntries(
      [...panel().querySelectorAll('[data-report^="camp:"]')].map((button) => [
        button.dataset.report.slice(5),
        button.querySelector("em").textContent,
      ]),
    );
    assert.deepEqual(counts, {
      all: "3",
      active: "2",
      inactive: "1",
      blocked: "1",
      spend: "0",
    });
    panel().querySelector('[data-report="camp:blocked"]').click();
    assert.deepEqual(
      [...panel().querySelectorAll(".ma-rep-row .ma-rep-acct > b")].map(
        (name) => name.textContent,
      ),
      ["Rejected one"],
    );
    // The campaign list under the line shows the ads with their statuses.
    panel().querySelector('[data-report="camps:111"]').click();
    for (let round = 0; round < 10; round += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const camps = [...panel().querySelectorAll(".ma-rep-camp")].map((node) => [
      node.querySelector(".ma-rep-cname b").textContent,
      node.querySelector(".ma-ad-block")?.textContent || "",
      [...node.querySelectorAll(".ma-ad")].map((chip) => chip.textContent),
    ]);
    assert.deepEqual(camps, [
      ["Good campaign", "", ["creo_V2active"]],
      ["Stuck campaign", "not running: rejected", ["creo_V1rejected"]],
    ]);
    services.panelController.destroy();
  } finally {
    Object.assign(globalThis, previous);
    browser.window.close();
  }
});
