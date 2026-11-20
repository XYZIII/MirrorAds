import {
  TREND_BREAKDOWNS,
  assignSlots,
  niceTicks,
  trendFrame,
  trendSeries,
} from "../domain/spend-trend.mjs";
import { runPool } from "../utils/pool.mjs";
import { escapeHtml } from "../utils/string.mjs";
import { t } from "./i18n.mjs";

const ON_KEY = "mirrorads.report.trend";
const BY_KEY = "mirrorads.report.trendBy";
const CONCURRENCY = 6;

// Categorical slots in fixed order (validated: adjacent CVD ΔE ≥ 9 on the
// light surface), and the gray every folded "other" series wears.
const SLOTS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const OTHER = "#a8a7a0";
const STATUS_SLOTS = { live: 0, dead: 1 };

const PLOT_HEIGHT = 168;
const TOP = 20;
const BOTTOM = 24;
const RIGHT = 8;
const GAP = 2;
const RADIUS = 4;

const money = (value) =>
  `$${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  })}`;
const exact = (value) =>
  `$${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
const axisMoney = (value) =>
  value >= 10000
    ? `$${Math.round(value / 1000)}K`
    : `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

function readSaved(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The choice still holds for this session.
  }
}

/** A column segment: square at the bottom, rounded on top when it ends the stack. */
function segmentPath(x, width, bottom, top, rounded) {
  const r = rounded ? Math.min(RADIUS, (bottom - top) / 2, width / 2) : 0;
  if (r <= 0) {
    return `M${x},${bottom}V${top}H${x + width}V${bottom}Z`;
  }
  return `M${x},${bottom}V${top + r}Q${x},${top} ${x + r},${top}H${x + width - r}Q${x + width},${top} ${x + width},${top + r}V${bottom}Z`;
}

/**
 * The spend chart of Reports: switched on and off from the report's top
 * row, read only while it is on, broken down by account, time zone or
 * account status.
 */
