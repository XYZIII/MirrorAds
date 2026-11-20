import { AccountHistory } from "../accounts/account-history.mjs";
import { AssetsView } from "../ui/assets-view.mjs";
import { HistoryView } from "../ui/history-view.mjs";
import { APP_ID } from "./constants.mjs";

/** Wires the History and Pixels tabs into the service graph. */
export function registerInsightServices(services, { state, dom, overrides }) {
  services.accountHistory =
    overrides.accountHistory ||
    new AccountHistory({
      // Each Facebook profile keeps its own history.
      actorId: () => services.sessionService?.getCurrentActorId?.() || "",
    });
  services.historyView =
    overrides.historyView ||
    new HistoryView({
      state,
      dom,
      appId: APP_ID,
      get accountHistory() {
        return services.accountHistory;
      },
    });
  services.assetsView =
    overrides.assetsView ||
    new AssetsView({
      state,
      dom,
      appId: APP_ID,
      get accountContextService() {
        return services.accountContextService;
      },
    });
}
