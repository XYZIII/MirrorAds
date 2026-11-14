import {
  buildRulePayload,
  ruleNameSet,
  ruleUsesMoney,
} from "../domain/ad-rules.mjs";
import { normalizeAccountId } from "../domain/ids.mjs";

const FIELDS = "id,name,status,evaluation_spec,execution_spec,schedule_spec";

/**
 * Reads the automated rules of an ad account and recreates them in others.
 * An account that fails never stops the rest, and a rule whose name already
 * exists in the target is left alone, so running the copy twice is safe.
 */
export class AdRuleService {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.listRules = this.listRules.bind(this);
    this.cloneRules = this.cloneRules.bind(this);
  }

  listRules(accountId) {
    const { graphGetAll } = this.dependencies.graphClient;
    return graphGetAll(`act_${normalizeAccountId(accountId)}/adrules_library`, {
      fields: FIELDS,
      limit: 200,
    });
  }

  async createRule(accountId, body) {
    const { graphFetch } = this.dependencies.graphClient;
    const json = await graphFetch(
      `act_${normalizeAccountId(accountId)}/adrules_library`,
      { method: "POST", body },
    );
    return String(json?.id || "");
  }

  /**
   * Copies `rules` into every account of `targets` ({ accountId, name,
   * currency }). Returns one result per account:
   * `{ accountId, name, created, skipped, failed, errors, notes }`.
   */
  async cloneRules({
    rules,
    targets,
    sourceCurrency = "",
    disabled = false,
    onProgress,
  }) {
    const { log } = this.dependencies.logging;
    const results = [];
    for (const [index, target] of targets.entries()) {
      const result = {
        accountId: String(target.accountId),
        name: target.name || String(target.accountId),
        created: 0,
        skipped: 0,
        failed: 0,
        errors: [],
        notes: [],
      };
      results.push(result);
      try {
        const existing = ruleNameSet(await this.listRules(target.accountId));
        const otherCurrency =
          sourceCurrency &&
          target.currency &&
          String(target.currency).toUpperCase() !==
            String(sourceCurrency).toUpperCase();
        for (const rule of rules) {
          const { body, widened } = buildRulePayload(rule, { disabled });
          const key = body.name.trim().toLowerCase();
          if (existing.has(key)) {
            result.skipped += 1;
            continue;
          }
          try {
            await this.createRule(target.accountId, body);
            existing.add(key);
            result.created += 1;
            if (widened)
              result.notes.push({ kind: "widened", rule: body.name });
            if (otherCurrency && ruleUsesMoney(rule)) {
              result.notes.push({ kind: "currency", rule: body.name });
            }
            log(
              "info",
              `Rule "${body.name}" created in ${result.name} (${result.accountId}).`,
            );
          } catch (error) {
            // A write that may have happened must not be repeated blindly.
            result.failed += 1;
            result.errors.push(
              `${body.name}: ${String(error?.message || error)}`,
            );
            log(
              "warn",
              `Rule "${body.name}" was not created in ${result.name}.`,
              error,
            );
          }
        }
      } catch (error) {
        result.failed += rules.length;
        result.errors.push(String(error?.message || error));
        log("warn", `Rules could not be read in ${result.name}.`, error);
      }
      onProgress?.(index + 1, targets.length);
    }
    return results;
  }
}
