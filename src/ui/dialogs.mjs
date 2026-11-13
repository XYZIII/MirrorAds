import { t } from "./i18n.mjs";
import { escapeHtml } from "../utils/string.mjs";

/** Dialogs. Dependencies are supplied by the application composition root. */
export class Dialogs {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.askMediaDownloadFailureDecision =
      this.askMediaDownloadFailureDecision.bind(this);
    this.askMediaPreflightDecision = this.askMediaPreflightDecision.bind(this);
    this.reloadAdsManagerResult = this.reloadAdsManagerResult.bind(this);
    this.askToReloadResult = this.askToReloadResult.bind(this);
    this.confirmCatalogPlan = this.confirmCatalogPlan.bind(this);
  }

  async confirmCatalogPlan(plan) {
    const changes = plan.filter((item) => item.mode !== "reuse");
    const lines = changes.map(
      (item) =>
        `${item.sourceName} → ${item.targetName} (${t(item.mode === "copy-new" ? "catalog.confirmNew" : "catalog.confirmExisting")})`,
    );
    return window.confirm(
      `${t("catalog.confirmTitle")}\n\n${lines.join("\n")}\n\n${t("catalog.confirmNote")}`,
    );
  }

  askMediaDownloadFailureDecision(file, error) {
    const fileName = file?.fileName || file?.name || "media file";
    const details = [
      `File: ${fileName}`,
      file?.type ? `Type: ${file.type}` : "",
      file?.sourceKind ? `Source: ${file.sourceKind}` : "",
      file?.sourceId ? `Source ID: ${file.sourceId}` : "",
      `Error: ${String(error?.message || error || "unknown error")}`,
    ].filter(Boolean);
    if (!document.body) {
      return Promise.resolve(
        window.confirm(
          `Can't download creative:\n${details.join("\n")}\n\nContinue?`,
        )
          ? "yes"
          : "no",
      );
    }

    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.style.cssText = [
        "position:fixed",
        "inset:0",
        "z-index:2147483647",
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "background:rgba(237, 241, 249, .54)",
        "font-family:ui-sans-serif,-apple-system,Segoe UI,Roboto,sans-serif",
      ].join(";");
      overlay.innerHTML = `
        <div style="width:min(520px,calc(100vw - 32px));background:#ffffff;color:#020202;border:1px solid rgba(17, 24, 39, .18);border-radius:8px;box-shadow:0 24px 70px rgba(17, 24, 39, 0.112);padding:18px;">
          <div style="font-size:16px;font-weight:700;margin-bottom:8px;">Can't download creative</div>
          <div style="font-size:13px;line-height:1.45;white-space:pre-wrap;color:#1d2025;margin-bottom:14px;">${escapeHtml(details.join("\n"))}</div>
          <div style="font-size:13px;color:#020202;margin-bottom:14px;">Continue with the remaining media files, or stop the export?</div>
          <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
            <button type="button" data-choice="yes" style="padding:7px 12px;border-radius:6px;border:1px solid #72e79d;background:#72e79d;color:#ecfdf3;font-weight:700;cursor:pointer;">Yes</button>
            <button type="button" data-choice="no" style="padding:7px 12px;border-radius:6px;border:1px solid rgba(17, 24, 39, .24);background:#e8ecf2;color:#020202;font-weight:700;cursor:pointer;">No</button>
            <button type="button" data-choice="cancel" style="padding:7px 12px;border-radius:6px;border:1px solid rgba(17, 24, 39, .24);background:transparent;color:#020202;font-weight:700;cursor:pointer;">Cancel</button>
          </div>
        </div>
      `;

      const cleanup = (choice) => {
        document.removeEventListener("keydown", onKeydown);
        overlay.remove();
        resolve(choice);
      };
      const onKeydown = (event) => {
        if (event.key === "Escape") {
          cleanup("cancel");
        }
      };
      overlay.addEventListener("click", (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const button = target?.closest("button[data-choice]");
        if (!button) return;
        cleanup(button.dataset.choice || "cancel");
      });
      document.addEventListener("keydown", onKeydown);
      document.body.appendChild(overlay);
      overlay.querySelector("button[data-choice='yes']")?.focus();
    });
  }

  askMediaPreflightDecision(summary) {
    const issues = summary?.issues || [];
    if (!issues.length) {
      return Promise.resolve("continue");
    }
    if (!document.body) {
      return Promise.resolve(
        window.confirm(
          "Media preflight found unavailable creative media. Try copying anyway?",
        )
          ? "try_anyway"
          : "cancel",
      );
    }
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.style.cssText =
        "position:fixed;inset:0;background:rgba(237, 241, 249, .72);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:20px;";
      const rows = issues
        .slice(0, 12)
        .map(
          (issue) => `
        <li style="margin:0 0 8px 0;">
          <div style="font-weight:700;">${escapeHtml(issue.adName || issue.adId || "Ad")}</div>
          <div>${escapeHtml(issue.creativeName || issue.creativeId || "Creative")} / ${escapeHtml(issue.slotLabel)}</div>
          <div style="color:#4c0303;">${escapeHtml(issue.reason)}</div>
          ${issue.sourceId ? `<div style="color:#18202a;">Source: ${escapeHtml(issue.sourceId)}</div>` : ""}
          ${issue.expectedFileName ? `<div style="color:#18202a;">File: ${escapeHtml(issue.expectedFileName)}</div>` : ""}
        </li>
      `,
        )
        .join("");
      const more =
        issues.length > 12
          ? `<div style="color:#18202a;margin-top:8px;">And ${escapeHtml(String(issues.length - 12))} more issue(s). See logs for the full list.</div>`
          : "";
      overlay.innerHTML = `
        <div style="background:#ffffff;color:#020202;width:min(760px,100%);max-height:86vh;overflow:auto;border:1px solid #dee2e6;border-radius:16px;padding:20px;box-shadow:0 24px 80px rgba(17, 24, 39, 0.112);font-family:ui-sans-serif,-apple-system,Segoe UI,Roboto,sans-serif;">
          <div style="font-size:17px;font-weight:800;margin-bottom:8px;">Media preflight found unavailable creative media</div>
          <div style="font-size:13px;color:#1d2025;margin-bottom:12px;">
            Checked ${escapeHtml(String(summary.adsChecked || 0))} ad(s) and ${escapeHtml(String(summary.mediaChecked || 0))} media item(s). ${escapeHtml(String(issues.length))} issue(s) need a decision before copying. A source image can only be reused when this session can open the account it was exported from \u2014 drop the creative files into "Creatives and media" to upload them again into the target account.
          </div>
          <ol style="font-size:12px;line-height:1.35;margin:0 0 14px 18px;padding:0;">${rows}</ol>
          ${more}
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap;">
            <button type="button" data-choice="cancel" style="padding:7px 12px;border-radius:6px;border:1px solid #d5dae0;background:#e8ecf2;color:#020202;font-weight:700;cursor:pointer;">Cancel</button>
            <button type="button" data-choice="valid_only" style="padding:7px 12px;border-radius:6px;border:1px solid #fab605;background:#fab605;color:#e8ecf2;font-weight:700;cursor:pointer;">Copy valid ads only</button>
            <button type="button" data-choice="try_anyway" style="padding:7px 12px;border-radius:6px;border:1px solid #cf1212;background:#cf1212;color:#111827;font-weight:700;cursor:pointer;">Try anyway</button>
          </div>
        </div>
      `;
      const finish = (choice) => {
        overlay.remove();
        resolve(choice);
      };
      overlay.addEventListener("click", (event) => {
        const button =
          event.target instanceof Element
            ? event.target.closest("button[data-choice]")
            : null;
        if (button) {
          finish(button.dataset.choice);
        }
      });
      document.body.appendChild(overlay);
    });
  }

  reloadAdsManagerResult(accountId) {
    const { buildAdsManagerAccountUrl } = this.dependencies.editorInspector;
    const targetUrl = buildAdsManagerAccountUrl(accountId);
    if (window.location.href === targetUrl) {
      window.location.reload();
    } else {
      window.location.assign(targetUrl);
    }
  }

  askToReloadResult(message, accountId) {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    const { reloadAdsManagerResult } = this;
    if (state.reloadTimer) {
      clearTimeout(state.reloadTimer);
      state.reloadTimer = null;
    }
    const promptText =
      message ||
      "Import finished. Reload Ads Manager to show the updated result?";
    let shouldReload = false;
    try {
      shouldReload = window.confirm(promptText);
    } catch (_error) {
      shouldReload = false;
    }
    if (!shouldReload) {
      log("info", "Result is ready. Reload skipped by user.");
      return;
    }
    log("info", "Reloading Ads Manager to show the updated result.");
    state.reloadTimer = window.setTimeout(() => {
      reloadAdsManagerResult(accountId);
    }, 1200);
  }
}
