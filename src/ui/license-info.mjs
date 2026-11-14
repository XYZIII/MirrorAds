import { APP_ID } from "../app/constants.mjs";
import { escapeHtml } from "../utils/string.mjs";
import { t } from "./i18n.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;
/** From this many days before the end, the panel reminds about renewal. */
export const REMIND_DAYS = 5;

const safeUrl = (url) => (/^https:\/\//.test(String(url || "")) ? url : "");

function formatDay(ms) {
  const date = new Date(Number(ms));
  return [date.getDate(), date.getMonth() + 1]
    .map((part) => String(part).padStart(2, "0"))
    .concat(date.getFullYear())
    .join(".");
}

/**
 * What the panel says about the licence the gate passed, or null when there
 * is nothing to say (no key, or the script was started some other way).
 */
export function licenseNotice(license, now = Date.now()) {
  if (!license || license.mode !== "key" || !license.key) return null;
  const expiresAt = Number(license.expiresAt) || null;
  const daysLeft = expiresAt ? Math.ceil((expiresAt - now) / DAY_MS) : null;
  const expired = expiresAt !== null && expiresAt <= now;
  return {
    key: String(license.key),
    expiresAt,
    daysLeft,
    expired,
    remind: expiresAt !== null && (expired || daysLeft <= REMIND_DAYS),
    renewUrl: safeUrl(license.renewUrl),
    cabinetUrl: safeUrl(license.cabinetUrl),
  };
}

export function reminderText(notice) {
  if (notice.expired)
    return t("license.ended", { date: formatDay(notice.expiresAt) });
  if (notice.daysLeft <= 1) return t("license.endsToday");
  return t("license.endsIn", {
    days: notice.daysLeft,
    date: formatDay(notice.expiresAt),
  });
}

/** The key and its end date in the ⚙ menu, and a reminder near the end. */
export class LicenseInfo {
  constructor({ root, license, now = Date.now() } = {}) {
    this.root = root;
    this.doc = root?.ownerDocument || globalThis.document;
    this.license =
      license === undefined ? globalThis.window?.__MirrorAdsLicense : license;
    this.now = now;
  }

  attach() {
    const notice = licenseNotice(this.license, this.now);
    if (!notice || !this.root || !this.doc) return this;
    const link = (url, label) =>
      url
        ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`
        : "";
    const menu = this.root.querySelector(`#${APP_ID}-service-menu`);
    if (menu) {
      const block = this.doc.createElement("div");
      block.className = "ma-license";
      block.innerHTML = `<div class="ma-license-line"><b>${escapeHtml(notice.key)}</b><span>${escapeHtml(
        notice.expiresAt
          ? t("license.until", { date: formatDay(notice.expiresAt) })
          : t("license.lifetime"),
      )}</span></div>
        <div class="ma-license-links">${link(notice.expiresAt ? notice.renewUrl : "", t("license.renew"))}${link(notice.cabinetUrl, t("license.cabinet"))}</div>`;
      menu.insertBefore(block, menu.querySelector(".ma-version-note"));
    }
    const head = this.root.querySelector(".ma-head");
    if (notice.remind && head) {
      const banner = this.doc.createElement("div");
      banner.className = `ma-license-banner${notice.expired ? " ma-license-ended" : ""}`;
      banner.setAttribute("role", "status");
      banner.innerHTML = `<span>${escapeHtml(reminderText(notice))}</span>
        ${link(notice.renewUrl, t("license.renew"))}
        <button type="button" class="ma-icon" data-license-hide data-always-enabled aria-label="${escapeHtml(t("license.hide"))}">✕</button>`;
      banner
        .querySelector("[data-license-hide]")
        .addEventListener("click", () => banner.remove());
      head.after(banner);
    }
    return this;
  }
}
