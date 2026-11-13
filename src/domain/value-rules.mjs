import { deepClone } from "../utils/object.mjs";

/**
 * Value rules ("Apply a rule set" in the ad set's Conversion section).
 *
 * A rule set belongs to one ad account and is referenced from the ad set by
 * `value_rule_set_id`. Cloning into another account therefore needs the rule
 * set's definition, not only its id.
 */

export const VALUE_RULE_SET_FIELDS =
  "id,name,rules{name,adjust_sign,adjust_value,status,criterias}";
export const ADSET_VALUE_RULE_FIELDS =
  "id,value_rule_set_id,value_rules_applied";

/** Criteria types whose values are enum tokens Meta expects in upper case. */
const ENUM_CRITERIA_TYPES = new Set([
  "GENDER",
  "OS_TYPE",
  "DEVICE_PLATFORM",
  "PLACEMENT",
  "AUDIENCE_LABEL",
  "OMNI_CHANNEL",
]);

function listOf(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function normalizeCriteria(raw) {
  const type = String(raw?.criteria_type || "").toUpperCase();
  const values = listOf(raw?.criteria_values).map((value) => {
    const text = String(value);
    return ENUM_CRITERIA_TYPES.has(type) ? text.toUpperCase() : text;
  });
  const valueTypes = listOf(raw?.criteria_value_types).map((value) =>
    String(value).toUpperCase(),
  );
  return {
    criteria_type: type,
    operator: String(raw?.operator || "CONTAINS").toUpperCase(),
    criteria_values: values,
    criteria_value_types: values.map((_, index) => valueTypes[index] || "NONE"),
  };
}

/** Graph response (nested `{data: []}` edges, object ids) -> portable definition. */
export function normalizeValueRuleSet(raw) {
  if (!raw || typeof raw !== "object") return null;
  const rules = listOf(raw.rules ?? raw.value_rules)
    .filter((rule) => String(rule?.status || "").toUpperCase() !== "DELETED")
    .map((rule, index) => ({
      name: String(rule?.name || `Rule ${index + 1}`),
      adjust_sign: String(rule?.adjust_sign || "").toUpperCase(),
      adjust_value: Number(rule?.adjust_value),
      criterias: listOf(rule?.criterias ?? rule?.criteria).map(
        normalizeCriteria,
      ),
    }));
  return {
    id: String(raw.id || ""),
    name: String(raw.name || ""),
    rules,
  };
}

/**
 * Identity of a rule set's behaviour. Rule order matters (Meta applies only the
 * first matching rule); criteria order and letter case do not.
 */
export function valueRuleSetSignature(ruleSet) {
  const normalized = normalizeValueRuleSet(ruleSet);
  if (!normalized) return "";
  return JSON.stringify(
    normalized.rules.map((rule) => [
      rule.adjust_sign,
      rule.adjust_value,
      rule.criterias
        .map((criteria) =>
          [
            criteria.criteria_type,
            criteria.operator,
            criteria.criteria_values
              .map(
                (value, index) =>
                  `${criteria.criteria_value_types[index]}:${value.toUpperCase()}`,
              )
              .sort()
              .join(","),
          ].join("|"),
        )
        .sort(),
    ]),
  );
}

/** Body for `POST act_<id>/value_rule_set`. */
export function buildValueRuleSetPayload(
  ruleSet,
  { name, criteriaKey = "criterias" } = {},
) {
  const normalized = normalizeValueRuleSet(ruleSet);
  return {
    name: String(name || normalized.name || "Value rule set"),
    rules: normalized.rules.map((rule) => ({
      name: rule.name,
      adjust_sign: rule.adjust_sign,
      adjust_value: rule.adjust_value,
      [criteriaKey]: rule.criterias.map((criteria) => deepClone(criteria)),
    })),
  };
}

export function adsetUsesValueRules(adset) {
  return (
    Boolean(adset?.value_rule_set_id) && adset.value_rules_applied !== false
  );
}

/** Distinct rule set ids the package's ad sets actually apply. */
export function getPackageValueRuleSetIds(packageData) {
  return [
    ...new Set(
      (packageData?.adsets || [])
        .filter(adsetUsesValueRules)
        .map((adset) => String(adset.value_rule_set_id)),
    ),
  ];
}

export function getPackageValueRuleSet(packageData, ruleSetId) {
  return (
    (packageData?.valueRuleSets || []).find(
      (item) => String(item?.id) === String(ruleSetId),
    ) || null
  );
}

/** A free name for a rule set whose name is taken by a different definition. */
export function pickValueRuleSetName(baseName, takenNames) {
  const base = String(baseName || "Value rule set").trim() || "Value rule set";
  const taken = new Set([...takenNames].map((name) => String(name).trim()));
  if (!taken.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base} (${suffix})`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Rewrites every ad set to the target account's rule set id. An ad set whose
 * rule set could not be carried over loses the reference, so the writers never
 * send another account's id to Meta.
 */
export function materializeValueRuleMappedPackage(packageData, ruleSetMap) {
  if (!packageData || !getPackageValueRuleSetIds(packageData).length) {
    return packageData;
  }
  const next = deepClone(packageData);
  for (const adset of next.adsets || []) {
    if (!adset?.value_rule_set_id) continue;
    const mapped = adsetUsesValueRules(adset)
      ? ruleSetMap?.[String(adset.value_rule_set_id)]
      : "";
    if (mapped) {
      adset.value_rule_set_id = String(mapped);
      adset.value_rules_applied = true;
    } else {
      delete adset.value_rule_set_id;
      delete adset.value_rules_applied;
    }
  }
  return next;
}
