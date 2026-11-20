import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import {
  accountOffsetMinutes,
  accountZoneLabel,
  zoneCounts,
} from "../src/domain/account-zone.mjs";
import {
  adsManagerAccountUrl,
  todayRange,
} from "../src/domain/ads-manager-links.mjs";
import { getAccountLabel } from "../src/domain/creative.mjs";
import { AccountPicks, inZone } from "../src/ui/account-picks.mjs";
import { MassCloneView } from "../src/ui/mass-clone-view.mjs";

const account = (id, name, offset, extra = {}) => ({
  id,
  name,
  raw: {
    account_status: 1,
    currency: "USD",
    funding_source: `fs-${id}`,
    timezone_offset_hours_utc: offset,
    ...extra,
  },
});

const ACCOUNTS = [
  account("1111111111111", "Bangkok A", 7),
  account("2222222222222", "Moscow B", 3),
  account("3333333333333", "Bangkok C", 7),
  account("4444444444444", "New York D", -5),
  account("5555555555555", "Kolkata E", 5.5),
  { id: "6666666666666", name: "No zone", raw: { account_status: 1 } },
];

test("an account's time zone is read from the account list", () => {
  assert.equal(accountOffsetMinutes(ACCOUNTS[0]), 420);
  assert.equal(accountOffsetMinutes(ACCOUNTS[3]), -300);
  assert.equal(accountOffsetMinutes(ACCOUNTS[4]), 330);
  assert.equal(accountOffsetMinutes(ACCOUNTS[5]), null);
  assert.equal(accountZoneLabel(ACCOUNTS[0]), "UTC+7");
  assert.equal(accountZoneLabel(ACCOUNTS[3]), "UTC-5");
  assert.equal(accountZoneLabel(ACCOUNTS[4]), "UTC+5:30");
  assert.equal(accountZoneLabel(ACCOUNTS[5]), "");
  assert.deepEqual(zoneCounts(ACCOUNTS), [
    { offset: -300, label: "UTC-5", count: 1 },
    { offset: 180, label: "UTC+3", count: 1 },
    { offset: 330, label: "UTC+5:30", count: 1 },
    { offset: 420, label: "UTC+7", count: 2 },
  ]);
  // The pickers show the zone with the name.
  assert.equal(
    getAccountLabel(ACCOUNTS[0]),
    "Bangkok A · UTC+7 [1111111111111]",
  );
  assert.equal(getAccountLabel(ACCOUNTS[5]), "No zone [6666666666666]");
});

test("accounts open in Ads Manager on today, by the account's own date", () => {
  // 20 Nov 2026, 22:30 UTC: already the 21st in Bangkok, still the 20th in New York.
  const nowMs = Date.UTC(2026, 10, 20, 22, 30);
  assert.equal(
    todayRange(nowMs, "Asia/Bangkok"),
    "2026-11-21_2026-11-22,today",
  );
  assert.equal(
    todayRange(nowMs, "America/New_York"),
    "2026-11-20_2026-11-21,today",
  );
  const url = new URL(
    adsManagerAccountUrl("act_1111111111111", {
      timeZone: "Asia/Bangkok",
      nowMs,
    }),
  );
  assert.equal(url.origin, "https://adsmanager.facebook.com");
  assert.equal(url.pathname, "/adsmanager/manage/campaigns");
  assert.equal(url.searchParams.get("act"), "1111111111111");
  assert.equal(url.searchParams.get("date"), "2026-11-21_2026-11-22,today");
  // A month and a year turn over too.
  assert.equal(
    todayRange(Date.UTC(2026, 11, 31, 12), "UTC"),
    "2026-12-31_2027-01-01,today",
  );
});

function setup() {
  const state = {
    accounts: ACCOUNTS,
    massTargets: {},
    massRunning: false,
    massZone: "",
  };
  const view = new MassCloneView({ state, dom: {} });
  view.render = () => {};
  const picks = new AccountPicks({
    state,
    appId: "mirrorads-root",
    graphClient: { graphFetch: async () => ({ data: [] }) },
    massCloneView: view,
    logging: { log: () => {} },
  });
  return { state, view, picks };
}

const ids = (accounts) => accounts.map((item) => item.id);

