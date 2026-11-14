import { buildReportStyles } from "./styles-reports.mjs";

/**
 * MirrorAds layout and look: a light side panel docked to the right edge of
 * Ads Manager with an icon rail, a list of ad accounts and a sticky launch bar.
 * Loaded last, so it overrides the legacy component rules.
 */
export function buildLayoutStyles(appId) {
  const A = `#${appId}`;
  return `
      ${A} {
        inset: 0 0 0 auto;
        width: min(700px, 100vw);
        font-family: ui-sans-serif, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        font-size: 13px;
        line-height: 1.4;
        color: #111827;
        --ma-ink: #111827;
        --ma-muted: #6b7280;
        --ma-faint: #9ca3af;
        --ma-line: #e5e7eb;
        --ma-soft: #f6f7f9;
        --ma-lime: #b4f461;
        --ma-lime-deep: #2f7d1b;
      }
      ${A} .ma-stage {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        justify-content: flex-start;
        gap: 0;
        height: 100%;
      }

      /* ---- frame: rail on the left, content on the right ---- */
      ${A} .ma-shell {
        display: grid;
        grid-template-columns: 68px minmax(0, 1fr);
        flex: 1 1 auto;
        width: 100%;
        max-width: none;
        min-height: 0;
        max-height: none;
        margin: 0;
        padding: 0;
        border: 0;
        border-left: 1px solid var(--ma-line);
        border-radius: 0;
        background: #ffffff;
        color: var(--ma-ink);
        box-shadow: -24px 0 60px rgba(17, 24, 39, 0.14);
        overflow: hidden;
      }
      ${A} .ma-main {
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
      }
      ${A} .ma-rail {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 14px 0 12px;
        background: #111827;
        color: #9ca3af;
      }
      ${A} .ma-rail-logo { margin-bottom: 14px; }
      ${A} .ma-rail-logo .ma-mark { width: 36px; height: 36px; }
      ${A} .ma-rail-gap { flex: 1 1 auto; }
      ${A} .ma-rail .ma-tab,
      ${A} .ma-rail .ma-rail-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 3px;
        width: 54px;
        min-height: 50px;
        padding: 6px 0;
        border: 0;
        border-radius: 12px;
        background: transparent;
        color: #9ca3af;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.01em;
        cursor: pointer;
        transition: background 0.15s ease, color 0.15s ease;
      }
      ${A} .ma-rail .ma-rail-btn { min-height: 40px; }
      ${A} .ma-rail .ma-tab:hover,
      ${A} .ma-rail .ma-rail-btn:hover { background: #1f2937; color: #ffffff; }
      ${A} .ma-rail .ma-tab.ma-tab-active { background: var(--ma-lime); color: #14280a; }
      ${A} .ma-rail .ma-log-toggle[aria-expanded="true"] { background: #1f2937; color: var(--ma-lime); }
      ${A} .ma-ico { width: 20px; height: 20px; display: block; }
      ${A} .ma-rail .ma-lang {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin-top: 6px;
        padding: 0;
        border: 0;
        background: transparent;
      }
      ${A} .ma-rail .ma-lang button {
        width: 34px;
        height: 22px;
        padding: 0;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: #6b7280;
        font-size: 10px;
        font-weight: 700;
        justify-content: center;
        cursor: pointer;
      }
      ${A} .ma-rail .ma-lang button:hover { color: #ffffff; background: transparent; }
      ${A} .ma-rail .ma-lang button.ma-active,
      ${A} .ma-rail .ma-lang button[aria-pressed="true"] { background: #1f2937; color: var(--ma-lime); }
      ${A} .ma-menu {
        top: auto;
        right: auto;
        bottom: 12px;
        left: 76px;
        width: 260px;
        max-width: none;
        padding: 8px;
        border: 1px solid var(--ma-line);
        border-radius: 14px;
        background: #ffffff;
        box-shadow: 0 18px 44px rgba(17, 24, 39, 0.18);
      }
      ${A} .ma-menu button {
        border: 0;
        border-radius: 9px;
        background: transparent;
        color: var(--ma-ink);
        font-weight: 500;
      }
      ${A} .ma-menu button:hover:not(:disabled) { background: var(--ma-soft); color: var(--ma-ink); }
      ${A} #${appId}-previous-version,
      ${A} #${appId}-version-note { display: none !important; }

      /* ---- top bar ---- */
      ${A} .ma-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin: 0;
        padding: 16px 20px 12px;
        border: 0;
        background: #ffffff;
        cursor: default;
      }
      ${A} .ma-brand { display: flex; align-items: baseline; gap: 10px; }
      ${A} .ma-brand h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 700;
        letter-spacing: -0.02em;
        color: var(--ma-ink);
      }
      ${A} .ma-build { margin: 0; font-size: 11px; color: var(--ma-faint); letter-spacing: 0; }
      ${A} .ma-head-right { display: flex; align-items: center; gap: 4px; }
      ${A} .ma-head .ma-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        padding: 0;
        border: 0;
        border-radius: 9px;
        background: transparent;
        color: var(--ma-muted);
        cursor: pointer;
      }
      ${A} .ma-head .ma-icon:hover { background: var(--ma-soft); color: var(--ma-ink); }
      ${A} .ma-head .ma-icon .ma-ico { width: 18px; height: 18px; }

      /* ---- content ---- */
      ${A} .ma-body {
        flex: 1 1 auto;
        min-height: 0;
        padding: 4px 20px 20px;
        background: #ffffff;
        overflow: auto;
      }
      ${A} .ma-card {
        margin: 0 0 22px;
        padding: 0;
        border: 0;
        border-radius: 0;
        background: transparent;
      }
      ${A} .ma-sec {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0 0 10px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--ma-faint);
      }
      ${A} .ma-sec-title { color: var(--ma-faint); }
      ${A} .ma-count { color: var(--ma-faint); font-weight: 500; letter-spacing: 0; text-transform: none; }
      ${A} .ma-hint { font-size: 12px; color: var(--ma-muted); }
      ${A} .ma-row { display: flex; align-items: flex-end; gap: 10px; margin: 0 0 10px; }
      ${A} .ma-row > .ma-field { flex: 1 1 0; min-width: 0; margin: 0; }
      ${A} .ma-row > .ma-field.ma-source-account { flex: 0 0 42%; }
      ${A} .ma-row > .ma-field.ma-narrow { flex: 0 0 132px; }
      ${A} .ma-field > span {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 0 0 5px;
        font-size: 12px;
        font-weight: 500;
        line-height: 1.3;
        color: var(--ma-muted);
      }
      ${A} select,
      ${A} input[type="text"],
      ${A} input[type="search"],
      ${A} input[type="number"],
      ${A} .ma-field > select,
      ${A} .ma-field > input[type="text"] {
        height: 38px;
        padding: 0 12px;
        border: 1px solid #d9dce3;
        border-radius: 10px;
        background: #ffffff;
        color: var(--ma-ink);
        font: inherit;
        font-size: 13px;
        box-shadow: none;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }
      ${A} select:hover,
      ${A} input[type="text"]:hover,
      ${A} input[type="search"]:hover { border-color: #c3c7d0; }
      ${A} select:focus,
      ${A} input[type="text"]:focus,
      ${A} input[type="search"]:focus,
      ${A} input[type="number"]:focus {
        outline: none;
        border-color: #6dbb2a;
        box-shadow: 0 0 0 3px rgba(180, 244, 97, 0.45);
      }
      ${A} select:disabled,
      ${A} input:disabled { background: var(--ma-soft); color: var(--ma-faint); }

      /* ---- buttons ---- */
      ${A} button { font-family: inherit; }
      ${A} button.ma-primary,
      ${A} .ma-bar .ma-primary {
        min-height: 40px;
        padding: 0 18px;
        border: 0;
        border-radius: 999px;
        background: var(--ma-lime);
        color: #14280a;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.15s ease, transform 0.05s ease;
      }
      ${A} button.ma-primary:hover:not(:disabled) { background: #a3ea4b; color: #14280a; }
      ${A} button.ma-primary:active:not(:disabled) { transform: translateY(1px); }
      ${A} button.ma-primary:disabled { background: #eef0f3; color: var(--ma-faint); cursor: default; }
      ${A} button.ma-secondary,
      ${A} .ma-bar .ma-secondary {
        min-height: 36px;
        padding: 0 14px;
        border: 1px solid #d9dce3;
        border-radius: 999px;
        background: #ffffff;
        color: var(--ma-ink);
        font-size: 12px;
        font-weight: 600;
      }
      ${A} button.ma-secondary:hover:not(:disabled) { background: var(--ma-soft); color: var(--ma-ink); border-color: #c3c7d0; }
      ${A} button.ma-secondary:disabled { color: var(--ma-faint); background: #ffffff; }
      ${A} button.ma-danger {
        min-height: 36px;
        padding: 0 14px;
        border: 1px solid #f3c2c2;
        border-radius: 999px;
        background: #fff5f5;
        color: #b42318;
        font-size: 12px;
        font-weight: 700;
      }
      ${A} button.ma-danger:hover:not(:disabled) { background: #ffe9e9; color: #b42318; }
      ${A} button.ma-danger:disabled { opacity: 0.5; }
      ${A} .ma-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; }
      ${A} .ma-bar-right { display: flex; gap: 6px; flex: 0 0 auto; }
      ${A} button.ma-info {
        width: 17px;
        height: 17px;
        border: 1px solid #d9dce3;
        background: #ffffff;
        color: var(--ma-muted);
      }
      ${A} button.ma-info:hover,
      ${A} button.ma-info:focus { background: var(--ma-soft); color: var(--ma-ink); }
      ${A} button.ma-info.ma-info-on,
      ${A} button.ma-info.ma-info-on:hover { background: var(--ma-lime); border-color: #8fd93a; color: #14280a; }

      /* ---- source ---- */
      ${A} .ma-source-row {
        display: inline-flex;
        align-items: center;
        gap: 0;
        margin: 0 0 12px;
        padding: 3px;
        border-radius: 999px;
        background: #f1f2f5;
      }
      ${A} .ma-source-row .ma-switch { display: none; }
      ${A} .ma-source-row .ma-source-label {
        height: 30px;
        padding: 0 14px;
        border: 0;
        border-radius: 999px;
        background: transparent;
        color: var(--ma-muted);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      ${A} .ma-source-row .ma-source-label:not(.is-on):hover { background: transparent; color: var(--ma-ink); }
      ${A} .ma-source-row .ma-source-label.is-on {
        background: #ffffff;
        color: var(--ma-ink);
        box-shadow: 0 1px 3px rgba(17, 24, 39, 0.14);
      }
      ${A} .ma-summary {
        margin: 0 0 10px;
        padding: 10px 12px;
        border: 0;
        border-radius: 10px;
        background: var(--ma-soft);
        color: var(--ma-ink);
        font-size: 12px;
      }
      ${A} .ma-drop { border: 1.5px dashed #cfd3db; border-radius: 12px; background: var(--ma-soft); color: var(--ma-muted); }
      ${A} .ma-drop:hover { border-color: #6dbb2a; }
      ${A} .ma-drop b { color: var(--ma-ink); }
      ${A} .ma-stats { display: flex; flex-wrap: wrap; gap: 6px; margin: 2px 0 0; }
      ${A} .ma-stat {
        display: inline-flex;
        align-items: baseline;
        gap: 6px;
        max-width: 100%;
        padding: 5px 11px;
        border: 0;
        border-radius: 999px;
        background: #f1f2f5;
      }
      ${A} .ma-stat b {
        display: inline;
        font-size: 12px;
        color: var(--ma-ink);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      ${A} .ma-stat span { font-size: 11px; color: var(--ma-muted); text-transform: none; letter-spacing: 0; white-space: nowrap; }
      ${A} .ma-stats > .ma-stat:nth-child(7) { background: #ecfbd6; }
      ${A} .ma-stats > .ma-stat:nth-child(7) b,
      ${A} .ma-stats > .ma-stat:nth-child(7) span { color: var(--ma-lime-deep); }
      ${A} .ma-stat-note {
        flex: 1 1 100%;
        border: 0;
        border-radius: 10px;
        background: var(--ma-soft);
        color: var(--ma-muted);
      }

      /* ---- ad accounts: a list with switches ---- */
      ${A} .ma-sec-split .ma-search {
        flex: 1 1 auto;
        height: 32px;
        margin-left: 6px;
        border-radius: 999px;
        background: #f1f2f5;
        border-color: transparent;
        font-size: 12px;
        font-weight: 400;
        letter-spacing: 0;
        text-transform: none;
      }
      ${A} .ma-scroll { max-height: none; overflow: visible; border: 0; border-radius: 0; background: transparent; }
      ${A} .ma-tbl-targets,
      ${A} .ma-tbl-targets thead,
      ${A} .ma-tbl-targets tbody { display: block; width: 100%; border: 0; background: transparent; }
      ${A} .ma-tbl-targets thead tr {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 2px 12px 8px;
      }
      ${A} .ma-tbl-targets thead th {
        display: none;
        position: static;
        padding: 0;
        border: 0;
        background: transparent;
        font-size: 12px;
        font-weight: 500;
        letter-spacing: 0;
        text-transform: none;
        color: var(--ma-muted);
      }
      ${A} .ma-tbl-targets thead th.ma-chk,
      ${A} .ma-tbl-targets thead th:nth-child(2) { display: block; width: auto; }
      ${A} .ma-tbl-targets tbody tr {
        display: grid;
        grid-template-columns: 40px repeat(6, minmax(0, 1fr));
        grid-template-areas: "chk acct acct acct acct acct cur";
        align-items: center;
        column-gap: 10px;
        row-gap: 10px;
        margin: 0 0 6px;
        padding: 10px 12px;
        border: 1px solid var(--ma-line);
        border-radius: 14px;
        background: #ffffff;
        transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
      }
      ${A} .ma-tbl-targets tbody tr:hover { border-color: #cfd3db; }
      ${A} .ma-tbl-targets tbody tr.ma-sel {
        grid-template-areas:
          "chk acct acct acct cur copies copies"
          ".   name name name name name name"
          ".   page page pixel pixel cat cat";
        border-color: #a6e060;
        background: #f8fdf0;
        box-shadow: 0 1px 0 rgba(17, 24, 39, 0.02);
      }
      ${A} .ma-tbl-targets:has(th.ma-hidden) tbody tr.ma-sel {
        grid-template-areas:
          "chk acct acct acct cur copies copies"
          ".   name name name name name name"
          ".   page page page pixel pixel pixel";
      }
      ${A} .ma-tbl-targets tbody td,
      ${A} .ma-tbl-targets tbody tr.ma-sel td,
      ${A} .ma-tbl-targets tbody tr:hover td {
        display: block;
        min-width: 0;
        padding: 0;
        border: 0;
        background: transparent;
        box-shadow: none;
      }
      ${A} .ma-tbl-targets tbody tr.ma-sel td:first-child { box-shadow: none; background: transparent; }
      ${A} .ma-tbl-targets td.ma-chk { grid-area: chk; width: auto; text-align: left; display: flex; align-items: center; }
      ${A} .ma-tbl-targets td.ma-acc-cell { grid-area: acct; }
      ${A} .ma-tbl-targets td.ma-cur { grid-area: cur; justify-self: end; }
      ${A} .ma-tbl-targets td.ma-copies-cell { grid-area: copies; }
      ${A} .ma-tbl-targets td.ma-newname { grid-area: name; }
      ${A} .ma-tbl-targets td.ma-fp-cell { grid-area: page; }
      ${A} .ma-tbl-targets td.ma-pix-cell { grid-area: pixel; }
      ${A} .ma-tbl-targets td.ma-cat-cell { grid-area: cat; }
      ${A} .ma-tbl-targets td.ma-empty { grid-column: 1 / -1; padding: 8px; color: var(--ma-muted); }
      ${A} .ma-tbl-targets tr:not(.ma-sel) td.ma-copies-cell,
      ${A} .ma-tbl-targets tr:not(.ma-sel) td.ma-newname,
      ${A} .ma-tbl-targets tr:not(.ma-sel) td.ma-fp-cell,
      ${A} .ma-tbl-targets tr:not(.ma-sel) td.ma-pix-cell,
      ${A} .ma-tbl-targets tr:not(.ma-sel) td.ma-cat-cell { display: none; }
      ${A} .ma-tbl-targets td[data-label]::before {
        content: attr(data-label);
        display: block;
        margin: 0 0 4px;
        font-size: 11px;
        font-weight: 500;
        color: var(--ma-muted);
      }
      ${A} .ma-tbl-targets td.ma-cur::before { display: none; }
      ${A} .ma-tbl-targets tbody tr.ma-sel td.ma-cur { display: flex; align-items: center; gap: 4px; justify-self: end; }
      ${A} .ma-tbl-targets tbody tr.ma-sel td.ma-copies-cell {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 6px;
      }
      ${A} .ma-tbl-targets td.ma-copies-cell::before { margin: 0; }
      ${A} .ma-tbl-targets .ma-copies { width: 54px; height: 32px; padding: 0 6px; text-align: center; }
      ${A} .ma-tbl-targets .ma-acc { display: flex; align-items: center; gap: 8px; min-width: 0; }
      ${A} .ma-tbl-targets .ma-who { min-width: 0; font-size: 13px; font-weight: 600; color: var(--ma-ink); }
      ${A} .ma-tbl-targets .ma-id { font-weight: 400; color: var(--ma-faint); }
      ${A} .ma-tbl-targets td.ma-newname { position: relative; }
      ${A} .ma-tbl-targets .ma-name-input {
        width: 100%;
        height: 36px;
        padding: 0 12px;
        border: 1px solid #111827;
        border-radius: 10px;
        background: #111827;
        color: #d9f99d;
        font-family: ui-monospace, "SF Mono", "Consolas", monospace;
        font-size: 12px;
      }
      ${A} .ma-tbl-targets .ma-name-input:hover { border-color: #111827; }
      ${A} .ma-tbl-targets .ma-name-input:focus {
        border-color: #6dbb2a;
        box-shadow: 0 0 0 3px rgba(180, 244, 97, 0.45);
      }
      ${A} .ma-tbl-targets td.ma-custom .ma-name-input { padding-right: 38px; color: #ffffff; border-color: #6dbb2a; }
      ${A} .ma-tbl-targets .ma-name-reset {
        position: absolute;
        right: 6px;
        bottom: 5px;
        width: 26px;
        height: 26px;
        padding: 0;
        border: 0;
        border-radius: 8px;
        background: #1f2937;
        color: #d9f99d;
        font-size: 14px;
        line-height: 1;
        cursor: pointer;
      }
      ${A} .ma-tbl-targets .ma-name-reset:hover { background: #374151; color: #ffffff; }
      ${A} .ma-tbl-targets .ma-fp-cell { min-width: 0; }
      ${A} .ma-tbl-targets .ma-fp-btn,
      ${A} .ma-tbl-targets .ma-pix,
      ${A} .ma-tbl-targets .ma-cat { width: 100%; min-width: 0; height: 34px; border-radius: 9px; }
      ${A} .ma-tbl-targets .ma-pix,
      ${A} .ma-tbl-targets .ma-cat,
      ${A} .ma-tbl-targets .ma-rate,
      ${A} .ma-tbl-targets .ma-copies { background: #ffffff; border: 1px solid #d9dce3; color: var(--ma-ink); }
      ${A} .ma-fp-btn { border: 1px solid #d9dce3; background: #ffffff; color: var(--ma-ink); }
      ${A} .ma-fp-btn:hover:not(:disabled) { background: #ffffff; border-color: #c3c7d0; color: var(--ma-ink); }
      ${A} .ma-fp-pop {
        border: 1px solid var(--ma-line);
        border-radius: 12px;
        background: #ffffff;
        box-shadow: 0 18px 44px rgba(17, 24, 39, 0.18);
      }
      ${A} .ma-fp-item { color: var(--ma-ink); background: transparent; }
      ${A} .ma-fp-item:hover { background: var(--ma-soft); color: var(--ma-ink); }
      ${A} .ma-fp-item.ma-on { background: #ecfbd6; }

      /* The row checkbox is drawn as a switch. */
      ${A} .ma-chk input[type="checkbox"] {
        appearance: none;
        -webkit-appearance: none;
        position: relative;
        width: 36px;
        height: 20px;
        margin: 0;
        border: 0;
        border-radius: 999px;
        background: #d6d9e0;
        cursor: pointer;
        transition: background 0.15s ease;
      }
      ${A} .ma-chk input[type="checkbox"]::after {
        content: "";
        position: absolute;
        top: 2px;
        left: 2px;
        width: 16px;
        height: 16px;
        border: 0;
        border-radius: 50%;
        background: #ffffff;
        box-shadow: 0 1px 2px rgba(17, 24, 39, 0.25);
        transform: none;
        transition: left 0.15s ease;
      }
      ${A} .ma-chk input[type="checkbox"]:checked { background: #6dbb2a; }
      ${A} .ma-chk input[type="checkbox"]:checked::after { left: 18px; }
      ${A} .ma-chk input[type="checkbox"]:indeterminate { background: #a6e060; }
      ${A} .ma-chk input[type="checkbox"]:indeterminate::after { left: 10px; }
      ${A} .ma-chk input[type="checkbox"]:disabled { opacity: 0.45; cursor: default; }
      ${A} .ma-note { border: 0; border-radius: 10px; background: var(--ma-soft); color: var(--ma-muted); }

      /* ---- run ---- */
      ${A} .ma-progress { height: 6px; border: 0; border-radius: 999px; background: #eef0f3; overflow: hidden; }
      ${A} .ma-progress i { background: #6dbb2a; border-radius: 999px; }
      ${A} .ma-jobs { border: 1px solid var(--ma-line); border-radius: 12px; overflow: hidden; }
      ${A} .ma-console { border: 0; border-radius: 10px; background: var(--ma-soft); color: var(--ma-muted); }

      /* ---- sticky launch bar ---- */
      ${A} .ma-footer {
        position: relative;
        display: block;
        flex: 0 0 auto;
        padding: 14px 20px 16px;
        border-top: 1px solid var(--ma-line);
        background: #ffffff;
        box-shadow: 0 -10px 24px rgba(17, 24, 39, 0.05);
      }
      ${A} .ma-footer.ma-hidden { display: none; }
      ${A} .ma-footer .ma-row { margin-bottom: 12px; }
      ${A} .ma-overrides { margin: 0 0 12px; }
      ${A} .ma-ovr-toggle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        width: 100%;
        min-height: 36px;
        padding: 0 12px;
        border: 1px dashed #cfd3db;
        border-radius: 10px;
        background: transparent;
        color: var(--ma-ink);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      ${A} .ma-ovr-toggle:hover { background: var(--ma-soft); color: var(--ma-ink); }
      ${A} .ma-ovr-toggle em {
        min-width: 0;
        font-style: normal;
        font-weight: 500;
        color: var(--ma-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      ${A} .ma-ovr-toggle.is-set { border-style: solid; border-color: #a6e060; background: #f8fdf0; }
      ${A} .ma-ovr-toggle.is-set em { color: var(--ma-lime-deep); font-weight: 600; }
      ${A} .ma-ovr-body { margin-top: 10px; }
      ${A} .ma-ovr-body .ma-row { margin-bottom: 6px; }
      ${A} .ma-ovr-body input { width: 100%; }
      ${A} .ma-ovr-note { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
      ${A} .ma-ovr-note span { font-size: 11px; line-height: 1.4; color: var(--ma-muted); }
      ${A} .ma-ovr-clear {
        flex: 0 0 auto;
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--ma-muted);
        font-size: 11px;
        font-weight: 600;
        text-decoration: underline;
        cursor: pointer;
      }
      ${A} .ma-ovr-clear:hover { background: transparent; color: var(--ma-ink); }
      ${A} .ma-launch { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
      ${A} .ma-launch .ma-hint { flex: 1 1 auto; min-width: 0; }
      ${A} .ma-launch .ma-primary {
        flex: 0 0 auto;
        min-width: 230px;
        min-height: 44px;
        font-size: 14px;
        white-space: nowrap;
      }
      ${A} .ma-macros-pop {
        position: absolute;
        left: 20px;
        right: 20px;
        bottom: calc(100% + 8px);
        margin: 0;
        padding: 12px 14px;
        border: 1px solid var(--ma-line);
        border-radius: 14px;
        background: #ffffff;
        color: var(--ma-ink);
        font-size: 12px;
        box-shadow: 0 18px 44px rgba(17, 24, 39, 0.18);
      }
      ${A} .ma-macros-pop code { background: #ecfbd6; color: var(--ma-lime-deep); }
      ${A} .ma-macros-pop span { color: var(--ma-muted); }

      ${buildReportStyles(A)}
      /* ---- log ---- */
      ${A} .ma-dock {
        display: flex;
        flex-direction: column;
        flex: 0 0 200px;
        width: 100%;
        max-width: none;
        max-height: none;
        border: 0;
        border-top: 1px solid #1f2937;
        border-radius: 0;
        background: #111827;
        box-shadow: -24px 0 60px rgba(17, 24, 39, 0.14);
        pointer-events: auto;
      }
      ${A} .ma-dock.ma-hidden { display: none; }
      ${A} .ma-dock-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 14px;
        border: 0;
        background: #111827;
      }
      ${A} .ma-dock-head span { color: #9ca3af; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
      ${A} .ma-dock .ma-secondary { min-height: 28px; border-color: #374151; background: transparent; color: #e5e7eb; }
      ${A} .ma-dock .ma-secondary:hover:not(:disabled) { background: #1f2937; color: #ffffff; border-color: #4b5563; }
      ${A} .ma-dock .ma-log-area {
        flex: 1 1 auto;
        min-height: 0;
        height: 0;
        padding: 4px 14px 12px;
        border: 0;
        border-radius: 0;
        background: #111827;
        color: #d1d5db;
        font-family: ui-monospace, "SF Mono", "Consolas", monospace;
        font-size: 11px;
        line-height: 1.5;
      }

      /* ---- collapsed mark ---- */
      ${A} .ma-mini { border: 0; border-radius: 16px; background: #111827; box-shadow: 0 12px 30px rgba(17, 24, 39, 0.28); }
      ${A} .ma-mini:hover { border: 0; }
      ${A} .ma-loading { background: rgba(255, 255, 255, 0.78); }
      @media (max-width: 800px) {
        ${A} { inset: 0; width: 100vw; }
      }
    `;
}
