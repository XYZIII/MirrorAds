import {
  currencyMinorUnits,
  parseAmount,
  toApiAmount,
} from "../domain/clone-overrides.mjs";
import { escapeHtml } from "../utils/string.mjs";
import { adChips, blockTag } from "./ad-status-view.mjs";
import { t } from "./i18n.mjs";

/** Campaigns that are switched off are listed up to this many. */
const OFF_LIMIT = 30;

/**
 * The campaigns of an account under its row in Reports: switch one off or on,
 * switch all running ones off, change a daily budget. These are live changes,
 * so every switch asks once more before it acts.
 */
export class ReportCampaigns {
  constructor(dependencies) {
    this.dependencies = dependencies;
  }

  get store() {
    const { state } = this.dependencies;
    state.reportCamps ||= {};
    return state.reportCamps;
  }

  get entry() {
    return this.store[this.dependencies.state.reportOpen];
  }

  item(id) {
    return this.entry?.items.find((item) => item.id === id);
  }

  /** Handles a click; returns false for a click that is not about the list. */
  handle(kind, value) {
    const { state } = this.dependencies;
    if (kind === "camps") {
      state.reportArm = "";
      state.reportEdit = "";
      state.reportOpen = state.reportOpen === value ? "" : value;
      if (state.reportOpen) this.load(value);
      else this.dependencies.render();
      return true;
    }
    if (kind === "coff" || kind === "con" || kind === "call") {
      const key = `${kind}:${value}`;
      if (state.reportArm !== key) {
        // First click arms the button, the second one acts.
        state.reportArm = key;
        this.dependencies.render();
      } else {
        state.reportArm = "";
        if (kind === "call") this.switch(null, false);
        else this.switch([value], kind === "con");
      }
      return true;
    }
    if (kind === "bedit") {
      state.reportArm = "";
      state.reportEdit = state.reportEdit === value ? "" : value;
      this.dependencies.render();
      return true;
    }
    if (kind === "bsave") {
      this.saveBudget(value);
      return true;
    }
    return false;
  }

  row() {
    const { state } = this.dependencies;
    return (state.report?.rows || []).find(
      (candidate) => candidate.accountId === state.reportOpen,
    );
  }

  async load(accountId) {
    const entry = { loading: true, error: "", items: [] };
    this.store[accountId] = entry;
    this.dependencies.render();
    try {
      entry.items = (
        await this.dependencies.reportActions.listCampaigns(accountId)
      ).map((item) => ({ ...item, busy: false, error: "" }));
    } catch (error) {
      entry.error = String(error?.message || error);
    }
    entry.loading = false;
    this.dependencies.render();
  }

  /**
   * Switches the given campaigns of the open account on or off; with no ids,
   * every running one off.
   */
  async switch(ids, on) {
    const { state } = this.dependencies;
    const entry = this.entry;
    if (!entry) return;
    const items = entry.items.filter(
      (item) => !item.busy && item.on !== on && (!ids || ids.includes(item.id)),
    );
    for (const item of items) item.busy = true;
    this.dependencies.render();
    const row = this.row();
    const step = on ? 1 : -1;
    for (const item of items) {
      try {
        await this.dependencies.reportActions.setCampaignStatus(item.id, on);
        item.on = on;
        item.error = "";
        // A campaign its ads keep from running was never counted as active:
        // switching it changes which list it is in, not the active count.
        const counts = !item.block;
        if (row && counts) {
          row.activeCampaigns = Math.max(0, (row.activeCampaigns || 0) + step);
          row.inactiveCampaigns = Math.max(
            0,
            (row.inactiveCampaigns || 0) - step,
          );
          if (Array.isArray(row.activeCampaignIds)) {
            row.activeCampaignIds = on
              ? [...new Set([...row.activeCampaignIds, String(item.id)])]
              : row.activeCampaignIds.filter((id) => id !== String(item.id));
          }
        }
        if (row && item.block && Array.isArray(row.blockedCampaigns)) {
          row.blockedCampaigns = on
            ? [
                ...row.blockedCampaigns.filter(
                  (blocked) => blocked.id !== String(item.id),
                ),
                { id: String(item.id), name: item.name, reason: item.block },
              ]
            : row.blockedCampaigns.filter(
                (blocked) => blocked.id !== String(item.id),
              );
        }
        if (state.report?.total && counts) {
          state.report.total.activeCampaigns = Math.max(
            0,
            (state.report.total.activeCampaigns || 0) + step,
          );
        }
      } catch (error) {
        item.error = String(error?.message || error);
      }
      item.busy = false;
      this.dependencies.render();
    }
  }

  async saveBudget(id) {
    const { state } = this.dependencies;
    const item = this.item(id);
    const row = this.row();
    if (!item || !row) return;
    const typed = this.dependencies
      .panel()
      ?.querySelector("[data-camp-budget]")?.value;
    const amount = parseAmount(typed);
    if (!amount) {
      item.error = t("reports.camps.badBudget");
      this.dependencies.render();
      return;
    }
    const apiAmount = toApiAmount(amount, row.currency);
    item.busy = true;
    this.dependencies.render();
    try {
      await this.dependencies.reportActions.setCampaignBudget(id, apiAmount);
      item.dailyBudget = apiAmount;
      item.error = "";
      state.reportEdit = "";
    } catch (error) {
      item.error = String(error?.message || error);
    }
    item.busy = false;
    this.dependencies.render();
  }

