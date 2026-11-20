import { describeRule } from "../domain/ad-rules.mjs";
import { campaignDelivery } from "../domain/ad-status.mjs";
import { billingInfo } from "../domain/billing.mjs";
import { normalizeAccountId } from "../domain/ids.mjs";
import { summarizeAdRows } from "../domain/report-groups.mjs";
import { bucketDailyRows, bucketHourlyRows } from "../domain/spend-trend.mjs";
import {
  classifyAccountStatus,
  filterHourlyRows,
  isKnownTimeZone,
  resolveWindow,
  spendingCampaignIds,
  summarizeInsights,
  toUsd,
  totalReport,
  zoneOffsetMinutes,
} from "../domain/report-time.mjs";

// Campaign and ad statuses ride along with the account fields: one request
// instead of three per account.
const ACCOUNT_FIELDS =
  "currency,account_currency_ratio_to_usd,timezone_name,timezone_offset_hours_utc,account_status,disable_reason,created_time";
const CAMPAIGN_FIELDS = "campaigns.limit(500){id,name,effective_status}";
// A campaign that is on but whose every ad was rejected delivers nothing:
// the ads tell which switched-on campaigns really run.
const AD_STATUS_FIELDS = "ads.limit(500){campaign_id,effective_status}";
// Asked in this order: when Meta refuses a part, the next asks for less.
const META_FIELDS = [
  `${ACCOUNT_FIELDS},${CAMPAIGN_FIELDS},${AD_STATUS_FIELDS}`,
  `${ACCOUNT_FIELDS},${CAMPAIGN_FIELDS}`,
  ACCOUNT_FIELDS,
];
// Read per campaign and added up: the same request tells which campaigns spent.
const INSIGHT_FIELDS = "campaign_id,spend,impressions,clicks,actions";
const AD_INSIGHT_FIELDS = "ad_id,ad_name,adset_id,campaign_name,spend,actions";
// Plain node expansions only: a sub-selection inside targeting is not
// something every account's API answers.
const AD_FIELDS = "name,effective_status,campaign{name},adset{targeting}";
// Every ad but archived and deleted ones: ads in review or rejected are
// launched too, and their account belongs under their creative.
const AD_STATUSES = JSON.stringify([
  "ACTIVE",
  "PAUSED",
  "PENDING_REVIEW",
  "DISAPPROVED",
  "PREAPPROVED",
  "PENDING_BILLING_INFO",
  "CAMPAIGN_PAUSED",
  "ADSET_PAUSED",
  "IN_PROCESS",
  "WITH_ISSUES",
]);
// The card needs more rights than the amount: without them, the amount alone.
const BILLING_FIELDS = ["balance,funding_source_details", "balance"];
const RULE_FIELDS =
  "id,name,status,evaluation_spec,execution_spec,schedule_spec";
const HOURLY = "hourly_stats_aggregated_by_advertiser_time_zone";
const CONCURRENCY = 8;

