import { assessAccountHealth } from "../accounts/account-health.mjs";
import { campaignChip } from "./account-picks.mjs";
import { cloneToLabel, getLang, smallLabel, statLabel, t } from "./i18n.mjs";
import { escapeHtml } from "../utils/string.mjs";
import { hasCloneOverrides, parseAmount } from "../domain/clone-overrides.mjs";
import {
  renderCampaignName,
  sourceAccountLabel,
} from "../domain/name-template.mjs";
import {
  getPackageValueRuleSet,
  getPackageValueRuleSetIds,
} from "../domain/value-rules.mjs";

const JOB_LABELS = {
  queued: "job.queued",
  running: "job.running",
  success: "job.success",
  failed: "job.failed",
  skipped: "job.skipped",
  cancelled: "job.cancelled",
};

/**
 * Package stats shared by the Clone source block and the Export tab, so both
 * screens describe a campaign the same way.
 */
export function buildPackageStatsHtml(data) {
  const adsets = Array.isArray(data?.adsets) ? data.adsets : [];
  const ads = Array.isArray(data?.ads) ? data.ads : [];
  const media = Array.isArray(data?._downloadQueue) ? data._downloadQueue : [];
  const creatives = new Set(
    ads.map((ad) => ad?.creative?.id || ad?.creative_id || "").filter(Boolean),
  );
  const catalogs = Array.isArray(data?.catalogs) ? data.catalogs : [];
  const currency = String(
    data?.source?.currency || data?.campaign?.currency || "",
  ).toUpperCase();
  const budget = adsets.reduce(
    (sum, adset) => sum + Number(adset?.daily_budget || 0),
    0,
  );
  const ruleSetIds = getPackageValueRuleSetIds(data);
  const ruleSetNames = ruleSetIds
    .map((id) => getPackageValueRuleSet(data, id)?.name || "")
    .filter(Boolean);
  const stat = (value, label, hint = "") =>
    `<div class="ma-stat"${
      hint ? ` title="${escapeHtml(hint)}"` : ""
    }><b>${escapeHtml(String(value))}</b><span>${escapeHtml(label)}</span></div>`;
  return [
    stat(adsets.length, statLabel("stat.adsets", adsets.length)),
    stat(ads.length, statLabel("stat.ads", ads.length)),
    stat(
      creatives.size || ads.length,
      statLabel("stat.creatives", creatives.size || ads.length),
    ),
    stat(media.length, statLabel("stat.media", media.length)),
    stat(
      `${currency ? `${currency} ` : ""}${(budget / 100).toFixed(2)}`,
      t("stat.budget"),
    ),
    stat(
      catalogs.length,
      statLabel("stat.catalogs", catalogs.length),
      catalogs
        .map((catalog) => `${catalog.name || "—"} · ${catalog.id}`)
        .join("\n"),
    ),
    stat(
      ruleSetIds.length
        ? ruleSetNames.join(", ") || ruleSetIds.length
        : t("stat.none"),
      t("stat.valueRules"),
      ruleSetIds.length ? t("stat.valueRulesHint") : "",
    ),
  ].join("");
}