  itemMarkup(item, row, button) {
    const { state } = this.dependencies;
    const units = currencyMinorUnits(row.currency);
    const amount = item.dailyBudget / units;
    const editing = state.reportEdit === item.id;
    const budget = editing
      ? `<span class="ma-rep-bedit"><input type="text" inputmode="decimal" data-camp-budget value="${escapeHtml(String(amount))}" /><i>${escapeHtml(row.currency || "")}</i>
          <button type="button" class="ma-rep-bsave" data-always-enabled data-report="bsave:${escapeHtml(item.id)}" ${item.busy ? "disabled" : ""}>${escapeHtml(t("reports.camps.save"))}</button>
          <button type="button" class="ma-rep-blink" data-always-enabled data-report="bedit:${escapeHtml(item.id)}">${escapeHtml(t("reports.act.cancel"))}</button></span>`
      : item.dailyBudget
        ? `<button type="button" class="ma-rep-blink" data-always-enabled data-report="bedit:${escapeHtml(item.id)}" title="${escapeHtml(t("reports.camps.editBudget"))}">${escapeHtml(
            `${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${row.currency} / ${t("reports.camps.day")}`,
          )} ✎</button>`
        : `<small>${escapeHtml(t("reports.camps.adsetBudget"))}</small>`;
    const working = item.busy ? t("reports.camps.working") : "";
    const blocked = item.on && item.block;
    return `<div class="ma-rep-camp${item.on ? "" : " is-off"}${blocked ? " is-blocked" : ""}">
        <div><span class="ma-rep-cname"><b title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</b>${blocked ? blockTag(item.block) : ""}</span>${budget}${adChips(item.ads)}${
          item.error
            ? `<small class="ma-rep-err">${escapeHtml(item.error)}</small>`
            : ""
        }</div>
        ${
          item.on
            ? button(
                `coff:${item.id}`,
                working || t("reports.camps.switchOff"),
                t("reports.camps.sure"),
                item.busy,
                "ma-rep-offbtn",
              )
            : button(
                `con:${item.id}`,
                working || t("reports.camps.switchOn"),
                t("reports.camps.sure"),
                item.busy,
                "ma-rep-onbtn",
              )
        }
      </div>`;
  }

  /** The panel under the row of the open account; "" for every other row. */
  markup(row) {
    const { state } = this.dependencies;
    if (state.reportOpen !== row.accountId) return "";
    const entry = this.store[row.accountId];
    const note = (text, cls = "") =>
      `<div class="ma-rep-cl"><div class="ma-rep-cl-note${cls}">${escapeHtml(text)}</div></div>`;
    if (!entry || entry.loading) return note(t("reports.camps.loading"));
    if (entry.error) return note(entry.error, " ma-rep-err");
    if (!entry.items.length) return note(t("reports.camps.none"));
    const armed = state.reportArm || "";
    const button = (key, label, armedLabel, disabled, cls) =>
      `<button type="button" class="${cls}${armed === key ? " is-armed" : ""}" data-always-enabled data-report="${escapeHtml(key)}" ${disabled ? "disabled" : ""}>${escapeHtml(armed === key ? armedLabel : label)}</button>`;
    const running = entry.items.filter((item) => item.on);
    const stopped = entry.items.filter((item) => !item.on);
    // On, but their ads keep them from running: listed with the running ones.
    const blocked = running.filter((item) => item.block).length;
    const shown = stopped.slice(0, OFF_LIMIT);
    const list = (items) =>
      items.map((item) => this.itemMarkup(item, row, button)).join("");
    return `<div class="ma-rep-cl">
        <div class="ma-rep-cl-head">
          <span>${escapeHtml(t("reports.camps.title", { count: running.length - blocked }))}${
            blocked
              ? ` · <em class="ma-rep-cl-blocked">${escapeHtml(t("reports.blocked.chip", { count: blocked }))}</em>`
              : ""
          }</span>
          ${
            running.length > 1
              ? button(
                  `call:${row.accountId}`,
                  t("reports.camps.allOff", { count: running.length }),
                  t("reports.camps.allSure", { count: running.length }),
                  false,
                  "ma-rep-offbtn",
                )
              : ""
          }
        </div>
        ${list(running)}
        ${
          stopped.length
            ? `<div class="ma-rep-cl-head ma-rep-cl-sub"><span>${escapeHtml(
                t("reports.camps.offTitle", { count: stopped.length }),
              )}${
                stopped.length > shown.length
                  ? ` · ${escapeHtml(t("reports.camps.offShown", { count: shown.length }))}`
                  : ""
              }</span></div>${list(shown)}`
            : ""
        }
      </div>`;
  }
}
