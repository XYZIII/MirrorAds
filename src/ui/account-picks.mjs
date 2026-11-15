import { normalizeAccountId } from "../domain/ids.mjs";
import { runPool } from "../utils/pool.mjs";
import { escapeHtml } from "../utils/string.mjs";
import { getLang, t } from "./i18n.mjs";

/** Campaign states that mean "this account already runs something of its own". */
export const LIVE_CAMPAIGN_STATUSES = [
  "ACTIVE",
  "PAUSED",
  "IN_PROCESS",
  "WITH_ISSUES",
];
const PRESENCE_LIMIT = 100;
const PRESENCE_CONCURRENCY = 6;

/**
 * Ad account ids in pasted text, in order, without repeats. Agents send them
 * one per line; commas, spaces and "act_" prefixes are fine too.
 */
export function parseAccountIds(text) {
  const ids = new Set();
  for (const match of String(text || "").matchAll(/\d{6,}/g)) ids.add(match[0]);
  return [...ids];
}

/** How many campaigns an account has (archived and deleted do not count). */
export async function fetchCampaignPresence(graphFetch, accountId) {
  const page = await graphFetch(
    `act_${normalizeAccountId(accountId)}/campaigns`,
    {
      query: {
        fields: "effective_status",
        effective_status: JSON.stringify(LIVE_CAMPAIGN_STATUSES),
        limit: PRESENCE_LIMIT,
      },
    },
  );
  const rows = page?.data || [];
  return {
    total: rows.length,
    active: rows.filter((row) => row.effective_status === "ACTIVE").length,
    more: Boolean(page?.paging?.next),
  };
}

function campaignsWord(count) {
  if (getLang() !== "ru") return count === 1 ? "campaign" : "campaigns";
  const tens = Math.abs(count) % 100;
  const ones = tens % 10;
  if (tens > 10 && tens < 20) return "кампаний";
  if (ones === 1) return "кампания";
  if (ones > 1 && ones < 5) return "кампании";
  return "кампаний";
}

/** The chip next to an account's name: has it got campaigns already? */
export function campaignChip(presence) {
  if (!presence) return "";
  if (presence.loading && presence.total === undefined) {
    return `<span class="ma-chip ma-camps ma-camps-wait" title="${escapeHtml(t("camps.checking"))}">…</span>`;
  }
  if (presence.failed) {
    return `<span class="ma-chip ma-camps" title="${escapeHtml(t("camps.failed"))}">?</span>`;
  }
  if (!presence.total) {
    return `<span class="ma-chip ma-camps ma-camps-none">${escapeHtml(t("camps.none"))}</span>`;
  }
  const count = `${presence.total}${presence.more ? "+" : ""}`;
  return `<span class="ma-chip ma-camps ma-camps-some" title="${escapeHtml(
    t("camps.tip", { n: count, active: presence.active }),
  )}">${escapeHtml(`${count} ${campaignsWord(presence.total)}`)}</span>`;
}

/**
 * The clone tab's account helpers: which accounts already have campaigns,
 * the "without campaigns" filter, and selecting accounts from a pasted list.
 */
