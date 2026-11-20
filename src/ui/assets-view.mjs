import {
  accountsWithout,
  buildAssetDirectory,
  searchAssets,
} from "../domain/asset-directory.mjs";
import { adsManagerAccountUrl } from "../domain/ads-manager-links.mjs";
import {
  accountDelivers,
  classifyAccountStatus,
} from "../domain/report-time.mjs";
import { runPool } from "../utils/pool.mjs";
import { escapeHtml } from "../utils/string.mjs";
import { ICONS } from "./icons.mjs";
import { t } from "./i18n.mjs";

const CONCURRENCY = 6;
const KINDS = ["pixels", "catalogs"];

/**
 * The Pixels tab: every pixel and catalog the profile's ad accounts can
 * use, how many accounts have each, and which ones do not.
 */
export class AssetsView {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.kind = "pixels";
    this.liveOnly = true;
    this.query = "";
    this.expanded = {};
    // accountId -> { accountId, name, ok, pixels, catalogs, error }
    this.entries = new Map();
    this.loading = false;
    this.done = 0;
    this.total = 0;
    this.boundRoot = null;
    this.open = this.open.bind(this);
    this.render = this.render.bind(this);
  }

  get panel() {
    const { dom, appId } = this.dependencies;
    return dom.root?.querySelector(`#${appId}-panel-assets`) || null;
  }

  /** The accounts in scope: the live ones, or all of them. */
  accounts() {
    return (this.dependencies.state.accounts || [])
      .map((account) => ({
        accountId: String(account.id || "").replace(/^act_/, ""),
        name: String(account.name || account.id || ""),
        live: accountDelivers(
          classifyAccountStatus(
            account.raw?.account_status ?? account.account_status,
          ),
        ),
      }))
      .filter((account) => account.accountId)
      .filter((account) => !this.liveOnly || account.live);
  }

  /** The tab is shown: the first visit reads the accounts. */
  open() {
    this.load();
  }

  /** Reads the accounts not read yet; `force` reads them all again. */
  async load(force = false) {
    const { state, accountContextService } = this.dependencies;
    if (this.loading) return;
    if (!state.sessionReady || !state.accounts?.length) {
      this.render();
      return;
    }
    if (force) this.entries.clear();
    const queue = this.accounts().filter(
      (account) => !this.entries.has(account.accountId),
    );
    if (!queue.length) {
      this.render();
      return;
    }
    this.loading = true;
    this.done = 0;
    this.total = queue.length;
    this.render();
    let painted = Date.now();
    await runPool(queue, CONCURRENCY, async (account) => {
      try {
        if (force) {
          accountContextService.invalidateAccountContextCache?.(
            account.accountId,
          );
        }
        const context = await accountContextService.fetchAccountContext(
          account.accountId,
          { quiet: true },
        );
        this.entries.set(account.accountId, {
          accountId: account.accountId,
          name: account.name,
          ok: true,
          pixels: context?.pixels || [],
          catalogs: context?.catalogs || [],
        });
      } catch (error) {
        this.entries.set(account.accountId, {
          accountId: account.accountId,
          name: account.name,
          ok: false,
          error: String(error?.message || error),
        });
      }
      this.done += 1;
      // Results show as they come, without repainting on every account.
      if (Date.now() - painted > 400) {
        painted = Date.now();
        this.render();
      }
    });
    this.loading = false;
    this.render();
  }

  bind(root) {
    if (!root || this.boundRoot === root) return;
    this.boundRoot = root;
    root.addEventListener("click", (event) => {
      const target = event.target.closest?.("[data-assets]");
      if (!target || !this.panel?.contains(target)) return;
      const [kind, value] = String(target.dataset.assets).split(":");
      if (kind === "kind" && KINDS.includes(value)) {
        this.kind = value;
        this.render();
      } else if (kind === "live") {
        this.liveOnly = !this.liveOnly;
        // Widening to every account reads the ones not read yet.
        this.load();
        this.render();
      } else if (kind === "reload") {
        this.load(true);
      } else if (kind === "toggle" && value) {
        this.expanded = { ...this.expanded, [value]: !this.expanded[value] };
        this.render();
      }
    });
    root.addEventListener("input", (event) => {
      const node = event.target;
      if (!this.panel?.contains(node) || !node.matches("[data-assets-search]"))
        return;
      this.query = node.value;
      // The list is redrawn below the search box, which keeps its caret.
      this.renderList();
    });
  }

  /** What was read for the accounts in scope. */
  scopeEntries() {
    return this.accounts()
      .map((account) => this.entries.get(account.accountId))
      .filter(Boolean);
  }

  assetMarkup(asset, entries, readable) {
    const kind = this.kind;
    const key = `${kind}-${asset.id}`;
    const missing = accountsWithout(asset, entries);
    const share = readable ? asset.accounts.length / readable : 0;
    const open = Boolean(this.expanded[key]);
    const status = missing.length
      ? `<button type="button" class="ma-asset-miss${open ? " is-open" : ""}" data-always-enabled data-assets="toggle:${escapeHtml(key)}" aria-expanded="${open}">${escapeHtml(
          t("assets.missing", { count: missing.length }),
        )} ▾</button>`
      : `<span class="ma-asset-all">${escapeHtml(t("assets.everywhere"))}</span>`;
    const list =
      open && missing.length
        ? `<div class="ma-asset-list">${missing
            .map(
              (entry) =>
                `<div class="ma-asset-acct"><b title="${escapeHtml(entry.name)}">${escapeHtml(entry.name)}</b><span>${escapeHtml(entry.accountId)}</span><a href="${escapeHtml(adsManagerAccountUrl(entry.accountId))}" target="_blank" rel="noopener" title="${escapeHtml(t("reports.open"))}">${ICONS.open}</a></div>`,
            )
            .join("")}</div>`
        : "";
    return `<div class="ma-asset${missing.length ? "" : " is-full"}">
        <div class="ma-asset-main">
          <div class="ma-asset-name"><b title="${escapeHtml(asset.name)}">${escapeHtml(asset.name)}</b><span>${escapeHtml(asset.id)}</span></div>
          <div class="ma-asset-cover">
            <span>${escapeHtml(t("assets.cover", { count: asset.accounts.length, total: readable }))}</span>
            <i class="ma-asset-bar" aria-hidden="true"><i style="width:${Math.round(share * 100)}%"></i></i>
          </div>
          ${status}
        </div>
        ${list}
      </div>`;
  }

  listMarkup() {
    const entries = this.scopeEntries();
    const readable = entries.filter((entry) => entry.ok).length;
    const directory = buildAssetDirectory(entries);
    const assets = searchAssets(directory[this.kind], this.query);
    if (!entries.length) {
      return this.loading
        ? ""
        : `<div class="ma-his-empty">${escapeHtml(t("assets.noAccounts"))}</div>`;
    }
    if (!assets.length) {
      return `<div class="ma-his-empty">${escapeHtml(
        this.query
          ? t("assets.noMatch")
          : t(this.kind === "pixels" ? "assets.noPixels" : "assets.noCatalogs"),
      )}</div>`;
    }
    return assets
      .map((asset) => this.assetMarkup(asset, entries, readable))
      .join("");
  }

  renderList() {
    const list = this.panel?.querySelector("[data-assets-list]");
    if (list) list.innerHTML = this.listMarkup();
  }

  render() {
    const panel = this.panel;
    if (!panel) return;
    const { state } = this.dependencies;
    if (!state.sessionReady || !state.accounts?.length) {
      panel.innerHTML = `<div class="ma-his-intro">${escapeHtml(t("assets.waiting"))}</div>`;
      return;
    }
    const entries = this.scopeEntries();
    const directory = buildAssetDirectory(entries);
    const failed = entries.filter((entry) => !entry.ok);
    const readable = entries.length - failed.length;
    const progress = this.loading
      ? `<div class="ma-asset-progress"><span class="ma-spin-dot" aria-hidden="true"></span>${escapeHtml(
          t("assets.loading", { done: this.done, total: this.total }),
        )}</div>`
      : "";
    const note = [
      t("assets.read", { count: readable }),
      failed.length ? t("assets.failed", { count: failed.length }) : "",
    ]
      .filter(Boolean)
      .join(" · ");
    const focused =
      panel.querySelector("[data-assets-search]") ===
      panel.ownerDocument.activeElement;
    panel.innerHTML = `<div class="ma-his-intro">${escapeHtml(t("assets.intro"))}</div>
      <div class="ma-rep-controls ma-asset-bar-top">
        <div class="ma-seg" role="group">${KINDS.map(
          (kind) =>
            `<button type="button" data-always-enabled data-assets="kind:${kind}" class="${kind === this.kind ? "is-on" : ""}">${escapeHtml(
              t(`assets.kind.${kind}`),
            )}<em>${directory[kind].length}</em></button>`,
        ).join("")}</div>
        <button type="button" class="ma-filter-chip" data-always-enabled data-assets="live" aria-pressed="${this.liveOnly}" title="${escapeHtml(t("assets.liveHint"))}">${escapeHtml(t("assets.liveOnly"))}</button>
        <button type="button" class="ma-secondary ma-asset-reload" data-always-enabled data-assets="reload" ${this.loading ? "disabled" : ""}>${escapeHtml(t("rules.reload"))}</button>
      </div>
      <input type="search" class="ma-asset-search" data-always-enabled data-assets-search placeholder="${escapeHtml(t("assets.search"))}" value="${escapeHtml(this.query)}" />
      ${progress}
      <div class="ma-asset-note"${failed.length ? ` title="${escapeHtml(failed.map((entry) => `${entry.name} · ${entry.accountId}: ${entry.error}`).join("\n"))}"` : ""}>${escapeHtml(note)}</div>
      <div class="ma-asset-items" data-assets-list>${this.listMarkup()}</div>`;
    if (focused) {
      const search = panel.querySelector("[data-assets-search]");
      search?.focus();
      search?.setSelectionRange?.(search.value.length, search.value.length);
    }
  }
}

