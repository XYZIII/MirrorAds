import {
  assessAccountHealth,
  isTransientFragmentFailure,
} from "../accounts/account-health.mjs";
import {
  getSourceCatalogsFromPackage,
  getSourcePagesFromPackage,
  getSourcePixelsFromPackage,
} from "../domain/package.mjs";
import { normalizeCurrency } from "../domain/currency.mjs";
import { sleep } from "../utils/object.mjs";
import {
  renderCampaignName,
  sourceAccountLabel,
} from "../domain/name-template.mjs";

/**
 * Sequential mass clone: one source campaign into many target accounts.
 *
 * Meta allows a single draft per account, so the run is strictly sequential. A
 * target that fails is rolled back (its created ads, ad sets and campaign are
 * deleted) and the loop continues with the next account, so one broken account
 * never costs the operator the rest of the batch.
 */
/** Accounts cloned at the same time; `state.massConcurrency` overrides it. */
const MASS_CONCURRENCY = 3;

export class MassCloneWorkflow {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.run = this.run.bind(this);
    this.runTarget = this.runTarget.bind(this);
    this.rollbackTarget = this.rollbackTarget.bind(this);
    this.selectedTargets = this.selectedTargets.bind(this);
    this.retryFailed = this.retryFailed.bind(this);
    this.concurrency = 1;
    this.baseMappings = null;
    this.lastTargets = [];
  }

  selectedTargets() {
    const { state } = this.dependencies;
    const selection = state.massTargets || {};
    return (state.accounts || [])
      .filter((account) => selection[account.id]?.selected)
      .flatMap((account) => {
        const accountId = String(account.id);
        const picked = selection[account.id] || {};
        const requested = Math.floor(Number(picked.copies) || 1);
        const copyCount = Math.min(100, Math.max(1, requested));
        const copyIndexes = Array.isArray(picked.copyIndexes)
          ? picked.copyIndexes
              .map((value) => Math.floor(Number(value)))
              .filter((value) => value >= 1 && value <= copyCount)
          : [];
        const indexes = copyIndexes.length
          ? [...new Set(copyIndexes)]
          : Array.from({ length: copyCount }, (_, index) => index + 1);
        return indexes.map((copyIndex) => ({
          accountId,
          name: account.name || accountId,
          pixelId: String(picked.pixelId || ""),
          pageId: String(picked.pageId || ""),
          catalogId: String(picked.catalogId || ""),
          campaignName: String(picked.campaignName || "").trim(),
          copyIndex,
          copyCount,
        }));
      });
  }

  /** Monotonic counter behind the {n} macro: grows with every campaign copy. */
  nextSequence() {
    const { state } = this.dependencies;
    state.massSequence = (Number(state.massSequence) || 0) + 1;
    return state.massSequence;
  }

  /** Renders the campaign name template and reports a name {auto} could not rebind. */
  buildCampaignName(template, sourceName, account, context = {}) {
    const result = renderCampaignName({
      template,
      sourceName,
      sourceAccountId: context.sourceAccountId,
      sourceAccountName: context.sourceAccountName,
      account,
      currency: context.currency,
      mode: context.mode,
      index: context.index,
      date: context.date,
      adNames: context.adNames,
    });
    if (result.autoMissed) {
      this.dependencies.logging.log(
        "warn",
        `Campaign name "${sourceName}" has no account marker {auto} can replace (source id, its first 4 digits or the account label); it stays unchanged for account ${result.targetAccountId}. Type the name in the account row to set it by hand.`,
      );
    }
    return result.name;
  }

  /** Pins every source pixel in the package to the pixel chosen for this target. */
  applyPixelChoice(packageData, pixelId) {
    const { state } = this.dependencies;
    if (!pixelId) return;
    const sourceIds = new Set([
      ...getSourcePixelsFromPackage(packageData).map((pixel) => pixel.id),
      ...Object.keys(state.clonePixelMappings || {}),
    ]);
    const mapping = { ...(state.clonePixelMappings || {}) };
    for (const id of sourceIds) mapping[id] = pixelId;
    state.clonePixelMappings = mapping;
  }

  /** Pins every source page in the package to the fan page chosen for this target. */
  applyPageChoice(packageData, pageId) {
    const { state } = this.dependencies;
    if (!pageId) return;
    const mapping = { ...(state.clonePageMappings || {}) };
    for (const page of getSourcePagesFromPackage(packageData)) {
      mapping[page.id] = pageId;
    }
    state.clonePageMappings = mapping;
  }

  /** Pins every source catalog to the catalog chosen for this target. */
  applyCatalogChoice(packageData, catalogId) {
    const { state } = this.dependencies;
    if (!catalogId) return;
    const mapping = { ...(state.cloneCatalogMappings || {}) };
    for (const catalog of getSourceCatalogsFromPackage(packageData)) {
      mapping[catalog.id] = catalogId;
    }
    state.cloneCatalogMappings = mapping;
  }

  accountCurrency(accountId) {
    const { state } = this.dependencies;
    const wanted = String(accountId || "").replace(/^act_/, "");
    const row = (state.accounts || []).find(
      (account) => String(account?.id) === wanted,
    );
    return normalizeCurrency(row?.raw?.currency || row?.currency);
  }

  /**
   * Budgets are stored in the account currency, so a clone across currencies
   * must rescale them. With no usable rate the target is refused instead of
   * silently copying a wrong budget.
   */
  async resolveCurrencyRate(target) {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    const from =
      this.accountCurrency(state.cloneSourceAccountId) ||
      normalizeCurrency(state.clonePackage?.source?.currency);
    const to = this.accountCurrency(target.accountId);
    state.cloneCurrency = from;
    if (!from || !to || from === to) {
      state.cloneCurrencyRate = 1;
      state.massCurrencyNote = from
        ? `${from} → ${to || from}: no conversion`
        : "source currency unknown: no conversion";
      return { ok: true, rate: 1, from, to };
    }
    const manual = Number(
      state.massRates?.[target.accountId] || state.massRateOverride,
    );
    if (Number.isFinite(manual) && manual > 0) {
      state.cloneCurrencyRate = manual;
      state.massRates ||= {};
      state.massRates[target.accountId] = manual;
      state.massCurrencyNote = `${from} → ${to} at manual rate ${manual}`;
      log("info", `Mass clone: using manual ${from}→${to} rate ${manual}.`);
      return { ok: true, rate: manual, from, to };
    }
    const service = this.dependencies.currencyRateService;
    const metaRate =
      (await service?.metaRate?.(
        state.cloneSourceAccountId,
        target.accountId,
      )) || (await service?.rate?.(from, to));
    const result = metaRate;
    if (!result?.ok) {
      state.cloneCurrencyRate = 1;
      state.massCurrencyNote = `${from} → ${to}: rate unavailable`;
      return {
        ok: false,
        from,
        to,
        message:
          `Meta did not return a ${from}→${to} rate for this cabinet. ` +
          "Type the rate in the currency column, or use a cabinet with the " +
          "same currency.",
      };
    }
    state.cloneCurrencyRate = result.rate;
    state.massAutoRates ||= {};
    state.massAutoRates[target.accountId] = result.rate;
    state.massCurrencyNote = `${from} → ${to} at ${result.rate} (${result.source})`;
    log(
      "info",
      `Mass clone: ${from}→${to} rate ${result.rate} (${result.source}).`,
    );
    return { ok: true, rate: result.rate, from, to };
  }

  async rollbackTarget(report, accountId) {
    const { log } = this.dependencies.logging;
    const { graphFetch } = this.dependencies.graphClient;
    const created = Array.isArray(report?.created) ? report.created : [];
    let deleted = 0;
    let failed = 0;
    // A draft can contain earlier successful copies and pre-existing work.
    // Delete only fragments recorded for this failed operation, never the whole
    // active draft. Draft ad objects themselves do not accept direct deletes.
    const draftRows = created.filter(
      (item) => item.draftId && item.fragmentId && !item.removed,
    );
    if (draftRows.length) {
      const draftId = draftRows[0].draftId;
      for (const type of ["ad", "adset", "campaign"]) {
        for (const row of draftRows.filter((item) => item.type === type)) {
          try {
            await graphFetch(String(row.fragmentId), { method: "DELETE" });
            deleted += 1;
          } catch (error) {
            failed += 1;
            log(
              "warn",
              `Rollback could not delete draft fragment ${row.fragmentId}; check the account manually.`,
              String(error),
            );
          }
        }
      }
      if (deleted) {
        log(
          "info",
          `Rollback deleted ${deleted} fragment(s) from draft ${draftId}.`,
        );
      }
      return { deleted, failed };
    }
    for (const type of ["ad", "adset", "campaign"]) {
      const rows = created.filter(
        (item) => item.type === type && !item.removed,
      );
      for (const row of rows) {
        try {
          await graphFetch(String(row.id), { method: "DELETE" });
          deleted += 1;
          log("info", `Rollback deleted ${type} ${row.id}.`);
        } catch (error) {
          failed += 1;
          log(
            "warn",
            `Rollback could not delete ${type} ${row.id}; check the account manually.`,
            String(error),
          );
        }
      }
    }
    return { deleted, failed };
  }

  /**
   * One clone attempt. `arm` writes this target's selections into the shared
   * state right before the operation starts: the operation snapshots the
   * state synchronously, so targets running side by side never see each
   * other's selections. A refused start (session or another operation not
   * settled yet) is retried briefly instead of dropping the account.
   */
  async runOneClone(arm, target) {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    const { runOperation } = this.dependencies;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      arm?.();
      state.lastOperationReport = null;
      const outcome = await runOperation("clone", {
        reloadOnSuccess: false,
        // The catalog is chosen per account in the table; asking again for
        // every account would stop a batch fifty times.
        confirmCatalogChanges: true,
        logPrefix: this.concurrency > 1 ? target?.name : "",
      });
      const result =
        outcome && typeof outcome === "object"
          ? outcome
          : {
              success: Boolean(outcome),
              report: state.lastOperationReport || null,
              started: Boolean(outcome || state.lastOperationReport),
            };
      if (result.started) return result;
      await sleep(2000);
    }
    log(
      "warn",
      "Mass clone: the clone did not start; the session is not ready.",
    );
    return { success: false, report: null, started: false };
  }

  async runTarget(target, { packageData, sourceName, index }) {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    const row = state.massResults[index];
    const health = assessAccountHealth(state.accounts, target.accountId);
    if (!health.ok) {
      row.status = "skipped";
      row.message = health.message;
      log("warn", `Mass clone: ${target.name} skipped. ${health.message}`);
      return false;
    }
    state.massActiveAccountId = target.accountId;
    row.status = "running";
    row.message = "";
    const currency = await this.resolveCurrencyRate(target);
    row.currency = currency?.to
      ? { from: currency.from, to: currency.to, rate: currency.rate }
      : null;
    if (currency && currency.ok === false) {
      row.status = "failed";
      row.message = currency.message;
      state.massActiveAccountId = "";
      log("warn", `Mass clone: ${target.name} not cloned. ${currency.message}`);
      this.dependencies.renderMassClone?.();
      return false;
    }
    // A start time is typed once and means that clock time in every account.
    let overrideZone = "";
    if (String(state.massOverrides?.start || "").trim()) {
      try {
        overrideZone = (
          await this.dependencies.reportService.loadAccountMeta(
            target.accountId,
          )
        ).timeZone;
      } catch (error) {
        log(
          "warn",
          `Could not read the time zone of ${target.name}; the start time override is skipped for it.`,
          String(error?.message || error),
        );
      }
    }
    const sourceAccountId =
      packageData?.source?.accountId || state.cloneSourceAccountId;
    const campaignName = this.buildCampaignName(
      // A name typed into the account row wins over the shared template.
      target.campaignName || state.massNameTemplate,
      sourceName,
      target,
      {
        sourceAccountId,
        sourceAccountName: sourceAccountLabel(state.accounts, sourceAccountId),
        currency: this.accountCurrency(target.accountId),
        mode: state.massMode,
        // Monotonic across the whole batch and across retries: a failed cabinet
        // still consumes its number, so names are never reused.
        index: this.nextSequence(),
        adNames: (packageData?.ads || []).map((ad) => ad?.name),
      },
    );
    row.campaignName = campaignName;
    const base = this.baseMappings;
    const arm = () => {
      // Start from the selections made before the batch, so one account's
      // pixel, page or catalog never leaks into the next one.
      if (base) {
        state.clonePixelMappings = { ...base.pixel };
        state.clonePageMappings = { ...base.page };
        state.cloneCatalogMappings = { ...base.catalog };
      }
      this.applyPixelChoice(packageData, target.pixelId);
      this.applyPageChoice(packageData, target.pageId);
      this.applyCatalogChoice(packageData, target.catalogId);
      state.cloneCurrency = currency?.from || state.cloneCurrency || "";
      state.cloneCurrencyRate = currency?.rate || 1;
      state.cloneOverrideZone = overrideZone;
      state.cloneTargetAccountId = target.accountId;
      state.cloneAsDraft =
        state.massMode !== "PAUSED" && state.massMode !== "ACTIVE";
      state.cloneStatus = state.cloneAsDraft ? "PAUSED" : state.massMode;
      state.cloneCampaignName = campaignName;
    };
    const copyLabel =
      target.copyCount > 1
        ? ` copy ${target.copyIndex}/${target.copyCount}`
        : "";
    log(
      "info",
      `Mass clone ${index + 1}/${state.massResults.length}${copyLabel}: ${sourceName} -> ${target.name} (${target.accountId}).`,
    );
    const first = await this.runOneClone(arm, target);
    const success = first.success;
    let report = first.report;
    row.counts = report?.counts || null;
    if (success) {
      row.status = "success";
      log("info", `Mass clone: ${target.name} cloned.`);
      return true;
    }
    // Meta sometimes rejects a freshly written draft ad with a publishing error
    // that clears once the ad is written again. Roll the draft back and retry
    // the target once instead of dropping it from the batch.
    const transient =
      !state.massStop && isTransientFragmentFailure(report?.validation?.errors);
    if (!transient && report?.validation?.errors?.length) {
      log(
        "info",
        `Mass clone: ${target.name} will not be retried; Meta rejects this draft for a reason a retry cannot fix (billing or permissions).`,
      );
    }
    if (transient) {
      log(
        "info",
        `Mass clone: ${target.name} hit a transient draft publishing error; clearing the draft and retrying once.`,
      );
      await this.rollbackTarget(report, target.accountId);
      const second = await this.runOneClone(arm, target);
      report = second.report;
      row.counts = report?.counts || null;
      row.retried = true;
      if (second.success) {
        row.status = "success";
        log("info", `Mass clone: ${target.name} cloned on retry.`);
        return true;
      }
    }
    row.status = "failed";
    row.message = (report?.issues || [])
      .map((issue) => issue.message)
      .join("; ")
      .slice(0, 400);
    if (!row.message) {
      row.message = "The clone operation was refused before it started.";
    }
    const rolled = await this.rollbackTarget(report, target.accountId);
    row.rollback = rolled;
    if (rolled.deleted) {
      row.message =
        `${row.message} Deleted ${rolled.deleted} created object(s).`.trim();
    }
    if (rolled.failed) {
      row.message =
        `${row.message} Rollback failed for ${rolled.failed} object(s).`.trim();
    }
    log(
      "warn",
      `Mass clone: ${target.name} failed; deleted ${rolled.deleted}, left ${rolled.failed}.`,
    );
    return false;
  }

  /** Runs the batch again for the accounts that failed in the last one. */
  async retryFailed() {
    return this.run({ retryFailed: true });
  }

  async run(options = {}) {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    if (this.dependencies.initializeSession) {
      await this.dependencies.initializeSession();
    }
    if (state.massRunning) {
      log(
        state.massStopping ? "warn" : "info",
        state.massStopping
          ? "Mass clone is still stopping: the current account is being cleaned up. Start again when it finishes."
          : "A mass clone is already running.",
      );
      return false;
    }
    const jsonSource = state.cloneSourceKind === "json";
    if (jsonSource) {
      if (!state.clonePackage) {
        log(
          "warn",
          "Load a JSON package in the Clone tab before starting the transfer.",
        );
        return false;
      }
    } else if (!state.cloneSourceAccountId || !state.cloneSourceCampaignId) {
      log("warn", "Pick a source account and campaign in the Clone tab first.");
      return false;
    }
    const failedBefore = (this.lastTargets || []).filter(
      (_, index) => state.massResults?.[index]?.status === "failed",
    );
    const targets =
      options?.retryFailed === true ? failedBefore : this.selectedTargets();
    if (!targets.length) {
      log(
        "warn",
        options?.retryFailed === true
          ? "There are no failed accounts to retry."
          : "Select at least one target account for the mass clone.",
      );
      return false;
    }
    this.lastTargets = targets;
    this.concurrency = Math.max(
      1,
      Math.min(
        Math.floor(Number(state.massConcurrency)) || MASS_CONCURRENCY,
        targets.length,
      ),
    );
    this.baseMappings = {
      pixel: { ...(state.clonePixelMappings || {}) },
      page: { ...(state.clonePageMappings || {}) },
      catalog: { ...(state.cloneCatalogMappings || {}) },
    };
    state.massRunning = true;
    state.massStop = false;
    state.massActiveAccountId = "";
    state.massResults = targets.map((target) => ({
      accountId: target.accountId,
      name: target.name,
      copyIndex: target.copyIndex,
      copyCount: target.copyCount,
      campaignName: "",
      status: "queued",
      message: "",
      counts: null,
      rollback: null,
    }));
    this.dependencies.renderMassClone?.();
    try {
      const packageData =
        await this.dependencies.cloneWorkflow.ensureClonePackageLoaded();
      if (!packageData) {
        log(
          "warn",
          "Clone package is not loaded; the mass clone did not start.",
        );
        return false;
      }
      const sourceName =
        packageData.source?.campaignName || packageData.campaign?.name || "";
      if (this.concurrency > 1) {
        log(
          "info",
          `Mass clone: ${targets.length} account(s), ${this.concurrency} at a time.`,
        );
      }
      // A few accounts run side by side. Copies for the same account never
      // do: they would write into the same draft at once.
      const queue = targets.map((_, index) => index);
      const inFlight = new Set();
      const worker = async () => {
        while (queue.length && !state.massStop) {
          const position = queue.findIndex(
            (index) => !inFlight.has(targets[index].accountId),
          );
          if (position < 0) {
            await sleep(300);
            continue;
          }
          const [index] = queue.splice(position, 1);
          const { accountId } = targets[index];
          inFlight.add(accountId);
          try {
            await this.runTarget(targets[index], {
              packageData,
              sourceName,
              index,
            });
          } catch (error) {
            const row = state.massResults[index];
            row.status = "failed";
            row.message = String(error?.message || error).slice(0, 400);
            log("error", `Mass clone: ${targets[index].name} failed.`, error);
          } finally {
            inFlight.delete(accountId);
            this.dependencies.renderMassClone?.();
          }
        }
      };
      await Promise.all(Array.from({ length: this.concurrency }, worker));
      for (const index of queue) state.massResults[index].status = "cancelled";
      const done = state.massResults.filter(
        (r) => r.status === "success",
      ).length;
      const failed = state.massResults.filter(
        (r) => r.status === "failed",
      ).length;
      const skipped = state.massResults.filter(
        (r) => r.status === "skipped",
      ).length;
      const cancelled = state.massResults.filter(
        (r) => r.status === "cancelled",
      ).length;
      log(
        "info",
        `Mass clone finished: ${done} cloned, ${failed} failed, ${skipped} skipped, ${cancelled} cancelled.`,
      );
      return failed === 0 && done > 0;
    } finally {
      // Hand the selections made before the batch back to the panel.
      state.clonePixelMappings = this.baseMappings.pixel;
      state.clonePageMappings = this.baseMappings.page;
      state.cloneCatalogMappings = this.baseMappings.catalog;
      this.baseMappings = null;
      state.massRunning = false;
      state.massStopping = false;
      state.massActiveAccountId = "";
      this.dependencies.renderMassClone?.();
      this.dependencies.onMassFinished?.();
      if (state.refreshAfterRun) {
        // The refresh button asked for a clean interface once the cleanup ended.
        state.refreshAfterRun = false;
        window.MirrorAds?.refresh?.();
      }
    }
  }
}
