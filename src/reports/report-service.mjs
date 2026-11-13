import { normalizeAccountId } from "../domain/ids.mjs";
import {
  dateInZone,
  filterHourlyRows,
  isKnownTimeZone,
  periodDates,
  summarizeInsights,
  toUsd,
  totalReport,
  viewerWindow,
  zoneOffsetMinutes,
} from "../domain/report-time.mjs";

const ACCOUNT_FIELDS =
  "currency,account_currency_ratio_to_usd,timezone_name,timezone_offset_hours_utc";
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

  /** Currency, USD ratio and time zone of an ad account; cached per session. */
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

  /** One account's line. `basis` says whose day the numbers are counted in. */
  async loadAccountRow(account, { period, zoneMode, viewerZone, nowMs }) {
    const accountId = normalizeAccountId(account.id);
    const base = { accountId, name: account.name || accountId };
    try {
      const meta = await this.loadAccountMeta(accountId);
      const accountRange = periodDates(
        period,
        dateInZone(nowMs, meta.timeZone),
      );
      let basis = "account";
      let summary = null;
      const sameClock =
        zoneOffsetMinutes(nowMs, meta.timeZone) ===
        zoneOffsetMinutes(nowMs, viewerZone);
      if (zoneMode === "viewer" && !sameClock) {
        const window = viewerWindow(period, nowMs, viewerZone, meta.timeZone);
        const hourly = await this.fetchInsights(
          accountId,
          window.accountRange,
          true,
        );
        if (hourly.length) {
          basis = "viewer";
          summary = summarizeInsights(
            filterHourlyRows(
              hourly,
              meta.timeZone,
              window.startMs,
              window.endMs,
            ),
          );
        } else {
          // No hourly rows: either nothing was spent, or Meta withholds the
          // hourly breakdown for this account. The daily numbers tell which.
          basis = "account-fallback";
        }
      } else if (zoneMode === "viewer") {
        basis = "viewer";
      }
      if (!summary) {
        summary = summarizeInsights(
          await this.fetchInsights(accountId, accountRange, false),
        );
        if (basis === "account-fallback" && summary.spend === 0) {
          basis = "viewer";
        }
      }
      return {
        ...base,
        ...summary,
        basis,
        currency: meta.currency,
        timeZone: meta.timeZone,
        offsetMinutes: zoneOffsetMinutes(nowMs, meta.timeZone),
        spendUsd: toUsd(summary.spend, meta.currency, meta.ratio),
        error: "",
      };
    } catch (error) {
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
        error: String(error?.message || error),
      };
    }
  }

  /**
   * Spend, leads and purchases per ad account for a period.
   * `zoneMode` is "account" (each account's own day) or "viewer" (one day for
   * all, cut from hourly data by the viewer's time zone).
   */
  async loadReport({ accounts, period, zoneMode, viewerZone, nowMs, onRow }) {
    const queue = [...(accounts || [])];
    const rows = [];
    const options = { period, zoneMode, viewerZone, nowMs };
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
