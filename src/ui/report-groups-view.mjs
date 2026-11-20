import {
  AD_DIMENSIONS,
  GROUP_DIMENSIONS,
  RANKED_DIMENSIONS,
  groupReport,
  sortGroups,
} from "../domain/report-groups.mjs";
import { adsManagerAccountUrl } from "../domain/ads-manager-links.mjs";
import { formatUtcOffset } from "../domain/report-time.mjs";
import { escapeHtml } from "../utils/string.mjs";
import { getLang, t } from "./i18n.mjs";
import { ICONS } from "./icons.mjs";
import { adKindLabel } from "./ad-status-view.mjs";

const GROUP_KEY = "mirrorads.report.groupBy";
const SORTS = ["label", "accounts", "spend", "leads", "purchases"];

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

/** A translation, or the fallback when the key has none. */
function said(key, fallback) {
  const text = t(key);
  return text === key ? fallback : text;
}

/** "Australia" for AU in the panel's language, when the browser knows it. */
function countryName(code) {
  try {
    return (
      new Intl.DisplayNames([getLang() || "en"], { type: "region" }).of(code) ||
      ""
    );
  } catch {
    return "";
  }
}

/**
 * The Groups view of Reports: the accounts of the report gathered by one
 * trait, with spend, leads and purchases per group. Traits of ads need
 * every account's ads, read once per report and only when asked for.
 */
export class ReportGroups {
  constructor(dependencies) {
    this.dependencies = dependencies;
    // The ads of the current report. Kept here, not in the panel state,
    // which every clone run copies whole.
    this.ads = null;
  }

  get dimension() {
    const { state } = this.dependencies;
    if (!GROUP_DIMENSIONS.includes(state.reportGroupBy)) {
      let saved = "";
      try {
        saved = localStorage.getItem(GROUP_KEY) || "";
      } catch {
        saved = "";
      }
      state.reportGroupBy = GROUP_DIMENSIONS.includes(saved)
        ? saved
        : "creative";
    }
    return state.reportGroupBy;
  }

  get sort() {
    const { state } = this.dependencies;
    if (!state.reportGroupSort) state.reportGroupSort = this.naturalSort();
    return state.reportGroupSort;
  }

  /** Ranked traits read best in their own order; the rest by spend. */
  naturalSort() {
    return RANKED_DIMENSIONS.has(this.dimension)
      ? { by: "label", dir: "asc" }
      : { by: "spend", dir: "desc" };
  }

  /** Handles a click; returns false for a click that is not about groups. */
  handle(kind, value) {
    const { state } = this.dependencies;
    if (kind === "groupby" && GROUP_DIMENSIONS.includes(value)) {
      state.reportGroupBy = value;
      try {
        localStorage.setItem(GROUP_KEY, value);
      } catch {
        // The choice still holds for this session.
      }
      state.reportGroupSort = this.naturalSort();
      state.reportGroupOpen = {};
      this.dependencies.render();
      this.ensureAds();
      return true;
    }
    if (kind === "gsort" && SORTS.includes(value)) {
      const sort = this.sort;
      // A second click on the same column turns the order round.
      state.reportGroupSort =
        sort.by === value
          ? { by: value, dir: sort.dir === "asc" ? "desc" : "asc" }
          : { by: value, dir: value === "label" ? "asc" : "desc" };
      this.dependencies.render();
      return true;
    }
    if (kind === "gopen") {
      const open = { ...(state.reportGroupOpen || {}) };
      if (open[value]) delete open[value];
      else open[value] = true;
      state.reportGroupOpen = open;
      this.dependencies.render();
      return true;
    }
    if (kind === "gretry") {
      this.ads = null;
      this.ensureAds();
      return true;
    }
    return false;
  }

  /** Reads the report's ads once, when the Groups view asks for a trait of ads. */
  async ensureAds() {
    const { state } = this.dependencies;
    const report = state.report;
    if (
      !report ||
      state.reportView !== "groups" ||
      !AD_DIMENSIONS.has(this.dimension) ||
      this.ads?.report === report
    ) {
      return;
    }
    const entry = {
      report,
      data: null,
      loading: true,
      done: 0,
      total: report.rows.length,
      error: "",
    };
    this.ads = entry;
    this.dependencies.render();
    try {
      entry.data = await this.dependencies.reportService.loadReportAds(
        report,
        report.rows,
        (done, total) => {
          if (this.ads !== entry) return;
          entry.done = done;
          entry.total = total;
          this.dependencies.render();
        },
      );
      const failed = Object.values(entry.data).filter(
        (item) => item.error,
      ).length;
      this.dependencies.logging?.log(
        failed ? "warn" : "info",
        `Ads read for groups: ${report.rows.length} accounts${failed ? `, ${failed} failed` : ""}.`,
      );
    } catch (error) {
      entry.error = String(error?.message || error);
    }
    entry.loading = false;
    if (this.ads === entry) this.dependencies.render();
  }

