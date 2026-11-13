import assert from "node:assert/strict";
import { test } from "node:test";
import {
  accountDelivers,
  addDays,
  classifyAccountStatus,
  filterReportRows,
  dateInZone,
  filterHourlyRows,
  formatUtcOffset,
  localHourToUtcMs,
  periodDates,
  summarizeInsights,
  toUsd,
  countCampaigns,
  periodBounds,
  reportZoneChoices,
  resolveWindow,
  totalReport,
  validateCustomPeriod,
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

const windowFor = (zone, accountZone, period = "today", custom = null) =>
  resolveWindow({ period, custom, nowMs: NOW, zone, accountZone });

test("the viewer's day maps onto two account dates", () => {
  const bangkok = windowFor(KYIV, BANGKOK);
  assert.equal(bangkok.startMs, Date.UTC(2026, 10, 13, 22));
  assert.equal(bangkok.endMs, Date.UTC(2026, 10, 14, 22));
  // Kyiv's 14th runs 05:00 on the 14th to 05:00 on the 15th in Bangkok.
  assert.deepEqual(bangkok.accountRange, {
    since: "2026-11-14",
    until: "2026-11-15",
  });
  assert.equal(bangkok.wholeAccountDays, false);
  assert.deepEqual(windowFor(KYIV, LA).accountRange, {
    since: "2026-11-13",
    until: "2026-11-14",
  });
});

test("a period on the account's own clock is whole account days", () => {
  const own = windowFor(BANGKOK, BANGKOK, "last7");
  assert.equal(own.wholeAccountDays, true);
  assert.deepEqual(own.accountRange, {
    since: "2026-11-08",
    until: "2026-11-14",
  });
  // Another zone with the same clock is just as good as the account's own.
  assert.equal(windowFor("Asia/Ho_Chi_Minh", BANGKOK).wholeAccountDays, true);
});

test("a custom period is dates, optionally with whole hours", () => {
  const dates = { since: "2026-11-13", until: "2026-11-14", withTime: false };
  assert.deepEqual(periodBounds("custom", "2026-11-20", dates), {
    since: { date: "2026-11-13", hour: 0 },
    until: { date: "2026-11-15", hour: 0 },
  });
  // 13.11 00:00 – 14.11 23:59 is the same two full days.
  const full = { ...dates, withTime: true, sinceHour: 0, untilHour: 23 };
  assert.deepEqual(
    periodBounds("custom", "2026-11-20", full),
    periodBounds("custom", "2026-11-20", dates),
  );
  // 13.11 18:00 – 14.11 05:59 ends at 06:00.
  const night = { ...dates, withTime: true, sinceHour: 18, untilHour: 5 };
  assert.deepEqual(periodBounds("custom", "2026-11-20", night), {
    since: { date: "2026-11-13", hour: 18 },
    until: { date: "2026-11-14", hour: 6 },
  });
  const window = windowFor(BANGKOK, BANGKOK, "custom", night);
  assert.equal(window.wholeAccountDays, false);
  assert.equal(window.startMs, Date.UTC(2026, 10, 13, 11));
  assert.equal(window.endMs, Date.UTC(2026, 10, 13, 23));
  assert.equal(
    windowFor(BANGKOK, BANGKOK, "custom", full).wholeAccountDays,
    true,
  );
});

test("custom periods are validated", () => {
  const ok = { since: "2026-11-13", until: "2026-11-14", withTime: false };
  assert.equal(validateCustomPeriod(ok), "");
  assert.equal(validateCustomPeriod({ ...ok, since: "" }), "dates");
  assert.equal(validateCustomPeriod({ ...ok, until: "2026-11-12" }), "order");
  assert.equal(
    validateCustomPeriod({
      since: "2026-11-13",
      until: "2026-11-13",
      withTime: true,
      sinceHour: 10,
      untilHour: 9,
    }),
    "order",
  );
  assert.equal(validateCustomPeriod({ ...ok, since: "2026-01-01" }), "long");
});

test("campaigns are counted as on or off", () => {
  assert.deepEqual(
    countCampaigns([
      { effective_status: "ACTIVE" },
      { effective_status: "ACTIVE" },
      { effective_status: "PAUSED" },
      { effective_status: "WITH_ISSUES" },
      { effective_status: "ARCHIVED" },
      { effective_status: "DELETED" },
    ]),
    { active: 2, inactive: 2 },
  );
});

test("time zone choices include Kyiv and fixed offsets with the right sign", () => {
  const choices = reportZoneChoices();
  assert.ok(choices.cities.includes("Europe/Kiev"));
  const plus7 = choices.offsets.find((item) => item.label === "UTC+7");
  assert.equal(zoneOffsetMinutes(NOW, plus7.zone), 420);
  const minus5 = choices.offsets.find((item) => item.label === "UTC-5");
  assert.equal(zoneOffsetMinutes(NOW, minus5.zone), -300);
});

test("hourly rows are cut by the viewer's day, not the account's", () => {
  const { startMs, endMs } = windowFor(KYIV, BANGKOK);
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

function createService({
  hourlyRows,
  dailyRows,
  meta,
  failFor = "",
  campaigns = {},
}) {
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
        if (path.endsWith("/campaigns")) {
          if (campaigns === "fail") throw new Error("no campaigns access");
          return campaigns[id] || [];
        }
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
    campaigns: {
      111: [
        { effective_status: "ACTIVE" },
        { effective_status: "ACTIVE" },
        { effective_status: "PAUSED" },
      ],
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
  assert.deepEqual(
    report.rows.map((row) => [
      row.name,
      row.activeCampaigns,
      row.inactiveCampaigns,
    ]),
    [
      ["Kyiv", 0, 0],
      ["Bangkok", 2, 1],
      ["LA", 0, 0],
    ],
  );
  assert.equal(report.total.activeCampaigns, 2);
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
  // Hourly rows that do carry actions keep their conversions.
  assert.equal(byName.Bangkok.purchases, null);
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
    campaigns: "fail",
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
  // Campaigns that cannot be read are unknown, not zero.
  assert.equal(failed.activeCampaigns, null);
});

test("a custom period with hours cuts hourly data on the account's clock", async () => {
  const { service, calls } = createService({
    meta: META,
    hourlyRows: {
      111: [
        {
          date_start: "2026-11-13",
          hourly_stats_aggregated_by_advertiser_time_zone: hourLabel(17),
          spend: "100",
        },
        {
          date_start: "2026-11-13",
          hourly_stats_aggregated_by_advertiser_time_zone: hourLabel(18),
          spend: "4",
          actions: [{ action_type: "lead", value: "2" }],
        },
        {
          date_start: "2026-11-14",
          hourly_stats_aggregated_by_advertiser_time_zone: hourLabel(5),
          spend: "6",
          actions: [{ action_type: "lead", value: "1" }],
        },
        {
          date_start: "2026-11-14",
          hourly_stats_aggregated_by_advertiser_time_zone: hourLabel(6),
          spend: "100",
        },
      ],
    },
    dailyRows: {},
  });
  const report = await service.loadReport({
    accounts: [ACCOUNTS[0]],
    period: "custom",
    custom: {
      since: "2026-11-13",
      until: "2026-11-14",
      withTime: true,
      sinceHour: 18,
      untilHour: 5,
    },
    zoneMode: "account",
    viewerZone: KYIV,
    nowMs: NOW,
  });
  const [row] = report.rows;
  assert.equal(row.spend, 10);
  assert.equal(row.leads, 3);
  assert.equal(row.basis, "account");
  const hourlyCall = calls.find((call) => call.hourly);
  assert.deepEqual(JSON.parse(hourlyCall.query.time_range), {
    since: "2026-11-13",
    until: "2026-11-14",
  });
});

test("account status decides whether campaigns can run", () => {
  assert.equal(classifyAccountStatus(1), "live");
  assert.equal(classifyAccountStatus(9), "live");
  assert.equal(classifyAccountStatus(2), "banned");
  assert.equal(classifyAccountStatus(7), "review");
  assert.equal(classifyAccountStatus(3), "billing");
  assert.equal(classifyAccountStatus(101), "closed");
  assert.equal(classifyAccountStatus(undefined), "unknown");
  assert.equal(accountDelivers("live"), true);
  assert.equal(accountDelivers("unknown"), true);
  for (const health of ["banned", "review", "billing", "closed"]) {
    assert.equal(accountDelivers(health), false, health);
  }
});

test("active campaigns count only in accounts that can deliver", () => {
  const rows = [
    {
      name: "live",
      health: "live",
      spend: 10,
      spendUsd: 10,
      leads: 1,
      purchases: 0,
      activeCampaigns: 3,
    },
    {
      name: "banned",
      health: "banned",
      spend: 5,
      spendUsd: 5,
      leads: 0,
      purchases: 0,
      activeCampaigns: 20,
    },
    {
      name: "debt",
      health: "billing",
      spend: 0,
      spendUsd: 0,
      leads: 0,
      purchases: 0,
      activeCampaigns: 4,
    },
    {
      name: "new",
      health: "unknown",
      spend: 0,
      spendUsd: 0,
      leads: 0,
      purchases: 0,
      activeCampaigns: 1,
    },
  ];
  // Spend of a banned account still happened and stays in the total.
  const total = totalReport(rows);
  assert.equal(total.activeCampaigns, 4);
  assert.equal(total.spendUsd, 15);
  assert.deepEqual(
    filterReportRows(rows, "live").map((row) => row.name),
    ["live", "new"],
  );
  assert.deepEqual(
    filterReportRows(rows, "dead").map((row) => row.name),
    ["banned", "debt"],
  );
  assert.equal(filterReportRows(rows, "all").length, 4);
  assert.equal(totalReport(filterReportRows(rows, "dead")).activeCampaigns, 0);
});

test("the report reads each account's status afresh", async () => {
  const meta = structuredClone(META);
  meta[111].account_status = 2;
  meta[111].disable_reason = 1;
  meta[222].account_status = 1;
  const { service } = createService({
    meta,
    hourlyRows: {},
    dailyRows: {},
    campaigns: {
      111: [{ effective_status: "ACTIVE" }, { effective_status: "ACTIVE" }],
      222: [{ effective_status: "ACTIVE" }],
    },
  });
  const load = () =>
    service.loadReport({
      accounts: ACCOUNTS,
      period: "today",
      zoneMode: "account",
      viewerZone: KYIV,
      nowMs: NOW,
    });
  const first = await load();
  const banned = first.rows.find((row) => row.name === "Bangkok");
  assert.equal(banned.health, "banned");
  assert.equal(banned.statusCode, 2);
  assert.equal(banned.disableReason, 1);
  assert.equal(first.rows.find((row) => row.name === "Kyiv").health, "live");
  assert.equal(first.rows.find((row) => row.name === "LA").health, "unknown");
  // Two campaigns are switched on in the banned account; only Kyiv's counts.
  assert.equal(first.total.activeCampaigns, 1);
  // The second report sees the ban that happened in between.
  meta[222].account_status = 2;
  const second = await load();
  assert.equal(second.rows.find((row) => row.name === "Kyiv").health, "banned");
  assert.equal(second.total.activeCampaigns, 0);
});
