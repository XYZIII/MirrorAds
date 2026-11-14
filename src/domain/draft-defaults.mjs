import { getEffectiveAdsetBidStrategy } from "./budget.mjs";

/**
 * Switch state of an object written into a draft. A draft never delivers
 * before it is published, so the clone is left ready to go: the campaign,
 * its ad sets and its ads are all switched on, whatever the source had.
 */
export function draftObjectStatus() {
  return "ACTIVE";
}

/** Bid strategies Ads Manager allows value rules with. */
const VALUE_RULE_STRATEGIES = new Set(["LOWEST_COST_WITHOUT_CAP", "COST_CAP"]);

/**
 * Ads Manager decides whether "Value rules" is available from the ad set's
 * own bid strategy. With a campaign budget the strategy lives on the campaign
 * and the exported ad set carries none, so the draft ad set showed
 * "Value rules: not available". Returns the strategy to write on such an ad
 * set, or "" when the ad set already has one or value rules cannot apply.
 */
export function valueRuleBidStrategy(adset, options = {}) {
  if (getEffectiveAdsetBidStrategy(adset, options)) return "";
  const strategy = String(
    options.campaignBidStrategy || "LOWEST_COST_WITHOUT_CAP",
  ).toUpperCase();
  return VALUE_RULE_STRATEGIES.has(strategy) ? strategy : "";
}