  label(group) {
    const dimension = this.dimension;
    if (group.tail) {
      return said(
        `groups.${dimension}.${group.key}`,
        t(`groups.special.${group.key}`),
      );
    }
    if (dimension === "geo" && group.countries?.length === 1) {
      const name = countryName(group.label);
      return name ? `${group.label} · ${name}` : group.label;
    }
    return group.label || t(`groups.${dimension}.${group.key}`);
  }

  head() {
    const sort = this.sort;
    const cell = (by, text) =>
      `<button type="button" class="ma-grp-sort${sort.by === by ? " is-on" : ""}" data-always-enabled data-report="gsort:${by}">${escapeHtml(text)}${
        sort.by === by ? `<em>${sort.dir === "asc" ? "↑" : "↓"}</em>` : ""
      }</button>`;
    return `<div class="ma-grp-head">
        ${cell("label", t("groups.col.group"))}
        ${cell("accounts", t("groups.col.accounts"))}
        ${cell("spend", t("reports.spend"))}
        ${cell("leads", `${t("reports.leads")} / ${t("reports.cpl")}`)}
        ${cell("purchases", `${t("reports.purchases")} / ${t("reports.cpa")}`)}
        <span></span>
      </div>`;
  }

  numbers(item) {
    return `<div class="ma-rep-num is-spend"><b>${money(item.spendUsd)}</b>${
      item.unconverted
        ? `<small title="${escapeHtml(t("groups.unconvertedHint"))}">${escapeHtml(
            t("groups.unconverted", { count: item.unconverted }),
          )}</small>`
        : ""
    }</div>
      <div class="ma-rep-num"><b>${item.leadsKnown ? count(item.leads) : "—"}</b><small>${cost(item.spendUsd, item.leads)}</small></div>
      <div class="ma-rep-num"><b>${item.purchasesKnown ? count(item.purchases) : "—"}</b><small>${cost(item.spendUsd, item.purchases)}</small></div>`;
  }

  accounts(item) {
    return `<div class="ma-grp-accts" title="${escapeHtml(
      t("groups.accountsHint", {
        running: item.running,
        accounts: item.accounts,
      }),
    )}"><b><i class="ma-grp-dot${item.running ? "" : " is-off"}"></i>${item.running}</b><small>${escapeHtml(
      t("groups.ofAccounts", { count: item.accounts }),
    )}</small></div>`;
  }

  /** "running", or why not: the ad's status, or the account's own. */
  memberState(member) {
    if (member.running) return { text: t("groups.running"), tone: "" };
    const reason = String(member.reason || "");
    if (reason.startsWith("health:")) {
      return { text: t(`reports.health.${reason.slice(7)}`), tone: "is-dead" };
    }
    if (reason.startsWith("ad:")) {
      const kind = reason.slice(3);
      return { text: adKindLabel(kind), tone: `is-${kind}` };
    }
    return { text: t("groups.idle"), tone: "" };
  }

  member(member) {
    const status = this.memberState(member);
    const zone =
      member.offsetMinutes === null || member.offsetMinutes === undefined
        ? ""
        : ` · ${formatUtcOffset(member.offsetMinutes)}`;
    return `<div class="ma-grp-member${member.running ? "" : " is-idle"}">
        <div class="ma-grp-who">
          <i class="ma-grp-dot${member.running ? "" : " is-off"}"></i>
          <div class="ma-rep-acct"><b title="${escapeHtml(member.name)}">${escapeHtml(member.name)}</b><span title="${escapeHtml(`${member.accountId}${zone}`)}">${escapeHtml(member.accountId)}</span>${
            member.error
              ? `<div class="ma-rep-note ma-rep-err" title="${escapeHtml(member.error)}">${escapeHtml(t("reports.rowError"))}</div>`
              : ""
          }</div>
        </div>
        <span class="ma-grp-state${status.tone ? ` ${status.tone}` : ""}">${escapeHtml(status.text)}</span>
        <div class="ma-rep-num"><b>${member.unconverted ? "—" : money(member.spendUsd)}</b></div>
        <div class="ma-rep-num"><b>${count(member.leads)}</b><small>${cost(member.spendUsd, member.leads)}</small></div>
        <div class="ma-rep-num"><b>${count(member.purchases)}</b><small>${cost(member.spendUsd, member.purchases)}</small></div>
        <a class="ma-grp-open" href="${escapeHtml(
          adsManagerAccountUrl(member.accountId, { timeZone: member.timeZone }),
        )}" target="_blank" rel="noopener" title="${escapeHtml(t("reports.open"))}">${ICONS.open}</a>
      </div>`;
  }

