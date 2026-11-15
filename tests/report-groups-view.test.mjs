import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { createServices } from "../src/app/create-services.mjs";
import { MirrorAdsState } from "../src/state/mirror-ads-state.mjs";
import { setLang } from "../src/ui/i18n.mjs";

const lead = (value) => ({ action_type: "lead", value: String(value) });

const META = {
  111: { offset: 7, zone: "Asia/Bangkok", spend: 50, leads: 5 },
  222: { offset: 3, zone: "Europe/Moscow", spend: 30, leads: 2 },
  333: { offset: 7, zone: "Asia/Bangkok", spend: 0, leads: 0 },
};
const ADS = {
  111: [
    { id: "a1", name: "creo_V4", spend: 30, leads: 3, status: "ACTIVE" },
    { id: "a2", name: "promo_V1", spend: 20, leads: 2, status: "ACTIVE" },
  ],
  222: [
    { id: "b1", name: "creo_V4 – Copy", spend: 30, leads: 2, status: "PAUSED" },
  ],
  333: [],
};
const STOP = {
  id: "r1",
  name: "Stop on spend",
  status: "ENABLED",
  evaluation_spec: {
    filters: [
      { field: "entity_type", value: "CAMPAIGN", operator: "EQUAL" },
      { field: "time_preset", value: "TODAY", operator: "EQUAL" },
      { field: "spent", value: 2000, operator: "GREATER_THAN" },
    ],
  },
  execution_spec: { execution_type: "PAUSE" },
  schedule_spec: { schedule_type: "SEMI_HOURLY" },
};
const RULES = { 111: [STOP], 222: [{ ...STOP, status: "DISABLED" }], 333: [] };
const CAMPAIGNS = {
  111: [
    { id: "c11", effective_status: "ACTIVE" },
    { id: "c12", effective_status: "ACTIVE" },
    { id: "c13", effective_status: "PAUSED" },
  ],
  222: [{ id: "c21", effective_status: "ACTIVE" }],
  333: [{ id: "c31", effective_status: "PAUSED" }],
};

function fakeGraph() {
  const calls = [];
  const id = (path) => path.match(/act_(\d+)/)[1];
  return {
    calls,
    graphFetch: async (path) => {
      calls.push(path);
      const meta = META[id(path)];
      return {
        currency: "USD",
        timezone_name: meta.zone,
        timezone_offset_hours_utc: meta.offset,
        account_status: 1,
        created_time: "2026-11-01T00:00:00+0000",
        campaigns: { data: CAMPAIGNS[id(path)] },
      };
    },
    graphGetAll: async (path, query = {}) => {
      calls.push(path);
      const account = id(path);
      if (path.endsWith("/adrules_library")) return RULES[account];
      if (path.endsWith("/ads")) {
        return ADS[account].map((ad) => ({
          id: ad.id,
          name: ad.name,
          effective_status: ad.status,
          campaign: { name: `AGENT_${account}_AU_${ad.name}` },
          adset: { targeting: { geo_locations: { countries: ["AU"] } } },
        }));
      }
      if (query.breakdowns) return [];
      if (query.level === "ad") {
        return ADS[account].map((ad) => ({
          ad_id: ad.id,
          ad_name: ad.name,
          spend: String(ad.spend),
          actions: [lead(ad.leads)],
        }));
      }
      const meta = META[account];
      return meta.spend
        ? [
            {
              campaign_id: CAMPAIGNS[account][0].id,
              spend: String(meta.spend),
              actions: [lead(meta.leads)],
            },
          ]
        : [];
    },
  };
}

