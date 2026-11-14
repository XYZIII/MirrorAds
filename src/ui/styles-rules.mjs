/** Styles of the Rules tab. */
export function buildRuleStyles(A) {
  return `
      ${A} .ma-rule-head { display: flex; align-items: flex-end; gap: 10px; margin-bottom: 16px; }
      ${A} .ma-rule-head .ma-field { flex: 1 1 auto; min-width: 0; margin: 0; }
      ${A} .ma-rule-head select { width: 100%; }
      ${A} .ma-rule-head button { flex: 0 0 auto; min-height: 40px; }
      ${A} .ma-rule-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin: 0 0 8px;
        font-size: 12px;
        font-weight: 600;
        color: var(--ma-ink);
      }
      ${A} .ma-rule-title label { display: flex; align-items: center; gap: 8px; cursor: pointer; }
      ${A} .ma-rule-title input[type="text"] { flex: 0 1 220px; height: 32px; font-size: 12px; }
      ${A} .ma-rule-list,
      ${A} .ma-rule-accts {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-height: 34vh;
        overflow: auto;
        margin: 0 0 18px;
        padding: 2px;
      }
      ${A} .ma-rule-accts { max-height: 30vh; }
      ${A} .ma-rule-note { padding: 14px; border-radius: 12px; background: var(--ma-soft); font-size: 12px; color: var(--ma-muted); }
      ${A} .ma-rule,
      ${A} .ma-rule-acct {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 10px 12px;
        border: 1px solid var(--ma-line);
        border-radius: 12px;
        background: #ffffff;
        cursor: pointer;
      }
      ${A} .ma-rule > div { min-width: 0; }
      ${A} .ma-rule b,
      ${A} .ma-rule-acct b {
        display: block;
        overflow: hidden;
        font-size: 13px;
        font-weight: 600;
        color: var(--ma-ink);
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      ${A} .ma-rule-chips { display: flex; flex-wrap: wrap; gap: 4px 6px; margin-top: 5px; }
      ${A} .ma-rule-chips i {
        padding: 2px 8px;
        border-radius: 999px;
        background: var(--ma-soft);
        color: var(--ma-muted);
        font-size: 11px;
        font-style: normal;
        font-weight: 500;
      }
      ${A} .ma-rule-chips i.is-on { background: #dcf7c0; color: #1f6a10; font-weight: 600; }
      ${A} .ma-rule small { display: block; margin-top: 5px; font-size: 11px; line-height: 1.4; color: #92590a; }
      ${A} .ma-rule-acct { align-items: center; padding: 8px 12px; }
      ${A} .ma-rule-acct[hidden] { display: none; }
      ${A} .ma-rule-acct b { flex: 0 1 auto; }
      ${A} .ma-rule-acct span { flex: 1 0 auto; font-size: 11px; color: var(--ma-faint); text-align: right; }
      ${A} .ma-rule-acct.is-dead { background: var(--ma-soft); cursor: default; }
      ${A} .ma-rule-acct.is-dead b { color: var(--ma-faint); }
      ${A} .ma-rule-go { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      ${A} .ma-rule-opt { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--ma-muted); cursor: pointer; }
      ${A} .ma-rule-go button.ma-primary { min-height: 42px; padding: 0 20px; }
      ${A} .ma-rule-go button.ma-primary:disabled { opacity: 0.5; cursor: default; }
    `;
}