  table({ groups, total }) {
    const { state } = this.dependencies;
    if (!groups.length) {
      return `<div class="ma-rep-empty">${escapeHtml(t("groups.empty"))}</div>`;
    }
    const open = state.reportGroupOpen || {};
    const rows = sortGroups(groups, this.sort.by, this.sort.dir)
      .map((group) => {
        const share = Math.round(group.share * 1000) / 10;
        const isOpen = Boolean(open[group.key]);
        return `<div class="ma-grp-row${isOpen ? " is-open" : ""}${group.tail ? " is-tail" : ""}" role="button" tabindex="0" aria-expanded="${isOpen}" data-always-enabled data-report="gopen:${escapeHtml(group.key)}">
            <div class="ma-grp-name">
              <b title="${escapeHtml(this.label(group))}">${escapeHtml(this.label(group))}</b>
              <span class="ma-grp-bar"><i style="width:${Math.min(100, share)}%"></i></span>
              <small>${escapeHtml(t("groups.share", { share }))}</small>
            </div>
            ${this.accounts(group)}
            ${this.numbers(group)}
            <span class="ma-grp-chev">${ICONS.chevron}</span>
          </div>${
            isOpen
              ? `<div class="ma-grp-members">${group.members.map((member) => this.member(member)).join("")}</div>`
              : ""
          }`;
      })
      .join("");
    return `${this.head()}
      <div class="ma-grp-list">${rows}</div>
      <div class="ma-grp-total">
        <div class="ma-grp-name"><b>${escapeHtml(t("groups.total"))}</b><small>${escapeHtml(
          t("groups.groupsCount", { count: groups.length }),
        )}</small></div>
        ${this.accounts(total)}
        ${this.numbers(total)}
        <span></span>
      </div>
      ${
        AD_DIMENSIONS.has(this.dimension)
          ? `<div class="ma-grp-note">${escapeHtml(t("groups.multiNote"))}</div>`
          : ""
      }`;
  }

  body(report, rows) {
    const dimension = this.dimension;
    if (!AD_DIMENSIONS.has(dimension)) {
      return this.table(groupReport({ dimension, rows, nowMs: report.nowMs }));
    }
    const ads = this.ads?.report === report ? this.ads : null;
    if (!ads || ads.loading) {
      const done = ads?.done || 0;
      const total = ads?.total || report.rows.length || 1;
      return `<div class="ma-grp-loading">
          <span class="ma-grp-progress"><i style="width:${Math.round((done / total) * 100)}%"></i></span>
          <span>${escapeHtml(t("groups.loadingAds", { done, total }))}</span>
        </div>`;
    }
    if (ads.error) {
      return `<div class="ma-rep-warn">${escapeHtml(t("groups.adsFailed", { error: ads.error }))}
          <button type="button" class="ma-rep-blink" data-always-enabled data-report="gretry">${escapeHtml(t("groups.retry"))}</button></div>`;
    }
    const failed = rows.filter((row) => ads.data?.[row.accountId]?.error);
    return `${
      failed.length
        ? `<div class="ma-rep-warn">${escapeHtml(t("groups.someFailed", { count: failed.length }))}
            <button type="button" class="ma-rep-blink" data-always-enabled data-report="gretry">${escapeHtml(t("groups.retry"))}</button></div>`
        : ""
    }${this.table(groupReport({ dimension, rows, ads: ads.data, nowMs: report.nowMs }))}`;
  }

  /** The view under the status filter; `rows` are the lines it shows. */
  markup(report, rows) {
    const dimension = this.dimension;
    const pills = GROUP_DIMENSIONS.map(
      (item) =>
        `<button type="button" class="ma-grp-pill${item === dimension ? " is-on" : ""}" data-always-enabled data-report="groupby:${item}">${escapeHtml(
          t(`groups.dim.${item}`),
        )}</button>`,
    ).join("");
    return `<div class="ma-grp">
        <div class="ma-grp-by">
          <span>${escapeHtml(t("groups.by"))}</span>
          <div class="ma-grp-pills">${pills}</div>
        </div>
        <div class="ma-grp-hint">${escapeHtml(t(`groups.hint.${dimension}`))}</div>
        ${this.body(report, rows)}
      </div>`;
  }
}
