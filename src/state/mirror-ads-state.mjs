import { DEFAULT_NAME_TEMPLATE } from "../domain/name-template.mjs";

export class MirrorAdsState {
  constructor() {
    this.token = "";
    this.privateTokens = null;
    this.sessionReady = false;
    this.loadingSession = false;
    this.busy = false;
    this.busyDepth = 0;
    this.operationActive = false;
    this.lastOperationReport = null;
    this.operationReport = null;
    this.operationCancelled = false;
    this.logs = [];
    this.networkDiagnostics = [];
    this.accounts = [];
    this.pages = [];
    this.importAccountPixels = [];
    this.importTargetCatalogs = [];
    this.importTargetBusiness = null;
    this.accountCampaignsCache = {};
    this.accountContextCache = {};
    this.accessiblePagesCache = null;
    this.exportAccountId = "";
    this.importAccountId = "";
    this.exportCampaigns = [];
    this.exportCampaignId = "";
    this.importPackage = null;
    this.importMediaFiles = new Map();
    this.importMediaOverrides = new Map();
    this.importMediaHashes = new Map();
    this.importPageMappings = {};
    this.importPixelMappings = {};
    this.importCatalogMappings = {};
    this.importCampaignName = "";
    this.importAsDraft = true;
    this.importStatus = "PAUSED";
    this.importPreserveSchedule = false;
    this.cloneSourceAccountId = "";
    this.cloneSourceCampaignId = "";
    this.cloneSourceCampaigns = [];
    // Export tab preview: the package stats shown before the files are written.
    this.exportPreview = null;
    this.exportPreviewKey = "";
    this.exportPreviewLoading = false;
    this.cloneSourceKind = "campaign";
    this.cloneJsonFileName = "";
    this.cloneMediaFiles = new Map();
    this.cloneMediaOverrides = new Map();
    this.cloneMediaHashes = new Map();
    this.cloneTargetAccountId = "";
    this.clonePackage = null;
    this.clonePackageLoading = false;
    this.clonePages = [];
    this.cloneTargetPixels = [];
    this.cloneSourceCatalogs = [];
    this.cloneSourceBusiness = null;
    this.cloneTargetCatalogs = [];
    this.cloneTargetBusiness = null;
    this.clonePageMappings = {};
    this.clonePixelMappings = {};
    this.cloneCatalogMappings = {};
    this.cloneManualSourceCatalogId = "";
    this.cloneCampaignName = "";
    this.cloneAsDraft = true;
    this.cloneStatus = "PAUSED";
    this.massTargets = {};
    this.massPixels = {};
    this.massMode = "DRAFT";
    this.massNameTemplate = DEFAULT_NAME_TEMPLATE;
    // Changes applied to every clone of a run; empty fields keep the source's.
    this.massOverrides = { budget: "", bid: "", start: "" };
    this.massOverridesOpen = false;
    this.cloneOverrideZone = "";
    this.massRateOverride = "";
    this.massCurrencyNote = "";
    this.cloneCurrencyRate = 1;
    this.cloneCurrency = "";
    this.massRunning = false;
    this.massStop = false;
    // Set while a stop request is being honoured: the UI unlocks immediately
    // even though the workflow is still cleaning up the current account.
    this.massStopping = false;
    this.refreshAfterRun = false;
    this.massResults = [];
    this.report = null;
    this.reportPeriod = "today";
    this.reportZone = "account";
    this.reportLoading = false;
    this.reportProgress = "";
    this.reportError = "";
    this.reportShowEmpty = false;
    this.reportStatusFilter = "all";
    this.reportSelected = {};
    // null, or { kind: "pause" | "budget", stage: "form" | "confirm" | "running" | "done", ... }
    this.reportAction = null;
    this.reportOpen = "";
    this.reportCamps = {};
    this.reportArm = "";
    this.reportEdit = "";
    // "accounts" or "groups"; null until read from storage.
    this.reportView = null;
    this.reportGroupBy = null;
    // null: the trait's own order; else { by, dir }.
    this.reportGroupSort = null;
    this.reportGroupOpen = {};
    // Only the accounts without a rule switched on.
    this.reportNoRules = false;
    // "all", "active", "inactive" or "spend": campaigns of live accounts.
    this.reportCampFilter = "all";
    this.rulesSource = "";
    this.rulesList = null;
    this.rulesLoading = false;
    this.rulesError = "";
    this.rulesPicked = {};
    this.rulesTargets = {};
    this.rulesDisabled = false;
    this.rulesSearch = "";
    // The "paste a list" box of the Rules tab.
    this.rulesPasteOpen = false;
    this.rulesPasteText = "";
    this.rulesPasteResult = "";
    this.rulesStage = "";
    this.rulesProgress = "";
    this.rulesResults = null;
    // null: not read from storage yet; "": follow the browser.
    this.reportViewerZone = null;
    this.reportCustom = null;
    this.activeTab = "reports";
    // The source block starts expanded: the operator picks files there.
    this.cloneSourceCollapsed = false;
    this.massRates = {};
    this.massAutoRates = {};
    this.massSearch = "";
    // "" or an offset from UTC in minutes: the clone targets of one zone.
    this.massZone = "";
    this.logDockOpen = false;
    this.massSequence = 0;
    this.clonePreviewOpen = false;
    this.massActiveAccountId = "";
    this.pageIdentityHints = null;
    this.pageIdentityProvisionCache = new Map();
    this.pageBackedThreadsProvisionCache = new Map();
    this.lastDraftIdentityRepair = null;
    this.graphTemplateAccountId = "";
    this.graphTemplateParams = null;
    this.tempIdCursor = null;
    this.reloadTimer = null;
    this.uiReady = false;
  }
}
