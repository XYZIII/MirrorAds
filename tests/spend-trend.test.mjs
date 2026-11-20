import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { createServices } from "../src/app/create-services.mjs";
import {
  assignSlots,
  bucketDailyRows,
  bucketHourlyRows,
  niceTicks,
  trendFrame,
  trendSeries,
} from "../src/domain/spend-trend.mjs";
import { ReportService } from "../src/reports/report-service.mjs";
import { MirrorAdsState } from "../src/state/mirror-ads-state.mjs";
import { setLang } from "../src/ui/i18n.mjs";

const HOURLY = "hourly_stats_aggregated_by_advertiser_time_zone";
const hour = (date, h, spend) => ({
  date_start: date,
  [HOURLY]: `${String(h).padStart(2, "0")}:00:00 - ${String(h).padStart(2, "0")}:59:59`,
  spend: String(spend),
});
// 20 Nov 2026, 15:00 in Moscow.
const NOW = Date.UTC(2026, 10, 20, 12);

test("a day is drawn by the hour, longer periods by the day", () => {
  const today = trendFrame({
    period: "today",
    nowMs: NOW,
    zone: "Europe/Moscow",
  });
  assert.equal(today.unit, "hour");
  assert.equal(today.count, 24);
  assert.equal(today.labels[0], "00");
  assert.equal(today.labels[23], "23");
  assert.equal(today.days[0], "20.11");
  const week = trendFrame({ period: "last7", nowMs: NOW, zone: "UTC" });
  assert.equal(week.unit, "day");
  assert.deepEqual(week.labels, [
    "14.11",
    "15.11",
    "16.11",
    "17.11",
    "18.11",
    "19.11",
    "20.11",
  ]);
  const hours = trendFrame({
    period: "custom",
    custom: {
      since: "2026-11-19",
      until: "2026-11-20",
      withTime: true,
      sinceHour: 18,
      untilHour: 5,
    },
    nowMs: NOW,
    zone: "UTC",
  });
  assert.equal(hours.unit, "hour");
  assert.equal(hours.count, 12);
  assert.equal(hours.labels[0], "18");
  assert.equal(hours.labels[6], "00");
  assert.equal(hours.days[6], "20.11");
});

test("hourly and daily rows land in their buckets", () => {
  const startMs = Date.UTC(2026, 10, 19, 21); // 00:00 on the 20th in Moscow
  const hourly = bucketHourlyRows(
    [
      hour("2026-11-20", 0, 1.5),
      hour("2026-11-20", 13, 2),
      hour("2026-11-20", 13, 0.5),
      hour("2026-11-19", 23, 9), // before the window
    ],
    {
      accountZone: "Europe/Moscow",
      startMs,
      endMs: startMs + 24 * 3600000,
      unit: "hour",
      count: 24,
    },
  );
  assert.equal(hourly[0], 1.5);
  assert.equal(hourly[13], 2.5);
  assert.equal(
    hourly.reduce((sum, value) => sum + value, 0),
    4,
  );
  // Days of a Bangkok account on a Moscow week: each to the nearest day.
  const daily = bucketDailyRows(
    [
      { date_start: "2026-11-14", spend: "3" },
      { date_start: "2026-11-20", spend: "4" },
      { date_start: "2026-11-21", spend: "100" },
    ],
    {
      accountZone: "Asia/Bangkok",
      startMs: Date.UTC(2026, 10, 13, 21),
      count: 7,
    },
  );
  assert.deepEqual(daily, [3, 0, 0, 0, 0, 0, 4]);
});

