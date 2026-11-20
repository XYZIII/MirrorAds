import {
  adStatusKind,
  adsByCampaign,
  campaignBlock,
} from "../domain/ad-status.mjs";
import { computeNewBudget } from "../domain/clone-overrides.mjs";
import { normalizeAccountId } from "../domain/ids.mjs";
import { accountDelivers } from "../domain/report-time.mjs";

const ACTIVE = JSON.stringify(["ACTIVE"]);
// The review feedback says why Meta rejected an ad; asked without it when
// Meta refuses the field.
const AD_LIST_FIELDS = [
  "id,name,campaign_id,effective_status,ad_review_feedback",
  "id,name,campaign_id,effective_status",
];

/** Meta's rejection reasons of an ad, as one line of text. */
export function reviewFeedbackText(feedback) {
  const texts = [];
  for (const group of Object.values(feedback || {})) {
    if (group && typeof group === "object") {
      for (const [key, value] of Object.entries(group)) {
        texts.push(String(value || key));
      }
    } else if (group) texts.push(String(group));
  }
  return [...new Set(texts)].join(" · ");
}

/**
 * Bulk actions on the campaigns of selected ad accounts. These change live
 * campaigns, so every action is confirmed in the panel before it gets here,
 * and each account's outcome is reported on its own.
 */
