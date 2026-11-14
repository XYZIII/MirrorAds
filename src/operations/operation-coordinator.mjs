import { OperationContext } from "./operation-context.mjs";
import { normalizeImportOptions } from "../domain/options.mjs";

/** One user operation at a time; UI selection state never becomes execution state. */
export class OperationCoordinator {
  constructor({ state, initializeSession, createRuntime, onChange, onReport }) {
    Object.assign(this, {
      state,
      initializeSession,
      createRuntime,
      onChange,
      onReport,
    });
    this.active = null;
    /** Batch operations in flight; the UI stays busy until the last ends. */
    this.batchCount = 0;
  }

  /** One operation started by the user; refused while anything else runs. */
  async run(kind, options = {}) {
    return (await this.execute(kind, options, false)).success;
  }

  /**
   * One operation of a batch (mass clone). Several of these may run at the
   * same time: each has its own snapshot of the selections and its own
   * services, so they share nothing but the session. Returns the report with
   * the verdict, because `state.lastOperationReport` is shared by the batch.
   * `started: false` means it was refused (a single operation is running).
   */
  async runBatch(kind, options = {}) {
    return this.execute(kind, options, true);
  }

  async execute(kind, options, batch) {
    const refused = { started: false, success: false, report: null };
    if (this.state.loadingSession || this.state.versionLoading) return refused;
    if (batch ? this.active && !this.batchCount : this.active) return refused;
    if (!this.batchCount && this.state.busy) return refused;
    // Facebook decorates native click events with cyclic flowlet metadata.
    // Discard UI events before snapshotting, not later inside the workflow.
    options = normalizeImportOptions(options);
    const context = new OperationContext(kind, this.state, options);
    this.active = context;
    if (batch) this.batchCount += 1;
    this.state.operationActive = true;
    this.state.busy = true;
    this.onChange();
    let success = false;
    let report = null;
    try {
      await this.initializeSession();
      context.useSession(this.state);
      const runtime = this.createRuntime(context);
      if (kind === "import")
        success = await runtime.importWorkflow.importPackage({
          ...context.options,
          reloadOnSuccess: false,
        });
      else if (kind === "clone")
        success = await runtime.cloneWorkflow.cloneCampaignToAccount({
          ...context.options,
          reloadOnSuccess: false,
        });
      else if (kind === "export")
        success = await runtime.exportWorkflow.exportSelectedCampaign();
      else throw new Error(`Unknown operation: ${kind}`);
      success = Boolean(success);
    } catch (error) {
      success = false;
      context.report.issue(error?.message || error, {
        uncertain: Boolean(error?.uncertain),
      });
    } finally {
      context.report.finish(success, {
        cancelled: context.state.operationCancelled,
      });
      report = context.report.toJSON();
      this.state.lastOperationReport = report;
      if (batch) this.batchCount -= 1;
      if (!this.batchCount) {
        this.active = null;
        this.state.operationActive = false;
        this.state.busy = false;
      }
      this.onChange();
      this.onReport(context.report, options);
    }
    return { started: true, success, report };
  }
}
