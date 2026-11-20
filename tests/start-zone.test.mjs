import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { createServices } from "../src/app/create-services.mjs";
import { applyCloneOverrides } from "../src/domain/clone-overrides.mjs";
import { MirrorAdsState } from "../src/state/mirror-ads-state.mjs";
import {
  saveStartZoneMode,
  saveViewerZone,
  startZoneMode,
  viewerZone,
} from "../src/state/zone-settings.mjs";
import { setLang } from "../src/ui/i18n.mjs";
import { accountZones, startZoneHint } from "../src/ui/start-zone-view.mjs";

const account = (id, zone, offset) => ({
  id,
  name: `Acc ${id}`,
  raw: {
    account_status: 1,
    funding_source: "1",
    timezone_name: zone,
    timezone_offset_hours_utc: offset,
  },
});
const ACCOUNTS = [
  account("1001", "America/Los_Angeles", -8),
  account("1002", "Asia/Bangkok", 7),
  account("1003", "Europe/Moscow", 3),
  account("1004", "Asia/Bangkok", 7),
  { id: "1005", name: "Fixed", raw: { timezone_offset_hours_utc: 5 } },
];

function withStorage(run) {
  const { window } = new JSDOM("", { url: "https://adsmanager.facebook.com/" });
  const previous = globalThis.localStorage;
  globalThis.localStorage = window.localStorage;
  try {
    return run(window.localStorage);
  } finally {
    globalThis.localStorage = previous;
    window.close();
  }
}

test("each zone of the accounts once, west to east", () => {
  assert.deepEqual(accountZones(ACCOUNTS), [
    { label: "UTC-8", zone: "America/Los_Angeles" },
    { label: "UTC+3", zone: "Europe/Moscow" },
    { label: "UTC+5", zone: "Etc/GMT-5" },
    { label: "UTC+7", zone: "Asia/Bangkok" },
  ]);
});

test("the switch and my zone are remembered between visits", () => {
  withStorage((storage) => {
    const state = new MirrorAdsState();
    assert.equal(startZoneMode(state), "account", "account time by default");
    saveStartZoneMode(state, "viewer");
    saveStartZoneMode(state, "nonsense");
    saveViewerZone(state, "Europe/Kiev");
    assert.equal(storage.getItem("mirrorads.clone.startZone"), "viewer");
    const next = new MirrorAdsState();
    assert.equal(startZoneMode(next), "viewer");
    assert.equal(viewerZone(next), "Europe/Kiev");
    // The same "my time" as in Reports.
    assert.equal(storage.getItem("mirrorads.report.zone"), "Europe/Kiev");
    saveViewerZone(next, "");
    assert.equal(storage.getItem("mirrorads.report.zone"), null);
  });
});

test("the hint turns a typed start into every account's clock, or mine", () => {
  setLang("en");
  withStorage(() => {
    const state = new MirrorAdsState();
    saveViewerZone(state, "Europe/Kiev");
    const NOW = Date.UTC(2026, 10, 20, 12);
    state.massOverrides = { budget: "", bid: "", start: "" };
    assert.match(
      startZoneHint(state, ACCOUNTS, NOW),
      /on its own clock: accounts in different zones/,
    );
    state.massOverrides.start = "2026-11-21T05:00";
    // Account time: 05:00 there is, on my Kyiv clock…
    assert.equal(
      startZoneHint(state, ACCOUNTS, NOW),
      "21.11 05:00 on each account's clock. In your time (Kiev (UTC+2)): UTC-8 — 21.11 15:00, UTC+3 — 21.11 04:00, UTC+5 — 21.11 02:00, UTC+7 — 21.11 00:00.",
    );
    // My time: one moment, shown on each account's clock.
    saveStartZoneMode(state, "viewer");
    assert.equal(
      startZoneHint(state, ACCOUNTS, NOW),
      "All start at one moment: 21.11 05:00 your time (Kiev (UTC+2)). On the accounts' clocks: UTC-8 — 20.11 19:00, UTC+3 — 21.11 06:00, UTC+5 — 21.11 08:00, UTC+7 — 21.11 10:00.",
    );
    // The typed time in my zone is what every copy gets.
    const { packageData } = applyCloneOverrides(
      { campaign: {}, adsets: [{ id: "s", start_time: "" }] },
      state.massOverrides,
      { currency: "USD", timeZone: viewerZone(state) },
    );
    assert.equal(packageData.adsets[0].start_time, "2026-11-21T03:00:00.000Z");
  });
});

test("the clone tab shows the switch, my zone picker and the live hint", async () => {
  const browser = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1001",
  });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    localStorage: globalThis.localStorage,
    HTMLSelectElement: globalThis.HTMLSelectElement,
  };
  Object.assign(globalThis, {
    window: browser.window,
    document: browser.window.document,
    localStorage: browser.window.localStorage,
    HTMLSelectElement: browser.window.HTMLSelectElement,
  });
  setLang("en");
  try {
    const state = new MirrorAdsState();
    Object.assign(state, {
      accounts: ACCOUNTS,
      massOverridesOpen: true,
      activeTab: "clone",
    });
    const dom = {};
    const services = createServices({
      state,
      dom,
      logger: { log() {} },
      overrides: { sessionService: { initializeSession: async () => {} } },
    });
    services.panelController.mount();
    state.uiReady = true;
    services.massCloneView.renderOverrides(true);
    const root = dom.root;
    const zoneButtons = () =>
      [...root.querySelectorAll("[data-start-zone]")].map((button) => [
        button.dataset.startZone,
        button.classList.contains("is-on"),
      ]);
    assert.deepEqual(zoneButtons(), [
      ["account", true],
      ["viewer", false],
    ]);
    assert.equal(root.querySelector("[data-start-viewer-zone]"), null);
    root.querySelector('[data-start-zone="viewer"]').click();
    assert.deepEqual(zoneButtons(), [
      ["account", false],
      ["viewer", true],
    ]);
    const picker = root.querySelector("[data-start-viewer-zone]");
    assert.ok(picker, "my zone can be picked");
    picker.value = "Asia/Bangkok";
    picker.dispatchEvent(new browser.window.Event("change", { bubbles: true }));
    assert.equal(viewerZone(state), "Asia/Bangkok");
    const start = root.querySelector('[data-override="start"]');
    start.value = "2026-12-01T05:00";
    start.dispatchEvent(new browser.window.Event("input", { bubbles: true }));
    assert.match(
      root.querySelector("[data-start-hint]").textContent,
      /^All start at one moment: 01\.12 05:00 your time \(Bangkok \(UTC\+7\)\)\. On the accounts' clocks: UTC-8 — 30\.11 14:00/,
    );
    assert.equal(
      root.querySelector('[data-override="start"]'),
      start,
      "typing never rebuilds the field",
    );
    services.panelController.destroy();
  } finally {
    Object.assign(globalThis, previous);
    browser.window.close();
  }
});