export class AccountPicks {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.loading = null;
  }

  render() {
    this.dependencies.massCloneView?.render?.();
  }

  /** Checks the given accounts (all usable ones by default) for campaigns. */
  loadPresence(accountIds) {
    if (this.loading) return this.loading;
    const { state, massCloneView, graphClient } = this.dependencies;
    const graphFetch = graphClient?.graphFetch;
    const ids = (
      accountIds ||
      massCloneView?.usableAccounts?.().map((account) => account.id) ||
      []
    ).map((id) => String(id));
    if (!graphFetch || !state || !ids.length) return Promise.resolve();
    state.massCampaigns ||= {};
    for (const id of ids) {
      state.massCampaigns[id] = {
        ...(state.massCampaigns[id] || {}),
        loading: true,
      };
    }
    this.render();
    this.loading = (async () => {
      const outcomes = await runPool(ids, PRESENCE_CONCURRENCY, (id) =>
        fetchCampaignPresence(graphFetch, id),
      );
      outcomes.forEach((outcome, index) => {
        state.massCampaigns[ids[index]] = outcome.error
          ? { failed: true }
          : outcome.value;
      });
      const failed = outcomes.filter((outcome) => outcome.error).length;
      if (failed) {
        this.dependencies.logging.log(
          "warn",
          `Could not check campaigns in ${failed} account(s); they stay in the list.`,
        );
      }
      this.dropHiddenSelection();
      this.render();
    })().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  /**
   * With the filter on, an account that has campaigns is neither shown nor
   * cloned into: a hidden selection would still be cloned.
   */
  dropHiddenSelection() {
    const { state } = this.dependencies;
    if (!state.massOnlyEmpty) return 0;
    let dropped = 0;
    for (const [id, picked] of Object.entries(state.massTargets || {})) {
      if (picked?.selected && state.massCampaigns?.[id]?.total > 0) {
        state.massTargets[id] = { ...picked, selected: false };
        dropped += 1;
      }
    }
    return dropped;
  }

  toggleOnlyEmpty() {
    const { state } = this.dependencies;
    if (state.massRunning) return;
    state.massOnlyEmpty = !state.massOnlyEmpty;
    this.dropHiddenSelection();
    this.syncControls();
    this.render();
  }

  /**
   * Selects exactly the pasted accounts. Ones without access in this profile,
   * unusable ones and — with the filter on — ones with campaigns are reported.
   */
  applyPasted(text) {
    const { state, massCloneView } = this.dependencies;
    const ids = parseAccountIds(text);
    const result = { ids, picked: [], notFound: [], unusable: [], skipped: [] };
    if (!ids.length) return result;
    const known = new Set(
      (state.accounts || []).map((account) => normalizeAccountId(account.id)),
    );
    const usable = new Map(
      massCloneView
        .usableAccounts()
        .map((account) => [normalizeAccountId(account.id), String(account.id)]),
    );
    const presence = state.massCampaigns || {};
    const chosen = new Set();
    for (const id of ids) {
      if (!known.has(id)) result.notFound.push(id);
      else if (!usable.has(id)) result.unusable.push(id);
      else if (state.massOnlyEmpty && presence[usable.get(id)]?.total > 0) {
        result.skipped.push(id);
      } else {
        result.picked.push(id);
        chosen.add(usable.get(id));
      }
    }
    // The list replaces the selection, and nothing chosen may hide behind a search.
    state.massTargets ||= {};
    for (const account of state.accounts || []) {
      const id = String(account.id);
      const selected = chosen.has(id);
      if (selected || state.massTargets[id]?.selected) {
        state.massTargets[id] = {
          ...(state.massTargets[id] || {}),
          selected,
          copyIndexes: undefined,
        };
      }
    }
    state.massSearch = "";
    const search = this.root?.querySelector(
      `#${this.dependencies.appId}-clone-search`,
    );
    if (search) search.value = "";
    this.render();
    return result;
  }

  resultText(result) {
    if (!result.ids.length) return t("picks.empty");
    const list = (ids) => ids.join(", ");
    return [
      t("picks.picked", { n: result.picked.length, total: result.ids.length }),
      result.skipped.length
        ? t("picks.skipped", {
            n: result.skipped.length,
            ids: list(result.skipped),
          })
        : "",
      result.unusable.length
        ? t("picks.unusable", {
            n: result.unusable.length,
            ids: list(result.unusable),
          })
        : "",
      result.notFound.length
        ? t("picks.notFound", {
            n: result.notFound.length,
            ids: list(result.notFound),
          })
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  syncControls() {
    const button = this.root?.querySelector("[data-picks-empty]");
    if (button) {
      button.setAttribute(
        "aria-pressed",
        this.dependencies.state.massOnlyEmpty ? "true" : "false",
      );
    }
  }

  /** Adds the filter, the "paste ids" button and its box to the accounts card. */
  attach(root) {
    const { appId } = this.dependencies;
    const search = root?.querySelector(`#${appId}-clone-search`);
    const header = search?.parentElement;
    if (!search || !header || header.querySelector("[data-picks-empty]"))
      return this;
    this.root = root;
    const doc = root.ownerDocument;
    const tools = doc.createElement("span");
    tools.className = "ma-picks";
    tools.innerHTML = `<button type="button" class="ma-filter-chip" data-picks-empty aria-pressed="false" title="${escapeHtml(t("picks.onlyEmptyHint"))}">${escapeHtml(t("picks.onlyEmpty"))}</button><button type="button" class="ma-filter-chip" data-picks-paste aria-expanded="false" title="${escapeHtml(t("picks.pasteHint"))}">${escapeHtml(t("picks.paste"))}</button>`;
    header.insertBefore(tools, search);
    const box = doc.createElement("div");
    box.className = "ma-paste ma-hidden";
    box.innerHTML = `<textarea rows="5" spellcheck="false" placeholder="${escapeHtml(t("picks.placeholder"))}" data-picks-text></textarea>
      <div class="ma-paste-bar"><span class="ma-hint">${escapeHtml(t("picks.replaceNote"))}</span><button type="button" class="ma-secondary" data-picks-close>${escapeHtml(t("picks.close"))}</button><button type="button" class="ma-primary" data-picks-apply>${escapeHtml(t("picks.apply"))}</button></div>
      <div class="ma-paste-result ma-hidden" data-picks-result role="status"></div>`;
    header.after(box);
    const setOpen = (open) => {
      box.classList.toggle("ma-hidden", !open);
      tools
        .querySelector("[data-picks-paste]")
        .setAttribute("aria-expanded", open ? "true" : "false");
      if (open) box.querySelector("textarea").focus();
    };
    root.addEventListener("click", (event) => {
      const target = event.target;
      if (target?.closest?.("[data-picks-empty]")) {
        this.toggleOnlyEmpty();
      } else if (target?.closest?.("[data-picks-paste]")) {
        setOpen(box.classList.contains("ma-hidden"));
      } else if (target?.closest?.("[data-picks-close]")) {
        setOpen(false);
      } else if (target?.closest?.("[data-picks-apply]")) {
        if (this.dependencies.state.massRunning) return;
        const output = box.querySelector("[data-picks-result]");
        output.textContent = this.resultText(
          this.applyPasted(box.querySelector("textarea").value),
        );
        output.classList.remove("ma-hidden");
      }
    });
    this.syncControls();
    return this;
  }
}
