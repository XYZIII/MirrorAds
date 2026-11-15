import { rulesState } from "../domain/ad-rules.mjs";
import { escapeHtml } from "../utils/string.mjs";
import { t } from "./i18n.mjs";
import { ICONS } from "./icons.mjs";

const SIGNS = {
  GREATER_THAN: ">",
  LESS_THAN: "<",
  EQUAL: "=",
  NOT_EQUAL: "≠",
};

/** A translation, or the key's own words when there is none. */
function said(key, fallback) {
  const text = t(key);
  return text === key ? fallback : text;
}

function words(code) {
  return String(code || "")
    .toLowerCase()
    .replace(/^offsite_conversion\.fb_pixel_/, "pixel ")
    .replace(/[._]+/g, " ")
    .trim();
}

function number(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && value !== "" && value !== null
    ? numeric.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : String(value ?? "");
}

/** "Spend > 20 USD", "CTR < 1", "Spend between 5 USD and 10 USD". */
export function conditionText(condition, currency = "") {
  const field = said(`rules.field.${condition.field}`, words(condition.field));
  const one = (value) =>
    condition.money && currency
      ? `${number(value)} ${currency}`
      : number(value);
  const value = Array.isArray(condition.value)
    ? condition.operator.endsWith("RANGE") && condition.value.length === 2
      ? `${one(condition.value[0])}–${one(condition.value[1])}`
      : condition.value.map(one).join(", ")
    : one(condition.value);
  const sign = SIGNS[condition.operator];
  if (sign) return `${field} ${sign} ${value}`;
  return `${field} ${said(`rules.op.${condition.operator}`, words(condition.operator))} ${value}`;
}

/** What the rule does, with the change it makes: "change budget −5 USD". */
function actionText(rule) {
  const action = said(`rules.action.${rule.action}`, words(rule.action));
  const change = rule.change;
  if (!change || !Number.isFinite(change.amount) || !change.amount) {
    return action;
  }
  const sign = change.amount > 0 ? "+" : "−";
  const amount =
    change.unit === "money"
      ? `${number(Math.abs(change.amount))} ${rule.currency}`.trim()
      : `${number(Math.abs(change.amount))}%`;
  return `${action} ${sign}${amount}`;
}

/** The two lines under a rule's name: what it does, and when. */
export function ruleLines(rule) {
  const doing = [
    actionText(rule),
    rule.level ? t(`rules.level.${rule.level}`) : "",
    rule.schedule
      ? said(`rules.schedule.${rule.schedule}`, words(rule.schedule))
      : "",
  ].filter(Boolean);
  const checking = [
    ...rule.conditions.map((condition) =>
      conditionText(condition, rule.currency),
    ),
    rule.preset ? said(`rules.preset.${rule.preset}`, words(rule.preset)) : "",
  ].filter(Boolean);
  return [doing.join(" · "), checking.join(" · ")].filter(Boolean);
}

/**
 * The rules chip of an account line: how many rules are switched on, with
 * the list on hover (or keyboard focus). No rules, or only switched-off
 * ones, stand out: that is what the chip is there to catch.
 */
export function rulesChip(row) {
  const { state, on, off } = rulesState(row.rules);
  const label =
    state === "on"
      ? t("reports.rules.on", { count: on })
      : t(`reports.rules.${state}`);
  let body;
  if (state === "unknown") {
    body = `<span class="ma-rules-empty">${escapeHtml(t("reports.rules.unknownHint"))}</span>`;
  } else if (state === "none") {
    body = `<span class="ma-rules-empty">${escapeHtml(t("reports.rules.noneHint"))}</span>`;
  } else {
    const rules = [...row.rules].sort(
      (a, b) => Number(b.enabled) - Number(a.enabled),
    );
    body = `<span class="ma-rules-title">${escapeHtml(
      t("reports.rules.title", { on, off }),
    )}</span>${rules
      .map(
        (rule) => `<span class="ma-rules-item${rule.enabled ? "" : " is-off"}">
          <span class="ma-rules-name"><span class="ma-rules-dot"></span>${escapeHtml(rule.name)}<em>${escapeHtml(
            t(rule.enabled ? "rules.on" : "rules.off"),
          )}</em></span>
          ${ruleLines(rule)
            .map((text) => `<small>${escapeHtml(text)}</small>`)
            .join("")}
        </span>`,
      )
      .join("")}`;
  }
  return `<span class="ma-rules ma-rules-${state}" tabindex="0" aria-label="${escapeHtml(label)}">${ICONS.rules}<span>${escapeHtml(label)}</span><span class="ma-rules-pop" role="tooltip">${body}</span></span>`;
}

/** Lines whose account has no rule switched on (rules that were read). */
export function withoutRules(rows) {
  return (rows || []).filter((row) => {
    const { state } = rulesState(row.rules);
    return state === "none" || state === "off";
  });
}
