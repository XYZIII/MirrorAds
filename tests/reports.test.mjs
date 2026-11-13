import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDays,
  dateInZone,
  filterHourlyRows,
  formatUtcOffset,
  localHourToUtcMs,
  periodDates,
  summarizeInsights,
  toUsd,
  totalReport,
  viewerWindow,
  zoneOffsetMinutes,
} from "../src/domain/report-time.mjs";
import { ReportService } from "../src/reports/report-service.mjs";

const KYIV = "Europe/Kiev";
const BANGKOK = "Asia/Bangkok"; // UTC+7
const LA = "America/Los_Angeles"; // UTC-8 in November
// 2026-11-14 01:25 in Kyiv (UTC+2).
const NOW = Date.UTC(2026, 10, 13, 23, 25);

const hourLabel = (hour) =>
  `${String(hour).padStart(2, "0")}:00:00 - ${String(hour).padStart(2, "0")}:59:59`;

test("the same instant is a different date in each zone", () => {
  assert.equal(dateInZone(NOW, KYIV), "2026-11-14");
  assert.equal(dateInZone(NOW, BANGKOK), "2026-11-14");
  assert.equal(dateInZone(NOW, LA), "2026-11-13");
  assert.equal(zoneOffsetMinutes(NOW, BANGKOK), 420);
  assert.equal(zoneOffsetMinutes(NOW, LA), -480);
  assert.equal(formatUtcOffset(420), "UTC+7");
  assert.equal(formatUtcOffset(-210), "UTC-3:30");
});

test("local hours convert to UTC, including across a clock change", () => {
  assert.equal(
    localHourToUtcMs("2026-11-14", 0, KYIV),
    Date.UTC(2026, 10, 13, 22),
  );
  assert.equal(
    localHourToUtcMs("2026-11-14", 5, BANGKOK),
    Date.UTC(2026, 10, 13, 22),
  );
  // Kyiv is UTC+3 in summer.
  assert.equal(
    localHourToUtcMs("2026-07-01", 0, KYIV),
    Date.UTC(2026, 5, 30, 21),
  );
});

test("periods are whole days ending today", () => {
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.deepEqual(periodDates("today", "2026-11-14"), {
    since: "2026-11-14",
    until: "2026-11-14",
  });
  assert.deepEqual(periodDates("yesterday", "2026-11-14"), {
    since: "2026-11-13",
    until: "2026-11-13",
  });
  assert.deepEqual(periodDates("last7", "2026-11-14"), {
    since: "2026-11-08",
    until: "2026-11-14",
  });
});

test("the viewer's day maps onto two account dates", () => {
  const bangkok = viewerWindow("today", NOW, KYIV, BANGKOK);
  assert.equal(bangkok.startMs, Date.UTC(2026, 10, 13, 22));
  assert.equal(bangkok.endMs, Date.UTC(2026, 10, 14, 22));
  // Kyiv's 14th runs 05:00 on the 14th to 05:00 on the 15th in Bangkok.
  assert.deepEqual(bangkok.accountRange, {
    since: "2026-11-14",
    until: "2026-11-15",
  });
  const la = viewerWindow("today", NOW, KYIV, LA);
  assert.deepEqual(la.accountRange, {
    since: "2026-11-13",
    until: "2026-11-14",
  });
});

test("hourly rows are cut by the viewer's day, not the account's", () => {
  const { startMs, endMs } = viewerWindow("today", NOW, KYIV, BANGKOK);
  const row = (date, hour, spend) => ({
    date_start: date,
    hourly_stats_aggregated_by_advertiser_time_zone: hourLabel(hour),
    spend: String(spend),
    impressions: "10",
    clicks: "1",
  });
  const rows = [
    row("2026-11-14", 4, 100), // 21:00 UTC on the 13th: still Kyiv's yesterday
    row("2026-11-14", 5, 7), // 22:00 UTC: Kyiv's midnight
    row("2026-11-14", 23, 5),
    row("2026-11-15", 4, 3), // last hour of Kyiv's today
    row("2026-11-15", 5, 100), // Kyiv's tomorrow
  ];
  const kept = filterHourlyRows(rows, BANGKOK, startMs, endMs);
  assert.deepEqual(
    kept.map((item) => item.spend),
    ["7", "5", "3"],
  );
  const summary = summarizeInsights(kept);
  assert.equal(summary.spend, 15);
  assert.equal(summary.impressions, 30);
  // Hourly rows carry no actions: conversions are unknown, not zero.
  assert.equal(summary.leads, null);
  assert.equal(summary.purchases, null);
});

test("leads and purchases are counted once, by priority", () => {
  const summary = summarizeInsights([
    {
      spend: "50",
      actions: [
        { action_type: "lead", value: "10" },
        { action_type: "offsite_conversion.fb_pixel_lead", value: "10" },
        { action_type: "purchase", value: "2" },
        { action_type: "omni_purchase", value: "2" },
        { action_type: "link_click", value: "90" },
      ],
    },
    { spend: "5", actions: [{ action_type: "link_click", value: "3" }] },
  ]);
  assert.equal(summary.spend, 55);
  assert.equal(summary.leads, 10);
  assert.equal(summary.purchases, 2);
});