test("breakdowns: the biggest accounts, zones west to east, live first", () => {
  const rows = [
    { accountId: "1", name: "A", offsetMinutes: 420, health: "live" },
    { accountId: "2", name: "B", offsetMinutes: 180, health: "live" },
    { accountId: "3", name: "C", offsetMinutes: 420, health: "banned" },
    { accountId: "4", name: "D", offsetMinutes: -300, health: "live" },
    { accountId: "5", name: "E", offsetMinutes: 180, health: "live" },
    { accountId: "6", name: "F", offsetMinutes: 60, health: "live" },
    { accountId: "7", name: "No data", offsetMinutes: 0, health: "live" },
  ];
  const buckets = new Map([
    ["1", [10, 0]],
    ["2", [6, 5]],
    ["3", [1, 1]],
    ["4", [0, 8]],
    ["5", [3, 0]],
    ["6", [0, 1]],
  ]);
  const total = trendSeries(rows, buckets, "total", 2);
  assert.deepEqual(
    total.map((item) => [item.key, item.values]),
    [["total", [20, 15]]],
  );
  const accounts = trendSeries(rows, buckets, "accounts", 2);
  assert.deepEqual(
    accounts.map((item) => [item.key, item.total, item.other]),
    [
      ["2", 11, false],
      ["1", 10, false],
      ["4", 8, false],
      ["5", 3, false],
      ["other", 3, true],
    ],
  );
  assert.equal(accounts[4].size, 2);
  const zones = trendSeries(rows, buckets, "zones", 2);
  assert.deepEqual(
    zones.map((item) => [item.label, item.total]),
    [
      ["UTC-5", 8],
      ["UTC+1", 1],
      ["UTC+3", 14],
      ["UTC+7", 12],
    ],
  );
  const status = trendSeries(rows, buckets, "status", 2);
  assert.deepEqual(
    status.map((item) => [item.key, item.values]),
    [
      ["live", [19, 14]],
      ["dead", [1, 1]],
    ],
  );
});

test("colours stay with their series, and the axis has round steps", () => {
  const memory = new Map();
  assert.deepEqual(
    [...assignSlots(["a", "b", "c"], memory, 4)],
    [
      ["a", 0],
      ["b", 1],
      ["c", 2],
    ],
  );
  // "a" leaves: the others keep their colours, the newcomer takes a free one.
  assert.deepEqual(
    [...assignSlots(["b", "c", "d"], memory, 4)],
    [
      ["b", 1],
      ["c", 2],
      ["d", 0],
    ],
  );
  assert.deepEqual(niceTicks(87), [0, 25, 50, 75, 100]);
  assert.deepEqual(niceTicks(4.2), [0, 2, 4, 6]);
  assert.deepEqual(niceTicks(0), [0, 1]);
});

test("an account's spend over time is read on the report's clock, in USD", async () => {
  const calls = [];
  const service = new ReportService({
    graphClient: {
      graphFetch: async () => ({
        currency: "EUR",
        account_currency_ratio_to_usd: 0.5,
        timezone_name: "Europe/Moscow",
        account_status: 1,
      }),
      graphGetAll: async (path, query) => {
        calls.push(query);
        if (query.breakdowns) {
          return [hour("2026-11-20", 9, 2), hour("2026-11-20", 10, 3)];
        }
        return [{ date_start: "2026-11-20", spend: "5" }];
      },
    },
  });
  const report = {
    period: "today",
    custom: null,
    nowMs: NOW,
    zoneMode: "account",
    viewerZone: "Europe/Moscow",
  };
  const frame = trendFrame({
    period: "today",
    nowMs: NOW,
    zone: "Europe/Moscow",
  });
  const result = await service.loadSpendSeries(
    { accountId: "1", spend: 5 },
    report,
    frame,
  );
  assert.equal(result.values[9], 4, "2 EUR at 0.5 per USD");
  assert.equal(result.values[10], 6);
  assert.equal(calls[0].level, "account");
  assert.equal(calls[0].fields, "spend");
  assert.equal(calls[0].time_increment, 1);
  assert.equal(calls[0].breakdowns, HOURLY);
  assert.equal(JSON.parse(calls[0].time_range).since, "2026-11-20");

  // No hourly rows from Meta for a spending account: said, not guessed.
  const quiet = new ReportService({
    graphClient: {
      graphFetch: async () => ({
        currency: "USD",
        timezone_name: "Europe/Moscow",
        account_status: 1,
      }),
      graphGetAll: async () => [],
    },
  });
  assert.deepEqual(
    await quiet.loadSpendSeries({ accountId: "2", spend: 5 }, report, frame),
    { values: null, reason: "hourly" },
  );
});