export class ReportActions {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.pauseCampaigns = this.pauseCampaigns.bind(this);
    this.changeBudgets = this.changeBudgets.bind(this);
    this.listCampaigns = this.listCampaigns.bind(this);
    this.setCampaignStatus = this.setCampaignStatus.bind(this);
    this.setCampaignBudget = this.setCampaignBudget.bind(this);
  }

  activeCampaigns(accountId, fields) {
    const { graphGetAll } = this.dependencies.graphClient;
    return graphGetAll(`act_${accountId}/campaigns`, {
      fields,
      effective_status: ACTIVE,
      limit: 500,
    });
  }

  /**
   * Campaigns of one account for the Reports list: the running ones first,
   * then the ones that are switched off. Archived and deleted are left out.
   */
  async listCampaigns(accountId) {
    const { graphGetAll } = this.dependencies.graphClient;
    const id = normalizeAccountId(accountId);
    const [rows, ads] = await Promise.all([
      graphGetAll(`act_${id}/campaigns`, {
        fields: "id,name,status,effective_status,daily_budget",
        effective_status: '["ACTIVE","PAUSED"]',
        limit: 500,
      }),
      this.listAds(id),
    ]);
    const groups = ads ? adsByCampaign(ads) : null;
    // Running first, then the ones on but stopped by their ads, then off.
    const rank = (item) => (item.on ? (item.block ? 1 : 0) : 2);
    return rows
      .map((row) => {
        const own = groups?.get(String(row.id)) || [];
        return {
          id: String(row.id),
          name: String(row.name || row.id),
          dailyBudget: Number(row.daily_budget) || 0,
          on: String(row.effective_status || row.status) === "ACTIVE",
          block: campaignBlock(row, own, Boolean(groups)),
          ads: groups
            ? own
                .map((ad) => ({
                  id: String(ad.id),
                  name: String(ad.name || ad.id),
                  kind: adStatusKind(ad.effective_status),
                  status: String(ad.effective_status || ""),
                  feedback: reviewFeedbackText(ad.ad_review_feedback),
                }))
                .filter((ad) => ad.kind !== "gone")
            : null,
        };
      })
      .sort((a, b) => rank(a) - rank(b));
  }

  /**
   * The ads of an account with their statuses, or null when Meta refuses
   * them: the campaigns are listed either way.
   */
  async listAds(accountId) {
    const { graphGetAll } = this.dependencies.graphClient;
    for (const fields of AD_LIST_FIELDS) {
      try {
        return await graphGetAll(`act_${accountId}/ads`, {
          fields,
          limit: 500,
        });
      } catch {
        // Fewer fields next.
      }
    }
    return null;
  }

  /** Switches one campaign on or off; throws when Meta refuses. */
  async setCampaignStatus(campaignId, on) {
    const { graphFetch } = this.dependencies.graphClient;
    await graphFetch(String(campaignId), {
      method: "POST",
      body: { status: on ? "ACTIVE" : "PAUSED" },
    });
    this.dependencies.logging.log(
      "info",
      `Campaign ${campaignId} switched ${on ? "on" : "off"} from Reports.`,
    );
  }

  /** Sets the daily budget of one campaign, in the API's minor units. */
  async setCampaignBudget(campaignId, apiAmount) {
    const { graphFetch } = this.dependencies.graphClient;
    await graphFetch(String(campaignId), {
      method: "POST",
      body: { daily_budget: apiAmount },
    });
    this.dependencies.logging.log(
      "info",
      `Campaign ${campaignId}: daily budget set to ${apiAmount} (minor units) from Reports.`,
    );
  }

  /** Runs `work` for every account and never lets one account stop the rest. */
  async forEachAccount(rows, onProgress, work) {
    const { log } = this.dependencies.logging;
    const results = [];
    for (const [index, row] of rows.entries()) {
      const accountId = normalizeAccountId(row.accountId);
      const result = {
        accountId,
        name: row.name || accountId,
        changed: 0,
        failed: 0,
        skipped: "",
        errors: [],
      };
      if (!accountDelivers(row.health)) {
        result.skipped = "not-working";
      } else {
        try {
          await work(accountId, row, result);
        } catch (error) {
          result.failed += 1;
          result.errors.push(String(error?.message || error));
        }
      }
      for (const message of result.errors) {
        log("warn", `Bulk action failed for ${result.name}.`, message);
      }
      results.push(result);
      onProgress?.(index + 1, rows.length);
    }
    return results;
  }

  /** One write; a failure is recorded on the account instead of thrown. */
  async write(result, objectId, body) {
    const { graphFetch } = this.dependencies.graphClient;
    try {
      await graphFetch(String(objectId), { method: "POST", body });
      result.changed += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push(`${objectId}: ${String(error?.message || error)}`);
    }
  }

  /** Switches off every campaign that is switched on in the given accounts. */
  async pauseCampaigns(rows, onProgress) {
    const { log } = this.dependencies.logging;
    const results = await this.forEachAccount(
      rows,
      onProgress,
      async (accountId, row, result) => {
        const campaigns = await this.activeCampaigns(accountId, "id,name");
        for (const campaign of campaigns) {
          await this.write(result, campaign.id, { status: "PAUSED" });
        }
      },
    );
    log(
      "info",
      `Campaigns switched off: ${results.reduce((sum, item) => sum + item.changed, 0)} in ${results.filter((item) => item.changed).length} account(s).`,
    );
    return results;
  }

  /**
   * Changes the daily budget of every active campaign in the given accounts.
   * The budget is changed where it lives: on the campaign, or on its active
   * ad sets when the campaign has no budget of its own. Lifetime budgets are
   * left alone.
   */
  async changeBudgets(rows, change, onProgress) {
    const { log } = this.dependencies.logging;
    const { graphGetAll } = this.dependencies.graphClient;
    const results = await this.forEachAccount(
      rows,
      onProgress,
      async (accountId, row, result) => {
        const meta =
          await this.dependencies.reportService.loadAccountMeta(accountId);
        const apply = async (object) => {
          const next = computeNewBudget(object.daily_budget, change, meta);
          if (next === null) {
            result.failed += 1;
            result.errors.push(
              `${object.id}: no ${meta.currency || "?"} to USD rate from Meta, budget left unchanged.`,
            );
            return;
          }
          await this.write(result, object.id, { daily_budget: next });
        };
        const campaigns = await this.activeCampaigns(
          accountId,
          "id,name,daily_budget,lifetime_budget",
        );
        for (const campaign of campaigns) {
          if (Number(campaign.daily_budget) > 0) {
            await apply(campaign);
            continue;
          }
          if (Number(campaign.lifetime_budget) > 0) continue;
          const adsets = await graphGetAll(`${campaign.id}/adsets`, {
            fields: "id,daily_budget",
            effective_status: ACTIVE,
            limit: 500,
          });
          for (const adset of adsets) {
            if (Number(adset.daily_budget) > 0) await apply(adset);
          }
        }
      },
    );
    log(
      "info",
      `Daily budgets changed: ${results.reduce((sum, item) => sum + item.changed, 0)} in ${results.filter((item) => item.changed).length} account(s).`,
    );
    return results;
  }
}