test("clone targets can be narrowed to one time zone", () => {
  const { state, view, picks } = setup();
  assert.equal(inZone(ACCOUNTS[0], ""), true);
  assert.equal(inZone(ACCOUNTS[0], "420"), true);
  assert.equal(inZone(ACCOUNTS[1], "420"), false);
  assert.equal(inZone(ACCOUNTS[5], "420"), false);

  state.massTargets = {
    1111111111111: { selected: true },
    2222222222222: { selected: true, copies: 3 },
  };
  picks.setZone(420);
  assert.equal(state.massZone, "420");
  assert.deepEqual(ids(view.targetAccounts()), [
    "1111111111111",
    "3333333333333",
  ]);
  assert.equal(
    state.massTargets["2222222222222"].selected,
    false,
    "a hidden account is never cloned into",
  );
  assert.equal(state.massTargets["2222222222222"].copies, 3, "settings kept");
  // The account without a card is not a target at all, zone or not.
  assert.equal(view.hiddenByZone(), 3);

  // A pasted list keeps to the zone and says what it left out.
  const result = picks.applyPasted("3333333333333\n2222222222222");
  assert.deepEqual(result.picked, ["3333333333333"]);
  assert.deepEqual(result.otherZone, ["2222222222222"]);
  assert.match(
    picks.resultText(result),
    /another time zone \(1\): 2222222222222/,
  );

  picks.setZone("");
  assert.equal(view.targetAccounts().length, ACCOUNTS.length - 1);
  assert.equal(view.hiddenByZone(), 0);
});

test("the zone list shows each zone with its count and keeps the choice", () => {
  const { window } = new JSDOM(
    `<div id="root"><section><h3 class="ma-sec ma-sec-split"><span class="ma-sec-title">Accounts</span><input type="search" id="mirrorads-root-clone-search" /></h3><div class="ma-scroll"></div></section></div>`,
  );
  const root = window.document.getElementById("root");
  const { state, view, picks } = setup();
  view.dependencies.dom = { root };
  picks.attach(root);
  view.renderZoneFilter();
  const select = root.querySelector("[data-picks-zone]");
  assert.deepEqual(
    [...select.options].map((option) => option.textContent),
    ["All time zones", "UTC-5 · 1", "UTC+3 · 1", "UTC+5:30 · 1", "UTC+7 · 2"],
  );
  select.value = "180";
  select.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(state.massZone, "180");
  view.renderZoneFilter();
  assert.equal(select.value, "180");
  assert.ok(select.classList.contains("is-on"));
  assert.deepEqual(ids(view.targetAccounts()), ["2222222222222"]);
});

test("the panel opens on Reports, with History and Pixels in the rail", async () => {
  const { createServices } = await import("../src/app/create-services.mjs");
  const { MirrorAdsState } = await import("../src/state/mirror-ads-state.mjs");
  const browser = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1",
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
  try {
    const state = new MirrorAdsState();
    assert.equal(state.activeTab, "reports");
    const dom = {};
    const services = createServices({
      state,
      dom,
      logger: { log() {} },
      overrides: { sessionService: { initializeSession: async () => {} } },
    });
    services.panelController.mount();
    const tabs = [...dom.root.querySelectorAll(".ma-tab")].map(
      (tab) => tab.dataset.tab,
    );
    assert.deepEqual(tabs, [
      "reports",
      "clone",
      "rules",
      "history",
      "assets",
      "export",
    ]);
    // Before the session is ready the tab is shown and waits for accounts.
    const active = dom.root.querySelector(".ma-tab.ma-tab-active");
    assert.equal(active.dataset.tab, "reports");
    assert.ok(
      !dom.root
        .querySelector("#mirrorads-root-panel-reports")
        .classList.contains("ma-hidden"),
    );
    assert.ok(
      dom.root
        .querySelector("#mirrorads-root-panel-export")
        .classList.contains("ma-hidden"),
    );
    assert.match(
      dom.root.querySelector("#mirrorads-root-panel-reports").textContent,
      /report opens by itself/,
    );
    dom.root.querySelector('.ma-tab[data-tab="history"]').click();
    assert.equal(state.activeTab, "history");
    assert.ok(
      !dom.root
        .querySelector("#mirrorads-root-panel-history")
        .classList.contains("ma-hidden"),
    );
    services.panelController.destroy();
  } finally {
    Object.assign(globalThis, previous);
    browser.window.close();
  }
});