test("spend converts to USD with Meta's ratio", () => {
  assert.equal(toUsd(10, "USD", 0), 10);
  assert.equal(toUsd(90, "EUR", 0.9), 100);
  assert.equal(toUsd(90, "EUR", 0), null);
  const total = totalReport([
    { spend: 10, spendUsd: 10, leads: 2, purchases: 1 },
    { spend: 90, spendUsd: 100, leads: null, purchases: null },
    { spend: 5, spendUsd: null, leads: 1, purchases: 0 },
    { spend: 0, spendUsd: 0, leads: 0, purchases: 0 },
    { spend: 0, spendUsd: null, leads: null, purchases: null, error: "x" },
  ]);
  assert.equal(total.spendUsd, 110);
  assert.equal(total.accounts, 3);
  assert.equal(total.unconverted, 1);
  assert.equal(total.leads, 3);
  assert.equal(total.purchases, 1);
});

function createService({ hourlyRows, dailyRows, meta, failFor = "" }) {
  const calls = [];
  const service = new ReportService({
    graphClient: {
      graphFetch: async (path) => {
        calls.push(path);
        if (path === `act_${failFor}`)
          throw new Error("(#10) Permission Denied");
        return meta[path.replace("act_", "")];
      },
      graphGetAll: async (path, query) => {
        calls.push({ path, hourly: Boolean(query.breakdowns), query });
        const id = path.split("/")[0].replace("act_", "");
        return query.breakdowns ? hourlyRows[id] || [] : dailyRows[id] || [];
      },
    },
  });
  return { service, calls };
}

const META = {
  111: {
    currency: "USD",
    timezone_name: BANGKOK,
    timezone_offset_hours_utc: 7,
  },
  222: {
    currency: "EUR",
    account_currency_ratio_to_usd: 0.9,
    timezone_name: KYIV,
    timezone_offset_hours_utc: 2,
  },
  333: { currency: "USD", timezone_name: LA, timezone_offset_hours_utc: -8 },
};
const ACCOUNTS = [
  { id: "111", name: "Bangkok" },
  { id: "222", name: "Kyiv" },
  { id: "333", name: "LA" },
];

test("account mode asks each account for its own day", async () => {
  const { service, calls } = createService({
    meta: META,
    hourlyRows: {},
    dailyRows: {
      111: [{ spend: "20", actions: [{ action_type: "lead", value: "4" }] }],
      222: [{ spend: "90", actions: [] }],
    },
  });
  const report = await service.loadReport({
    accounts: ACCOUNTS,
    period: "today",
    zoneMode: "account",
    viewerZone: KYIV,
    nowMs: NOW,
  });
  assert.equal(calls.filter((call) => call.hourly).length, 0);
  const range = (id) =>
    JSON.parse(
      calls.find((call) => call.path === `act_${id}/insights`).query.time_range,
    );
  assert.deepEqual(range("111"), { since: "2026-11-14", until: "2026-11-14" });
  // Los Angeles is still on the 13th.
  assert.deepEqual(range("333"), { since: "2026-11-13", until: "2026-11-13" });
  // Sorted by USD spend: 90 EUR is 100 USD.
  assert.deepEqual(
    report.rows.map((row) => [row.name, row.spendUsd, row.leads]),
    [
      ["Kyiv", 100, 0],
      ["Bangkok", 20, 4],
      ["LA", 0, null],
    ],
  );
  assert.equal(report.total.spendUsd, 120);
});

test("viewer mode cuts hourly data and falls back when Meta withholds it", async () => {
  const { service, calls } = createService({
    meta: META,
    hourlyRows: {
      111: [
        {
          date_start: "2026-11-14",
          hourly_stats_aggregated_by_advertiser_time_zone: hourLabel(4),
          spend: "100",
        },
        {
          date_start: "2026-11-14",
          hourly_stats_aggregated_by_advertiser_time_zone: hourLabel(9),
          spend: "8",
        },
      ],
      333: [],
    },
    dailyRows: {
      222: [{ spend: "9", actions: [{ action_type: "purchase", value: "1" }] }],
      333: [{ spend: "30", actions: [{ action_type: "lead", value: "3" }] }],
    },
  });
  const report = await service.loadReport({
    accounts: ACCOUNTS,
    period: "today",
    zoneMode: "viewer",
    viewerZone: KYIV,
    nowMs: NOW,
  });
  const byName = Object.fromEntries(report.rows.map((row) => [row.name, row]));
  // Bangkok: only the hour inside Kyiv's day counts; no conversions by the hour.
  assert.equal(byName.Bangkok.spend, 8);
  assert.equal(byName.Bangkok.basis, "viewer");
  assert.equal(byName.Bangkok.leads, null);
  // Same clock as the viewer: the daily numbers already are the viewer's day.
  assert.equal(byName.Kyiv.basis, "viewer");
  assert.equal(byName.Kyiv.purchases, 1);
  assert.equal(
    calls.some((call) => call.path === "act_222/insights" && call.hourly),
    false,
  );
  // LA: no hourly rows but daily spend exists, so the row is flagged.
  assert.equal(byName.LA.basis, "account-fallback");
  assert.equal(byName.LA.spend, 30);
  assert.equal(byName.LA.leads, 3);
});

test("one failing account does not break the report", async () => {
  const { service } = createService({
    meta: META,
    hourlyRows: {},
    dailyRows: { 111: [{ spend: "5" }] },
    failFor: "222",
  });
  const report = await service.loadReport({
    accounts: ACCOUNTS,
    period: "yesterday",
    zoneMode: "account",
    viewerZone: KYIV,
    nowMs: NOW,
  });
  const failed = report.rows.find((row) => row.name === "Kyiv");
  assert.match(failed.error, /Permission Denied/);
  assert.equal(report.total.spendUsd, 5);
});
