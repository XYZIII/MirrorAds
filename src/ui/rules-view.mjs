import { summarizeRule } from "../domain/ad-rules.mjs";
import {
  accountDelivers,
  classifyAccountStatus,
} from "../domain/report-time.mjs";
import { escapeHtml } from "../utils/string.mjs";
import { parseAccountIds } from "./account-picks.mjs";
import { t } from "./i18n.mjs";

const KNOWN = {
  action: [
    "PAUSE",
    "UNPAUSE",
    "CHANGE_BUDGET",
    "CHANGE_BID",
    "CHANGE_CAMPAIGN_BUDGET",
    "NOTIFICATION",
    "ROTATE",
    "REBALANCE_BUDGET",
  ],
  schedule: ["SEMI_HOURLY", "HOURLY", "DAILY", "CUSTOM"],
};

/** A label for a Meta enum: a translation when there is one, else the raw value. */
function label(group, value) {
  if (!value) return "";
  return KNOWN[group].includes(value) ? t(`rules.${group}.${value}`) : value;
}

/**
 * Targets from a pasted list of ad account ids, in the order pasted. Working
 * accounts are picked; the rest are reported. The source is never a target.
 */
export function matchPastedTargets(text, accounts, sourceId) {
  const ids = parseAccountIds(text);
  const byId = new Map((accounts || []).map((item) => [item.accountId, item]));
  const result = { ids, picked: [], notFound: [], unusable: [], source: [] };
  for (const id of ids) {
    const item = byId.get(id);
    if (!item) result.notFound.push(id);
    else if (id === String(sourceId || "")) result.source.push(id);
    else if (!item.usable) result.unusable.push(id);
    else result.picked.push(id);
  }
  return result;
}

