import { billingUrl, payable, settling } from "../domain/billing.mjs";
import { totalReport } from "../domain/report-time.mjs";
import { escapeHtml } from "../utils/string.mjs";
import { t } from "./i18n.mjs";
import { ICONS } from "./icons.mjs";

// Coming back to the tab re-checks at most this often.
const RECHECK_GAP_MS = 4000;
// Meta can take a moment to show the payment: one more look after this.
const SECOND_LOOK_MS = 45000;

const amount = (value, currency) =>
  value === null || value === undefined
    ? ""
    : `${Number(value).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} ${currency || ""}`.trim();

/**
 * Paying unpaid balances from Reports. Meta has no API call that pays, so a
 * payment is Meta's own page opened in a tab, where "Pay now" charges the
 * card. "Pay all" and "Pay selected" walk through those pages one link at a
 * time (a browser opens one tab per click); coming back to Ads Manager
 * re-checks the accounts whose page was opened, and a paid one turns live.
 */
export class ReportPayments {
  constructor(dependencies) {
    this.dependencies = dependencies;
    // { ids, opened }: the accounts of a "pay all" or "pay selected" walk.
    this.queue = null;
    // Accounts whose payment page was opened and that are not paid yet.
    this.pending = new Set();
    this.checking = false;
    this.lastCheck = 0;
    this.watching = false;
    this.onReturn = () => {
      if (document.visibilityState === "hidden") return;
      this.recheck();
    };
  }

  get report() {
    return this.dependencies.state.report;
  }

  row(accountId) {
    return this.report?.rows.find((row) => row.accountId === accountId);
  }

  /** The accounts of the report that "Pay now" would settle, in list order. */
  payableRows() {
    return (this.report?.rows || []).filter(payable);
  }

  /** A row link that opens the account's payment page (and records it). */
  link(accountId, label, kind, cls = "ma-rep-pay") {
    return `<a class="${cls}" href="${escapeHtml(billingUrl(accountId))}" target="_blank" rel="noopener" data-always-enabled data-report-pay="${escapeHtml(
      kind,
    )}" title="${escapeHtml(t("reports.pay.hintLink"))}">${ICONS.card}<span>${escapeHtml(label)}</span></a>`;
  }

  /** A click on a payment link: the tab opens by itself; this keeps track. */
  handleLink(kind) {
    const [what, id] = String(kind).split(":");
    let opened = id;
    if (what === "all" || what === "selected") {
      const rows =
        what === "all"
          ? this.payableRows()
          : this.dependencies.selectedRows().filter(payable);
      if (!rows.length) return;
      this.queue = { ids: rows.map((row) => row.accountId), opened: [] };
      opened = rows[0].accountId;
    }
    if (!opened) return;
    if (
      this.queue?.ids.includes(opened) &&
      !this.queue.opened.includes(opened)
    ) {
      this.queue.opened.push(opened);
    }
    this.pending.add(opened);
    this.dependencies.logging?.log(
      "info",
      `Payment page opened: ${this.row(opened)?.name || opened}.`,
    );
    this.watch();
    // After the click has opened the tab.
    setTimeout(() => this.dependencies.render(), 0);
  }

  /** Handles a button; false for one that is not about payments. */
  handle(kind) {
    if (kind === "paycheck") {
      this.recheck(true);
      return true;
    }
    if (kind === "payend") {
      this.queue = null;
      this.dependencies.render();
      return true;
    }
    return false;
  }

  /** Looks again at the accounts whose page was opened once the tab is back. */
  watch() {
    if (this.watching) return;
    this.watching = true;
    window.addEventListener("focus", this.onReturn);
    document.addEventListener("visibilitychange", this.onReturn);
  }

  unwatch() {
    if (!this.watching) return;
    this.watching = false;
    window.removeEventListener("focus", this.onReturn);
    document.removeEventListener("visibilitychange", this.onReturn);
  }

  nextId() {
    return this.queue?.ids.find(
      (id) => !this.queue.opened.includes(id) && payable(this.row(id)),
    );
  }

  /**
   * Reads afresh the status of the accounts whose payment page was opened.
   * A settled one turns live and is marked paid.
   */
  async recheck(force = false, followUp = true) {
    const ids = [...this.pending].filter((id) => this.row(id));
    if (!ids.length || this.checking) return;
    if (!force && Date.now() - this.lastCheck < RECHECK_GAP_MS) return;
    this.checking = true;
    this.lastCheck = Date.now();
    this.dependencies.render();
    let settled = 0;
    for (const id of ids) {
      const row = this.row(id);
      try {
        const fresh = await this.dependencies.reportService.recheckBilling(id);
        row.statusCode = fresh.statusCode;
        row.disableReason = fresh.disableReason;
        row.health = fresh.health;
        if (fresh.amountDue !== null) row.amountDue = fresh.amountDue;
        if (fresh.health !== "billing") {
          row.paid = true;
          this.pending.delete(id);
          settled += 1;
          this.dependencies.logging?.log(
            "info",
            `Payment: ${row.name} is settled and live again.`,
          );
        }
      } catch (error) {
        this.dependencies.logging?.log(
          "warn",
          `Payment: could not re-check ${row.name}.`,
          String(error?.message || error),
        );
      }
    }
    this.checking = false;
    if (settled && this.report)
      this.report.total = totalReport(this.report.rows);
    if (!this.pending.size) this.unwatch();
    else if (!force && followUp) {
      // Meta can be a little late: one more look after a return, not a loop.
      clearTimeout(this.secondLook);
      this.secondLook = setTimeout(
        () => this.recheck(false, false),
        SECOND_LOOK_MS,
      );
      this.secondLook?.unref?.();
    }
    this.dependencies.render();
  }

