import {
  accountDelivers,
  addDays,
  clockInZone,
  dateInZone,
  filterReportRows,
  formatUtcOffset,
  isKnownTimeZone,
  reportZoneChoices,
  totalReport,
  validateCustomPeriod,
  zoneOffsetMinutes,
} from "../domain/report-time.mjs";
import { escapeHtml } from "../utils/string.mjs";
import { t } from "./i18n.mjs";
import { ICONS } from "./icons.mjs";

const PERIODS = ["today", "yesterday", "last7", "custom"];
const STATUSES = ["all", "live", "dead"];
const ZONE_KEY = "mirrorads.report.zone";
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

  /** The browser's zone. Anti-detect profiles and proxies often change it. */
  browserZone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  }

  /** The zone "My time" uses: the one picked by hand, else the browser's. */
  viewerZone() {
    const { state } = this.dependencies;
    if (state.reportViewerZone === null) {
      let saved = "";
      try {
        saved = localStorage.getItem(ZONE_KEY) || "";
      } catch {
        saved = "";
      }
      state.reportViewerZone = isKnownTimeZone(saved) ? saved : "";
    }
    return state.reportViewerZone || this.browserZone();
  }

  setViewerZone(zone) {
    const { state } = this.dependencies;
    state.reportViewerZone = isKnownTimeZone(zone) ? zone : "";
    try {
      if (state.reportViewerZone) {
        localStorage.setItem(ZONE_KEY, state.reportViewerZone);
      } else {
        localStorage.removeItem(ZONE_KEY);
      }
    } catch {
      // The choice still holds for this session.
    }
  }

  /** The custom period, defaulting to yesterday and today. */
  customPeriod() {
    const { state } = this.dependencies;
    if (!state.reportCustom) {
      const today = dateInZone(Date.now(), this.viewerZone());
      state.reportCustom = {
        since: addDays(today, -1),
        until: today,
        withTime: false,
        sinceHour: 0,
        untilHour: 23,
      };
    }
    return state.reportCustom;
  }

  /** Reads the custom period inputs back into state. */
  readCustomInputs() {
    const panel = this.panel;
    const custom = this.customPeriod();
    const value = (name) =>
      panel?.querySelector(`[data-report-input="${name}"]`)?.value;
    custom.since = value("since") || custom.since;
    custom.until = value("until") || custom.until;
    if (custom.withTime) {
      custom.sinceHour = Number(value("sinceHour") ?? custom.sinceHour);
      custom.untilHour = Number(value("untilHour") ?? custom.untilHour);
    }
    return custom;
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
        // A custom period waits for its dates and the Show button.
        if (value === "custom") this.render();
        else this.load();
      } else if (kind === "zone" && ZONES.includes(value)) {
        this.readCustomInputs();
        state.reportZone = value;
        this.load();
      } else if (kind === "apply") {
        this.readCustomInputs();
        this.load();
      } else if (kind === "time") {
        this.readCustomInputs().withTime = !this.customPeriod().withTime;
        this.render();
      } else if (kind === "refresh") {
        this.readCustomInputs();
        this.load();
      } else if (kind === "status" && STATUSES.includes(value)) {
        state.reportStatusFilter = value;
        this.render();
      } else if (kind === "empty") {
        state.reportShowEmpty = !state.reportShowEmpty;
        this.render();
      }
    });
    root.addEventListener("change", (event) => {
      const select = event.target.closest?.("[data-report-viewer-zone]");
      if (!select || !this.panel?.contains(select)) return;
      this.readCustomInputs();
      this.setViewerZone(select.value);
      this.load();
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
    const custom = state.reportPeriod === "custom" ? this.customPeriod() : null;
    const invalid = custom ? validateCustomPeriod(custom) : "";
    if (invalid) {
      state.reportError = t(`reports.custom.${invalid}`);
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
        custom: custom ? { ...custom } : null,
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
    const delivers = accountDelivers(row.health);
    const running = delivers ? row.activeCampaigns || 0 : 0;
    const health =
      row.health && row.health !== "unknown"
        ? `<i class="ma-rep-health ma-rep-health-${row.health}" title="${escapeHtml(
            t("reports.healthHint", {
              status: row.statusCode ?? "?",
              reason: row.disableReason || "—",
            }),
          )}">${escapeHtml(t(`reports.health.${row.health}`))}</i>`
        : "";
    const counts =
      row.activeCampaigns === null || row.activeCampaigns === undefined
        ? ""
        : delivers
          ? `<i class="ma-rep-on${row.activeCampaigns ? "" : " is-zero"}" title="${escapeHtml(t("reports.activeHint"))}">${escapeHtml(
              t("reports.active", { count: row.activeCampaigns }),
            )}</i><i class="ma-rep-off" title="${escapeHtml(t("reports.inactiveHint"))}">${escapeHtml(
              t("reports.inactive", { count: row.inactiveCampaigns }),
            )}</i>`
          : row.activeCampaigns
            ? `<i class="ma-rep-stuck" title="${escapeHtml(t("reports.stuckHint"))}">${escapeHtml(
                t("reports.stuck", { count: row.activeCampaigns }),
              )}</i>`
            : "";
    const campaigns =
      health || counts
        ? `<div class="ma-rep-camps">${health}${counts}</div>`
        : "";
    const spendUsd =
      row.spendUsd === null && row.spend > 0 ? null : row.spendUsd;
    return `
      <div class="ma-rep-row${row.spend > 0 || running > 0 ? "" : " ma-rep-zero"}${delivers ? "" : " ma-rep-dead"}">
        <div class="ma-rep-acct">
          <b title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</b>
          <span>${escapeHtml(row.accountId)}${zone ? ` · ${escapeHtml(zone)}` : ""}</span>
          ${campaigns}${note}
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
    const custom = this.customPeriod();
    const hours = (selected, last) =>
      Array.from({ length: 24 }, (_, hour) => {
        const label = `${String(hour).padStart(2, "0")}:${last ? "59" : "00"}`;
        return `<option value="${hour}" ${hour === Number(selected) ? "selected" : ""}>${label}</option>`;
      }).join("");
    const customRow =
      state.reportPeriod === "custom"
        ? `<div class="ma-rep-custom">
            <input type="date" data-report-input="since" value="${escapeHtml(custom.since)}" />
            ${custom.withTime ? `<select data-report-input="sinceHour">${hours(custom.sinceHour, false)}</select>` : ""}
            <span>—</span>
            <input type="date" data-report-input="until" value="${escapeHtml(custom.until)}" />
            ${custom.withTime ? `<select data-report-input="untilHour">${hours(custom.untilHour, true)}</select>` : ""}
            <button type="button" class="ma-rep-time${custom.withTime ? " is-on" : ""}" data-always-enabled data-report="time" title="${escapeHtml(t("reports.custom.timeHint"))}">${escapeHtml(t("reports.custom.time"))}</button>
            <button type="button" class="ma-primary ma-rep-apply" data-always-enabled data-report="apply" ${
              state.reportLoading ? "disabled" : ""
            }>${escapeHtml(t("reports.custom.apply"))}</button>
          </div>`
        : "";
    const choices = reportZoneChoices();
    const zoneLabel = (zone) =>
      `${zone.replace(/^.*\//, "").replace(/_/g, " ")} (${formatUtcOffset(zoneOffsetMinutes(Date.now(), zone))})`;
    const option = (zone, label) =>
      `<option value="${escapeHtml(zone)}" ${zone === state.reportViewerZone ? "selected" : ""}>${escapeHtml(label)}</option>`;
    const zoneSelect =
      state.reportZone === "viewer"
        ? `<label class="ma-rep-zonepick"><span>${escapeHtml(t("reports.zonePick"))}</span>
            <select data-report-viewer-zone>
              <option value="" ${state.reportViewerZone ? "" : "selected"}>${escapeHtml(
                t("reports.zoneAuto", { zone: zoneLabel(this.browserZone()) }),
              )}</option>
              <optgroup label="${escapeHtml(t("reports.zoneCities"))}">${choices.cities
                .map((zone) => option(zone, zoneLabel(zone)))
                .join("")}</optgroup>
              <optgroup label="${escapeHtml(t("reports.zoneOffsets"))}">${choices.offsets
                .map((item) => option(item.zone, item.label))
                .join("")}</optgroup>
            </select></label>`
        : "";
    const controls = `
      <div class="ma-rep-controls">
        ${this.segment("period", PERIODS, state.reportPeriod)}
        <button type="button" class="ma-secondary ma-rep-refresh" data-always-enabled data-report="refresh" ${
          state.reportLoading ? "disabled" : ""
        }>${ICONS.refresh}<span>${escapeHtml(
          state.reportLoading
            ? `${t("reports.loading")} ${state.reportProgress}`
            : t("reports.refresh"),
        )}</span></button>
      </div>
      ${customRow}
      <div class="ma-rep-controls">
        ${this.segment("zone", ZONES, state.reportZone)}
        ${zoneSelect}
      </div>
      <div class="ma-rep-zonehint">${escapeHtml(
        state.reportZone === "viewer"
          ? t("reports.zoneHint.viewer", { zone: zoneLabel(viewerZone) })
          : t("reports.zoneHint.account"),
      )}</div>
      ${
        state.reportError && report
          ? `<div class="ma-rep-warn">${escapeHtml(state.reportError)}</div>`
          : ""
      }`;
    const statusFilter = `
      <div class="ma-rep-controls ma-rep-statusbar">
        <span>${escapeHtml(t("reports.statusLabel"))}</span>
        ${this.segment("status", STATUSES, state.reportStatusFilter)}
      </div>`;
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
    const filter = state.reportStatusFilter;
    const rows = filterReportRows(report.rows, filter);
    // The tiles add up what the status filter shows.
    const total = filter === "all" ? report.total : totalReport(rows);
    // An account whose campaigns are running matters even before it spends.
    // The "not working" filter lists every such account, spending or not.
    const spent =
      filter === "dead"
        ? rows
        : rows.filter(
            (row) =>
              row.spend > 0 ||
              row.error ||
              (accountDelivers(row.health) && row.activeCampaigns > 0),
          );
    const idle = rows.length - spent.length;
    const visible = state.reportShowEmpty ? rows : spent;
    const tile = (label, value, sub = "") =>
      `<div class="ma-rep-tile"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b>${
        sub ? `<small>${escapeHtml(sub)}</small>` : ""
      }</div>`;
    panel.innerHTML = `
      ${controls}
      <div class="ma-rep-tiles${state.reportLoading ? " ma-rep-stale" : ""}">
        ${tile(t("reports.spend"), money(total.spendUsd), `${t("reports.accountsSpending", { count: total.accounts })} · ${t("reports.activeTotal", { count: total.activeCampaigns })}`)}
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
      ${statusFilter}
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
          `<div class="ma-rep-empty">${escapeHtml(t(filter === "dead" ? "reports.noDead" : "reports.noSpend"))}</div>`
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
