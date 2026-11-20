import { ReportActions } from "../reports/report-actions.mjs";
import { ReportService } from "../reports/report-service.mjs";
import { ReportsView } from "../ui/reports-view.mjs";
import { APP_ID } from "./constants.mjs";

/** Wires the Reports tab: its data, its bulk actions and its view. */
export function registerReportServices(services, { state, dom, overrides }) {
  services.reportService =
    overrides.reportService ||
    new ReportService({
      get graphClient() {
        return services.graphClient;
      },
    });
  services.reportActions =
    overrides.reportActions ||
    new ReportActions({
      get logging() {
        return services.logging;
      },
      get graphClient() {
        return services.graphClient;
      },
      get reportService() {
        return services.reportService;
      },
    });
  services.reportsView =
    overrides.reportsView ||
    new ReportsView({
      state,
      dom,
      appId: APP_ID,
      get reportActions() {
        return services.reportActions;
      },
      get logging() {
        return services.logging;
      },
      get reportService() {
        return services.reportService;
      },
    });
}