test("Reports draws the spend chart on demand, with a table and hover details", async () => {
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
      ],
      reportPeriod: "last7",
    });
    const META = {
      111: { zone: "Asia/Bangkok", offset: 7, daily: [10, 20] },
      222: { zone: "Europe/Moscow", offset: 3, daily: [5, 0] },
    };
    const trendReads = [];
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
            timezone_name: META[id(path)].zone,
            timezone_offset_hours_utc: META[id(path)].offset,
            account_status: 1,
            campaigns: { data: [] },
          }),
          graphGetAll: async (path, query = {}) => {
            if (path.endsWith("/adrules_library")) return [];
            const meta = META[id(path)];
            if (query.level === "account") {
              trendReads.push(id(path));
              const range = JSON.parse(query.time_range);
              const last = new Date(`${range.until}T00:00:00Z`);
              return meta.daily.map((spend, index) => ({
                date_start: new Date(
                  last.getTime() - (meta.daily.length - 1 - index) * 86400000,
                )
                  .toISOString()
                  .slice(0, 10),
                spend: String(spend),
              }));
            }
            if (query.breakdowns) return [];
            const total = meta.daily.reduce((sum, value) => sum + value, 0);
            return [{ campaign_id: "c", spend: String(total) }];
          },
        },
        sessionService: { initializeSession: async () => {} },
      },
    });
    services.panelController.mount();
    const panel = () => dom.root.querySelector("#mirrorads-root-panel-reports");
    await services.reportsView.load();
    assert.equal(panel().querySelector(".ma-trend"), null, "off by default");
    assert.deepEqual(trendReads, [], "nothing read while it is off");
    panel().querySelector('[data-report="trend:toggle"]').click();
    for (let round = 0; round < 20; round += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    assert.deepEqual(trendReads.sort(), ["111", "222"]);
    const card = panel().querySelector(".ma-trend");
    assert.match(card.querySelector(".ma-trend-head b").textContent, /by day/);
    assert.equal(card.querySelectorAll("[data-trend-col]").length, 7);
    assert.equal(card.querySelector(".ma-trend-peak").textContent, "$20.00");
    assert.equal(card.querySelector(".ma-trend-legend"), null, "one series");
    assert.equal(localStorage.getItem("mirrorads.report.trend"), "1");

    // By account: a legend with each account's total.
    panel().querySelector('[data-report="trendby:accounts"]').click();
    assert.deepEqual(
      [...panel().querySelectorAll(".ma-trend-key")].map(
        (key) => key.textContent,
      ),
      ["East$30.00", "West$5.00"],
    );
    // Hover (or focus) lists every series of the column.
    const columns = panel().querySelectorAll("[data-trend-col]");
    columns[5].dispatchEvent(
      new browser.window.Event("focusin", { bubbles: true }),
    );
    const tip = panel().querySelector("[data-trend-tip]");
    assert.equal(tip.hidden, false);
    assert.deepEqual(
      [...tip.querySelectorAll(".ma-trend-tiprow")].map(
        (row) => row.textContent,
      ),
      ["$15.00Total", "$10.00East", "$5.00West"],
    );
    // The same numbers as a table.
    panel().querySelector('[data-report="trend:table"]').click();
    const cells = [...panel().querySelectorAll(".ma-trend-table tbody tr")][6]
      .textContent;
    assert.match(cells, /\$20\.00\$0\.00\$20\.00/);
    // Switched off, it is gone and stays off.
    panel().querySelector('[data-report="trend:toggle"]').click();
    assert.equal(panel().querySelector(".ma-trend"), null);
    assert.equal(localStorage.getItem("mirrorads.report.trend"), "0");
    services.panelController.destroy();
  } finally {
    Object.assign(globalThis, previous);
    browser.window.close();
  }
});