/** Styles of the Pixels tab. */
export function buildAssetStyles(A) {
  return `
      ${A} .ma-asset-bar-top { gap: 8px; margin-bottom: 10px; }
      ${A} .ma-asset-bar-top .ma-filter-chip { width: auto; }
      ${A} button.ma-asset-reload { width: auto; min-height: 34px; margin-left: auto; padding: 0 14px; font-size: 12px; }
      ${A} input.ma-asset-search { display: block; box-sizing: border-box; width: 100%; height: 34px; margin: 0 0 8px; font-size: 12px; }
      ${A} .ma-asset-progress { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; font-size: 12px; color: var(--ma-muted); }
      ${A} .ma-asset-note { margin: 0 0 10px; font-size: 11px; color: var(--ma-faint); }
      ${A} .ma-asset {
        margin-top: 6px;
        padding: 10px 12px;
        border: 1px solid var(--ma-line);
        border-radius: 12px;
        background: #ffffff;
      }
      ${A} .ma-asset-main {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 150px 118px;
        align-items: center;
        column-gap: 12px;
      }
      ${A} .ma-asset-name { min-width: 0; }
      ${A} .ma-asset-name > b {
        display: block;
        overflow: hidden;
        font-size: 13px;
        font-weight: 600;
        color: var(--ma-ink);
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      ${A} .ma-asset-name > span { display: block; font-size: 11px; color: var(--ma-faint); font-variant-numeric: tabular-nums; }
      ${A} .ma-asset-cover > span { display: block; margin-bottom: 4px; font-size: 12px; font-weight: 600; color: var(--ma-ink); font-variant-numeric: tabular-nums; }
      ${A} .ma-asset-bar { display: block; height: 6px; border-radius: 999px; background: #f1f2f5; overflow: hidden; }
      ${A} .ma-asset-bar > i { display: block; height: 100%; border-radius: 999px; background: #f59e0b; }
      ${A} .ma-asset.is-full .ma-asset-bar > i { background: #6dbb2a; }
      ${A} .ma-asset-all { justify-self: end; padding: 2px 10px; border-radius: 999px; background: #dcf7c0; color: #1f6a10; font-size: 11px; font-weight: 700; white-space: nowrap; }
      ${A} button.ma-asset-miss {
        justify-self: end;
        width: auto;
        min-height: 28px;
        padding: 0 12px;
        border: 1px solid #fde1a7;
        border-radius: 999px;
        background: #fff7e0;
        color: #7a5200;
        font-size: 11px;
        font-weight: 700;
        white-space: nowrap;
        cursor: pointer;
      }
      ${A} button.ma-asset-miss:hover:not(:disabled),
      ${A} button.ma-asset-miss.is-open { background: #fde9b8; color: #7a5200; }
      ${A} .ma-asset-list { margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--ma-line); }
      ${A} .ma-asset-acct {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto 20px;
        align-items: center;
        column-gap: 10px;
        padding: 3px 0;
      }
      ${A} .ma-asset-acct > b { overflow: hidden; font-size: 12px; font-weight: 600; color: var(--ma-ink); text-overflow: ellipsis; white-space: nowrap; }
      ${A} .ma-asset-acct > span { font-size: 11px; color: var(--ma-faint); font-variant-numeric: tabular-nums; }
      ${A} .ma-asset-acct > a { display: inline-flex; color: var(--ma-faint); }
      ${A} .ma-asset-acct > a:hover { color: var(--ma-ink); }
      ${A} .ma-asset-acct .ma-ico { width: 15px; height: 15px; }
  `;
}
