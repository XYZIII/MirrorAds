import { APP_ID, APP_MARK_SVG } from "../app/constants.mjs";
import { t } from "./i18n.mjs";
import { ICONS } from "./icons.mjs";

/** The icon rail: the tabs, the log, refresh, service menu and language. */
export function railMarkup() {
  return `
        <nav class="ma-rail" aria-label="MirrorAds">
          <div class="ma-rail-logo">${APP_MARK_SVG}</div>
          <button class="ma-tab" data-tab="reports" data-always-enabled title="${t("tab.reports")}">${ICONS.reports}<span>${t("tab.reports")}</span></button>
          <button class="ma-tab" data-tab="clone" title="${t("tab.clone")}">${ICONS.clone}<span>${t("tab.clone")}</span></button>
          <button class="ma-tab" data-tab="rules" data-always-enabled title="${t("tab.rules")}">${ICONS.rules}<span>${t("tab.rules")}</span></button>
          <button class="ma-tab" data-tab="history" data-always-enabled title="${t("tab.history")}">${ICONS.history}<span>${t("tab.history")}</span></button>
          <button class="ma-tab" data-tab="assets" data-always-enabled title="${t("tab.assetsHint")}">${ICONS.assets}<span>${t("tab.assets")}</span></button>
          <button class="ma-tab ma-tab-active" data-tab="export" title="${t("tab.export")}">${ICONS.export}<span>${t("tab.export")}</span></button>
          <button id="${APP_ID}-log-toggle" class="ma-rail-btn ma-log-toggle" data-always-enabled title="${t("btn.log")}" aria-label="${t("btn.log")}" aria-expanded="false">${ICONS.log}<span>${t("logs.title")}</span></button>
          <span class="ma-rail-gap"></span>
          <button id="${APP_ID}-refresh" class="ma-rail-btn ma-refresh" data-always-enabled title="${t("btn.refresh")}" aria-label="${t("btn.refresh")}">${ICONS.refresh}</button>
          <button id="${APP_ID}-service" class="ma-rail-btn" data-always-enabled title="${t("btn.service")}" aria-label="${t("btn.service")}" aria-expanded="false">${ICONS.settings}</button>
          <div class="ma-lang" role="group" aria-label="Language">
            <button type="button" data-lang="ru" data-always-enabled title="${t("lang.ru")}" aria-pressed="false">RU</button>
            <button type="button" data-lang="en" data-always-enabled title="${t("lang.en")}" aria-pressed="true">EN</button>
          </div>
          <div id="${APP_ID}-service-menu" class="ma-menu ma-hidden">
            <button data-role="busy-lock" id="${APP_ID}-clear-drafts" type="button">${t("menu.clearDrafts")}</button>
            <button id="${APP_ID}-previous-version" type="button">${t("menu.prevVersion")}</button>
            <div id="${APP_ID}-version-note" class="ma-version-note" role="status"></div>
          </div>
        </nav>`;
}

/**
 * Wires the tab buttons: a click shows its panel and opens what the tab
 * needs; the tab kept in state is shown on mount.
 */
export function wireTabs(root, dependencies) {
  const {
    state,
    renderUI,
    loadExportPreview,
    massCloneController,
    reportsView,
    rulesView,
    historyView,
    assetsView,
  } = dependencies;
  // Shows a tab without loading anything: the first paint, before the
  // session is connected, shows the right tab already.
  const showTab = (tab) => {
    const button = root.querySelector(`.ma-tab[data-tab="${tab}"]`);
    const panel = root.querySelector(`#${APP_ID}-panel-${tab}`);
    if (!button || !panel) return;
    root
      .querySelectorAll(".ma-tab")
      .forEach((node) => node.classList.remove("ma-tab-active"));
    root
      .querySelectorAll(".ma-tab-panel")
      .forEach((node) => node.classList.add("ma-hidden"));
    button.classList.add("ma-tab-active");
    panel.classList.remove("ma-hidden");
  };
  root.querySelectorAll(".ma-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activeTab = btn.dataset.tab;
      renderUI();
      showTab(btn.dataset.tab);
      if (btn.dataset.tab === "clone") {
        massCloneController.ensureTargetsLoaded();
      }
      if (btn.dataset.tab === "reports") reportsView.open();
      if (btn.dataset.tab === "rules") rulesView.open();
      if (btn.dataset.tab === "history") historyView?.open();
      if (btn.dataset.tab === "assets") assetsView?.open();
      historyView?.syncBadge();
      if (btn.dataset.tab === "export") void loadExportPreview();
    });
  });
  // Bind the clone flow up front: the panel is remounted on session changes
  // and the wiring must exist before the first click.
  massCloneController.bind(root);
  reportsView.bind(root);
  rulesView.bind(root);
  historyView?.bind(root);
  assetsView?.bind(root);
  // Reports is the default tab. Before the session is connected only the
  // tab is shown; the report loads once the accounts are in.
  if (state.activeTab && state.activeTab !== "export" && state.sessionReady) {
    root.querySelector(`.ma-tab[data-tab="${state.activeTab}"]`)?.click();
  } else {
    showTab(state.activeTab || "export");
    if (state.activeTab === "reports") reportsView.open();
    if (state.activeTab === "history") historyView?.open();
    if (state.activeTab === "assets") assetsView?.render();
  }
}