async function settle(rounds = 20) {
  for (let index = 0; index < rounds; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

test("Reports shows each account's rules and groups accounts by creative or time zone", async () => {
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
        { id: "111", name: "East" },
        { id: "222", name: "West" },
        { id: "333", name: "Idle" },
      ],
    });
    const dom = {};
    const graph = fakeGraph();
    const services = createServices({
      state,
      dom,
      logger: { log() {} },
      overrides: {
        graphClient: graph,
        sessionService: { initializeSession: async () => {} },
      },
    });
    services.panelController.mount();
    const panel = () => dom.root.querySelector("#mirrorads-root-panel-reports");
    const click = (selector) => {
      const element = panel().querySelector(selector);
      assert.ok(element, `${selector} is on screen`);
      element.click();
    };
    await services.reportsView.load();
    state.reportShowEmpty = true;
    services.reportsView.render();

    // Every line says how it stands with rules.
    const chips = [...panel().querySelectorAll(".ma-rules")].map((chip) => [
      chip.closest(".ma-rep-row").querySelector(".ma-rep-acct b").textContent,
      chip.className.replace("ma-rules ", ""),
      chip.firstElementChild.nextElementSibling.textContent,
    ]);
    assert.deepEqual(chips, [
      ["East", "ma-rules-on", "rules: 1"],
      ["West", "ma-rules-off", "rules off"],
      ["Idle", "ma-rules-none", "no rules"],
    ]);
    assert.match(
      panel().querySelector(".ma-rules-on .ma-rules-pop").textContent,
      /Stop on spend[\s\S]*switch off · campaigns · every 30 min[\s\S]*Spend > 20 USD · today/,
    );
    // Only the accounts without a rule switched on.
    click('[data-report="norules"]');
    assert.deepEqual(
      [...panel().querySelectorAll(".ma-rep-row .ma-rep-acct > b")].map(
        (name) => name.textContent,
      ),
      ["West", "Idle"],
    );
    click('[data-report="norules"]');

    // Campaigns: all of them by default, then those on, off or spending.
    const counts = () =>
      Object.fromEntries(
        [...panel().querySelectorAll('[data-report^="camp:"]')].map(
          (button) => [
            button.dataset.report.slice(5),
            button.querySelector("em").textContent,
          ],
        ),
      );
    assert.deepEqual(counts(), {
      all: "5",
      active: "3",
      inactive: "2",
      spend: "2",
    });
    assert.ok(
      panel()
        .querySelector('[data-report="camp:all"]')
        .classList.contains("is-on"),
    );
    const names = () =>
      [...panel().querySelectorAll(".ma-rep-row .ma-rep-acct > b")].map(
        (name) => name.textContent,
      );
    const notes = (selector) =>
      [...panel().querySelectorAll(`.ma-rep-row ${selector}`)].map(
        (chip) => chip.textContent,
      );
    click('[data-report="camp:spend"]');
    assert.deepEqual(names(), ["East", "West"]);
    assert.deepEqual(notes(".ma-rep-spending"), [
      "with spend: 1",
      "with spend: 1",
    ]);
    click('[data-report="camp:active"]');
    assert.deepEqual(names(), ["East", "West"]);
    assert.deepEqual(notes(".ma-rep-idle"), ["no spend: 1"]);
    click('[data-report="camp:inactive"]');
    assert.deepEqual(names(), ["East", "Idle"]);
    click('[data-report="camp:all"]');

    // Groups by creative read the ads once, then add them up.
    click('[data-report="view:groups"]');
    click('[data-report="groupby:creative"]');
    await settle();
    const groups = () =>
      [...panel().querySelectorAll(".ma-grp-row")].map((row) => [
        row.querySelector(".ma-grp-name b").textContent,
        row.querySelector(".ma-grp-accts b").textContent,
        row.querySelector(".ma-grp-accts small").textContent,
        row.querySelector(".is-spend b").textContent,
      ]);
    assert.deepEqual(groups(), [
      ["creo_V4", "1", "of 2", "$60.00"],
      ["promo_V1", "1", "of 1", "$20.00"],
      ["No ads", "0", "of 1", "$0.00"],
    ]);
    const adReads = graph.calls.filter((call) => call.endsWith("/ads")).length;
    assert.equal(adReads, 3);
    // A group opens on click, and with the keyboard.
    const first = panel().querySelector(".ma-grp-row");
    first.click();
    assert.deepEqual(
      [...panel().querySelectorAll(".ma-grp-member .ma-rep-acct > b")].map(
        (name) => name.textContent,
      ),
      ["East", "West"],
    );
    panel()
      .querySelector(".ma-grp-row")
      .dispatchEvent(
        new browser.window.KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
        }),
      );
    assert.equal(panel().querySelectorAll(".ma-grp-member").length, 0);

    // Traits of the accounts need no more reading; ads are not read again.
    // Idle has only a paused campaign: it does not run.
    click('[data-report="groupby:zone"]');
    assert.deepEqual(
      groups().map(([label, running, of]) => [label, running, of]),
      [
        ["UTC+3", "1", "of 1"],
        ["UTC+7", "1", "of 2"],
      ],
    );
    click('[data-report="groupby:creative"]');
    await settle();
    assert.equal(
      graph.calls.filter((call) => call.endsWith("/ads")).length,
      adReads,
    );
    // Sorting by leads, then the other way round.
    click('[data-report="gsort:leads"]');
    assert.equal(groups()[0][0], "creo_V4");
    click('[data-report="gsort:leads"]');
    assert.equal(groups()[0][0], "promo_V1");
    // The view and the trait are remembered.
    assert.equal(localStorage.getItem("mirrorads.report.view"), "groups");
    assert.equal(localStorage.getItem("mirrorads.report.groupBy"), "creative");
    services.panelController.destroy();
  } finally {
    Object.assign(globalThis, previous);
    browser.window.close();
  }
});