/** ReportService. Dependencies are supplied by the application composition root. */
export class ReportService {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.accountMeta = new Map();
    this.loadReport = this.loadReport.bind(this);
  }

  /** Currency, USD ratio, time zone and status of an ad account, per report. */
  async loadAccountMeta(accountId) {
    if (this.accountMeta.has(accountId)) return this.accountMeta.get(accountId);
    const { graphFetch } = this.dependencies.graphClient;
    let row;
    for (const [index, fields] of META_FIELDS.entries()) {
      try {
        row = await graphFetch(`act_${accountId}`, { query: { fields } });
        break;
      } catch (error) {
        // If Meta refuses the ads or campaigns part, the account itself is
        // still worth reading: spend and status matter more than the counts.
        if (index === META_FIELDS.length - 1) throw error;
      }
    }
    if (Array.isArray(row)) row = row[0] || {};
    const offsetHours = Number(row?.timezone_offset_hours_utc);
    // A zone name the browser does not know falls back to a fixed offset.
    const fixed = Number.isFinite(offsetHours)
      ? `Etc/GMT${offsetHours <= 0 ? "+" : "-"}${Math.abs(Math.round(offsetHours))}`
      : "UTC";
    const meta = {
      currency: String(row?.currency || "").toUpperCase(),
      ratio: Number(row?.account_currency_ratio_to_usd) || 0,
      timeZone: isKnownTimeZone(row?.timezone_name) ? row.timezone_name : fixed,
      statusCode: Number(row?.account_status) || null,
      disableReason: Number(row?.disable_reason) || 0,
      health: classifyAccountStatus(row?.account_status),
      // Absent when Meta refuses the campaigns edge: unknown, not zero.
      // Without ads, or with more ads than one page, a campaign that is on
      // counts as running.
      campaigns: row?.campaigns
        ? campaignDelivery(
            row.campaigns.data,
            Array.isArray(row?.ads?.data) ? row.ads.data : null,
            !row?.ads?.paging?.next,
          )
        : null,
      createdTime: String(row?.created_time || ""),
    };
    this.accountMeta.set(accountId, meta);
    return meta;
  }

  async fetchInsights(accountId, range, hourly, level = "campaign") {
    const { graphGetAll } = this.dependencies.graphClient;
    return graphGetAll(`act_${accountId}/insights`, {
      level,
      fields: level === "ad" ? AD_INSIGHT_FIELDS : INSIGHT_FIELDS,
      time_range: JSON.stringify(range),
      ...(hourly
        ? { breakdowns: HOURLY, time_increment: 1, limit: 500 }
        : { limit: 500 }),
    });
  }

  /**
   * What an unpaid account owes and the card it pays with, or null when
   * Meta does not say. Never throws.
   */
  async loadBilling(accountId, currency) {
    const { graphFetch } = this.dependencies.graphClient;
    for (const fields of BILLING_FIELDS) {
      try {
        let row = await graphFetch(`act_${accountId}`, { query: { fields } });
        if (Array.isArray(row)) row = row[0] || {};
        return billingInfo(row, currency);
      } catch {
        // Fewer fields next.
      }
    }
    return null;
  }

  /**
   * The status and debt of an account read afresh: after its payment page
   * was opened, this tells whether the payment went through.
   */
  async recheckBilling(accountId) {
    const { graphFetch } = this.dependencies.graphClient;
    let row = await graphFetch(`act_${accountId}`, {
      query: { fields: "account_status,disable_reason,currency,balance" },
    });
    if (Array.isArray(row)) row = row[0] || {};
    // The next report reads the account afresh too.
    this.accountMeta.delete(accountId);
    return {
      statusCode: Number(row?.account_status) || null,
      disableReason: Number(row?.disable_reason) || 0,
      health: classifyAccountStatus(row?.account_status),
      ...billingInfo(row, String(row?.currency || "").toUpperCase()),
    };
  }

  /**
   * The automated rules of an account, or null when they cannot be read.
   * Never throws: a report without rules is still a report.
   */
  async loadRules(accountId) {
    const { graphGetAll } = this.dependencies.graphClient;
    try {
      const rules = await graphGetAll(`act_${accountId}/adrules_library`, {
        fields: RULE_FIELDS,
        limit: 200,
      });
      return (rules || []).filter(
        (rule) => String(rule?.status || "").toUpperCase() !== "DELETED",
      );
    } catch {
      return null;
    }
  }

  /**
   * One account's line. `basis` says whose clock the period was read on:
   * "viewer", "account", or "account-fallback" when the viewer's clock was
   * asked for but Meta gave no hourly data, so whole account days are shown.
   */
  async loadAccountRow(
    account,
    { period, custom, zoneMode, viewerZone, nowMs },
  ) {
    const accountId = normalizeAccountId(account.id);
    const base = { accountId, name: account.name || accountId };
    // Rules do not depend on the period: they are read alongside.
    const rulesRead = this.loadRules(accountId);
    const describe = (rules, currency) =>
      Array.isArray(rules)
        ? rules.map((rule) => describeRule(rule, currency))
        : null;
    try {
      const meta = await this.loadAccountMeta(accountId);
      // Only an account held for an unpaid balance is asked what it owes.
      const billing =
        meta.statusCode === 3
          ? await this.loadBilling(accountId, meta.currency)
          : null;
      const window = resolveWindow({
        period,
        custom,
        nowMs,
        zone: zoneMode === "viewer" ? viewerZone : meta.timeZone,
        accountZone: meta.timeZone,
      });
      let basis = zoneMode === "viewer" ? "viewer" : "account";
      let summary = null;
      let spending = [];
      if (!window.wholeAccountDays) {
        const hourly = await this.fetchInsights(
          accountId,
          window.accountRange,
          true,
        );
        if (hourly.length) {
          const inside = filterHourlyRows(
            hourly,
            meta.timeZone,
            window.startMs,
            window.endMs,
          );
          summary = summarizeInsights(inside);
          spending = spendingCampaignIds(inside);
        }
      }
      if (!summary) {
        const daily = await this.fetchInsights(
          accountId,
          window.accountRange,
          false,
        );
        summary = summarizeInsights(daily);
        spending = spendingCampaignIds(daily);
        // No hourly rows although money was spent: Meta withholds the hourly
        // breakdown for this account, so these are whole account days.
        if (!window.wholeAccountDays && summary.spend > 0) {
          basis = "account-fallback";
        }
      }
      const campaigns = meta.campaigns;
      return {
        ...base,
        ...summary,
        basis,
        currency: meta.currency,
        timeZone: meta.timeZone,
        offsetMinutes: zoneOffsetMinutes(nowMs, meta.timeZone),
        spendUsd: toUsd(summary.spend, meta.currency, meta.ratio),
        activeCampaigns: campaigns ? campaigns.active : null,
        inactiveCampaigns: campaigns ? campaigns.inactive : null,
        activeCampaignIds: campaigns ? campaigns.activeIds : null,
        blockedCampaigns: campaigns ? campaigns.blocked : null,
        spendingCampaignIds: spending,
        health: meta.health,
        statusCode: meta.statusCode,
        disableReason: meta.disableReason,
        createdTime: meta.createdTime,
        amountDue: billing?.amountDue ?? null,
        amountDueUsd:
          billing?.amountDue === null || billing?.amountDue === undefined
            ? null
            : toUsd(billing.amountDue, meta.currency, meta.ratio),
        card: billing?.card || "",
        rules: describe(await rulesRead, meta.currency),
        error: "",
      };
    } catch (error) {
      const campaigns = this.accountMeta.get(accountId)?.campaigns || null;
      return {
        ...base,
        spend: 0,
        spendUsd: null,
        leads: null,
        purchases: null,
        basis: "account",
        currency: "",
        timeZone: "",
        offsetMinutes: null,
        activeCampaigns: campaigns ? campaigns.active : null,
        inactiveCampaigns: campaigns ? campaigns.inactive : null,
        activeCampaignIds: campaigns ? campaigns.activeIds : null,
        blockedCampaigns: campaigns ? campaigns.blocked : null,
        spendingCampaignIds: null,
        // The account itself could not be read: fall back to the status it
        // had when the account list was loaded.
        health: classifyAccountStatus(
          account?.raw?.account_status ?? account?.account_status,
        ),
        statusCode:
          Number(account?.raw?.account_status ?? account?.account_status) ||
          null,
        disableReason: 0,
        createdTime: "",
        rules: describe(await rulesRead, ""),
        error: String(error?.message || error),
      };
    }
  }

  /**
   * Spend, leads and purchases per ad account for a period.
   * `zoneMode` is "account" (each account's own day) or "viewer" (one day for
   * all, cut from hourly data by the viewer's time zone).
   */
  async loadReport({
    accounts,
    period,
    custom,
    zoneMode,
    viewerZone,
    nowMs,
    onRow,
  }) {
    const queue = [...(accounts || [])];
    const rows = [];
    const options = { period, custom, zoneMode, viewerZone, nowMs };
    // An account can be banned between two reports: read its status afresh.
    this.accountMeta.clear();
    const worker = async () => {
      while (queue.length) {
        const account = queue.shift();
        const row = await this.loadAccountRow(account, options);
        rows.push(row);
        onRow?.(rows.length, (accounts || []).length);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker),
    );
    rows.sort(
      (a, b) =>
        (b.spendUsd ?? b.spend) - (a.spendUsd ?? a.spend) ||
        a.name.localeCompare(b.name),
    );
    return {
      rows,
      total: totalReport(rows),
      nowMs,
      period,
      zoneMode,
      custom: custom || null,
      viewerZone,
    };
  }

  /**
   * One account's ads for the report's period, on the same clock as its
   * line: each ad with its name, campaign, targeted countries, whether it
   * runs now, and its spend, leads and purchases.
   */
  async loadAccountAds(row, report) {
    const { graphGetAll } = this.dependencies.graphClient;
    const accountId = row.accountId;
    const meta = await this.loadAccountMeta(accountId);
    const window = resolveWindow({
      period: report.period,
      custom: report.custom,
      nowMs: report.nowMs,
      zone: report.zoneMode === "viewer" ? report.viewerZone : meta.timeZone,
      accountZone: meta.timeZone,
    });
    let insights = null;
    // The line fell back to whole days: so do its ads, or they would not add up.
    if (!window.wholeAccountDays && row.basis !== "account-fallback") {
      const hourly = await this.fetchInsights(
        accountId,
        window.accountRange,
        true,
        "ad",
      );
      if (hourly.length) {
        insights = filterHourlyRows(
          hourly,
          meta.timeZone,
          window.startMs,
          window.endMs,
        );
      }
    }
    if (!insights) {
      insights = await this.fetchInsights(
        accountId,
        window.accountRange,
        false,
        "ad",
      );
    }
    // Each ad carries its ad set's targeting: pages are kept small.
    let ads;
    try {
      ads = await graphGetAll(`act_${accountId}/ads`, {
        fields: AD_FIELDS,
        effective_status: AD_STATUSES,
        limit: 100,
      });
    } catch {
      // Meta's own default list, if it refuses the status filter.
      ads = await graphGetAll(`act_${accountId}/ads`, {
        fields: AD_FIELDS,
        limit: 100,
      });
    }
    return summarizeAdRows({
      insights,
      ads,
      currency: meta.currency,
      ratio: meta.ratio,
      delivers: row.health === "live" || row.health === "unknown",
    });
  }

  /**
   * One account's spend over the report's period in the chart's buckets,
   * in USD, on the same clock as its line: { values } or { values: null,
   * reason } when Meta gives no hourly numbers or no USD rate.
   */
  async loadSpendSeries(row, report, frame) {
    const { graphGetAll } = this.dependencies.graphClient;
    const accountId = row.accountId;
    const meta = await this.loadAccountMeta(accountId);
    const window = resolveWindow({
      period: report.period,
      custom: report.custom,
      nowMs: report.nowMs,
      zone: report.zoneMode === "viewer" ? report.viewerZone : meta.timeZone,
      accountZone: meta.timeZone,
    });
    const read = (hourly) =>
      graphGetAll(`act_${accountId}/insights`, {
        level: "account",
        fields: "spend",
        time_range: JSON.stringify(window.accountRange),
        time_increment: 1,
        limit: 500,
        ...(hourly ? { breakdowns: HOURLY } : {}),
      });
    const shape = {
      accountZone: meta.timeZone,
      startMs: window.startMs,
      endMs: window.endMs,
      unit: frame.unit,
      count: frame.count,
    };
    let values = null;
    // Hours, or days cut on another clock than the account's, need hourly rows.
    if (frame.unit === "hour" || !window.wholeAccountDays) {
      const hourly = await read(true);
      if (hourly.length) values = bucketHourlyRows(hourly, shape);
      else if (frame.unit === "hour" && row.spend > 0) {
        return { values: null, reason: "hourly" };
      }
    }
    if (!values) values = bucketDailyRows(await read(false), shape);
    const usd = values.map((value) => toUsd(value, meta.currency, meta.ratio));
    if (usd.some((value) => value === null)) {
      return { values: null, reason: "currency" };
    }
    return { values: usd };
  }

  /**
   * The ads of every account of a report, for groupings by creative, geo or
   * agent. Returns { [accountId]: { ads } | { error } }; one failing account
   * never stops the rest.
   */
  async loadReportAds(report, rows, onProgress) {
    const queue = [...(rows || [])];
    const result = {};
    let done = 0;
    const worker = async () => {
      while (queue.length) {
        const row = queue.shift();
        try {
          result[row.accountId] = {
            ads: await this.loadAccountAds(row, report),
          };
        } catch (error) {
          result[row.accountId] = { error: String(error?.message || error) };
        }
        done += 1;
        onProgress?.(done, rows.length);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker),
    );
    return result;
  }
}
