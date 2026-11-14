import { APP_TITLE } from "./constants.mjs";
import { MirrorAdsState } from "../state/mirror-ads-state.mjs";
import { Logger } from "../core/logger.mjs";
import { createServices } from "./create-services.mjs";
import { createDebugApi } from "./debug-api.mjs";
import { OperationCoordinator } from "../operations/operation-coordinator.mjs";
import { ReportView } from "../ui/report-view.mjs";

/** Owns the browser UI lifetime and the root service composition. */
export class MirrorAdsApp {
  constructor() {
    this.state = new MirrorAdsState();
    this.dom = {};
    this.logger = new Logger({
      appTitle: APP_TITLE,
      state: this.state,
      onRender: () => this.services?.logView.renderLogs(),
    });
    this.services = createServices({
      state: this.state,
      dom: this.dom,
      logger: this.logger,
    });
    this.reportView = new ReportView({
      dom: this.dom,
      services: this.services,
      state: this.state,
    });
    this.coordinator = new OperationCoordinator({
      state: this.state,
      initializeSession: this.services.sessionService.initializeSession,
      createRuntime: (context) => {
        // Accounts of a batch run side by side: their lines carry the account.
        const prefix = context.options?.logPrefix;
        const logger = prefix
          ? {
              log: (level, message, details) =>
                this.logger.log(level, `[${prefix}] ${message}`, details),
            }
          : this.logger;
        return createServices({ state: context.state, dom: {}, logger });
      },
      onChange: () => this.services.panelView.renderUI(),
      onReport: (report, options) => this.reportView.show(report, options),
    });
    this.services.importWorkflow.importPackage = (options) =>
      this.coordinator.run("import", options);
    this.services.cloneWorkflow.cloneCampaignToAccount = (options) =>
      this.coordinator.run("clone", options);
    this.services.exportWorkflow.exportSelectedCampaign = () =>
      this.coordinator.run("export");
    // Each target of a mass clone is a full clone operation, so it runs through
    // the coordinator and gets its own operation report.
    this.services.massCloneWorkflow.dependencies.onMassFinished = () =>
      this.reportView.showMassSummary(this.state);
    this.services.massCloneWorkflow.dependencies.runOperation = (
      kind,
      options,
    ) => this.coordinator.runBatch(kind, options);
    this.debug = createDebugApi(this.services, this.state);
    this.debug.lastReport = () => this.state.lastOperationReport;
  }

  mount() {
    this.services.panelController.mount();
  }
  destroy() {
    if (this.coordinator.active) {
      this.logger.log(
        "warn",
        "An operation is still running. Wait for its report before closing MirrorAds.",
      );
      return false;
    }
    this.reportView.destroy();
    this.services.panelController.destroy();
    return true;
  }

  toPublicApi() {
    return {
      mount: () => this.mount(),
      destroy: () => this.destroy(),
      state: this.state,
      initSession: this.services.sessionService.initializeSession,
      debug: this.debug,
    };
  }
}