export class ReportTrend {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.enabled = readSaved(ON_KEY, "0") === "1";
    const by = readSaved(BY_KEY, "total");
    this.breakdown = TREND_BREAKDOWNS.includes(by) ? by : "total";
    this.table = false;
    this.data = null;
    this.colors = new Map();
    this.view = null;
  }

  /** The chart's switch for the report's top row. */
  toggleMarkup(icon) {
    return `<button type="button" class="ma-rep-trendbtn${this.enabled ? " is-on" : ""}" data-always-enabled data-report="trend:toggle" aria-pressed="${this.enabled}" title="${escapeHtml(t("trend.toggleHint"))}">${icon}<span>${escapeHtml(t("trend.toggle"))}</span></button>`;
  }

  /** Handles a click; returns false for a click that is not about the chart. */
  handle(kind, value) {
    if (kind === "trend" && value === "toggle") {
      this.enabled = !this.enabled;
      save(ON_KEY, this.enabled ? "1" : "0");
      this.dependencies.render();
      this.ensure();
      return true;
    }
    if (kind === "trend" && value === "table") {
      this.table = !this.table;
      this.dependencies.render();
      return true;
    }
    if (kind === "trendby" && TREND_BREAKDOWNS.includes(value)) {
      this.breakdown = value;
      save(BY_KEY, value);
      this.dependencies.render();
      return true;
    }
    return false;
  }

  /** Reads every spending account's series once per report, while the chart is on. */
  async ensure() {
    const { state, reportService } = this.dependencies;
    const report = state.report;
    if (!this.enabled || !report || this.data?.report === report) return;
    const frame = trendFrame({
      period: report.period,
      custom: report.custom,
      nowMs: report.nowMs,
      zone: report.viewerZone,
    });
    const rows = report.rows.filter((row) => !row.error && row.spend > 0);
    const entry = {
      report,
      frame,
      buckets: new Map(),
      missing: { hourly: 0, currency: 0, failed: 0 },
      loading: true,
      done: 0,
      total: rows.length,
    };
    this.data = entry;
    this.dependencies.render();
    await runPool(rows, CONCURRENCY, async (row) => {
      try {
        const result = await reportService.loadSpendSeries(row, report, frame);
        if (result.values) entry.buckets.set(row.accountId, result.values);
        else entry.missing[result.reason] += 1;
      } catch {
        entry.missing.failed += 1;
      }
      entry.done += 1;
      if (this.data === entry && entry.done % 4 === 0) {
        this.dependencies.render();
      }
    });
    entry.loading = false;
    if (this.data === entry) this.dependencies.render();
  }

  seriesLabel(series) {
    if (series.other) return t("trend.other", { count: series.size || 0 });
    if (this.breakdown === "status") return t(`trend.status.${series.key}`);
    if (this.breakdown === "total") return t("trend.total");
    return series.label;
  }

  /** Colours for the series: fixed for status, remembered for the others. */
  seriesColors(series) {
    if (this.breakdown === "status") {
      return series.map((item) => SLOTS[STATUS_SLOTS[item.key] ?? 0]);
    }
    const memory = this.colors.get(this.breakdown) || new Map();
    this.colors.set(this.breakdown, memory);
    const named = series.filter((item) => !item.other).map((item) => item.key);
    const slots = assignSlots(named, memory, SLOTS.length);
    return series.map((item) =>
      item.other ? OTHER : SLOTS[slots.get(item.key) ?? 0],
    );
  }

  /** The chart card for the rows the filters show; "" while it is off. */
  markup(rows) {
    if (!this.enabled) return "";
    const entry = this.data;
    if (!entry || entry.report !== this.dependencies.state.report) {
      return `<div class="ma-trend"><div class="ma-trend-note">${escapeHtml(t("trend.loading", { done: 0, total: "…" }))}</div></div>`;
    }
    const { frame } = entry;
    const series = trendSeries(
      rows,
      entry.buckets,
      this.breakdown,
      frame.count,
    );
    const colors = this.seriesColors(series);
    const totals = frame.labels.map((_, index) =>
      series.reduce((sum, item) => sum + item.values[index], 0),
    );
    const zone = this.dependencies.state.report?.zoneMode === "viewer";
    const head = `<div class="ma-trend-head">
        <div><b>${escapeHtml(t(frame.unit === "hour" ? "trend.titleHours" : "trend.titleDays"))}</b><span>${escapeHtml(
          t(zone ? "trend.clockViewer" : "trend.clockAccount"),
        )}</span></div>
        <div class="ma-seg ma-trend-by" role="group">${TREND_BREAKDOWNS.map(
          (by) =>
            `<button type="button" data-always-enabled data-report="trendby:${by}" class="${by === this.breakdown ? "is-on" : ""}">${escapeHtml(t(`trend.by.${by}`))}</button>`,
        ).join("")}</div>
      </div>`;
    const notes = [
      entry.loading
        ? t("trend.loading", { done: entry.done, total: entry.total })
        : "",
      entry.missing.hourly
        ? t("trend.noHourly", { count: entry.missing.hourly })
        : "",
      entry.missing.currency
        ? t("trend.noRate", { count: entry.missing.currency })
        : "",
      entry.missing.failed
        ? t("trend.failed", { count: entry.missing.failed })
        : "",
    ].filter(Boolean);
    const note = notes.length
      ? `<div class="ma-trend-note">${escapeHtml(notes.join(" · "))}</div>`
      : "";
    if (!series.length) {
      this.view = null;
      return `<div class="ma-trend">${head}${note}${
        entry.loading
          ? ""
          : `<div class="ma-trend-empty">${escapeHtml(t("trend.empty"))}</div>`
      }</div>`;
    }
    this.view = { frame, series, colors, totals };
    const legend =
      series.length > 1
        ? `<div class="ma-trend-legend">${series
            .map(
              (item, index) =>
                `<span class="ma-trend-key"><i style="background:${colors[index]}"></i><span title="${escapeHtml(this.seriesLabel(item))}">${escapeHtml(this.seriesLabel(item))}</span><b>${escapeHtml(money(item.total))}</b></span>`,
            )
            .join("")}</div>`
        : "";
    const tableButton = `<button type="button" class="ma-trend-tablebtn" data-always-enabled data-report="trend:table" aria-pressed="${this.table}">${escapeHtml(
      t(this.table ? "trend.hideTable" : "trend.showTable"),
    )}</button>`;
    return `<div class="ma-trend${entry.loading ? " is-stale" : ""}">
        ${head}${note}
        <div class="ma-trend-plot" data-trend-plot>${this.svg(frame, series, colors, totals)}<div class="ma-trend-tip" data-trend-tip hidden></div></div>
        <div class="ma-trend-foot">${legend}${tableButton}</div>
        ${this.table ? this.tableMarkup(frame, series, totals) : ""}
      </div>`;
  }

  svg(frame, series, colors, totals) {
    // Drawn at the width it is shown at, so its text keeps its size.
    const measured = Math.round(this.dependencies.panel()?.clientWidth || 0);
    const width = measured > 0 ? Math.max(320, measured - 30) : 640;
    const ticks = niceTicks(Math.max(...totals));
    const top = ticks[ticks.length - 1] || 1;
    const left =
      Math.max(...ticks.map((tick) => axisMoney(tick).length)) * 7 + 10;
    const plotWidth = width - left - RIGHT;
    const height = TOP + PLOT_HEIGHT + BOTTOM;
    const band = plotWidth / frame.count;
    const barWidth = Math.max(2, Math.min(24, band * 0.64));
    const y = (value) => TOP + PLOT_HEIGHT - (value / top) * PLOT_HEIGHT;
    const grid = ticks
      .map(
        (tick) =>
          `<line x1="${left}" x2="${width - RIGHT}" y1="${y(tick)}" y2="${y(tick)}" class="${tick === 0 ? "ma-trend-base" : "ma-trend-grid"}"/><text x="${left - 8}" y="${y(tick) + 4}" class="ma-trend-ytick">${escapeHtml(axisMoney(tick))}</text>`,
      )
      .join("");
    // Labels never crowd: every n-th one, so each has room.
    const labelWidth = frame.unit === "hour" ? 24 : 40;
    const every = Math.max(1, Math.ceil(labelWidth / band));
    const xLabels = frame.labels
      .map((label, index) => {
        if (index % every) return "";
        const text =
          frame.unit === "hour" && label === "00" && index > 0
            ? frame.days[index]
            : label;
        return `<text x="${left + band * index + band / 2}" y="${TOP + PLOT_HEIGHT + 16}" class="ma-trend-xtick">${escapeHtml(text)}</text>`;
      })
      .join("");
    const columns = frame.labels
      .map((label, index) => {
        const x = left + band * index + (band - barWidth) / 2;
        const parts = series
          .map((item, slot) => ({
            value: item.values[index],
            color: colors[slot],
          }))
          .filter((part) => part.value > 0);
        let base = TOP + PLOT_HEIGHT;
        const paths = parts
          .map((part, order) => {
            const height = (part.value / top) * PLOT_HEIGHT;
            const last = order === parts.length - 1;
            const bottom = base;
            base -= height;
            // A 2px surface gap separates stacked parts tall enough to
            // show it; slivers stay solid, or the gaps would be all there is.
            const end = last || height < 4 ? base : base + GAP;
            if (bottom - end < 0.5) return "";
            return `<path d="${segmentPath(x, barWidth, bottom, end, last)}" fill="${part.color}"/>`;
          })
          .join("");
        return `<g class="ma-trend-col" data-col="${index}">${paths}</g>`;
      })
      .join("");
    // One label, on the peak: the axis, legend and tooltip carry the rest.
    const peak = totals.indexOf(Math.max(...totals));
    const peakX = Math.min(
      width - RIGHT - 24,
      Math.max(left + 24, left + band * peak + band / 2),
    );
    const peakLabel =
      totals[peak] > 0
        ? `<text x="${peakX}" y="${y(totals[peak]) - 6}" class="ma-trend-peak">${escapeHtml(money(totals[peak]))}</text>`
        : "";
    const hits = frame.labels
      .map(
        (label, index) =>
          `<rect x="${left + band * index}" y="${TOP}" width="${band}" height="${PLOT_HEIGHT}" class="ma-trend-hit" data-trend-col="${index}" tabindex="0" aria-label="${escapeHtml(
            `${this.bucketLabel(frame, index)}: ${exact(totals[index])}`,
          )}"/>`,
      )
      .join("");
    return `<svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="${escapeHtml(t("trend.aria"))}" data-trend-svg>${grid}${columns}${peakLabel}${xLabels}${hits}</svg>`;
  }

  /** "13.11 14:00–15:00" for an hour, "13.11" for a day. */
  bucketLabel(frame, index) {
    if (frame.unit === "day") return frame.days[index];
    const hour = Number(frame.labels[index]);
    const next = String((hour + 1) % 24).padStart(2, "0");
    return `${frame.days[index]} ${frame.labels[index]}:00–${next}:00`;
  }

  tableMarkup(frame, series, totals) {
    const head = series
      .map((item) => `<th>${escapeHtml(this.seriesLabel(item))}</th>`)
      .join("");
    const body = frame.labels
      .map(
        (label, index) =>
          `<tr><td>${escapeHtml(this.bucketLabel(frame, index))}</td>${series
            .map((item) => `<td>${escapeHtml(exact(item.values[index]))}</td>`)
            .join(
              "",
            )}${series.length > 1 ? `<td><b>${escapeHtml(exact(totals[index]))}</b></td>` : ""}</tr>`,
      )
      .join("");
    return `<div class="ma-trend-tablewrap"><table class="ma-trend-table"><thead><tr><th>${escapeHtml(
      t(frame.unit === "hour" ? "trend.colHour" : "trend.colDay"),
    )}</th>${head}${series.length > 1 ? `<th>${escapeHtml(t("trend.total"))}</th>` : ""}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  /** Hover and keyboard focus show every series of a column. */
  bindHover(root) {
    const show = (target) => {
      const hit = target?.closest?.("[data-trend-col]");
      const plot = hit?.closest?.("[data-trend-plot]");
      if (!hit || !plot || !this.view) return;
      const index = Number(hit.dataset.trendCol);
      const { frame, series, colors, totals } = this.view;
      const svg = plot.querySelector("[data-trend-svg]");
      svg?.classList.add("is-dim");
      svg?.querySelectorAll(".ma-trend-col").forEach((node) => {
        node.classList.toggle("is-hot", Number(node.dataset.col) === index);
      });
      const tip = plot.querySelector("[data-trend-tip]");
      if (!tip) return;
      const doc = tip.ownerDocument;
      tip.replaceChildren();
      const title = doc.createElement("div");
      title.className = "ma-trend-tiptitle";
      title.textContent = this.bucketLabel(frame, index);
      tip.append(title);
      const line = (color, value, name, strong) => {
        const row = doc.createElement("div");
        row.className = "ma-trend-tiprow";
        const key = doc.createElement("i");
        if (color) key.style.background = color;
        const amount = doc.createElement("b");
        amount.textContent = value;
        const label = doc.createElement("span");
        label.textContent = name;
        if (strong) row.classList.add("is-total");
        row.append(key, amount, label);
        tip.append(row);
      };
      if (series.length > 1) {
        line("", exact(totals[index]), t("trend.total"), true);
      }
      series.forEach((item, slot) => {
        line(colors[slot], exact(item.values[index]), this.seriesLabel(item));
      });
      tip.hidden = false;
      const svgBox = svg.getBoundingClientRect?.();
      const hitBox = hit.getBoundingClientRect?.();
      const plotBox = plot.getBoundingClientRect?.();
      if (svgBox && hitBox && plotBox && plotBox.width) {
        const center = hitBox.left - plotBox.left + hitBox.width / 2;
        const tipWidth = tip.offsetWidth || 180;
        const leftSide = center > plotBox.width / 2;
        tip.style.left = `${Math.max(0, leftSide ? center - tipWidth - 12 : center + 12)}px`;
        tip.style.top = "8px";
      }
    };
    const hide = (target) => {
      const plot = target?.closest?.("[data-trend-plot]");
      if (!plot) return;
      plot.querySelector("[data-trend-svg]")?.classList.remove("is-dim");
      const tip = plot.querySelector("[data-trend-tip]");
      if (tip) tip.hidden = true;
    };
    root.addEventListener("pointerover", (event) => show(event.target));
    root.addEventListener("focusin", (event) => show(event.target));
    root.addEventListener("pointerout", (event) => {
      if (event.target?.closest?.("[data-trend-col]")) hide(event.target);
    });
    root.addEventListener("focusout", (event) => {
      if (event.target?.closest?.("[data-trend-col]")) hide(event.target);
    });
  }
}

/** Styles of the spend chart. */
export function buildTrendStyles(A) {
  return `
      ${A} button.ma-rep-trendbtn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        width: auto;
        min-height: 34px;
        padding: 0 12px;
        border: 1px solid var(--ma-line);
        border-radius: 999px;
        background: #ffffff;
        color: var(--ma-muted);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      ${A} button.ma-rep-trendbtn { margin-left: auto; }
      ${A} button.ma-rep-trendbtn + .ma-rep-refresh { margin-left: 0; }
      ${A} button.ma-rep-trendbtn .ma-ico { width: 15px; height: 15px; }
      ${A} button.ma-rep-trendbtn:hover:not(:disabled) { background: var(--ma-soft); color: var(--ma-ink); }
      ${A} button.ma-rep-trendbtn.is-on,
      ${A} button.ma-rep-trendbtn.is-on:hover:not(:disabled) { border-color: transparent; background: var(--ma-lime); color: #14280a; }
      ${A} .ma-trend {
        margin: 0 0 14px;
        padding: 12px 14px 10px;
        border: 1px solid var(--ma-line);
        border-radius: 14px;
        background: #ffffff;
      }
      ${A} .ma-trend.is-stale .ma-trend-plot { opacity: 0.55; }
      ${A} .ma-trend-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
      ${A} .ma-trend-head b { display: block; font-size: 13px; font-weight: 700; color: var(--ma-ink); }
      ${A} .ma-trend-head span { display: block; font-size: 11px; color: var(--ma-faint); }
      ${A} .ma-trend-by button { height: 26px; padding: 0 10px; font-size: 11px; }
      ${A} .ma-trend-note { margin: 0 0 6px; font-size: 11px; color: var(--ma-muted); }
      ${A} .ma-trend-empty { padding: 18px 0 10px; font-size: 12px; color: var(--ma-muted); text-align: center; }
      ${A} .ma-trend-plot { position: relative; }
      ${A} .ma-trend-plot svg { display: block; overflow: visible; }
      ${A} .ma-trend-grid { stroke: #e1e0d9; stroke-width: 1; shape-rendering: crispEdges; }
      ${A} .ma-trend-base { stroke: #c3c2b7; stroke-width: 1; shape-rendering: crispEdges; }
      ${A} .ma-trend-ytick { fill: #898781; font-size: 11px; text-anchor: end; font-variant-numeric: tabular-nums; }
      ${A} .ma-trend-xtick { fill: #898781; font-size: 11px; text-anchor: middle; font-variant-numeric: tabular-nums; }
      ${A} .ma-trend-peak { fill: #52514e; font-size: 11px; font-weight: 600; text-anchor: middle; }
      ${A} .ma-trend-hit { fill: transparent; cursor: default; outline: none; }
      ${A} .ma-trend-col { transition: opacity 0.12s ease; }
      ${A} svg.is-dim .ma-trend-col:not(.is-hot) { opacity: 0.4; }
      ${A} .ma-trend-tip {
        position: absolute;
        z-index: 5;
        min-width: 160px;
        max-width: 260px;
        padding: 8px 10px;
        border: 1px solid rgba(11, 11, 11, 0.1);
        border-radius: 10px;
        background: #ffffff;
        box-shadow: 0 6px 18px rgba(17, 24, 39, 0.14);
        pointer-events: none;
      }
      ${A} .ma-trend-tip[hidden] { display: none; }
      ${A} .ma-trend-tiptitle { margin-bottom: 4px; font-size: 11px; font-weight: 600; color: #52514e; }
      ${A} .ma-trend-tiprow { display: grid; grid-template-columns: 12px auto minmax(0, 1fr); align-items: center; column-gap: 6px; padding: 1px 0; font-size: 12px; }
      ${A} .ma-trend-tiprow i { display: block; width: 12px; height: 2px; border-radius: 1px; }
      ${A} .ma-trend-tiprow b { color: #0b0b0b; font-weight: 700; font-variant-numeric: tabular-nums; }
      ${A} .ma-trend-tiprow span { overflow: hidden; color: #52514e; text-overflow: ellipsis; white-space: nowrap; }
      ${A} .ma-trend-tiprow.is-total { margin-bottom: 2px; padding-bottom: 3px; border-bottom: 1px solid #e1e0d9; }
      ${A} .ma-trend-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-top: 6px; }
      ${A} .ma-trend-legend { display: flex; flex-wrap: wrap; gap: 4px 14px; min-width: 0; }
      ${A} .ma-trend-key { display: inline-flex; align-items: center; gap: 6px; max-width: 240px; font-size: 12px; color: #52514e; }
      ${A} .ma-trend-key i { flex: 0 0 auto; width: 10px; height: 10px; border-radius: 2px; }
      ${A} .ma-trend-key span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      ${A} .ma-trend-key b { color: #0b0b0b; font-weight: 600; font-variant-numeric: tabular-nums; }
      ${A} button.ma-trend-tablebtn {
        width: auto;
        min-height: 0;
        margin-left: auto;
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--ma-muted);
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
      }
      ${A} button.ma-trend-tablebtn:hover:not(:disabled) { background: transparent; color: var(--ma-ink); text-decoration: underline; }
      ${A} .ma-trend-tablewrap { max-height: 260px; margin-top: 8px; overflow: auto; border-top: 1px solid #e1e0d9; }
      ${A} .ma-trend-table { width: 100%; border-collapse: collapse; font-size: 12px; }
      ${A} .ma-trend-table th { position: sticky; top: 0; padding: 6px 8px; background: #ffffff; color: #52514e; font-weight: 600; text-align: right; white-space: nowrap; }
      ${A} .ma-trend-table td { padding: 4px 8px; border-top: 1px solid #f1f0ec; color: #0b0b0b; text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
      ${A} .ma-trend-table th:first-child,
      ${A} .ma-trend-table td:first-child { text-align: left; }
  `;
}