  /** The debt line and payment chip of an account row. */
  rowParts(row) {
    if (row.paid) {
      return {
        chip: `<i class="ma-rep-paid">${escapeHtml(t("reports.pay.paid"))}</i>`,
        note: "",
      };
    }
    if (settling(row)) {
      return {
        chip: `<i class="ma-rep-settling" title="${escapeHtml(t("reports.pay.settlingHint"))}">${escapeHtml(
          t("reports.pay.settling"),
        )}</i>`,
        note: "",
      };
    }
    if (!payable(row)) return { chip: "", note: "" };
    const debt = [
      row.amountDue === null
        ? ""
        : t("reports.pay.due", { amount: amount(row.amountDue, row.currency) }),
      row.card,
    ]
      .filter(Boolean)
      .join(" · ");
    const opened = this.pending.has(row.accountId);
    return {
      chip: this.link(
        row.accountId,
        t(opened ? "reports.pay.again" : "reports.pay.button"),
        `row:${row.accountId}`,
      ),
      note: debt
        ? `<div class="ma-rep-debt">${escapeHtml(debt)}${
            opened ? ` · <em>${escapeHtml(t("reports.pay.waiting"))}</em>` : ""
          }</div>`
        : "",
    };
  }

  /** "Pay selected" for the action bar, when the selection owes something. */
  selectedLink() {
    const rows = this.dependencies.selectedRows().filter(payable);
    return rows.length
      ? this.link(
          rows[0].accountId,
          t("reports.pay.selected", { count: rows.length }),
          "selected",
          "ma-rep-pay is-bar",
        )
      : "";
  }

  queueMarkup() {
    const rows = this.queue.ids.map((id) => this.row(id)).filter(Boolean);
    const paid = rows.filter((row) => row.paid).length;
    const next = this.nextId();
    const done = paid === rows.length;
    const chips = rows
      .map((row) => {
        const stage = row.paid
          ? "paid"
          : this.queue.opened.includes(row.accountId)
            ? "opened"
            : "waiting";
        return `<span class="ma-rep-paychip is-${stage}">${escapeHtml(row.name)}<em>${escapeHtml(
          t(`reports.pay.stage.${stage}`),
        )}</em></span>`;
      })
      .join("");
    const lead = done
      ? `<b>${escapeHtml(t("reports.pay.allPaid"))}</b>`
      : `<b>${escapeHtml(
          t("reports.pay.queue", {
            opened: this.queue.opened.length,
            total: rows.length,
            paid,
          }),
        )}</b>`;
    return `<div class="ma-rep-paybar is-queue${done ? " is-done" : ""}">
        <div class="ma-rep-payhead">
          ${lead}
          <span class="ma-rep-payacts">
            ${
              next
                ? this.link(
                    next,
                    t("reports.pay.next", { name: this.row(next).name }),
                    `next:${next}`,
                    "ma-rep-pay is-bar",
                  )
                : ""
            }
            ${
              done
                ? ""
                : `<button type="button" class="ma-secondary" data-always-enabled data-report="paycheck" ${this.checking ? "disabled" : ""}>${escapeHtml(
                    t(
                      this.checking
                        ? "reports.pay.checking"
                        : "reports.pay.check",
                    ),
                  )}</button>`
            }
            <button type="button" class="ma-rep-link" data-always-enabled data-report="payend">${escapeHtml(
              t(done ? "reports.pay.close" : "reports.pay.end"),
            )}</button>
          </span>
        </div>
        <div class="ma-rep-paychips">${chips}</div>
        ${done ? "" : `<small>${escapeHtml(t(next ? "reports.pay.hint" : "reports.pay.allOpened"))}</small>`}
      </div>`;
  }

  /** The bar above the account list: the debts, or the walk through them. */
  markup() {
    if (!this.report) return "";
    if (this.queue) return this.queueMarkup();
    const due = this.payableRows();
    if (!due.length) return "";
    const known = due.every((row) => row.amountDueUsd !== null);
    const usd = due.reduce((sum, row) => sum + (row.amountDueUsd || 0), 0);
    return `<div class="ma-rep-paybar">
        <div class="ma-rep-payhead">
          <b>${escapeHtml(t("reports.pay.banner", { count: due.length }))}${
            known && usd > 0
              ? ` · ≈ $${escapeHtml(
                  usd.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }),
                )}`
              : ""
          }</b>
          <span class="ma-rep-payacts">${this.link(
            due[0].accountId,
            t("reports.pay.all", { count: due.length }),
            "all",
            "ma-rep-pay is-bar",
          )}</span>
        </div>
        <small>${escapeHtml(t("reports.pay.bannerHint"))}</small>
      </div>`;
  }
}