/** Renders the clone tab: target table with per-account page/pixel/catalog and the run screen. */
export class MassCloneView {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.render = this.render.bind(this);
    this.renderTargets = this.renderTargets.bind(this);
    this.renderProgress = this.renderProgress.bind(this);
    this.renderSource = this.renderSource.bind(this);
    this.renderExportSource = this.renderExportSource.bind(this);
  }

  /**
   * Meta refuses ad creation without a working funding source, drafts included
   * (error 1359188). The reliable marker is a funding source that actually
   * exists — `funding_source_details.id` (mirrored by `funding_source`) — not
   * the masked card label: Meta only fills `display_string` once the card has
   * been billed at least once, so a freshly attached card shows an id with no
   * label. Empty shells carry no id at all.
   */
  hasPaymentMethod(account) {
    const raw = account?.raw || {};
    return Boolean(raw.funding_source_details?.id || raw.funding_source);
  }

  /** Accounts that can host a clone: settled and with a payment method. */
  usableAccounts() {
    const { state } = this.dependencies;
    return (state.accounts || []).filter(
      (account) =>
        assessAccountHealth(state.accounts, account.id).ok &&
        this.hasPaymentMethod(account),
    );
  }

  /** Accounts that already have campaigns while the "without campaigns" filter hides them. */
  hiddenWithCampaigns() {
    const { state } = this.dependencies;
    if (!state.massOnlyEmpty) return 0;
    return this.usableAccounts().filter(
      (account) => state.massCampaigns?.[String(account.id)]?.total > 0,
    ).length;
  }

  /** Only usable accounts are listed: unsettled or unpaid cabinets cannot host ads. */
  targetAccounts() {
    const { state } = this.dependencies;
    const query = String(state.massSearch || "")
      .trim()
      .toLowerCase();
    return this.usableAccounts().filter((account) => {
      if (
        state.massOnlyEmpty &&
        state.massCampaigns?.[String(account.id)]?.total > 0
      ) {
        return false;
      }
      if (!query) return true;
      return (
        String(account.name || "")
          .toLowerCase()
          .includes(query) || String(account.id).includes(query)
      );
    });
  }

  /** Accounts dropped because the cabinet has no payment method. */
  hiddenNoPayment() {
    const { state } = this.dependencies;
    return (state.accounts || []).filter(
      (account) =>
        assessAccountHealth(state.accounts, account.id).ok &&
        !this.hasPaymentMethod(account),
    ).length;
  }

  accountCurrency(account) {
    return String(
      account?.raw?.currency || account?.currency || "",
    ).toUpperCase();
  }

  sourceCurrency() {
    const { state } = this.dependencies;
    const source = (state.accounts || []).find(
      (account) =>
        String(account.id) === String(state.cloneSourceAccountId || ""),
    );
    return this.accountCurrency(source);
  }

  isBusinessAccount(account) {
    return Boolean(
      account?.raw?.business?.id ||
      account?.raw?.business ||
      account?.businessId ||
      account?.raw?.owner_business,
    );
  }

  /** The catalog column only makes sense for a campaign that sells from a catalog. */
  showsCatalogColumn() {
    const { state } = this.dependencies;
    return Boolean(state.clonePackage?.catalogs?.length);
  }

  pixelOptions(accountId, selectedPixelId) {
    const { state } = this.dependencies;
    const pixels = state.massPixels?.[accountId] || [];
    const head = `<option value="" ${selectedPixelId ? "" : "selected"}>${escapeHtml(
      t("opt.noPixel"),
    )}</option>`;
    return (
      head +
      pixels
        .map(
          (pixel) =>
            `<option value="${escapeHtml(pixel.id)}" ${
              pixel.id === selectedPixelId ? "selected" : ""
            }>${escapeHtml(pixel.name || pixel.id)}</option>`,
        )
        .join("")
    );
  }

  catalogOptions(accountId, selectedCatalogId) {
    const { state } = this.dependencies;
    const catalogs = state.massCatalogs?.[accountId] || [];
    const business = state.massCatalogBusiness?.[accountId];
    if (!catalogs.length) {
      return `<option value="" selected>${escapeHtml(t("opt.noCatalogs"))}</option>`;
    }
    const head = `<option value="" ${selectedCatalogId ? "" : "selected"}>${escapeHtml(
      t("opt.noCatalog"),
    )}</option>`;
    const copy = business?.id
      ? `<option value="__copy__" ${
          selectedCatalogId === "__copy__" ? "selected" : ""
        }>${escapeHtml(t("opt.copyCatalog", { bm: business.name || business.id }))}</option>`
      : "";
    const reuse = catalogs
      .map(
        (catalog) =>
          `<option value="${escapeHtml(catalog.id)}" ${
            catalog.id === selectedCatalogId ? "selected" : ""
          }>${escapeHtml(catalog.name || catalog.id)}</option>`,
      )
      .join("");
    // Same-source data pushed into a catalog that already exists in the target.
    const copyInto = catalogs
      .map(
        (catalog) =>
          `<option value="__copy_into__:${escapeHtml(catalog.id)}" ${
            selectedCatalogId === `__copy_into__:${catalog.id}`
              ? "selected"
              : ""
          }>${escapeHtml(t("opt.copyInto", { name: catalog.name || catalog.id }))}</option>`,
      )
      .join("");
    return (
      `<optgroup label="${escapeHtml(t("opt.catalogReuseGroup"))}">${head}${copy}${reuse}</optgroup>` +
      (copyInto
        ? `<optgroup label="${escapeHtml(t("opt.catalogCopyGroup"))}">${copyInto}</optgroup>`
        : "")
    );
  }

  /** Page picker: a native select cannot show the page avatar, so it is a listbox. */
  pageCell(accountId, picked) {
    const { state } = this.dependencies;
    const pages = state.massPages?.[accountId] || [];
    const open = String(state.massOpenPageMenu || "") === accountId;
    const selected = pages.find(
      (page) => String(page.id) === String(picked.pageId || ""),
    );
    const initial = (selected?.name || "FP").trim().charAt(0).toUpperCase();
    const face = selected?.picture
      ? `<img src="${escapeHtml(selected.picture)}" alt="" loading="lazy" />`
      : `<span>${escapeHtml(initial)}</span>`;
    const items = [
      `<button type="button" class="ma-fp-item" data-mass-page-pick="${escapeHtml(
        accountId,
      )}" data-page-id="">
        <span class="ma-fp-ico ma-fp-auto">${escapeHtml(t("opt.autoPageShort"))}</span>
        <span class="ma-fp-name">${escapeHtml(t("opt.autoPage"))}</span>
      </button>`,
      ...pages.map((page) => {
        const mark =
          String(page.id) === String(picked.pageId || "") ? " ma-on" : "";
        return `<button type="button" class="ma-fp-item${mark}" data-mass-page-pick="${escapeHtml(
          accountId,
        )}" data-page-id="${escapeHtml(page.id)}">
          <span class="ma-fp-ico">${
            page.picture
              ? `<img src="${escapeHtml(page.picture)}" alt="" loading="lazy" />`
              : `<span>${escapeHtml((page.name || "F").charAt(0).toUpperCase())}</span>`
          }</span>
          <span class="ma-fp-name">${escapeHtml(page.name || page.id)}</span>
        </button>`;
      }),
    ].join("");
    return `<td class="ma-fp-cell" data-label="${escapeHtml(t("field.fanPage"))}" data-fp-cell="${escapeHtml(accountId)}">
      <button type="button" class="ma-fp-btn" data-mass-page-toggle="${escapeHtml(
        accountId,
      )}" ${state.massRunning ? "disabled" : ""} title="${escapeHtml(
        selected?.name || t("opt.autoPage"),
      )}">
        <span class="ma-fp-ico">${face}</span>
        <span class="ma-fp-name">${escapeHtml(
          selected?.name || t("opt.autoPageShort"),
        )}</span>
        <span class="ma-caret">▾</span>
      </button>
      <div class="ma-fp-pop${open ? "" : " ma-hidden"}" data-mass-page-pop="${escapeHtml(
        accountId,
      )}">${items}</div>
    </td>`;
  }

  /** Export tab: the same stats, with its own loading line. */
  renderExportSource() {
    const { state, dom } = this.dependencies;
    const box = dom.exportPackageSummary;
    if (!box) return;
    if (state.exportPreviewLoading) {
      box.innerHTML = `<div class="ma-stat ma-stat-note"><span class="ma-spin-dot" aria-hidden="true"></span><span>${escapeHtml(
        t("export.loading"),
      )}</span></div>`;
      return;
    }
    if (!state.exportPreview) {
      box.innerHTML = "";
      return;
    }
    box.innerHTML = buildPackageStatsHtml(state.exportPreview);
  }

  renderSource() {
    const { state, dom } = this.dependencies;
    const box = dom.clonePackageSummary;
    if (!box) return;
    const data = state.clonePackage;
    if (!data) {
      // One calm line across the whole stats grid: the narrow grid cell made
      // this notice wrap into a tall column.
      box.innerHTML = state.clonePackageLoading
        ? `<div class="ma-stat ma-stat-note"><span class="ma-spin-dot" aria-hidden="true"></span><span>${escapeHtml(
            t("clone.loading"),
          )}</span></div>`
        : "";
      return;
    }
    box.innerHTML = buildPackageStatsHtml(data);

    if (dom.cloneSummary) {
      const adsets = Array.isArray(data.adsets) ? data.adsets : [];
      const ads = Array.isArray(data.ads) ? data.ads : [];
      const currency = String(
        data?.source?.currency || data?.campaign?.currency || "",
      ).toUpperCase();
      const budget = adsets.reduce(
        (sum, adset) => sum + Number(adset?.daily_budget || 0),
        0,
      );
      const campaignName =
        data.campaign?.name ||
        state.cloneCampaignName ||
        data.fileNameMap ||
        "";
      const parts = [
        state.accounts?.find(
          (account) =>
            String(account.id) === String(state.cloneSourceAccountId || ""),
        )?.name,
        campaignName,
        `${adsets.length} ${smallLabel("stat.adsets", adsets.length)}`,
        `${ads.length} ${smallLabel("stat.ads", ads.length)}`,
        `${currency ? `${currency} ` : ""}${(budget / 100).toFixed(2)}`,
      ].filter(Boolean);
      dom.cloneSummary.textContent = parts.join(" · ");
    }
  }

  renderTargets() {
    const { state, dom } = this.dependencies;
    const body = dom.cloneTargetsBody;
    if (!body) return;
    const accounts = this.targetAccounts();
    const catalogColumn = this.showsCatalogColumn();
    if (dom.cloneCatalogHead) {
      dom.cloneCatalogHead.classList.toggle("ma-hidden", !catalogColumn);
    }
    dom.root
      ?.querySelector("[data-bulk-catalog-wrap]")
      ?.classList.toggle("ma-hidden", !catalogColumn);
    const columns = 7 + (catalogColumn ? 1 : 0);
    if (!accounts.length) {
      body.innerHTML = `<tr><td colspan="${columns}" class="ma-empty">${escapeHtml(
        t("clone.targetsNone"),
      )}</td></tr>`;
      return;
    }
    // The open listbox is reparented to the panel root, so a plain innerHTML
    // rebuild would leave the old copy on screen. Drop any strays first.
    dom.root
      ?.querySelectorAll(":scope > .ma-fp-pop")
      .forEach((node) => node.remove());
    const selection = state.massTargets || {};
    const sourceCurrency = this.sourceCurrency();
    const rates = state.massRates || {};
    const autoRates = state.massAutoRates || {};
    body.innerHTML = accounts
      .map((account) => {
        const accountId = String(account.id);
        const picked = selection[accountId] || {};
        const currency = this.accountCurrency(account);
        const rate = rates[accountId];
        const autoRate = autoRates[accountId];
        const converts =
          sourceCurrency && currency && currency !== sourceCurrency;
        const knownRate = Number.isFinite(Number(rate)) && Number(rate) > 0;
        const knownAuto =
          Number.isFinite(Number(autoRate)) && Number(autoRate) > 0;
        const rateText = knownRate
          ? `×${rate}`
          : knownAuto
            ? `×${autoRate}`
            : t("currency.none");
        // Narrow column: the code, an optional rate box and the whole story in a tooltip.
        const currencyChip = converts
          ? `<span class="ma-chip ma-warn" title="${escapeHtml(
              t(knownRate ? "currency.tooltipRate" : "currency.tooltip", {
                from: sourceCurrency,
                to: currency,
                rate: rateText,
              }),
            )}">${escapeHtml(currency)}</span>
            <input type="number" step="0.0001" min="0" class="ma-rate" data-mass-rate="${escapeHtml(
              accountId,
            )}" placeholder="${escapeHtml(
              knownAuto ? `${autoRate}` : "—",
            )}" title="${escapeHtml(
              t("rate.autoHint", { rate: rateText }),
            )}" value="${knownRate ? escapeHtml(String(rate)) : ""}" ${
              state.massRunning ? "disabled" : ""
            } />`
          : `<span class="ma-chip" title="${escapeHtml(
              t("currency.same", { cur: currency || "—" }),
            )}">${escapeHtml(currency || "—")}</span>`;
        const isSource =
          String(accountId) === String(state.cloneSourceAccountId || "");
        const businessName =
          account.raw?.business?.name ||
          account.raw?.owner_business?.name ||
          "BM";
        const typeIcon = this.isBusinessAccount(account)
          ? `<span class="ma-acc-ico ma-bm" title="${escapeHtml(
              t("chip.bm", { biz: businessName }),
            )}" aria-label="${escapeHtml(t("chip.bm", { biz: businessName }))}">BM</span>`
          : `<span class="ma-acc-ico ma-personal" title="${escapeHtml(
              t("chip.personal"),
            )}" aria-label="${escapeHtml(t("chip.personal"))}">&#9679;</span>`;
        const catalogCell = catalogColumn
          ? `<td class="ma-cat-cell" data-label="${escapeHtml(t("field.catalog"))}"><select class="ma-cat" title="${escapeHtml(
              (state.massCatalogs?.[accountId] || []).length
                ? t("opt.noCatalogHint")
                : t("opt.noCatalogsHint"),
            )}" data-mass-catalog="${escapeHtml(
              accountId,
            )}" ${state.massRunning ? "disabled" : ""}>${this.catalogOptions(
              accountId,
              String(picked.catalogId || ""),
            )}</select></td>`
          : "";
        return `<tr data-account-row="${escapeHtml(accountId)}"${
          picked.selected ? ' class="ma-sel"' : ""
        }>
          <td class="ma-chk"><input type="checkbox" data-mass-account="${escapeHtml(
            accountId,
          )}" ${picked.selected ? "checked" : ""} ${
            state.massRunning ? "disabled" : ""
          } /></td>
          <td class="ma-acc-cell"><span class="ma-acc">${typeIcon}<span class="ma-who">${escapeHtml(
            account.name || accountId,
          )}<span class="ma-id">${escapeHtml(accountId)}</span></span>${
            isSource
              ? `<span class="ma-chip">${escapeHtml(t("chip.source"))}</span>`
              : ""
          }${campaignChip(state.massCampaigns?.[accountId])}</span></td>
          <td class="ma-newname${picked.campaignName ? " ma-custom" : ""}" data-label="${escapeHtml(t("field.newName"))}"><input type="text" class="ma-name-input" data-mass-name="${escapeHtml(accountId)}" value="${escapeHtml(
            picked.campaignName || this.previewName(account),
          )}" placeholder="${escapeHtml(this.previewName(account) || t("field.newName"))}" title="${escapeHtml(t("field.newNameHint"))}" spellcheck="false" />${
            picked.campaignName
              ? `<button type="button" class="ma-name-reset" data-mass-name-reset="${escapeHtml(accountId)}" title="${escapeHtml(t("field.newNameReset"))}">↺</button>`
              : ""
          }</td>
          <td class="ma-copies-cell" data-label="${escapeHtml(t("field.copies"))}"><input type="number" class="ma-copies" data-mass-copies="${escapeHtml(
            accountId,
          )}" min="1" max="100" step="1" value="${Math.min(
            100,
            Math.max(1, Math.floor(Number(picked.copies) || 1)),
          )}" ${state.massRunning ? "disabled" : ""} /></td>
          ${this.pageCell(accountId, picked)}
          <td class="ma-pix-cell" data-label="${escapeHtml(t("field.pixel"))}"><select class="ma-pix" title="${escapeHtml(
            t("opt.noPixelHint"),
          )}" data-mass-pixel="${escapeHtml(accountId)}" ${
            state.massRunning ? "disabled" : ""
          }>${this.pixelOptions(accountId, String(picked.pixelId || ""))}</select></td>
          ${catalogCell}
          <td class="ma-cur" data-label="${escapeHtml(t("field.currency"))}">${currencyChip}</td>
        </tr>`;
      })
      .join("");
    this.positionPagePopups();
  }

  /** The campaign name this account's clone will get under the current template. */
  previewName(account) {
    const { state } = this.dependencies;
    const data = state.clonePackage;
    const sourceName = data?.source?.campaignName || data?.campaign?.name || "";
    if (!sourceName) return "";
    const sourceAccountId =
      data?.source?.accountId || state.cloneSourceAccountId;
    return renderCampaignName({
      template: state.massNameTemplate,
      sourceName,
      sourceAccountId,
      sourceAccountName: sourceAccountLabel(state.accounts, sourceAccountId),
      account,
      currency: this.accountCurrency(account),
      mode: state.massMode,
      index: 1,
      adNames: (data?.ads || []).map((ad) => ad?.name),
    }).name;
  }

  /** The page listbox is a fixed overlay: the table scroll would clip it. */
  positionPagePopups() {
    const { state, dom } = this.dependencies;
    const openId = String(state.massOpenPageMenu || "");
    if (!openId) return;
    const pop = document.querySelector(
      `[data-mass-page-pop="${CSS.escape(openId)}"]`,
    );
    const button = document.querySelector(
      `[data-mass-page-toggle="${CSS.escape(openId)}"]`,
    );
    if (!pop || !button) return;
    // Move the listbox to the panel root: inside the table it inherits the
    // card's containing block and gets clipped by the scroll area.
    const host = dom.root || document.getElementById("mirrorads-root");
    if (host && pop.parentElement !== host) host.append(pop);
    const anchor = button.getBoundingClientRect();
    const width = Math.max(220, Math.round(anchor.width));
    pop.style.position = "fixed";
    pop.style.marginTop = "0";
    pop.style.pointerEvents = "auto";
    pop.style.width = `${width}px`;
    // Flip above the button when there is no room below.
    const popHeight = pop.offsetHeight || 240;
    const below = window.innerHeight - anchor.bottom;
    const top =
      below < popHeight + 12 && anchor.top > popHeight + 12
        ? anchor.top - popHeight - 4
        : anchor.bottom + 4;
    const left = Math.min(
      Math.max(8, anchor.left),
      window.innerWidth - width - 8,
    );
    pop.style.top = `${Math.round(top)}px`;
    pop.style.left = `${Math.round(left)}px`;
  }

  renderProgress() {
    const { state, dom } = this.dependencies;
    const jobs = dom.massCloneProgress;
    if (!jobs) return;
    const results = state.massResults || [];
    if (dom.cloneRunCard) {
      dom.cloneRunCard.classList.toggle(
        "ma-hidden",
        !results.length && !state.massRunning,
      );
    }
    if (!results.length) {
      jobs.innerHTML = "";
      if (dom.cloneProgressBar) dom.cloneProgressBar.style.width = "0%";
      if (dom.cloneCounters) dom.cloneCounters.innerHTML = "";
      if (dom.cloneConsole) dom.cloneConsole.textContent = "";
      return;
    }
    const counts = {
      success: 0,
      failed: 0,
      skipped: 0,
      cancelled: 0,
      queued: 0,
      running: 0,
    };
    for (const row of results)
      counts[row.status] = (counts[row.status] || 0) + 1;
    if (dom.cloneProgressBar) {
      const finished = results.length - counts.queued - counts.running;
      dom.cloneProgressBar.style.width = `${Math.round((finished / results.length) * 100)}%`;
    }
    if (dom.cloneCounters) {
      const active =
        results.find((row) => row.status === "running")?.name || "—";
      const finishedNow = results.length - counts.queued - counts.running;
      dom.cloneCounters.innerHTML = [
        `<span>${escapeHtml(t("run.progress"))} <b>${finishedNow}/${results.length}</b></span>`,
        `<span>${escapeHtml(t("run.done"))} <b class="ma-ok">${counts.success}</b></span>`,
        `<span>${escapeHtml(t("run.rolled"))} <b class="ma-warn">${counts.failed}</b></span>`,
        `<span>${escapeHtml(t("run.queued"))} <b>${counts.queued + counts.running}</b></span>`,
        `<span>${escapeHtml(t("run.current"))} <b>${escapeHtml(active)}</b></span>`,
      ].join("");
    }
    jobs.innerHTML = results
      .map((row) => {
        const detail = row.counts
          ? ` · campaign ${row.counts.campaign}, ad set ${row.counts.adset}, ad ${row.counts.ad}`
          : "";
        const copy =
          row.copyCount > 1 ? ` · ${row.copyIndex}/${row.copyCount}` : "";
        return `<div class="ma-job ma-${escapeHtml(row.status)}">
          <div><b>${escapeHtml(row.name || row.accountId)}${escapeHtml(copy)}</b>
            <div class="ma-job-ph">${escapeHtml(
              t(JOB_LABELS[row.status] || row.status),
            )}${escapeHtml(detail)}${row.retried ? " · retried" : ""}</div>
            ${row.message ? `<div class="ma-job-msg">${escapeHtml(row.message)}</div>` : ""}
          </div>
        </div>`;
      })
      .join("");
    if (dom.cloneConsole) {
      dom.cloneConsole.textContent = results
        .filter((row) => row.message)
        .map((row) => `${row.name}: ${row.message}`)
        .join("\n");
    }
  }

  /**
   * The "change on clone" strip above the name template: daily budget, bid and
   * start time for every clone of the run. It is rebuilt only when its shape
   * changes, so typing in its fields is never interrupted by other renders.
   */
  renderOverrides(force = false) {
    const { state, dom, appId } = this.dependencies;
    const box = dom.root?.querySelector(`#${appId}-clone-overrides`);
    if (!box) return;
    const overrides = state.massOverrides || {};
    const currency =
      state.clonePackage?.source?.currency || this.sourceCurrency() || "";
    const filled = hasCloneOverrides(overrides);
    const key = `${state.massOverridesOpen ? 1 : 0}|${currency}|${filled ? 1 : 0}|${getLang()}`;
    if (!force && this.overridesKey === key && box.childElementCount) return;
    this.overridesKey = key;
    const field = (name, type, label, extra = "") =>
      `<label class="ma-field"><span>${escapeHtml(label)}</span><input type="${type}" data-override="${name}" value="${escapeHtml(
        overrides[name] || "",
      )}" ${extra} /></label>`;
    box.innerHTML = `
      <button type="button" class="ma-ovr-toggle${filled ? " is-set" : ""}" data-always-enabled data-override-toggle aria-expanded="${state.massOverridesOpen ? "true" : "false"}">
        <span>${escapeHtml(t("overrides.title"))}</span>
        <em>${escapeHtml(filled ? this.overridesSummary(currency) : t("overrides.none"))}</em>
      </button>
      ${
        state.massOverridesOpen
          ? `<div class="ma-ovr-body">
              <div class="ma-row">
                ${field("budget", "text", t("overrides.budget", { currency: currency || "…" }), 'inputmode="decimal" placeholder="—"')}
                ${field("bid", "text", t("overrides.bid", { currency: currency || "…" }), 'inputmode="decimal" placeholder="—"')}
                ${field("start", "datetime-local", t("overrides.start"))}
              </div>
              <div class="ma-ovr-note">
                <span>${escapeHtml(t("overrides.note"))}</span>
                <button type="button" class="ma-ovr-clear" data-always-enabled data-override-clear>${escapeHtml(t("overrides.clear"))}</button>
              </div>
            </div>`
          : ""
      }`;
  }

  /** "budget 50 USD · start 15.11 09:00" for the collapsed strip. */
  overridesSummary(currency) {
    const { state } = this.dependencies;
    const overrides = state.massOverrides || {};
    const parts = [];
    if (parseAmount(overrides.budget)) {
      parts.push(
        `${t("overrides.short.budget")} ${overrides.budget} ${currency}`.trim(),
      );
    }
    if (parseAmount(overrides.bid)) {
      parts.push(
        `${t("overrides.short.bid")} ${overrides.bid} ${currency}`.trim(),
      );
    }
    if (String(overrides.start || "").trim()) {
      parts.push(
        `${t("overrides.short.start")} ${String(overrides.start).replace("T", " ")}`,
      );
    }
    return parts.join(" · ");
  }

  render() {
    const { state, dom } = this.dependencies;
    if (!state.uiReady || !dom.root) return;
    this.renderOverrides();
    this.renderSource();
    this.renderTargets();
    this.renderProgress();
    const total = this.targetAccounts().length;
    const selected = Object.values(state.massTargets || {}).filter(
      (item) => item.selected,
    );
    const count = selected.length;
    const campaignCount = selected.reduce(
      (sum, item) =>
        sum +
        (Array.isArray(item.copyIndexes) && item.copyIndexes.length
          ? item.copyIndexes.length
          : Math.min(100, Math.max(1, Math.floor(Number(item.copies) || 1)))),
      0,
    );
    if (dom.cloneTargetsNote) {
      const hidden = this.hiddenNoPayment();
      const withCampaigns = this.hiddenWithCampaigns();
      const notes = [
        hidden ? t("targets.noPayment", { n: hidden }) : "",
        withCampaigns ? t("targets.withCampaigns", { n: withCampaigns }) : "",
      ].filter(Boolean);
      dom.cloneTargetsNote.textContent = notes.join(" ");
      dom.cloneTargetsNote.classList.toggle("ma-hidden", !notes.length);
    }
    const bulkLabel = dom.root?.querySelector("[data-bulk-label]");
    if (bulkLabel) {
      const picked = this.usableAccounts().filter(
        (account) => state.massTargets?.[String(account.id)]?.selected,
      ).length;
      bulkLabel.textContent = picked
        ? t("bulk.forSelected", { n: picked })
        : t("bulk.forListed", { n: total });
    }
    if (dom.cloneMaster) {
      dom.cloneMaster.checked = total > 0 && count === total;
      dom.cloneMaster.indeterminate = count > 0 && count < total;
      dom.cloneMaster.disabled = !total || state.massRunning;
    }
    if (dom.cloneRunButton) {
      dom.cloneRunButton.textContent = state.massRunning
        ? t("run.running")
        : campaignCount
          ? cloneToLabel(campaignCount)
          : t("btn.clone");
    }
    if (dom.massStopButton) {
      dom.massStopButton.disabled = !state.massRunning;
    }
    if (dom.massRetryButton) {
      const failed = (state.massResults || []).filter(
        (row) => row.status === "failed",
      ).length;
      dom.massRetryButton.disabled = state.massRunning || !failed;
      dom.massRetryButton.textContent = failed
        ? t("btn.retryN", { n: failed })
        : t("btn.retry");
    }
  }
}
