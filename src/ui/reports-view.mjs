import { clockInZone, formatUtcOffset } from "../domain/report-time.mjs";
import { escapeHtml } from "../utils/string.mjs";
import { t } from "./i18n.mjs";
import { ICONS } from "./icons.mjs";

const PERIODS = ["today", "yesterday", "last7"];
const ZONES = ["account", "viewer"];

const money = (value) =>
  value === null || value === undefined
    ? "—"
    : `$${Number(value).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
const count = (value) =>
  value === null || value === undefined ? "—" : String(Math.round(value));
const cost = (spend, results) =>
  spend === null || !results ? "—" : money(spend / results);

/** The Reports tab: spend, leads and purchases per ad account. */
export class ReportsView {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.requestId = 0;
    this.boundRoot = null;
    this.open = this.open.bind(this);
    this.render = this.render.bind(this);
  }

  get panel() {
    const { dom, appId } = this.dependencies;
    return dom.root?.querySelector(`#${appId}-panel-reports`) || null;
  }

  viewerZone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  }

  bind(root) {
    if (!root || this.boundRoot === root) return;
    this.boundRoot = root;
    root.addEventListener("click", (event) => {
      const { state } = this.dependencies;
      const target = event.target.closest?.("[data-report]");
      if (!target || !this.panel?.contains(target)) return;
      const [kind, value] = target.dataset.report.split(":");
      if (kind === "period" && PERIODS.includes(value)) {
        state.reportPeriod = value;
        this.load();
      } else if (kind === "zone" && ZONES.includes(value)) {
        state.reportZone = value;
        this.load();
      } else if (kind === "refresh") {
        this.load();
      } else if (kind === "empty") {
        state.reportShowEmpty = !state.reportShowEmpty;
        this.render();
      }
    });
  }

  /** Called when the tab is shown: loads once, then keeps what is on screen. */
  open() {
    const { state } = this.dependencies;
    if (!state.report && !state.reportLoading) this.load();
    else this.render();
  }

  async load() {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    const requestId = ++this.requestId;
    if (!state.sessionReady || !(state.accounts || []).length) {
      state.reportError = t("reports.waiting");
      this.render();
      return;
    }
    state.reportLoading = true;
    state.reportError = "";
    state.reportProgress = "";
    this.render();
    try {
      const report = await this.dependencies.reportService.loadReport({
        accounts: state.accounts,
        period: state.reportPeriod,
        zoneMode: state.reportZone,
        viewerZone: this.viewerZone(),
        nowMs: Date.now(),
        onRow: (done, total) => {
          if (requestId !== this.requestId) return;
          state.reportProgress = `${done}/${total}`;
          this.render();
        },
      });
      if (requestId !== this.requestId) return;
      state.report = report;
      const failed = report.rows.filter((row) => row.error).length;
      log(
        failed ? "warn" : "info",
        `Report loaded: ${report.rows.length} accounts, $${report.total.spendUsd.toFixed(2)} spend${failed ? `, ${failed} failed` : ""}.`,
      );
    } catch (error) {
      if (requestId !== this.requestId) return;
      state.reportError = String(error?.message || error);
      log("error", "Report failed.", state.reportError);
    } finally {
      if (requestId === this.requestId) {
        state.reportLoading = false;
        this.render();
      }
    }
  }

  segment(kind, values, active) {
    return `<div class="ma-seg" role="group">${values
      .map(
        (value) =>
          `<button type="button" data-always-enabled data-report="${kind}:${value}" class="${
            value === active ? "is-on" : ""
          }">${escapeHtml(t(`reports.${kind}.${value}`))}</button>`,
      )
      .join("")}</div>`;
  }

  rowMarkup(row, nowMs) {
    const zone =
      row.offsetMinutes === null
        ? ""
        : `${formatUtcOffset(row.offsetMinutes)} · ${clockInZone(nowMs, row.timeZone)}`;
    const original =
      row.currency && row.currency !== "USD" && row.spend > 0
        ? `<small>${escapeHtml(
            `${row.spend.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${row.currency}`,
          )}</small>`
        : "";
    const note = row.error
      ? `<div class="ma-rep-note ma-rep-err" title="${escapeHtml(row.error)}">${escapeHtml(t("reports.rowError"))}</div>`
      : row.basis === "account-fallback"
        ? `<div class="ma-rep-note" title="${escapeHtml(t("reports.fallbackHint"))}">${escapeHtml(t("reports.fallback"))}</div>`
        : "";
    const spendUsd =
      row.spendUsd === null && row.spend > 0 ? null : row.spendUsd;
    return `
      <div class="ma-rep-row${row.spend > 0 ? "" : " ma-rep-zero"}">
        <div class="ma-rep-acct">
          <b title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</b>
          <span>${escapeHtml(row.accountId)}${zone ? ` · ${escapeHtml(zone)}` : ""}</span>
          ${note}
        </div>
        <div class="ma-rep-num"><b>${row.error ? "—" : money(spendUsd)}</b>${original}</div>
        <div class="ma-rep-num"><b>${count(row.leads)}</b><small>${cost(row.spendUsd, row.leads)}</small></div>
        <div class="ma-rep-num"><b>${count(row.purchases)}</b><small>${cost(row.spendUsd, row.purchases)}</small></div>
        <a class="ma-rep-open" href="https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${encodeURIComponent(
          row.accountId,
        )}" target="_blank" rel="noopener" title="${escapeHtml(t("reports.open"))}">${ICONS.open}</a>
      </div>`;
  }

  render() {
    const { state } = this.dependencies;
    const panel = this.panel;
    if (!panel) return;
    const report = state.report;
    const viewerZone = this.viewerZone();
    const controls = `
      <div class="ma-rep-controls">
        ${this.segment("period", PERIODS, state.reportPeriod)}
        ${this.segment("zone", ZONES, state.reportZone)}
        <button type="button" class="ma-secondary ma-rep-refresh" data-always-enabled data-report="refresh" ${
          state.reportLoading ? "disabled" : ""
        }>${ICONS.refresh}<span>${escapeHtml(
          state.reportLoading
            ? `${t("reports.loading")} ${state.reportProgress}`
            : t("reports.refresh"),
        )}</span></button>
      </div>
      <div class="ma-rep-zonehint">${escapeHtml(
        state.reportZone === "viewer"
          ? t("reports.zoneHint.viewer", { zone: viewerZone })
          : t("reports.zoneHint.account"),
      )}</div>`;
    if (state.reportError && !report) {
      panel.innerHTML = `${controls}<div class="ma-rep-empty">${escapeHtml(state.reportError)}</div>`;
      return;
    }
    if (!report) {
      panel.innerHTML = `${controls}<div class="ma-rep-empty">${escapeHtml(
        state.reportLoading ? t("reports.loadingFirst") : t("reports.empty"),
      )}</div>`;
      return;
    }
    const total = report.total;
    const spent = report.rows.filter((row) => row.spend > 0 || row.error);
    const idle = report.rows.length - spent.length;
    const visible = state.reportShowEmpty ? report.rows : spent;
    const tile = (label, value, sub = "") =>
      `<div class="ma-rep-tile"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b>${
        sub ? `<small>${escapeHtml(sub)}</small>` : ""
      }</div>`;
    panel.innerHTML = `
      ${controls}
      <div class="ma-rep-tiles${state.reportLoading ? " ma-rep-stale" : ""}">
        ${tile(t("reports.spend"), money(total.spendUsd), t("reports.accountsSpending", { count: total.accounts }))}
        ${tile(t("reports.leads"), total.leadsKnown ? count(total.leads) : "—", total.leadsKnown ? `${t("reports.cpl")} ${cost(total.spendUsd, total.leads)}` : "")}
        ${tile(t("reports.purchases"), total.purchasesKnown ? count(total.purchases) : "—", total.purchasesKnown ? `${t("reports.cpa")} ${cost(total.spendUsd, total.purchases)}` : "")}
      </div>
      ${
        total.unconverted
          ? `<div class="ma-rep-warn">${escapeHtml(t("reports.unconverted", { count: total.unconverted }))}</div>`
          : ""
      }
      ${
        state.reportZone === "viewer" &&
        report.rows.some(
          (row) =>
            row.basis === "viewer" && row.leads === null && row.spend > 0,
        )
          ? `<div class="ma-rep-warn">${escapeHtml(t("reports.noConversions"))}</div>`
          : ""
      }
      <div class="ma-rep-head">
        <span>${escapeHtml(t("reports.account"))}</span>
        <span>${escapeHtml(t("reports.spend"))}</span>
        <span>${escapeHtml(t("reports.leads"))} / ${escapeHtml(t("reports.cpl"))}</span>
        <span>${escapeHtml(t("reports.purchases"))} / ${escapeHtml(t("reports.cpa"))}</span>
        <span></span>
      </div>
      <div class="ma-rep-list${state.reportLoading ? " ma-rep-stale" : ""}">
        ${
          visible.map((row) => this.rowMarkup(row, report.nowMs)).join("") ||
          `<div class="ma-rep-empty">${escapeHtml(t("reports.noSpend"))}</div>`
        }
      </div>
      ${
        idle
          ? `<button type="button" class="ma-rep-more" data-always-enabled data-report="empty">${escapeHtml(
              t(
                state.reportShowEmpty ? "reports.hideIdle" : "reports.showIdle",
                { count: idle },
              ),
            )}</button>`
          : ""
      }`;
  }
}
