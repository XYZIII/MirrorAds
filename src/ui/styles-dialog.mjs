/** The verdict shown over the panel when an operation has finished. */
export function buildDialogStyles(A) {
  return `
      ${A} .ma-overlay {
        padding: 24px;
        background: rgba(17, 24, 39, 0.32);
        backdrop-filter: blur(3px);
      }
      ${A} .ma-overlay .ma-report-card {
        width: min(460px, 100%);
        padding: 22px;
        border: 0;
        border-radius: 20px;
        background: #ffffff;
        box-shadow: 0 30px 80px rgba(17, 24, 39, 0.35);
      }
      ${A} .ma-overlay .ma-report-head { align-items: flex-start; margin-bottom: 4px; }
      ${A} .ma-overlay .ma-report-head h3 {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 0;
        font-size: 17px;
        font-weight: 700;
        line-height: 1.25;
        color: var(--ma-ink);
      }
      ${A} .ma-overlay .ma-report-head h3::before {
        content: "✓";
        flex: 0 0 30px;
        display: grid;
        place-items: center;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: var(--ma-lime);
        color: var(--ma-ink);
        font-size: 15px;
      }
      ${A} .ma-overlay .ma-report-card.is-problem .ma-report-head h3::before {
        content: "!";
        background: #fde68a;
      }
      ${A} .ma-overlay .ma-report-head .ma-icon {
        flex: 0 0 30px;
        width: 30px;
        height: 30px;
        min-height: 0;
        padding: 0;
        border: 0;
        border-radius: 50%;
        background: var(--ma-soft);
        color: var(--ma-muted);
        font-size: 12px;
      }
      ${A} .ma-overlay .ma-report-head .ma-icon:hover { background: #e5e7eb; color: var(--ma-ink); }
      ${A} .ma-overlay .ma-report-card .ma-report-meta {
        margin: 0 0 14px 40px;
        font-size: 12px;
        line-height: 1.5;
        color: var(--ma-muted);
        word-break: break-word;
      }
      ${A} .ma-overlay .ma-mass-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-height: 46vh;
        overflow: auto;
        margin: 0;
        padding: 0;
        border: 0;
        background: transparent;
      }
      ${A} .ma-overlay .ma-mass-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin: 0;
        padding: 10px 12px;
        border: 1px solid var(--ma-line);
        border-radius: 12px;
        background: #ffffff;
        font-size: 13px;
      }
      ${A} .ma-overlay .ma-mass-row > div { min-width: 0; }
      ${A} .ma-overlay .ma-mass-row b { font-weight: 600; color: var(--ma-ink); }
      ${A} .ma-overlay .ma-mass-message { margin-top: 2px; font-size: 11px; line-height: 1.4; color: var(--ma-muted); word-break: break-word; }
      ${A} .ma-overlay .ma-mass-row > span {
        flex: 0 0 auto;
        padding: 3px 10px;
        border-radius: 999px;
        background: var(--ma-soft);
        color: var(--ma-muted);
        font-size: 11px;
        font-weight: 600;
      }
      ${A} .ma-overlay .ma-mass-row.ma-success > span { background: #ecfbd6; color: var(--ma-lime-deep); }
      ${A} .ma-overlay .ma-mass-row.ma-failed { border-color: #fecaca; background: #fef7f7; }
      ${A} .ma-overlay .ma-mass-row.ma-failed > span { background: #fee2e2; color: #b91c1c; }
      ${A} .ma-overlay .ma-report-card .ma-actions { margin-top: 18px; gap: 8px; }
      ${A} .ma-overlay .ma-report-card .ma-actions button {
        min-height: 40px;
        padding: 0 18px;
        border: 1px solid var(--ma-line);
        border-radius: 999px;
        background: #ffffff;
        color: var(--ma-ink);
        font-size: 13px;
        font-weight: 600;
      }
      ${A} .ma-overlay .ma-report-card .ma-actions button:hover { background: var(--ma-soft); }
      ${A} .ma-overlay .ma-report-card .ma-actions button.ma-primary {
        min-width: 110px;
        border-color: transparent;
        background: var(--ma-lime);
      }
      ${A} .ma-overlay .ma-report-card .ma-actions button.ma-primary:hover { background: #a3ea4b; }
      /* ---- the build number opens the update history ---- */
      ${A} .ma-build { cursor: pointer; }
      ${A} .ma-build:hover { color: var(--ma-ink); text-decoration: underline; }
      /* ---- docked next to Ads Manager; the left edge resizes the panel ---- */
      ${A} .ma-resize {
        position: absolute;
        top: 0;
        bottom: 0;
        left: -5px;
        width: 10px;
        z-index: 90;
        cursor: col-resize;
        pointer-events: auto;
        touch-action: none;
      }
      ${A} .ma-resize::after {
        content: "";
        position: absolute;
        top: 50%;
        left: 3px;
        width: 4px;
        height: 48px;
        margin-top: -24px;
        border-radius: 4px;
        background: var(--ma-lime-deep);
        opacity: 0;
        transition: opacity 0.15s ease;
      }
      ${A} .ma-resize:hover::after,
      html.mirrorads-resizing ${A} .ma-resize::after { opacity: 0.9; }
      ${A}.ma-min .ma-resize { display: none; }
      html.mirrorads-pushed ${A} .ma-shell { box-shadow: none; }
      ${A} .ma-menu button.ma-menu-check { display: flex; align-items: center; gap: 8px; }
      ${A} .ma-menu button.ma-menu-check::before {
        content: "";
        flex: 0 0 16px;
        display: grid;
        place-items: center;
        width: 16px;
        height: 16px;
        border: 1.5px solid #d1d5db;
        border-radius: 5px;
        background: #ffffff;
        color: var(--ma-ink);
        font-size: 11px;
        font-weight: 800;
        line-height: 1;
      }
      ${A} .ma-menu button.ma-menu-check[aria-checked="true"]::before {
        content: "✓";
        border-color: var(--ma-lime-deep);
        background: var(--ma-lime);
      }
      /* ---- what's new ---- */
      ${A} .ma-overlay .ma-report-card.ma-news {
        display: flex;
        flex-direction: column;
        width: min(540px, 100%);
        max-height: calc(100% - 40px);
      }
      ${A} .ma-overlay .ma-news .ma-report-head h3::before { content: "✦"; }
      ${A} .ma-news-list { flex: 1 1 auto; min-height: 0; overflow: auto; margin: 8px -6px 0 0; padding-right: 6px; }
      ${A} .ma-news-entry + .ma-news-entry { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--ma-line); }
      ${A} .ma-news-ver { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
      ${A} .ma-news-ver b { font-size: 13px; font-weight: 700; color: var(--ma-ink); }
      ${A} .ma-news-ver span { font-size: 11px; color: var(--ma-faint); }
      ${A} .ma-news ul { margin: 0; padding-left: 18px; }
      ${A} .ma-news li { margin: 5px 0; font-size: 13px; line-height: 1.5; color: #374151; }
      /* ---- licence ---- */
      ${A} .ma-menu .ma-license { margin: 4px 0; padding: 9px 10px; border-radius: 10px; background: var(--ma-soft); font-size: 12px; }
      ${A} .ma-license-line { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
      ${A} .ma-license-line b { font: 700 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--ma-ink); }
      ${A} .ma-license-line span { color: var(--ma-muted); white-space: nowrap; }
      ${A} .ma-license-links { display: flex; gap: 12px; margin-top: 4px; }
      ${A} .ma-license a, ${A} .ma-license-banner a { color: var(--ma-lime-deep); font-weight: 600; text-decoration: none; }
      ${A} .ma-license a:hover, ${A} .ma-license-banner a:hover { text-decoration: underline; }
      ${A} .ma-license-banner {
        display: flex;
        align-items: center;
        gap: 12px;
        margin: 0 16px 8px;
        padding: 8px 8px 8px 14px;
        border-radius: 12px;
        background: #fff7e0;
        color: #92590a;
        font-size: 12px;
      }
      ${A} .ma-license-banner span { flex: 1 1 auto; }
      ${A} .ma-license-banner.ma-license-ended { background: #fee2e2; color: #b91c1c; }
      ${A} .ma-license-banner .ma-icon { width: 26px; height: 26px; min-height: 0; }
    `;
}
