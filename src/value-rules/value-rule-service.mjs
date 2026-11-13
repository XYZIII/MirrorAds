import { normalizeAccountId } from "../domain/ids.mjs";
import {
  ADSET_VALUE_RULE_FIELDS,
  VALUE_RULE_SET_FIELDS,
  buildValueRuleSetPayload,
  getPackageValueRuleSet,
  getPackageValueRuleSetIds,
  normalizeValueRuleSet,
  pickValueRuleSetName,
  valueRuleSetSignature,
} from "../domain/value-rules.mjs";

/** ValueRuleService. Dependencies are supplied by the application composition root. */
export class ValueRuleService {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.attachValueRulesToExport = this.attachValueRulesToExport.bind(this);
    this.listAccountValueRuleSets = this.listAccountValueRuleSets.bind(this);
    this.createValueRuleSet = this.createValueRuleSet.bind(this);
    this.resolveValueRuleSetMap = this.resolveValueRuleSetMap.bind(this);
  }

  /**
   * Export side: reads which rule set every ad set applies and the rule set
   * definitions. Runs as separate requests so an account or API version that
   * does not expose value rules never breaks the campaign export itself.
   */
  async attachValueRulesToExport(campaignId, adsets, accountId) {
    const { log } = this.dependencies.logging;
    const { graphFetch, graphGetAll } = this.dependencies.graphClient;
    let rows;
    try {
      rows = await graphGetAll(`${campaignId}/adsets`, {
        fields: ADSET_VALUE_RULE_FIELDS,
      });
    } catch (error) {
      log(
        "warn",
        "Could not read value rules of the source ad sets; they will not be copied.",
        String(error?.message || error),
      );
      return [];
    }
    const byId = new Map(rows.map((row) => [String(row.id), row]));
    const ruleSetIds = new Set();
    for (const adset of adsets) {
      const row = byId.get(String(adset.id));
      if (!row?.value_rule_set_id || row.value_rules_applied === false) {
        continue;
      }
      adset.value_rule_set_id = String(row.value_rule_set_id);
      adset.value_rules_applied = true;
      ruleSetIds.add(adset.value_rule_set_id);
    }
    if (!ruleSetIds.size) return [];
    // Ads Manager's token may read rule sets only through the account edge;
    // `GET <rule set id>` answers "(#10) Permission Denied".
    let accountSets = [];
    try {
      accountSets = await this.listAccountValueRuleSets(accountId);
    } catch (error) {
      log(
        "warn",
        `Could not list value rule sets of source account ${accountId}; trying each rule set directly.`,
        String(error?.message || error),
      );
    }
    const ruleSets = [];
    for (const ruleSetId of ruleSetIds) {
      let ruleSet = accountSets.find((item) => item.id === ruleSetId) || null;
      if (!ruleSet) {
        try {
          ruleSet = normalizeValueRuleSet(
            await graphFetch(ruleSetId, {
              query: { fields: VALUE_RULE_SET_FIELDS },
            }),
          );
        } catch (error) {
          log(
            "warn",
            `Could not read value rule set ${ruleSetId} (account lists ${accountSets.length} set(s)); it can only be reused inside the source account.`,
            String(error?.message || error),
          );
          continue;
        }
      }
      ruleSets.push({ ...ruleSet, id: ruleSetId });
      log(
        "info",
        `Value rule set exported: ${ruleSet.name || ruleSetId} (${ruleSet.rules.length} rules).`,
      );
    }
    return ruleSets;
  }

  async listAccountValueRuleSets(accountId) {
    const { graphGetAll } = this.dependencies.graphClient;
    const rows = await graphGetAll(
      `act_${normalizeAccountId(accountId)}/value_rule_set`,
      { fields: VALUE_RULE_SET_FIELDS },
    );
    return rows.map(normalizeValueRuleSet).filter((item) => item?.id);
  }

  async createValueRuleSet(accountId, ruleSet, name) {
    const { log } = this.dependencies.logging;
    const { graphFetch } = this.dependencies.graphClient;
    const path = `act_${normalizeAccountId(accountId)}/value_rule_set`;
    let json;
    try {
      json = await graphFetch(path, {
        method: "POST",
        body: buildValueRuleSetPayload(ruleSet, { name }),
      });
    } catch (error) {
      if (error?.uncertain) throw error;
      // Meta's reference names the list `criteria`, its examples `criterias`.
      log(
        "warn",
        "Value rule set was rejected with `criterias`; retrying with `criteria`.",
        String(error?.message || error),
      );
      json = await graphFetch(path, {
        method: "POST",
        body: buildValueRuleSetPayload(ruleSet, {
          name,
          criteriaKey: "criteria",
        }),
      });
    }
    return String(json?.id || "");
  }

  /**
   * Import side: maps every source rule set id to a rule set in the target
   * account — the same set when it lives there, an existing set with identical
   * rules, or a freshly created copy. A rule set that cannot be carried over is
   * left out of the map and reported, so the clone is never silently partial.
   */
  async resolveValueRuleSetMap(accountId, packageData) {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    const { listAccountValueRuleSets, createValueRuleSet } = this;
    const sourceIds = getPackageValueRuleSetIds(packageData);
    const mapping = {};
    if (!sourceIds.length) return mapping;
    // A notice, not an issue: an issue makes the mass clone roll back the whole
    // campaign, and a clone without its rule set is still worth keeping.
    const fail = (message, details = "") => {
      state.operationReport?.notice(message, { stage: "value_rules" });
      log("warn", message, details);
    };
    const sameAccount =
      normalizeAccountId(packageData?.source?.accountId) ===
      normalizeAccountId(accountId);
    let targetSets;
    try {
      targetSets = await listAccountValueRuleSets(accountId);
    } catch (error) {
      if (sameAccount) {
        for (const id of sourceIds) mapping[id] = id;
        return mapping;
      }
      fail(
        `Value rules were NOT copied: cannot read value rule sets of account ${accountId}.`,
        String(error?.message || error),
      );
      return mapping;
    }
    for (const sourceId of sourceIds) {
      if (targetSets.some((item) => item.id === sourceId)) {
        mapping[sourceId] = sourceId;
        continue;
      }
      const definition = getPackageValueRuleSet(packageData, sourceId);
      if (!definition?.rules?.length) {
        fail(
          `Value rules were NOT copied: the package has no definition for rule set ${sourceId}.`,
        );
        continue;
      }
      const signature = valueRuleSetSignature(definition);
      const twin = targetSets.find(
        (item) => valueRuleSetSignature(item) === signature,
      );
      if (twin) {
        mapping[sourceId] = twin.id;
        log(
          "info",
          `Value rule set reused in the target account: ${twin.name || twin.id}.`,
        );
        continue;
      }
      const name = pickValueRuleSetName(
        definition.name,
        targetSets.map((item) => item.name),
      );
      try {
        let createdId = await createValueRuleSet(accountId, definition, name);
        if (!createdId) {
          const refreshed = await listAccountValueRuleSets(accountId);
          createdId =
            refreshed.find((item) => valueRuleSetSignature(item) === signature)
              ?.id || "";
        }
        if (!createdId) {
          throw new Error("Meta returned no id for the new value rule set.");
        }
        mapping[sourceId] = createdId;
        targetSets.push({ ...definition, id: createdId, name });
        const message = `Value rule set created in the target account: ${name} (${createdId}).`;
        state.operationReport?.notice(message, { stage: "value_rules" });
        log("info", message);
      } catch (error) {
        if (error?.uncertain) throw error;
        fail(
          `Value rules were NOT copied: could not create rule set "${name}" in account ${accountId} (Meta allows 6 rule sets per account).`,
          String(error?.message || error),
        );
      }
    }
    return mapping;
  }
}
