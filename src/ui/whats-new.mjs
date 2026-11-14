import { APP_ID } from "../app/constants.mjs";
import { CHANGELOG } from "../app/changelog.mjs";
import { Config } from "../config.mjs";
import { compareBuilds, isBuildVersion } from "../domain/build-version.mjs";
import { escapeHtml } from "../utils/string.mjs";
import { getLang, t } from "./i18n.mjs";

export const SEEN_KEY = "mirrorads.whatsnew.seen.v1";

/**
 * Keys a brand-new user already has: written by the loader and the gate
 * before the panel opens.
 */
const FIRST_RUN_KEYS = new Set([
  SEEN_KEY,
  "mirrorads.loader.cache.v1",
  "mirrorads.loader.refresh.v1",
  "mirrorads.license.key.v1",
  "mirrorads.license.state.v1",
  "mirrorads.app.cache.v2",
]);

/** True when this browser has used MirrorAds before. */
export function isReturningUser(keys) {
  return keys.some(
    (key) => String(key).startsWith("mirrorads.") && !FIRST_RUN_KEYS.has(key),
  );
}

/**
 * What to show when the panel opens and which build to remember as seen.
 * A returning user who never saw this window gets the latest entry only; a
 * new user gets nothing — everything is new to them anyway.
 */
export function launchPlan({ changelog, seen, current, returning }) {
  if (!isBuildVersion(current)) return { show: [], remember: seen || "" };
  const released = changelog.filter(
    (entry) => compareBuilds(entry.version, current) <= 0,
  );
  if (!isBuildVersion(seen)) {
    return {
      show: returning && released.length ? [released[0]] : [],
      remember: current,
    };
  }
  return {
    show: released.filter((entry) => compareBuilds(entry.version, seen) > 0),
    remember: compareBuilds(current, seen) > 0 ? current : seen,
  };
}

function formatDate(iso) {
  const [year, month, day] = String(iso || "").split("-");
  return day && month && year ? `${day}.${month}.${year}` : "";
}

/** The "What's new" window, shown once per update, and the update history. */
export class WhatsNew {
  constructor({
    root,
    storage,
    version = Config.VERSION,
    changelog = CHANGELOG,
    delayMs = 700,
  } = {}) {
    this.root = root;
    this.doc = root?.ownerDocument || globalThis.document;
    this.storage =
      storage === undefined ? this.doc?.defaultView?.localStorage : storage;
    this.version = version;
    this.changelog = changelog;
    this.delayMs = delayMs;
    this.element = null;
  }

  keys() {
    try {
      const keys = [];
      for (let index = 0; index < (this.storage?.length || 0); index += 1) {
        keys.push(this.storage.key(index));
      }
      return keys;
    } catch (_error) {
      return [];
    }
  }

  attach() {
    const { root, doc } = this;
    if (!root || !doc) return this;
    const menu = root.querySelector(`#${APP_ID}-service-menu`);
    if (menu) {
      const item = doc.createElement("button");
      item.type = "button";
      item.dataset.newsOpen = "";
      item.dataset.alwaysEnabled = "";
      item.textContent = t("news.menu");
      menu.insertBefore(item, menu.querySelector(".ma-version-note"));
    }
    // Delegated: the header with the build number is re-rendered.
    root.addEventListener("click", (event) => {
      if (!event.target?.closest?.(".ma-build, [data-news-open]")) return;
      event.preventDefault();
      this.show(this.changelog, "history");
    });
    let seen = null;
    try {
      seen = this.storage?.getItem(SEEN_KEY) ?? null;
    } catch (_error) {
      seen = null;
    }
    const plan = launchPlan({
      changelog: this.changelog,
      seen,
      current: this.version,
      returning: isReturningUser(this.keys()),
    });
    try {
      if (plan.remember) this.storage?.setItem(SEEN_KEY, plan.remember);
    } catch (_error) {
      // Not remembered: the window may show again next time, nothing worse.
    }
    if (plan.show.length) {
      setTimeout(() => {
        if (this.root.isConnected && !this.element) this.show(plan.show, "new");
      }, this.delayMs);
    }
    return this;
  }

  entryMarkup(entry) {
    const items = entry[getLang() === "ru" ? "ru" : "en"] || entry.en || [];
    return `<section class="ma-news-entry">
        <div class="ma-news-ver"><b>${escapeHtml(t("news.build", { version: entry.version }))}</b><span>${escapeHtml(formatDate(entry.date))}</span></div>
        <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </section>`;
  }

  /** `kind` is "new" for the one-time window, "history" for the full list. */
  show(entries, kind) {
    this.close();
    const shell = this.root.querySelector(".ma-shell") || this.root;
    const overlay = this.doc.createElement("div");
    overlay.className = "ma-overlay";
    overlay.dataset.news = kind;
    overlay.innerHTML = `<section class="ma-card ma-report-card ma-news" role="dialog" aria-modal="true">
        <div class="ma-report-head">
          <h3>${escapeHtml(t(kind === "new" ? "news.title" : "news.history"))}</h3>
          <button type="button" class="ma-icon" data-news-close aria-label="${escapeHtml(t("report.close"))}">✕</button>
        </div>
        <div class="ma-news-list">${entries.map((entry) => this.entryMarkup(entry)).join("")}</div>
        <div class="ma-actions">
          ${kind === "new" && this.changelog.length > entries.length ? `<button type="button" data-news-all>${escapeHtml(t("news.all"))}</button>` : ""}
          <button type="button" class="ma-primary" data-news-close>${escapeHtml(t("news.ok"))}</button>
        </div>
      </section>`;
    overlay.addEventListener("click", (event) => {
      event.stopPropagation();
      if (
        event.target === overlay ||
        event.target.closest("[data-news-close]")
      ) {
        this.close();
      } else if (event.target.closest("[data-news-all]")) {
        this.show(this.changelog, "history");
      }
    });
    shell.append(overlay);
    this.element = overlay;
  }

  close() {
    this.element?.remove();
    this.element = null;
  }
}