/** What a pasted list did, one line per kind of outcome. */
export function pastedTargetsText(result) {
  if (!result.ids.length) return t("picks.empty");
  const list = (ids) => ids.join(", ");
  const line = (key, ids) =>
    ids.length ? t(key, { n: ids.length, ids: list(ids) }) : "";
  return [
    t("picks.picked", { n: result.picked.length, total: result.ids.length }),
    line("rules.paste.source", result.source),
    line("rules.paste.dead", result.unusable),
    line("picks.notFound", result.notFound),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * The Rules tab: pick automated rules of one account and copy them into
 * others. Nothing is written before the confirm step.
 */
export class RulesView {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.requestId = 0;
    this.boundRoot = null;
    this.open = this.open.bind(this);
    this.render = this.render.bind(this);
  }

  get panel() {
    const { dom, appId } = this.dependencies;
    return dom.root?.querySelector(`#${appId}-panel-rules`) || null;
  }

  accounts() {
    return (this.dependencies.state.accounts || []).map((account) => {
      const id = String(account.accountId || account.id || "").replace(
        /^act_/,
        "",
      );
      const health = classifyAccountStatus(
        account.account_status ?? account.raw?.account_status,
      );
      return {
        accountId: id,
        name: account.name || id,
        currency: String(
          account.raw?.currency || account.currency || "",
        ).toUpperCase(),
        usable: accountDelivers(health),
      };
    });
  }

  source() {
    const { state } = this.dependencies;
    return this.accounts().find((item) => item.accountId === state.rulesSource);
  }

  /** True when some other account uses another currency than the source. */
  mixedCurrency() {
    const currency = this.source()?.currency || "";
    return this.accounts().some(
      (item) => item.usable && item.currency && item.currency !== currency,
    );
  }

  pickedRules() {
    const { state } = this.dependencies;
    return (state.rulesList || []).filter(
      (rule) => state.rulesPicked?.[rule.id],
    );
  }

  pickedTargets() {
    const { state } = this.dependencies;
    return this.accounts().filter(
      (item) =>
        item.usable &&
        item.accountId !== state.rulesSource &&
        state.rulesTargets?.[item.accountId],
    );
  }

  bind(root) {
    if (!root || this.boundRoot === root) return;
    this.boundRoot = root;
    root.addEventListener("click", (event) => {
      const target = event.target.closest?.("[data-rules]");
      if (!target || !this.panel?.contains(target)) return;
      this.handle(target.dataset.rules);
    });
    root.addEventListener("change", (event) => {
      const { state } = this.dependencies;
      const node = event.target;
      if (!this.panel?.contains(node)) return;
      if (node.matches("[data-rules-source]")) {
        state.rulesSource = node.value;
        this.load();
      } else if (node.matches("[data-rule-pick]")) {
        state.rulesPicked = { ...state.rulesPicked };
        if (node.checked) state.rulesPicked[node.dataset.rulePick] = true;
        else delete state.rulesPicked[node.dataset.rulePick];
        this.render();
        this.refocus("rulePick", node.dataset.rulePick);
      } else if (node.matches("[data-rule-target]")) {
        state.rulesTargets = { ...state.rulesTargets };
        if (node.checked) state.rulesTargets[node.dataset.ruleTarget] = true;
        else delete state.rulesTargets[node.dataset.ruleTarget];
        this.render();
        this.refocus("ruleTarget", node.dataset.ruleTarget);
      } else if (node.matches("[data-rules-all]")) {
        const picked = {};
        if (node.checked) {
          for (const rule of state.rulesList || []) picked[rule.id] = true;
        }
        state.rulesPicked = picked;
        this.render();
      } else if (node.matches("[data-rules-targets-all]")) {
        const targets = { ...state.rulesTargets };
        // Only the accounts the search currently shows.
        for (const box of this.panel.querySelectorAll("[data-rule-target]")) {
          if (box.closest(".ma-rule-acct")?.hidden) continue;
          if (node.checked) targets[box.dataset.ruleTarget] = true;
          else delete targets[box.dataset.ruleTarget];
        }
        state.rulesTargets = targets;
        this.render();
      } else if (node.matches("[data-rules-disabled]")) {
        state.rulesDisabled = node.checked;
      }
    });
    root.addEventListener("input", (event) => {
      const node = event.target;
      if (!this.panel?.contains(node)) return;
      if (node.matches("[data-rules-paste-text]")) {
        // Kept for the next render; typing itself needs no re-render.
        this.dependencies.state.rulesPasteText = node.value;
        return;
      }
      if (!node.matches("[data-rules-search]")) return;
      // Filtered in place: a re-render would take the caret away.
      this.dependencies.state.rulesSearch = node.value;
      this.applySearch();
    });
  }

  applySearch() {
    const query = String(this.dependencies.state.rulesSearch || "")
      .trim()
      .toLowerCase();
    for (const row of this.panel?.querySelectorAll(".ma-rule-acct") || []) {
      row.hidden = Boolean(query) && !row.dataset.search.includes(query);
    }
  }

  handle(step) {
    const { state } = this.dependencies;
    if (step === "reload") {
      this.load();
      return;
    }
    if (step === "paste") {
      state.rulesPasteOpen = !state.rulesPasteOpen;
      this.render();
      if (state.rulesPasteOpen) {
        this.panel?.querySelector("[data-rules-paste-text]")?.focus();
      }
      return;
    }
    if (step === "paste-close") {
      state.rulesPasteOpen = false;
      this.render();
      return;
    }
    if (step === "paste-apply") {
      this.applyPasted(state.rulesPasteText || "");
      return;
    }
    if (step === "ask" && this.pickedRules().length) {
      if (this.pickedTargets().length) state.rulesStage = "confirm";
    } else if (step === "cancel" || step === "close") {
      state.rulesStage = "";
      state.rulesResults = null;
    } else if (step === "run" && state.rulesStage === "confirm") {
      this.run();
      return;
    }
    this.render();
  }

  /** The pasted accounts become the targets, replacing the selection. */
  applyPasted(text) {
    const { state } = this.dependencies;
    if (state.rulesStage === "running") return null;
    const result = matchPastedTargets(text, this.accounts(), state.rulesSource);
    if (result.ids.length) {
      state.rulesTargets = Object.fromEntries(
        result.picked.map((id) => [id, true]),
      );
      // Nothing picked may hide behind a search.
      state.rulesSearch = "";
    }
    state.rulesPasteText = text;
    state.rulesPasteResult = pastedTargetsText(result);
    this.render();
    return result;
  }

  pasteMarkup() {
    const { state } = this.dependencies;
    if (!state.rulesPasteOpen) return "";
    return `<div class="ma-paste ma-rule-paste">
        <textarea rows="5" spellcheck="false" data-always-enabled data-rules-paste-text placeholder="${escapeHtml(t("picks.placeholder"))}">${escapeHtml(state.rulesPasteText || "")}</textarea>
        <div class="ma-paste-bar"><span class="ma-hint">${escapeHtml(t("picks.replaceNote"))}</span><button type="button" class="ma-secondary" data-always-enabled data-rules="paste-close">${escapeHtml(t("picks.close"))}</button><button type="button" class="ma-primary" data-always-enabled data-rules="paste-apply">${escapeHtml(t("picks.apply"))}</button></div>
        ${
          state.rulesPasteResult
            ? `<div class="ma-paste-result" role="status">${escapeHtml(state.rulesPasteResult)}</div>`
            : ""
        }
      </div>`;
  }

  async run() {
    const { state } = this.dependencies;
    const rules = this.pickedRules();
    const targets = this.pickedTargets();
    state.rulesStage = "running";
    state.rulesProgress = `0/${targets.length}`;
    this.render();
    let results = [];
    try {
      results = await this.dependencies.adRuleService.cloneRules({
        rules,
        targets,
        sourceAccountId: state.rulesSource,
        disabled: Boolean(state.rulesDisabled),
        onProgress: (done, total) => {
          state.rulesProgress = `${done}/${total}`;
          this.render();
        },
      });
    } catch (error) {
      results = [
        {
          accountId: "",
          name: "",
          created: 0,
          skipped: 0,
          failed: rules.length,
          errors: [String(error?.message || error)],
          notes: [],
        },
      ];
    }
    state.rulesResults = results;
    state.rulesStage = "done";
    this.render();
  }

  /** Called when the tab is shown: the first visit loads the rules. */
  open() {
    const { state } = this.dependencies;
    if (!state.rulesSource) {
      const accounts = this.accounts();
      const preferred = String(
        state.cloneSourceAccountId || state.exportAccountId || "",
      ).replace(/^act_/, "");
      state.rulesSource =
        accounts.find((item) => item.accountId === preferred)?.accountId ||
        accounts[0]?.accountId ||
        "";
    }
    if (state.rulesSource && !state.rulesList && !state.rulesLoading) {
      this.load();
    } else this.render();
  }

  async load() {
    const { state } = this.dependencies;
    const requestId = ++this.requestId;
    state.rulesStage = "";
    state.rulesResults = null;
    state.rulesPicked = {};
    state.rulesError = "";
    state.rulesList = null;
    if (!state.sessionReady || !state.rulesSource) {
      state.rulesError = t("rules.waiting");
      this.render();
      return;
    }
    state.rulesLoading = true;
    this.render();
    try {
      const rules = await this.dependencies.adRuleService.listRules(
        state.rulesSource,
      );
      if (requestId !== this.requestId) return;
      state.rulesList = rules;
      // The usual wish is "all of them", so that is the starting point.
      state.rulesPicked = Object.fromEntries(
        rules.map((rule) => [rule.id, true]),
      );
    } catch (error) {
      if (requestId !== this.requestId) return;
      state.rulesError = String(error?.message || error);
      this.dependencies.logging.log(
        "warn",
        "Rules could not be loaded.",
        error,
      );
    }
    state.rulesLoading = false;
    this.render();
  }

  ruleMarkup(rule) {
    const { state } = this.dependencies;
    const info = summarizeRule(rule);
    const chips = [
      label("action", info.action),
      info.level ? t(`rules.level.${info.level}`) : "",
      label("schedule", info.schedule),
      t("rules.conditions", { count: info.conditions }),
    ]
      .filter(Boolean)
      .map((text) => `<i>${escapeHtml(text)}</i>`)
      .join("");
    const warn = [
      info.targetsObjects ? t("rules.warn.objects") : "",
      info.usesMoney && this.mixedCurrency() ? t("rules.warn.money") : "",
    ]
      .filter(Boolean)
      .map((text) => `<small>${escapeHtml(text)}</small>`)
      .join("");
    return `<label class="ma-rule">
        <input type="checkbox" class="ma-rep-pick" data-always-enabled data-rule-pick="${escapeHtml(info.id)}" ${state.rulesPicked?.[info.id] ? "checked" : ""} />
        <div>
          <b title="${escapeHtml(info.name)}">${escapeHtml(info.name)}</b>
          <div class="ma-rule-chips"><i class="${info.enabled ? "is-on" : "is-off"}">${escapeHtml(t(info.enabled ? "rules.on" : "rules.off"))}</i>${chips}</div>
          ${warn}
        </div>
      </label>`;
  }

  barMarkup(rules, targets) {
    const { state } = this.dependencies;
    const button = (step, text, cls) =>
      `<button type="button" class="${cls}" data-always-enabled data-rules="${step}">${escapeHtml(text)}</button>`;
    if (state.rulesStage === "confirm") {
      return `<div class="ma-rep-actbar is-confirm"><span class="ma-rep-acttext"><b>${escapeHtml(
        t("rules.confirm", { rules: rules.length, accounts: targets.length }),
      )}</b> ${escapeHtml(t("rules.confirmNote"))}</span>
        ${button("run", t("rules.yes"), "ma-primary")}
        ${button("cancel", t("reports.act.cancel"), "ma-rep-link")}</div>`;
    }
    if (state.rulesStage === "running") {
      return `<div class="ma-rep-actbar"><span class="ma-rep-acttext">${escapeHtml(t("reports.act.running"))} ${escapeHtml(state.rulesProgress || "")}</span></div>`;
    }
    if (state.rulesStage === "done") {
      const results = state.rulesResults || [];
      const sum = (key) =>
        results.reduce((total, item) => total + item[key], 0);
      const lines = results
        .filter((item) => item.failed || item.notes.length)
        .flatMap((item) => [
          ...item.errors.map((text) => `${item.name}: ${text}`),
          ...item.notes.map(
            (note) =>
              `${item.name}: ${t(`rules.note.${note.kind}`, { rule: note.rule })}`,
          ),
        ])
        .slice(0, 8)
        .map((text) => `<div class="ma-rep-acterr">${escapeHtml(text)}</div>`)
        .join("");
      return `<div class="ma-rep-actbar"><span class="ma-rep-acttext"><b>${escapeHtml(
        t("rules.done", {
          created: sum("created"),
          skipped: sum("skipped"),
          failed: sum("failed"),
        }),
      )}</b></span>${button("close", t("reports.act.ok"), "ma-secondary")}${lines}</div>`;
    }
    const ready = rules.length && targets.length;
    return `<div class="ma-rule-go">
        <label class="ma-rule-opt"><input type="checkbox" class="ma-rep-pick" data-always-enabled data-rules-disabled ${state.rulesDisabled ? "checked" : ""} /> ${escapeHtml(t("rules.disabled"))}</label>
        <button type="button" class="ma-primary" data-always-enabled data-rules="ask" ${ready ? "" : "disabled"}>${escapeHtml(
          t("rules.go", { rules: rules.length, accounts: targets.length }),
        )}</button>
      </div>`;
  }

  /** The clicked box keeps the keyboard focus after the redraw, in place. */
  refocus(key, value) {
    const attribute =
      key === "rulePick" ? "data-rule-pick" : "data-rule-target";
    const box = [
      ...(this.panel?.querySelectorAll(`[${attribute}]`) || []),
    ].find((node) => node.dataset[key] === value);
    try {
      box?.focus({ preventScroll: true });
    } catch {
      // Focus is a nicety; the click has already done its work.
    }
  }

  render() {
    const panel = this.panel;
    if (!panel) return;
    // Every tick redraws the tab: its lists keep where they were scrolled,
    // or a click on an account far down would throw the list to the top.
    const scrolled = [".ma-rule-list", ".ma-rule-accts"].map((selector) => [
      selector,
      panel.querySelector(selector)?.scrollTop || 0,
    ]);
    const panelTop = panel.scrollTop;
    this.draw(panel);
    for (const [selector, top] of scrolled) {
      const node = panel.querySelector(selector);
      if (node && top) node.scrollTop = top;
    }
    if (panelTop) panel.scrollTop = panelTop;
  }

  draw(panel) {
    const { state } = this.dependencies;
    const accounts = this.accounts();
    const rules = state.rulesList || [];
    const picked = this.pickedRules();
    const targets = this.pickedTargets();
    const options = accounts
      .map(
        (item) =>
          `<option value="${escapeHtml(item.accountId)}" ${item.accountId === state.rulesSource ? "selected" : ""}>${escapeHtml(`${item.name} · ${item.accountId}`)}</option>`,
      )
      .join("");
    const ruleList = state.rulesLoading
      ? `<div class="ma-rule-note">${escapeHtml(t("rules.loading"))}</div>`
      : state.rulesError
        ? `<div class="ma-rule-note ma-rep-err">${escapeHtml(state.rulesError)}</div>`
        : rules.length
          ? rules.map((rule) => this.ruleMarkup(rule)).join("")
          : `<div class="ma-rule-note">${escapeHtml(t("rules.none"))}</div>`;
    const candidates = accounts.filter(
      (item) => item.accountId !== state.rulesSource,
    );
    const accountList = candidates
      .map(
        (
          item,
        ) => `<label class="ma-rule-acct${item.usable ? "" : " is-dead"}" data-search="${escapeHtml(`${item.name} ${item.accountId}`.toLowerCase())}">
            <input type="checkbox" class="ma-rep-pick" data-always-enabled data-rule-target="${escapeHtml(item.accountId)}" ${
              item.usable && state.rulesTargets?.[item.accountId]
                ? "checked"
                : ""
            } ${item.usable ? "" : "disabled"} />
            <b title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</b>
            <span>${escapeHtml(item.accountId)}${item.currency ? ` · ${escapeHtml(item.currency)}` : ""}${item.usable ? "" : ` · ${escapeHtml(t("rules.dead"))}`}</span>
          </label>`,
      )
      .join("");
    panel.innerHTML = `
      <div class="ma-rule-head">
        <label class="ma-field"><span>${escapeHtml(t("rules.source"))}</span>
          <select data-always-enabled data-rules-source>${options}</select></label>
        <button type="button" class="ma-secondary" data-always-enabled data-rules="reload">${escapeHtml(t("rules.reload"))}</button>
      </div>
      <div class="ma-rule-title">
        <label><input type="checkbox" class="ma-rep-pick" data-always-enabled data-rules-all ${rules.length && picked.length === rules.length ? "checked" : ""} /> ${escapeHtml(
          t("rules.title", { picked: picked.length, total: rules.length }),
        )}</label>
      </div>
      <div class="ma-rule-list">${ruleList}</div>
      <div class="ma-rule-title">
        <label><input type="checkbox" class="ma-rep-pick" data-always-enabled data-rules-targets-all ${
          targets.length &&
          targets.length === candidates.filter((item) => item.usable).length
            ? "checked"
            : ""
        } /> ${escapeHtml(t("rules.targets", { picked: targets.length }))}</label>
        <span class="ma-rule-find">
          <button type="button" class="ma-filter-chip" data-always-enabled data-rules="paste" aria-expanded="${state.rulesPasteOpen ? "true" : "false"}" title="${escapeHtml(t("rules.paste.hint"))}">${escapeHtml(t("rules.paste"))}</button>
          <input type="text" data-always-enabled data-rules-search placeholder="${escapeHtml(t("rules.search"))}" value="${escapeHtml(state.rulesSearch || "")}" />
        </span>
      </div>
      ${this.pasteMarkup()}
      <div class="ma-rule-accts">${accountList || `<div class="ma-rule-note">${escapeHtml(t("rules.noAccounts"))}</div>`}</div>
      ${this.barMarkup(picked, targets)}`;
    this.applySearch();
  }
}
