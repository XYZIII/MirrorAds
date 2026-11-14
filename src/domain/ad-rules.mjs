/**
 * Automated rules (Ads Manager "Rules") copied between ad accounts. A rule is
 * a name plus three specs: what to look at (evaluation), what to do
 * (execution) and when (schedule).
 */

/** Filter fields that name concrete objects of the source account. */
const OBJECT_ID_FIELD =
  /^(id|(campaign|adset|ad|adgroup)\.id|campaign_group\.id)$/;

/** Filter fields whose values are money in the account currency. */
const MONEY_FIELD =
  /(spent|spend|cost_per|cpc|cpm|cpp|budget|bid|purchase_roas|value)/i;

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
  const conditions = filters(rule).some(
    (item) =>
      MONEY_FIELD.test(item?.field || "") &&
      !OBJECT_ID_FIELD.test(item?.field || ""),
  );
  const change = (rule?.execution_spec?.execution_options || []).some(
    (option) =>
      option?.field === "change_spec" &&
      String(option?.value?.unit || "").toUpperCase() === "ACCOUNT_CURRENCY",
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
