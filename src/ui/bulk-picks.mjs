import { escapeHtml } from "../utils/string.mjs";
import { t } from "./i18n.mjs";

/** The "automatic choice" value in the bulk selects; per account it is "". */
export const AUTO = "__auto__";
/** Catalog choice "copy the source catalog into the account's BM". */
const COPY = "__copy__";

const FIELDS = { page: "pageId", pixel: "pixelId", catalog: "catalogId" };
const LISTS = {
  page: "massPages",
  pixel: "massPixels",
  catalog: "massCatalogs",
};
const MISSING_SHOWN = 5;

/**
 * One choice of page, pixel or catalog for many accounts at once. Each
 * account keeps its own list, so a choice lands only where it exists, and
 * the result names the accounts that do not have it.
 */
export class BulkPicks {
  constructor(dependencies) {
    this.dependencies = dependencies;
  }

  /** The selected accounts; with nothing selected, every listed one. */
  targets() {
    const { state, massCloneView } = this.dependencies;
    const selected = massCloneView
      .usableAccounts()
      .filter((account) => state.massTargets?.[String(account.id)]?.selected);
    return selected.length
      ? { accounts: selected, everyListed: false }
      : { accounts: massCloneView.targetAccounts(), everyListed: true };
  }

  listFor(kind, accountId) {
    return this.dependencies.state[LISTS[kind]]?.[accountId];
  }

  /** Every choice that at least one target account has, most common first. */
  choices(kind) {
    const { state } = this.dependencies;
    const { accounts } = this.targets();
    const found = new Map();
    const add = (id, name) => {
      const entry = found.get(id) || { id, name, count: 0 };
      entry.count += 1;
      found.set(id, entry);
    };
    for (const account of accounts) {
      const accountId = String(account.id);
      for (const item of this.listFor(kind, accountId) || []) {
        add(String(item.id), item.name || String(item.id));
      }
      if (kind === "catalog" && state.massCatalogBusiness?.[accountId]?.id) {
        add(COPY, t("bulk.copyCatalog"));
      }
    }
    const items = [...found.values()].sort(
      (a, b) =>
        (b.id === COPY) - (a.id === COPY) ||
        b.count - a.count ||
        a.name.localeCompare(b.name),
    );
    return { total: accounts.length, items };
  }

  /** Puts one choice into every target account that has it. */
  apply(kind, value) {
    const { state, massCloneView } = this.dependencies;
    const field = FIELDS[kind];
    const { accounts, everyListed } = this.targets();
    const result = {
      applied: 0,
      missing: [],
      total: accounts.length,
      everyListed,
    };
    state.massTargets ||= {};
    for (const account of accounts) {
      const accountId = String(account.id);
      const available =
        value === AUTO ||
        (kind === "catalog" && value === COPY
          ? Boolean(state.massCatalogBusiness?.[accountId]?.id)
          : (this.listFor(kind, accountId) || []).some(
              (item) => String(item.id) === value,
            ));
      if (!available) {
        result.missing.push(account.name || accountId);
        continue;
      }
      state.massTargets[accountId] = {
        ...(state.massTargets[accountId] || {}),
        [field]: value === AUTO ? "" : value,
      };
      result.applied += 1;
    }
    massCloneView.render();
    return result;
  }

  resultText(kind, value, result) {
    const name =
      value === AUTO
        ? t("bulk.autoName")
        : this.choices(kind).items.find((item) => item.id === value)?.name ||
          value;
    const lines = [
      t("bulk.done", {
        what: t(`bulk.${kind}Word`),
        name,
        n: result.applied,
        total: result.total,
      }),
    ];
    if (result.missing.length) {
      const shown = result.missing.slice(0, MISSING_SHOWN).join(", ");
      const more = result.missing.length - MISSING_SHOWN;
      lines.push(
        t("bulk.missing", {
          names:
            more > 0 ? `${shown} ${t("bulk.andMore", { n: more })}` : shown,
        }),
      );
    }
    if (result.everyListed) lines.push(t("bulk.everyListed"));
    return lines.join(" ");
  }

  optionsHtml(kind) {
    const { total, items } = this.choices(kind);
    const head = `<option value="">${escapeHtml(t(`bulk.${kind}`))}</option><option value="${AUTO}">${escapeHtml(t("bulk.auto"))}</option>`;
    if (!items.length) {
      return `${head}<option value="" disabled>${escapeHtml(t("bulk.nothing"))}</option>`;
    }
    return (
      head +
      items
        .map(
          (item) =>
            `<option value="${escapeHtml(item.id)}">${escapeHtml(
              item.count < total
                ? `${item.name} (${item.count}/${total})`
                : item.name,
            )}</option>`,
        )
        .join("")
    );
  }

  /** Adds the row of bulk choices above the accounts table. */
  attach(root) {
    const { appId } = this.dependencies;
    const table = root
      ?.querySelector(`#${appId}-clone-targets-body`)
      ?.closest(".ma-scroll");
    if (!table || table.parentElement.querySelector("[data-bulk-bar]"))
      return this;
    const doc = root.ownerDocument;
    const bar = doc.createElement("div");
    bar.className = "ma-bulk";
    bar.dataset.bulkBar = "";
    const select = (kind) =>
      `<select class="ma-bulk-pick" data-bulk="${kind}" title="${escapeHtml(t("bulk.hint"))}">${`<option value="">${escapeHtml(t(`bulk.${kind}`))}</option>`}</select>`;
    bar.innerHTML = `<span class="ma-bulk-label" data-bulk-label>${escapeHtml(t("bulk.title"))}</span>
      ${select("page")}${select("pixel")}<span class="ma-bulk-cat" data-bulk-catalog-wrap>${select("catalog")}</span>
      <div class="ma-bulk-note ma-hidden" data-bulk-note role="status"></div>`;
    table.parentElement.insertBefore(bar, table);
    // The lists load in the background: options are built when a select opens.
    const refresh = (event) => {
      const picker = event.target?.closest?.("[data-bulk]");
      if (picker) picker.innerHTML = this.optionsHtml(picker.dataset.bulk);
    };
    bar.addEventListener("pointerdown", refresh);
    bar.addEventListener("focusin", refresh);
    bar.addEventListener("change", (event) => {
      const picker = event.target?.closest?.("[data-bulk]");
      if (!picker || !picker.value) return;
      const value = picker.value;
      picker.value = "";
      if (this.dependencies.state.massRunning) return;
      const kind = picker.dataset.bulk;
      const note = bar.querySelector("[data-bulk-note]");
      note.textContent = this.resultText(kind, value, this.apply(kind, value));
      note.classList.remove("ma-hidden");
    });
    return this;
  }
}
