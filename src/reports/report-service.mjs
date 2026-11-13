import { normalizeAccountId } from "../domain/ids.mjs";
import {
  classifyAccountStatus,
  countCampaigns,
  filterHourlyRows,
  isKnownTimeZone,
  resolveWindow,
  summarizeInsights,
  toUsd,
  totalReport,
  zoneOffsetMinutes,
} from "../domain/report-time.mjs";

const ACCOUNT_FIELDS =
  "currency,account_currency_ratio_to_usd,timezone_name,timezone_offset_hours_utc,account_status,disable_reason";
const INSIGHT_FIELDS = "spend,impressions,clicks,actions";
const HOURLY = "hourly_stats_aggregated_by_advertiser_time_zone";
const CONCURRENCY = 4;

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
    let row = await graphFetch(`act_${accountId}`, {
      query: { fields: ACCOUNT_FIELDS },
    });
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
    };
    this.accountMeta.set(accountId, meta);
    return meta;
  }

  async fetchInsights(accountId, range, hourly) {
    const { graphGetAll } = this.dependencies.graphClient;
    return graphGetAll(`act_${accountId}/insights`, {
      level: "account",
      fields: INSIGHT_FIELDS,
      time_range: JSON.stringify(range),
      ...(hourly ? { breakdowns: HOURLY, time_increment: 1, limit: 500 } : {}),
    });
  }

  /** Campaigns switched on and off right now; null when they cannot be read. */
  async loadCampaignCounts(accountId) {
    const { graphGetAll } = this.dependencies.graphClient;
    try {
      return countCampaigns(
        await graphGetAll(`act_${accountId}/campaigns`, {
          fields: "effective_status",
          limit: 500,
        }),
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
    const campaignsPromise = this.loadCampaignCounts(accountId);
    try {
      const meta = await this.loadAccountMeta(accountId);
      const window = resolveWindow({
        period,
        custom,
        nowMs,
        zone: zoneMode === "viewer" ? viewerZone : meta.timeZone,
        accountZone: meta.timeZone,
      });
      let basis = zoneMode === "viewer" ? "viewer" : "account";
      let summary = null;
      if (!window.wholeAccountDays) {
        const hourly = await this.fetchInsights(
          accountId,
          window.accountRange,
          true,
        );
        if (hourly.length) {
          summary = summarizeInsights(
            filterHourlyRows(
              hourly,
              meta.timeZone,
              window.startMs,
              window.endMs,
            ),
          );
        }
      }
      if (!summary) {
        summary = summarizeInsights(
          await this.fetchInsights(accountId, window.accountRange, false),
        );
        // No hourly rows although money was spent: Meta withholds the hourly
        // breakdown for this account, so these are whole account days.
        if (!window.wholeAccountDays && summary.spend > 0) {
          basis = "account-fallback";
        }
      }
      const campaigns = await campaignsPromise;
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
        health: meta.health,
        statusCode: meta.statusCode,
        disableReason: meta.disableReason,
        error: "",
      };
    } catch (error) {
      const campaigns = await campaignsPromise;
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
        // The account itself could not be read: fall back to the status it
        // had when the account list was loaded.
        health: classifyAccountStatus(
          account?.raw?.account_status ?? account?.account_status,
        ),
        statusCode:
          Number(account?.raw?.account_status ?? account?.account_status) ||
          null,
        disableReason: 0,
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
    return { rows, total: totalReport(rows), nowMs, period, zoneMode };
  }
}
