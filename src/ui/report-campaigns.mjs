import { currencyMinorUnits } from "../domain/clone-overrides.mjs";
import { escapeHtml } from "../utils/string.mjs";
import { t } from "./i18n.mjs";

/**
 * The list of running campaigns under an account row in Reports, with a
 * switch-off button per campaign and one for all of them. Switching off is a
 * live change, so every button asks once more before it acts.
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

  /** Handles a click; returns false for a click that is not about the list. */
  handle(kind, value) {
    const { state } = this.dependencies;
    if (kind === "camps") {
      state.reportArm = "";
      state.reportOpen = state.reportOpen === value ? "" : value;
      if (state.reportOpen) this.load(value);
      else this.dependencies.render();
      return true;
    }
    if (kind === "coff" || kind === "call") {
      const key = `${kind}:${value}`;
      if (state.reportArm !== key) {
        // First click arms the button, the second one acts.
        state.reportArm = key;
        this.dependencies.render();
      } else {
        state.reportArm = "";
        this.pause(kind === "coff" ? [value] : null);
      }
      return true;
    }
    return false;
  }

  async load(accountId) {
    const entry = { loading: true, error: "", items: [] };
    this.store[accountId] = entry;
    this.dependencies.render();
    try {
      entry.items = (
        await this.dependencies.reportActions.listActiveCampaigns(accountId)
      ).map((item) => ({ ...item, off: false, busy: false, error: "" }));
    } catch (error) {
      entry.error = String(error?.message || error);
    }
    entry.loading = false;
    this.dependencies.render();
  }

  /** Switches off the given campaigns of the open account, or all still on. */
  async pause(ids) {
    const { state } = this.dependencies;
    const accountId = state.reportOpen;
    const entry = this.store[accountId];
    if (!entry) return;
    const items = entry.items.filter(
      (item) => !item.off && !item.busy && (!ids || ids.includes(item.id)),
    );
    for (const item of items) item.busy = true;
    this.dependencies.render();
    const row = (state.report?.rows || []).find(
      (candidate) => candidate.accountId === accountId,
    );
    for (const item of items) {
      try {
        await this.dependencies.reportActions.pauseCampaign(item.id);
        item.off = true;
        item.error = "";
        if (row) {
          row.activeCampaigns = Math.max(0, (row.activeCampaigns || 0) - 1);
          row.inactiveCampaigns = (row.inactiveCampaigns || 0) + 1;
        }
        if (state.report?.total?.activeCampaigns > 0) {
          state.report.total.activeCampaigns -= 1;
        }
      } catch (error) {
        item.error = String(error?.message || error);
      }
      item.busy = false;
      this.dependencies.render();
    }
  }

  /** The panel under the row of the open account; "" for every other row. */
  markup(row) {
    const { state } = this.dependencies;
    if (state.reportOpen !== row.accountId) return "";
    const entry = this.store[row.accountId];
    if (!entry || entry.loading) {
      return `<div class="ma-rep-cl"><div class="ma-rep-cl-note">${escapeHtml(t("reports.camps.loading"))}</div></div>`;
    }
    if (entry.error) {
      return `<div class="ma-rep-cl"><div class="ma-rep-cl-note ma-rep-err">${escapeHtml(entry.error)}</div></div>`;
    }
    if (!entry.items.length) {
      return `<div class="ma-rep-cl"><div class="ma-rep-cl-note">${escapeHtml(t("reports.camps.none"))}</div></div>`;
    }
    const armed = state.reportArm || "";
    const units = currencyMinorUnits(row.currency);
    const stillOn = entry.items.filter((item) => !item.off).length;
    const button = (key, label, armedLabel, disabled) =>
      `<button type="button" class="ma-rep-offbtn${armed === key ? " is-armed" : ""}" data-always-enabled data-report="${escapeHtml(key)}" ${disabled ? "disabled" : ""}>${escapeHtml(armed === key ? armedLabel : label)}</button>`;
    const items = entry.items
      .map((item) => {
        const budget = item.dailyBudget
          ? `${(item.dailyBudget / units).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${row.currency} / ${t("reports.camps.day")}`
          : "";
        return `<div class="ma-rep-camp${item.off ? " is-off" : ""}">
            <div><b title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</b>${
              item.error
                ? `<small class="ma-rep-err">${escapeHtml(item.error)}</small>`
                : budget
                  ? `<small>${escapeHtml(budget)}</small>`
                  : ""
            }</div>
            ${
              item.off
                ? `<span class="ma-rep-offdone">${escapeHtml(t("reports.camps.off"))}</span>`
                : button(
                    `coff:${item.id}`,
                    item.busy
                      ? t("reports.camps.working")
                      : t("reports.camps.switchOff"),
                    t("reports.camps.sure"),
                    item.busy,
                  )
            }
          </div>`;
      })
      .join("");
    return `<div class="ma-rep-cl">
        <div class="ma-rep-cl-head">
          <span>${escapeHtml(t("reports.camps.title", { count: stillOn }))}</span>
          ${
            stillOn > 1
              ? button(
                  `call:${row.accountId}`,
                  t("reports.camps.allOff", { count: stillOn }),
                  t("reports.camps.allSure", { count: stillOn }),
                  false,
                )
              : ""
          }
        </div>
        ${items}
      </div>`;
  }
}
