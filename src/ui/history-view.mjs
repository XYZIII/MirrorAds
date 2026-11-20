import {
  HISTORY_FILTERS,
  filterCounts,
  filterEvents,
} from "../domain/account-history.mjs";
import { adsManagerAccountUrl } from "../domain/ads-manager-links.mjs";
import { escapeHtml } from "../utils/string.mjs";
import { ICONS } from "./icons.mjs";
import { getLang, t } from "./i18n.mjs";

/** Events listed at most; older ones stay stored. */
const SHOWN_LIMIT = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

function locale() {
  return getLang() === "ru" ? "ru-RU" : "en-US";
}

function dayKey(ms) {
  const date = new Date(ms);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** "Today", "Yesterday" or the date, in the viewer's own time. */
export function dayLabel(ms, nowMs = Date.now()) {
  if (dayKey(ms) === dayKey(nowMs)) return t("history.today");
  if (dayKey(ms) === dayKey(nowMs - DAY_MS)) return t("history.yesterday");
  return new Date(ms).toLocaleDateString(locale(), {
    day: "numeric",
    month: "long",
  });
}

function timeLabel(ms) {
  return new Date(ms).toLocaleTimeString(locale(), {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function health(value) {
  return value ? t(`reports.health.${value}`) : "";
}

/** What an event says about its account, in a few words. */
export function eventText(event) {
  switch (event.k) {
    case "new":
      return t("history.text.new", { status: health(event.to) });
    case "returned":
      return t("history.text.returned", { status: health(event.to) });
    case "gone":
      return t("history.text.gone", { status: health(event.from) });
    case "start": {
      const parts = Object.entries(event.counts || {})
        .sort((a, b) => b[1] - a[1])
        .map(([kind, count]) => t(`history.count.${kind}`, { count }));
      return t("history.text.start", {
        count: event.count || 0,
        parts: parts.join(", "),
      });
    }
    default:
      return `${health(event.from)} → ${health(event.to)}`;
  }
}

/**
 * The History tab: what changed in the profile's ad accounts from one open
 * of the panel to the next.
 */
export class HistoryView {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.filter = "all";
    this.armed = false;
    this.highlightSince = 0;
    this.boundRoot = null;
    this.open = this.open.bind(this);
    this.render = this.render.bind(this);
  }

  get history() {
    return this.dependencies.accountHistory;
  }

  get panel() {
    const { dom, appId } = this.dependencies;
    return dom.root?.querySelector(`#${appId}-panel-history`) || null;
  }

  /** The tab is shown: its events count as seen from now on. */
  open() {
    this.armed = false;
    this.highlightSince = this.history?.markSeen() ?? 0;
    this.render();
  }

  bind(root) {
    if (!root || this.boundRoot === root) return;
    this.boundRoot = root;
    root.addEventListener("click", (event) => {
      const target = event.target.closest?.("[data-history]");
      if (!target || !this.panel?.contains(target)) return;
      const [kind, value] = String(target.dataset.history).split(":");
      if (kind === "filter" && value in HISTORY_FILTERS) {
        this.filter = value;
        this.armed = false;
      } else if (kind === "clear") {
        if (this.armed) {
          this.history?.clear();
          this.armed = false;
          this.highlightSince = 0;
        } else this.armed = true;
      }
      this.render();
    });
    this.history?.onChange(() => this.syncBadge());
    this.syncBadge();
  }

  /** The number of unseen changes on the tab button. */
  syncBadge() {
    const button = this.dependencies.dom.root?.querySelector(
      '.ma-tab[data-tab="history"]',
    );
    if (!button) return;
    const visible = this.dependencies.state.activeTab === "history";
    const count = visible ? 0 : this.history?.unseenCount() || 0;
    let badge = button.querySelector(".ma-tab-badge");
    if (!count) {
      badge?.remove();
      button.title = t("tab.history");
      return;
    }
    if (!badge) {
      badge = button.ownerDocument.createElement("em");
      badge.className = "ma-tab-badge";
      button.append(badge);
    }
    badge.textContent = count > 99 ? "99+" : String(count);
    button.title = `${t("tab.history")} · ${t("history.unseen", { count })}`;
  }

  rowMarkup(event) {
    const unseen =
      this.highlightSince &&
      event.k !== "start" &&
      event.t > this.highlightSince;
    const account = event.id
      ? `<div class="ma-his-acct"><b title="${escapeHtml(event.n || event.id)}">${escapeHtml(event.n || event.id)}</b><span>${escapeHtml(event.id)}</span></div>`
      : `<div class="ma-his-acct"><b>${escapeHtml(t("history.profile"))}</b></div>`;
    const open = event.id
      ? `<a class="ma-his-open" href="${escapeHtml(adsManagerAccountUrl(event.id))}" target="_blank" rel="noopener" title="${escapeHtml(t("reports.open"))}">${ICONS.open}</a>`
      : "<span></span>";
    return `<div class="ma-his-row is-${escapeHtml(event.k)}${unseen ? " is-unseen" : ""}">
        <span class="ma-his-time">${escapeHtml(timeLabel(event.t))}</span>
        <span class="ma-his-kind">${escapeHtml(t(`history.kind.${event.k}`))}</span>
        ${account}
        <span class="ma-his-change">${escapeHtml(eventText(event))}</span>
        ${open}
      </div>`;
  }

  render() {
    const panel = this.panel;
    if (!panel) return;
    this.syncBadge();
    const history = this.history?.read() || { snapshot: null, events: [] };
    const snapshot = history.snapshot;
    if (!snapshot) {
      panel.innerHTML = `<div class="ma-his-intro">${escapeHtml(t("history.waiting"))}</div>`;
      return;
    }
    const nowMs = Date.now();
    const accounts = Object.values(snapshot.accounts || {}).filter(
      (entry) => !entry.g,
    );
    const live = accounts.filter(
      (entry) => entry.h === "live" || entry.h === "unknown",
    ).length;
    const week = history.events.filter(
      (event) => event.k !== "start" && nowMs - event.t < 7 * DAY_MS,
    );
    const weekOf = (kinds) =>
      week.filter((event) => kinds.includes(event.k)).length;
    const tile = (label, value, sub = "") =>
      `<div class="ma-rep-tile"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b>${
        sub ? `<small>${escapeHtml(sub)}</small>` : ""
      }</div>`;
    const tiles = `<div class="ma-rep-tiles ma-his-tiles">
        ${tile(t("history.now"), String(accounts.length), t("history.nowSub", { live, dead: accounts.length - live }))}
        ${tile(
          t("history.week"),
          String(week.length),
          t("history.weekSub", {
            fresh: weekOf(HISTORY_FILTERS.new),
            banned: weekOf(HISTORY_FILTERS.banned),
            billing: weekOf(HISTORY_FILTERS.billing),
            gone: weekOf(HISTORY_FILTERS.gone),
          }),
        )}
        ${tile(
          t("history.since"),
          new Date(snapshot.first).toLocaleDateString(locale(), {
            day: "numeric",
            month: "short",
          }),
          t("history.lastCheck", {
            when: `${dayLabel(snapshot.last, nowMs).toLowerCase()} ${timeLabel(snapshot.last)}`,
          }),
        )}
      </div>`;
    const counts = filterCounts(history.events);
    const filters = `<div class="ma-rep-controls ma-his-bar">
        <div class="ma-seg" role="group">${Object.keys(HISTORY_FILTERS)
          .map(
            (filter) =>
              `<button type="button" data-always-enabled data-history="filter:${filter}" class="${filter === this.filter ? "is-on" : ""}">${escapeHtml(
                t(`history.filter.${filter}`),
              )}<em>${counts[filter] || 0}</em></button>`,
          )
          .join("")}</div>
        <button type="button" class="ma-his-clear${this.armed ? " is-armed" : ""}" data-always-enabled data-history="clear" title="${escapeHtml(t("history.clearHint"))}">${escapeHtml(
          this.armed ? t("history.clearSure") : t("history.clear"),
        )}</button>
      </div>`;
    const events = filterEvents(history.events, this.filter);
    const shown = events.slice(0, SHOWN_LIMIT);
    let list = "";
    let day = "";
    for (const event of shown) {
      const label = dayLabel(event.t, nowMs);
      if (label !== day) {
        day = label;
        list += `<div class="ma-his-day">${escapeHtml(label)}</div>`;
      }
      list += this.rowMarkup(event);
    }
    const changes = history.events.some((event) => event.k !== "start");
    const empty = !shown.length
      ? `<div class="ma-his-empty">${escapeHtml(
          this.filter === "all" ? t("history.empty") : t("history.emptyFilter"),
        )}</div>`
      : !changes && this.filter === "all"
        ? `<div class="ma-his-empty">${escapeHtml(t("history.empty"))}</div>`
        : "";
    const more =
      events.length > shown.length
        ? `<div class="ma-his-more">${escapeHtml(t("history.shown", { count: shown.length, total: events.length }))}</div>`
        : "";
    panel.innerHTML = `<div class="ma-his-intro">${escapeHtml(t("history.intro"))}</div>${tiles}${filters}${empty}<div class="ma-his-list">${list}</div>${more}`;
  }
}

/** Styles of the History tab and the badge on its button. */
export function buildHistoryStyles(A) {
  return `
      ${A} .ma-rail .ma-tab { position: relative; }
      ${A} .ma-tab-badge {
        position: absolute;
        top: 3px;
        right: 5px;
        min-width: 16px;
        height: 16px;
        padding: 0 4px;
        border-radius: 999px;
        background: #ef4444;
        color: #ffffff;
        font-size: 10px;
        font-style: normal;
        font-weight: 700;
        line-height: 16px;
        text-align: center;
        box-sizing: border-box;
      }
      ${A} .ma-his-intro { margin: 0 0 12px; font-size: 12px; line-height: 1.5; color: var(--ma-muted); }
      ${A} .ma-his-tiles .ma-rep-tile b { font-size: 20px; }
      ${A} .ma-his-bar { justify-content: space-between; margin-bottom: 12px; }
      ${A} .ma-his-bar .ma-seg { flex-wrap: wrap; }
      ${A} button.ma-his-clear {
        width: auto;
        min-height: 30px;
        padding: 0 12px;
        border: 1px solid var(--ma-line);
        border-radius: 999px;
        background: #ffffff;
        color: var(--ma-muted);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      ${A} button.ma-his-clear:hover:not(:disabled) { background: var(--ma-soft); color: var(--ma-ink); }
      ${A} button.ma-his-clear.is-armed,
      ${A} button.ma-his-clear.is-armed:hover:not(:disabled) { border-color: #ef4444; background: #ef4444; color: #ffffff; }
      ${A} .ma-his-day {
        margin: 14px 0 6px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--ma-faint);
      }
      ${A} .ma-his-day:first-child { margin-top: 0; }
      ${A} .ma-his-row {
        display: grid;
        grid-template-columns: 44px 92px minmax(0, 1fr) minmax(0, 1.1fr) 26px;
        align-items: center;
        column-gap: 10px;
        margin-top: 4px;
        padding: 8px 10px;
        border: 1px solid var(--ma-line);
        border-radius: 12px;
        background: #ffffff;
      }
      ${A} .ma-his-row.is-unseen { border-color: #b4f461; box-shadow: inset 3px 0 0 var(--ma-lime); }
      ${A} .ma-his-time { font-size: 12px; color: var(--ma-faint); font-variant-numeric: tabular-nums; }
      ${A} .ma-his-kind {
        justify-self: start;
        padding: 2px 9px;
        border-radius: 999px;
        background: #f1f2f5;
        color: var(--ma-muted);
        font-size: 11px;
        font-weight: 700;
        white-space: nowrap;
      }
      ${A} .ma-his-row.is-new .ma-his-kind,
      ${A} .ma-his-row.is-returned .ma-his-kind { background: #dbeafe; color: #1e40af; }
      ${A} .ma-his-row.is-banned .ma-his-kind,
      ${A} .ma-his-row.is-closed .ma-his-kind { background: #ffe9e9; color: #b42318; }
      ${A} .ma-his-row.is-review .ma-his-kind,
      ${A} .ma-his-row.is-billing .ma-his-kind { background: #fff7e0; color: #7a5200; }
      ${A} .ma-his-row.is-live .ma-his-kind { background: #dcf7c0; color: #1f6a10; }
      ${A} .ma-his-row.is-gone .ma-his-kind { background: #ede9fe; color: #5b21b6; }
      ${A} .ma-his-row.is-start .ma-his-kind { background: #111827; color: var(--ma-lime); }
      ${A} .ma-his-acct { min-width: 0; }
      ${A} .ma-his-acct > b {
        display: block;
        overflow: hidden;
        font-size: 13px;
        font-weight: 600;
        color: var(--ma-ink);
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      ${A} .ma-his-acct > span { display: block; font-size: 11px; color: var(--ma-faint); font-variant-numeric: tabular-nums; }
      ${A} .ma-his-change { min-width: 0; font-size: 12px; line-height: 1.4; color: var(--ma-muted); }
      ${A} .ma-his-open { display: inline-flex; color: var(--ma-faint); }
      ${A} .ma-his-open:hover { color: var(--ma-ink); }
      ${A} .ma-his-open .ma-ico { width: 16px; height: 16px; }
      ${A} .ma-his-empty,
      ${A} .ma-his-more { margin: 10px 0; padding: 14px; border-radius: 12px; background: var(--ma-soft); font-size: 12px; line-height: 1.5; color: var(--ma-muted); }
      ${A} .ma-his-more { padding: 8px 12px; text-align: center; }
  `;
}
