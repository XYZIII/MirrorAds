/**
 * What the ads of a campaign say about its delivery. A campaign that is
 * switched on runs only while at least one of its ads runs: when Meta has
 * rejected every ad, the campaign is on but delivers nothing.
 */

const KINDS = {
  ACTIVE: "active",
  DISAPPROVED: "rejected",
  PENDING_REVIEW: "review",
  IN_PROCESS: "review",
  PREAPPROVED: "review",
  WITH_ISSUES: "issues",
  PENDING_BILLING_INFO: "billing",
  PAUSED: "paused",
  ADSET_PAUSED: "paused",
  CAMPAIGN_PAUSED: "paused",
  ARCHIVED: "gone",
  DELETED: "gone",
};

/**
 * The kind of an ad's effective status: "active", "rejected", "review",
 * "issues", "billing", "paused", "gone" (archived or deleted) or "other".
 */
export function adStatusKind(status) {
  return KINDS[String(status || "").toUpperCase()] || "other";
}

// When the ads of a stopped campaign disagree, the reason shown is the one
// the buyer has to act on first.
const BLOCK_ORDER = [
  "rejected",
  "issues",
  "billing",
  "review",
  "paused",
  "other",
];

/**
 * Why a switched-on campaign does not deliver, judged by its ads: "" while
 * one of them runs, else "rejected", "issues", "billing", "review",
 * "paused", "other" or "noads". A campaign that is not on, or whose ads are
 * not known (`known` false), gets "".
 */
export function campaignBlock(campaign, ads, known = true) {
  if (String(campaign?.effective_status || "").toUpperCase() !== "ACTIVE") {
    return "";
  }
  if (!known) return "";
  const kinds = (ads || [])
    .map((ad) => adStatusKind(ad?.effective_status))
    .filter((kind) => kind !== "gone");
  if (kinds.includes("active")) return "";
  if (!kinds.length) return "noads";
  return BLOCK_ORDER.find((kind) => kinds.includes(kind)) || "other";
}

/**
 * Where a campaign stands, for a campaign picker: { kind } with kind
 * "running", "blocked" (on, but stopped by its ads; with `reason`),
 * "paused", "gone" or "other" (with Meta's `status`).
 */
export function campaignStanding(campaign, ads, known = true) {
  const status = String(
    campaign?.effective_status || campaign?.status || "",
  ).toUpperCase();
  if (status === "ACTIVE") {
    const reason = campaignBlock(campaign, ads, known);
    return reason ? { kind: "blocked", reason } : { kind: "running" };
  }
  if (status === "PAUSED" || status === "CAMPAIGN_PAUSED") {
    return { kind: "paused" };
  }
  if (status === "ARCHIVED" || status === "DELETED") return { kind: "gone" };
  return { kind: "other", status };
}

/** Ads grouped by the id of their campaign. */
export function adsByCampaign(ads) {
  const groups = new Map();
  for (const ad of ads || []) {
    const id = String(ad?.campaign_id || ad?.campaign?.id || "");
    if (!id) continue;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(ad);
  }
  return groups;
}

/** How many ads of a list are of each kind: { active: 2, rejected: 1 }. */
export function adKindCounts(ads) {
  const counts = {};
  for (const ad of ads || []) {
    const kind = adStatusKind(ad?.effective_status);
    if (kind === "gone") continue;
    counts[kind] = (counts[kind] || 0) + 1;
  }
  return counts;
}

/**
 * Campaigns read together with their ads: { active, inactive, activeIds,
 * blocked }. "active" counts the campaigns that are switched on and have a
 * running ad; "blocked" lists the ones that are on but stopped by their ads
 * ({ id, name, reason, ads }), and they count as inactive.
 * Without ads (null), or when the ads list was cut short (`complete` false),
 * nothing is judged by ads: a campaign that is on counts as active.
 */
export function campaignDelivery(campaigns, ads = null, complete = true) {
  const groups = ads && complete ? adsByCampaign(ads) : null;
  const result = { active: 0, inactive: 0, activeIds: [], blocked: [] };
  for (const campaign of campaigns || []) {
    const status = String(campaign?.effective_status || "").toUpperCase();
    if (status === "DELETED" || status === "ARCHIVED") continue;
    if (status !== "ACTIVE") {
      result.inactive += 1;
      continue;
    }
    const own = groups?.get(String(campaign.id)) || [];
    const reason = campaignBlock(campaign, own, Boolean(groups));
    if (reason) {
      result.inactive += 1;
      result.blocked.push({
        id: String(campaign.id),
        name: String(campaign.name || campaign.id),
        reason,
        ads: adKindCounts(own),
      });
    } else {
      result.active += 1;
      if (campaign.id) result.activeIds.push(String(campaign.id));
    }
  }
  return result;
}
