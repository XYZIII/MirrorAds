/**
 * Automated rules (Ads Manager "Rules") copied between ad accounts. A rule is
 * a name plus three specs: what to look at (evaluation), what to do
 * (execution) and when (schedule).
 */

import { currencyMinorUnits } from "./clone-overrides.mjs";

/** Filter fields that name concrete objects of the source account. */
const OBJECT_ID_FIELD =
  /^(id|(campaign|adset|ad|adgroup)\.id|campaign_group\.id)$/;

/**
 * Filter fields whose values are money in the account currency: spend, the
 * cost-per metrics, budgets, bids and conversion values. ROAS is a ratio and
 * frequencies, counts and percentages are plain numbers, so they are not.
 */
const MONEY_FIELD =
  /(^|[._:])(spent|spend|cpc|cpm|cpp|cpa|bid_amount|[a-z_]*budget[a-z_]*)$|cost_per|_value$/i;

function isMoneyField(field) {
  const name = String(field || "");
  return (
    MONEY_FIELD.test(name) && !/roas/i.test(name) && !OBJECT_ID_FIELD.test(name)
  );
}

const LEVEL_NAMES = { CAMPAIGN: "campaign", ADSET: "adset", AD: "ad" };

function filters(rule) {
  const list = rule?.evaluation_spec?.filters;
  return Array.isArray(list) ? list : [];
}

function filterValue(rule, field) {
  return filters(rule).find((item) => item?.field === field)?.value;
}

/** True when the rule is limited to hand-picked objects of its account. */
export function ruleTargetsObjects(rule) {
  return filters(rule).some((item) => OBJECT_ID_FIELD.test(item?.field || ""));
}

/** True when a condition of the rule is an amount of money. */
export function ruleUsesMoney(rule) {
  const conditions = filters(rule).some((item) => isMoneyField(item?.field));
  const change = (rule?.execution_spec?.execution_options || []).some(
    (option) =>
      option?.field === "change_spec" &&
      (String(option?.value?.unit || "").toUpperCase() === "ACCOUNT_CURRENCY" ||
        Number(option?.value?.limit) > 0),
  );
  return conditions || change;
}

