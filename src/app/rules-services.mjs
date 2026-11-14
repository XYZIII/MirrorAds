import { AdRuleService } from "../rules/ad-rule-service.mjs";
import { RulesView } from "../ui/rules-view.mjs";
import { APP_ID } from "./constants.mjs";

/** Wires the Rules tab into the service graph. */
export function registerRulesServices(services, { state, dom, overrides }) {
  services.adRuleService =
    overrides.adRuleService ||
    new AdRuleService({
      get graphClient() {
        return services.graphClient;
      },
      get logging() {
        return services.logging;
      },
    });
  services.rulesView =
    overrides.rulesView ||
    new RulesView({
      state,
      dom,
      appId: APP_ID,
      get adRuleService() {
        return services.adRuleService;
      },
      get logging() {
        return services.logging;
      },
    });
}
