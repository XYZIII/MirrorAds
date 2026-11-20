import { adStatusKind } from "../domain/ad-status.mjs";
import { escapeHtml } from "../utils/string.mjs";
import { t } from "./i18n.mjs";

/** How many ads are listed under a campaign before "and N more". */
const AD_LIMIT = 8;

/** "rejected", "in review"…: a short word for a kind of ad status. */
export function adKindLabel(kind) {
  return t(`ads.kind.${kind || "other"}`);
}

/**
 * A few words on where a campaign stands, for a campaign picker: "active",
 * "paused", "⚠ not running: rejected"…
 */
export function campaignStandingLabel(standing) {
  if (!standing?.kind) return "";
  if (["running", "paused", "gone"].includes(standing.kind)) {
    return t(`camp.standing.${standing.kind}`);
  }
  if (standing.kind === "blocked") {
    return `⚠ ${t("ads.blocked", { reason: adKindLabel(standing.reason) })}`;
  }
  const kind = adStatusKind(standing.status);
  if (kind !== "other") return adKindLabel(kind);
  return String(standing.status || "")
    .toLowerCase()
    .replace(/_/g, " ");
}

/** How many switched-on campaigns of a report line are stopped by their ads. */
export function blockedCount(row) {
  return Array.isArray(row?.blockedCampaigns) ? row.blockedCampaigns.length : 0;
}

/**
 * The chip of a report line whose switched-on campaigns do not run because
 * of their ads: "rejected: 2" when Meta rejected them all, else "not
 * running: 2". The hover lists each campaign with its reason.
 */
export function blockedChip(row) {
  const blocked = Array.isArray(row?.blockedCampaigns)
    ? row.blockedCampaigns
    : [];
  if (!blocked.length) return "";
  const rejected = blocked.every((item) => item.reason === "rejected");
  const lines = blocked.map((item) => {
    const counts = Object.entries(item.ads || {})
      .map(([kind, count]) => `${adKindLabel(kind)}: ${count}`)
      .join(", ");
    return `• ${item.name} — ${adKindLabel(item.reason)}${counts ? ` (${counts})` : ""}`;
  });
  const title = [t("reports.blocked.title"), ...lines].join("\n");
  return `<i class="ma-rep-blocked" title="${escapeHtml(title)}">${escapeHtml(
    t(rejected ? "reports.blocked.rejected" : "reports.blocked.chip", {
      count: blocked.length,
    }),
  )}</i>`;
}

/**
 * The ads of a campaign as small status chips: each ad's name and status,
 * with Meta's reason on hover for a rejected one.
 */
export function adChips(ads) {
  if (!Array.isArray(ads)) return "";
  if (!ads.length) {
    return `<span class="ma-ads"><span class="ma-ad is-none">${escapeHtml(t("ads.none"))}</span></span>`;
  }
  const shown = ads.slice(0, AD_LIMIT);
  const chips = shown
    .map((ad) => {
      const hint = [ad.name, adKindLabel(ad.kind), ad.feedback]
        .filter(Boolean)
        .join("\n");
      return `<span class="ma-ad is-${escapeHtml(ad.kind)}" title="${escapeHtml(hint)}"><span>${escapeHtml(ad.name)}</span><em>${escapeHtml(adKindLabel(ad.kind))}</em></span>`;
    })
    .join("");
  const more =
    ads.length > shown.length
      ? `<span class="ma-ad is-more">${escapeHtml(t("ads.more", { count: ads.length - shown.length }))}</span>`
      : "";
  return `<span class="ma-ads">${chips}${more}</span>`;
}

/** The note on a switched-on campaign that its ads keep from running. */
export function blockTag(block) {
  if (!block) return "";
  return `<span class="ma-ad-block">${escapeHtml(
    t("ads.blocked", { reason: adKindLabel(block) }),
  )}</span>`;
}

/** Styles of the ad chips and notes; shared by Reports and Clone. */
export function buildAdStatusStyles(A) {
  return `
      ${A} .ma-ads { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
      ${A} .ma-ad {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        max-width: 220px;
        padding: 2px 8px;
        border-radius: 999px;
        background: #f1f2f5;
        color: var(--ma-muted);
        font-size: 11px;
        line-height: 1.5;
      }
      ${A} .ma-ad > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ma-ink); }
      ${A} .ma-ad > em { flex: 0 0 auto; font-style: normal; font-weight: 600; }
      ${A} .ma-ad.is-active { background: #e3f6cf; }
      ${A} .ma-ad.is-active > em { color: #1f6a10; }
      ${A} .ma-ad.is-rejected { background: #fde8e8; }
      ${A} .ma-ad.is-rejected > em { color: #b91c1c; }
      ${A} .ma-ad.is-issues > em,
      ${A} .ma-ad.is-billing > em { color: #b45309; }
      ${A} .ma-ad.is-issues,
      ${A} .ma-ad.is-billing { background: #fff1d0; }
      ${A} .ma-ad.is-review { background: #e8effd; }
      ${A} .ma-ad.is-review > em { color: #1d4ed8; }
      ${A} .ma-ad.is-none,
      ${A} .ma-ad.is-more { color: var(--ma-faint); }
      ${A} .ma-rep-cname { display: flex; align-items: center; gap: 6px; min-width: 0; }
      ${A} .ma-rep-cname b { min-width: 0; }
      ${A} .ma-ad-block {
        flex: 0 0 auto;
        display: inline-block;
        padding: 1px 8px;
        border-radius: 999px;
        background: #fde8e8;
        color: #b91c1c;
        font-size: 11px;
        font-weight: 600;
        white-space: nowrap;
      }
      ${A} .ma-stat small.ma-stat-ads {
        padding: 0 6px;
        border-radius: 999px;
        background: #ffffff;
        color: var(--ma-muted);
        font-size: 11px;
        font-weight: 600;
        white-space: nowrap;
      }
      ${A} .ma-stat small.ma-stat-ads.is-rejected { color: #b91c1c; }
      ${A} .ma-stat small.ma-stat-ads.is-issues,
      ${A} .ma-stat small.ma-stat-ads.is-billing { color: #b45309; }
      ${A} .ma-stat small.ma-stat-ads.is-review { color: #1d4ed8; }
      ${A} .ma-rep-camps i.ma-rep-blocked { background: #fde8e8; color: #b91c1c; }
      ${A} .ma-rep-camp.is-blocked { box-shadow: inset 3px 0 0 #ef4444; }
      ${A} .ma-rep-cl-blocked { font-style: normal; color: #b91c1c; }
  `;
}
