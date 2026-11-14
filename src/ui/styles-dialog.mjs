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
    `;
}