/** A compact, language-neutral description of a rule for the list. */
export function summarizeRule(rule) {
  const entity = String(filterValue(rule, "entity_type") || "").toUpperCase();
  const conditions = filters(rule).filter(
    (item) =>
      !["entity_type", "time_preset", "attribution_window"].includes(
        item?.field,
      ) && !OBJECT_ID_FIELD.test(item?.field || ""),
  ).length;
  return {
    id: String(rule?.id || ""),
    name: String(rule?.name || rule?.id || ""),
    enabled: String(rule?.status || "").toUpperCase() === "ENABLED",
    action: String(rule?.execution_spec?.execution_type || ""),
    level: LEVEL_NAMES[entity] || "",
    schedule: String(rule?.schedule_spec?.schedule_type || ""),
    conditions,
    targetsObjects: ruleTargetsObjects(rule),
    usesMoney: ruleUsesMoney(rule),
  };
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/**
 * The request that recreates `rule` in another account.
 *
 * Object ids of the source account mean nothing elsewhere, so filters on them
 * are removed: the copy applies to every object of its level, and
 * `widened` reports that. `disabled` creates the copy switched off.
 */
export function buildRulePayload(rule, { disabled = false } = {}) {
  const evaluation = clone(rule?.evaluation_spec) || {};
  const before = Array.isArray(evaluation.filters)
    ? evaluation.filters.length
    : 0;
  if (Array.isArray(evaluation.filters)) {
    evaluation.filters = evaluation.filters.filter(
      (item) => !OBJECT_ID_FIELD.test(item?.field || ""),
    );
  }
  const body = {
    name: String(rule?.name || "Rule"),
    evaluation_spec: evaluation,
    execution_spec: clone(rule?.execution_spec) || {},
    status:
      disabled || String(rule?.status || "").toUpperCase() !== "ENABLED"
        ? "DISABLED"
        : "ENABLED",
  };
  if (rule?.schedule_spec) body.schedule_spec = clone(rule.schedule_spec);
  return {
    body,
    widened: before > (evaluation.filters?.length ?? 0),
  };
}

/** Names already used by rules of an account, for the "already there" check. */
export function ruleNameSet(rules) {
  return new Set(
    (rules || []).map((rule) =>
      String(rule?.name || "")
        .trim()
        .toLowerCase(),
    ),
  );
}

/**
 * The multiplier that turns an amount of one account into the same money in
 * another: both the exchange rate (Meta's ratio to USD) and the API's units
 * (cents for USD, whole units for VND or JPY). 1 for the same currency, null
 * when the currencies differ and a rate is missing.
 */
export function moneyFactor(from, to, minorUnits) {
  const source = String(from?.currency || "").toUpperCase();
  const target = String(to?.currency || "").toUpperCase();
  if (!source || !target || source === target) return 1;
  const sourceRatio = Number(from?.ratio);
  const targetRatio = Number(to?.ratio);
  if (!(sourceRatio > 0) || !(targetRatio > 0)) return null;
  return (
    (targetRatio / sourceRatio) * (minorUnits(target) / minorUnits(source))
  );
}

function scaleMoney(value, factor) {
  if (Array.isArray(value))
    return value.map((item) => scaleMoney(item, factor));
  if (value === null || value === "" || typeof value === "boolean")
    return value;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  const scaled = Math.max(1, Math.round(numeric * factor));
  return typeof value === "string" ? String(scaled) : scaled;
}

/**
 * Converts every money amount of a rule request in place: money conditions,
 * a budget or bid change given in the account currency, and the cap of a
 * change. Returns how many amounts were converted.
 */
export function convertRuleMoney(body, factor) {
  if (!(factor > 0) || factor === 1) return 0;
  let converted = 0;
  for (const item of body?.evaluation_spec?.filters || []) {
    if (!isMoneyField(item?.field)) continue;
    item.value = scaleMoney(item.value, factor);
    converted += 1;
  }
  for (const option of body?.execution_spec?.execution_options || []) {
    const spec = option?.field === "change_spec" ? option.value : null;
    if (!spec || typeof spec !== "object") continue;
    if (
      String(spec.unit || "").toUpperCase() === "ACCOUNT_CURRENCY" &&
      spec.amount !== undefined
    ) {
      // A change may be negative ("lower the budget by 5"): keep the sign.
      const amount = Number(spec.amount);
      if (Number.isFinite(amount) && amount !== 0) {
        spec.amount =
          Math.sign(amount) *
          Math.max(1, Math.round(Math.abs(amount) * factor));
        converted += 1;
      }
    }
    if (Number(spec.limit) > 0) {
      spec.limit = scaleMoney(spec.limit, factor);
      converted += 1;
    }
  }
  return converted;
}

const SETTING_FIELDS = new Set([
  "entity_type",
  "time_preset",
  "attribution_window",
]);

/** An amount in the API's units (cents for USD) in whole account money. */
function wholeMoney(value, units) {
  if (Array.isArray(value)) return value.map((item) => wholeMoney(item, units));
  const numeric = Number(value);
  return Number.isFinite(numeric) && value !== "" && value !== null
    ? numeric / units
    : value;
}

/**
 * What a rule checks, does and when, for a tooltip. Money conditions and a
 * budget change given in money are in the account's whole units: 2000
 * cents of spend read as 20 USD. `currency` is the account's.
 */
export function describeRule(rule, currency = "") {
  const units = currencyMinorUnits(currency);
  const conditions = filters(rule)
    .filter(
      (item) =>
        !SETTING_FIELDS.has(item?.field) &&
        !OBJECT_ID_FIELD.test(item?.field || ""),
    )
    .map((item) => {
      const money = isMoneyField(item?.field);
      return {
        field: String(item?.field || ""),
        operator: String(item?.operator || "").toUpperCase(),
        value: money ? wholeMoney(item?.value, units) : item?.value,
        money,
      };
    });
  const option = (rule?.execution_spec?.execution_options || []).find(
    (item) => item?.field === "change_spec",
  )?.value;
  let change = null;
  if (option && typeof option === "object") {
    const unit = String(option.unit || "").toUpperCase();
    const amount = Number(option.amount);
    change = {
      amount:
        unit === "ACCOUNT_CURRENCY" && Number.isFinite(amount)
          ? amount / units
          : amount,
      unit: unit === "ACCOUNT_CURRENCY" ? "money" : "percent",
      limit: Number(option.limit) > 0 ? Number(option.limit) / units : null,
    };
  }
  return {
    ...summarizeRule(rule),
    status: String(rule?.status || "").toUpperCase(),
    preset: String(filterValue(rule, "time_preset") || "").toUpperCase(),
    conditions,
    change,
    currency: String(currency || "").toUpperCase(),
  };
}

/**
 * Where an account stands with rules: "on" when at least one is switched
 * on, "off" when all are off, "none" without any, "unknown" when they
 * could not be read (`rules` is null).
 */
export function rulesState(rules) {
  if (!Array.isArray(rules)) return { state: "unknown", on: 0, off: 0 };
  const on = rules.filter((rule) => rule.enabled).length;
  const off = rules.length - on;
  return { state: on ? "on" : off ? "off" : "none", on, off };
}
