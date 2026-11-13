export function buildStudioStyles(appId) {
  return `
      /* --- wide studio layout: 760px centred shell ------------------------- */
      #${appId} .ma-shell {
        width: 100%;
        max-width: 760px;
        margin: 0 auto;
        max-height: calc(100vh - 36px);
        display: flex;
        flex-direction: column;
        padding: 0;
        background: #f2f3f5;
        border: 1px solid #e1e2e8;
        border-radius: 14px;
        box-shadow: 0 24px 60px rgba(17, 24, 39, 0.176);
        overflow: hidden;
      }
      #${appId} .ma-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 16px;
        margin: 0;
        border-bottom: 1px solid #e5e6eb;
        background: linear-gradient(180deg, #ffffff, #f0f1f4 70%);
      }
      #${appId} .ma-brand { display: flex; align-items: center; gap: 10px; }
      #${appId} .ma-brand h2 { margin: 0; font-size: 17px; letter-spacing: 0.2px; color: #111827; }
      #${appId} .ma-tabs { padding: 0 12px; background: #f0f1f4; }
      #${appId} .ma-build { font-size: 11px; color: #656a81; }
      #${appId} .ma-head-right { display: flex; align-items: center; gap: 6px; }
      #${appId} .ma-lang {
        display: inline-flex;
        gap: 2px;
        padding: 2px;
        border: 1px solid #e0e1e7;
        border-radius: 8px;
        background: #f5f5f7;
      }
      #${appId} .ma-lang button {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 3px 7px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: #313341;
        font-size: 11px;
        cursor: pointer;
      }
      #${appId} .ma-lang button.ma-active { background: #e7e7ed; color: #2f7d1b; }
      #${appId} .ma-lang svg { display: block; border-radius: 2px; }
      #${appId} .ma-icon {
        width: 28px;
        height: 28px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: 1px solid #e0e1e7;
        border-radius: 8px;
        background: #eeeef2;
        color: #181a26;
        font-size: 14px;
        cursor: pointer;
      }
      #${appId} .ma-icon:hover { background: #e7e7ed; color: #2f7d1b; }
      /* Stage: the panel and the optional log dock are centred together, so
         opening the dock pushes the panel's left edge further left. */
      #${appId} .ma-stage {
        display: flex;
        align-items: stretch;
        justify-content: center;
        gap: 14px;
      }
      #${appId} .ma-shell { flex: 0 1 760px; min-width: 0; margin: 0; }
      #${appId} .ma-dock {
        pointer-events: auto;
        align-self: stretch;
        flex: 0 0 560px;
        width: 560px;
        max-width: calc(100vw - 40px);
        max-height: calc(100vh - 36px);
        display: flex;
        flex-direction: column;
        background: #f2f3f5;
        border: 1px solid #e1e2e8;
        border-radius: 12px;
        box-shadow: 0 24px 60px rgba(17, 24, 39, 0.176);
        overflow: hidden;
      }
      #${appId} .ma-dock.ma-hidden { display: none !important; }
      #${appId} .ma-dock-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 10px 14px;
        border-bottom: 1px solid #e5e6eb;
        background: linear-gradient(180deg, #ffffff, #f0f1f4 70%);
      }
      #${appId} .ma-dock-head span {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #2f7d1b;
      }
      #${appId} .ma-dock button {
        width: auto;
        padding: 7px 12px;
        font-size: 12px;
      }
      #${appId} .ma-dock .ma-log-area {
        flex: 1 1 auto;
        min-height: 120px;
        height: 0;
        width: 100%;
        border: 0;
        border-radius: 0;
        background: #f5f5f7;
        resize: none;
        /* Long log lines wrap instead of forcing a sideways scroll. */
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        word-break: break-word;
        overflow-x: hidden;
      }
      #${appId} .ma-head { position: relative; }
      /* Service menu: a proper card hanging under the gear, never outside the panel. */
      #${appId} .ma-menu {
        position: absolute;
        top: calc(100% - 2px);
        right: 86px;
        z-index: 200;
        width: 320px;
        max-width: calc(100% - 32px);
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 10px;
        border: 1px solid #e0e1e7;
        border-radius: 10px;
        background: #eeeef2;
        box-shadow: 0 16px 34px rgba(17, 24, 39, 0.176);
        pointer-events: auto;
      }
      #${appId} .ma-menu.ma-hidden { display: none !important; }
      #${appId} .ma-menu button {
        width: 100%;
        text-align: left;
        padding: 9px 12px;
        border: 1px solid #e1e2e8;
        border-radius: 8px;
        background: #eaeaee;
        color: #111827;
        font-size: 13px;
        font-weight: 600;
      }
      #${appId} .ma-menu button:hover:not(:disabled) {
        background: #e4e5eb;
        color: #2f7d1b;
      }
      #${appId} .ma-menu [role="status"] {
        padding: 0 4px;
        font-size: 11px;
        line-height: 1.45;
        color: #50546a;
      }
      #${appId} .ma-tabs {
        display: flex;
        gap: 4px;
        padding: 0 16px;
        margin: 0;
        border-bottom: 1px solid #e5e6eb;
        background: #f0f1f4;
      }
      #${appId} .ma-tab {
        padding: 11px 14px;
        border: 0;
        border-bottom: 2px solid transparent;
        border-radius: 0;
        background: transparent;
        color: #50546a;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      }
      #${appId} .ma-tab.ma-tab-active { color: #2f7d1b; border-bottom-color: #6dbb2a; }
      #${appId} .ma-body { padding: 14px 16px 18px; overflow: auto; flex: 1 1 auto; }
      #${appId} .ma-card {
        background: #eeeff2;
        border: 1px solid #e5e5e9;
        border-radius: 10px;
        padding: 12px 14px 14px;
        margin: 0 0 12px;
      }
      #${appId} .ma-sec {
        display: flex;
        align-items: baseline;
        gap: 8px;
        margin: 0 0 10px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.4px;
        text-transform: uppercase;
        color: #2f7d1b;
      }
      #${appId} .ma-count { font-size: 11px; font-weight: 500; color: #5e6279; text-transform: none; letter-spacing: 0; }
      #${appId} .ma-stats {
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 6px;
        margin: 10px 0 8px;
      }
      #${appId} .ma-stat-note {
        grid-column: 1 / -1;
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 9px 12px;
        border-style: dashed;
        background: #f3f3f6;
        color: #50546a;
        font-size: 12px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #${appId} .ma-stat-note > span:last-child {
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #${appId} .ma-spin-dot {
        flex: 0 0 auto;
        width: 13px;
        height: 13px;
        border: 2px solid rgba(109, 187, 42, 0.22);
        border-top-color: #6dbb2a;
        border-radius: 50%;
        animation: ma-spin 0.8s linear infinite;
      }
      #${appId} .ma-stat {
        background: #f3f3f6;
        border: 1px solid #e5e6eb;
        border-radius: 8px;
        padding: 7px 8px;
      }
      #${appId} .ma-stat b { display: block; font-size: 14px; color: #111827; }
      #${appId} .ma-stat span { font-size: 10px; color: #5e6279; text-transform: uppercase; letter-spacing: 0.3px; }
      #${appId} .ma-tbl { width: 100%; border-collapse: collapse; font-size: 12px; }
      #${appId} .ma-tbl th {
        position: sticky;
        top: 0;
        z-index: 1;
        text-align: left;
        padding: 7px 8px;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.4px;
        text-transform: uppercase;
        color: #5e6279;
        border-bottom: 1px solid #e5e5e9;
        background: #f1f1f4;
      }
      #${appId} .ma-tbl td { padding: 7px 8px; border-bottom: 1px solid #e7e8ed; vertical-align: middle; }
      #${appId} .ma-tbl tr:last-child td { border-bottom: 0; }
      #${appId} .ma-tbl tr.ma-sel td { background: #f3fbe8; }
      #${appId} .ma-chk { width: 38px; text-align: center; cursor: pointer; }
      /* One control height for the whole target table: page, pixel, catalog, rate. */
      #${appId} .ma-tbl .ma-pix,
      #${appId} .ma-tbl .ma-cat,
      #${appId} .ma-tbl .ma-fp-btn,
      #${appId} .ma-tbl .ma-rate,
      #${appId} .ma-tbl .ma-copies {
        box-sizing: border-box;
        height: 40px;
        border-radius: 8px;
        font-size: 13px;
      }
      #${appId} .ma-tbl .ma-pix,
      #${appId} .ma-tbl .ma-cat {
        padding: 0 10px;
        background: #eeeef2;
        color: #111827;
        border: 1px solid #d9dae2;
      }
      #${appId} .ma-tbl .ma-fp-btn { padding: 0 10px; }
      /* Checkboxes must stay clickable at a glance. */
      #${appId} .ma-chk input[type="checkbox"] {
        width: 20px;
        height: 20px;
        margin: 0;
        accent-color: #b4f461;
        cursor: pointer;
        vertical-align: middle;
      }
      #${appId} .ma-who { display: flex; flex-direction: column; gap: 1px; }
      #${appId} .ma-id { font-size: 10px; color: #808496; font-family: "Consolas", monospace; }
      #${appId} .ma-chip {
        display: inline-block;
        padding: 2px 7px;
        border-radius: 999px;
        border: 1px solid #e0e1e7;
        background: #f3f3f6;
        color: #313341;
        font-size: 10px;
        white-space: nowrap;
      }
      #${appId} .ma-chip.ma-ok { border-color: #d2ebd5; color: #20832e; background: #eff6f1; }
      #${appId} .ma-chip.ma-warn { border-color: #ebe4d2; color: #926a00; background: #f6f4ef; }
      #${appId} .ma-chip.ma-err { border-color: #ebd2d2; color: #650000; background: #f6efef; }
      #${appId} .ma-scroll { max-height: 260px; overflow: auto; border: 1px solid #e5e6eb; border-radius: 8px; }
      #${appId} .ma-empty { padding: 14px; text-align: center; color: #5e6279; font-size: 12px; }
      #${appId} .ma-pix { min-width: 130px; font-size: 11px; padding: 4px 6px; }
      #${appId} .ma-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-top: 10px;
        flex-wrap: wrap;
      }
      #${appId} .ma-bar-right { display: flex; gap: 6px; }
      #${appId} .ma-hint { font-size: 11px; color: #5e6279; }
      #${appId} button.ma-info {
        width: 16px;
        height: 16px;
        padding: 0;
        border: 1px solid #d9dae2;
        border-radius: 50%;
        background: #ececf1;
        color: #2f7d1b;
        font-size: 10px;
        font-weight: 700;
        line-height: 1;
        cursor: pointer;
      }
      /* The global "button:hover turns accent" rule made the glyph invisible:
         keep the idle look on hover and paint the highlight ourselves. */
      #${appId} button.ma-info:hover,
      #${appId} button.ma-info:focus {
        background: #ececf1;
        color: #2f7d1b;
        outline: none;
      }
      #${appId} button.ma-info.ma-info-on,
      #${appId} button.ma-info.ma-info-on:hover {
        background: #b4f461;
        border-color: #6dbb2a;
        color: #111827;
      }
      #${appId} .ma-macros-pop {
        position: relative;
        margin-top: 6px;
        padding: 8px 10px;
        border: 1px solid #e0e1e7;
        border-radius: 8px;
        background: #f2f3f7;
        font-size: 11px;
        line-height: 1.6;
      }
      #${appId} .ma-macros-pop code {
        padding: 1px 5px;
        border-radius: 4px;
        background: #ececf1;
        color: #2f7d1b;
        font-family: "Consolas", monospace;
      }
      #${appId} .ma-progress {
        height: 6px;
        margin: 4px 0 10px;
        border-radius: 999px;
        background: #f5f5f7;
        overflow: hidden;
      }
      #${appId} .ma-progress i {
        display: block;
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, #8fd93a, #b4f461);
        transition: width 0.25s ease;
      }
      #${appId} .ma-run-stats {
        display: flex;
        flex-wrap: wrap;
        gap: 14px;
        margin-bottom: 8px;
        font-size: 11px;
        color: #50546a;
      }
      #${appId} .ma-run-stats b { color: #111827; }
      #${appId} .ma-job {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
        padding: 7px 10px;
        border-bottom: 1px solid #e7e8ed;
        font-size: 12px;
      }
      #${appId} .ma-job:last-child { border-bottom: 0; }
      #${appId} .ma-job-ph { font-size: 10px; color: #5e6279; }
      #${appId} .ma-job-msg { margin-top: 2px; font-size: 11px; color: #5b3535; }
      #${appId} .ma-job-id { font-size: 10px; color: #999caa; font-family: "Consolas", monospace; }
      #${appId} .ma-job.ma-success b { color: #20832e; }
      #${appId} .ma-job.ma-failed b { color: #650000; }
      #${appId} .ma-job.ma-running b { color: #2f7d1b; }
      #${appId} .ma-console {
        margin-top: 8px;
        max-height: 90px;
        overflow: auto;
        padding: 8px 10px;
        border-radius: 8px;
        background: #f7faf5;
        border: 1px solid #e7e8ed;
        color: #50546a;
        font-family: "Consolas", monospace;
        font-size: 10px;
        white-space: pre-wrap;
      }
      #${appId} .ma-console:empty { display: none; }
      #${appId} .ma-media-row { display: flex; justify-content: space-between; padding: 4px 8px; font-size: 11px; border-bottom: 1px solid #ececf1; }
      #${appId} .ma-logs { border-top: 1px solid #e5e6eb; background: #f1f1f4; }
      #${appId} .ma-log-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; cursor: pointer; font-size: 11px; color: #50546a; text-transform: uppercase; letter-spacing: 0.4px; }
      #${appId} .ma-log-area { border-radius: 0; border: 0; border-top: 1px solid #e7e8ed; margin: 0; height: 110px; }
      #${appId} .ma-ok { color: #20832e; }
      #${appId} .ma-warn { color: #926a00; }
      #${appId} .ma-err { color: #650000; }
      #${appId} .ma-tab.ma-tab-active,
      #${appId} .ma-tab.ma-active {
        color: #2f7d1b;
        border-bottom: 2px solid #6dbb2a;
      }
      #${appId} .ma-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 16px;
        border-top: 1px solid #e5e6eb;
        background: #f0f1f4;
      }
      #${appId} button.ma-primary {
        background: #b4f461;
        border: 1px solid #6dbb2a;
        color: #111827;
        font-weight: 700;
      }
      #${appId} button.ma-primary:hover:not(:disabled) { background: #a3ea4b; }
      #${appId} button.ma-danger {
        background: #f5eded;
        border: 1px solid #ebd2d2;
        color: #570000;
      }
      #${appId} button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      #${appId} details.ma-logs:not([open]) .ma-log-area { display: none; }
      #${appId} details.ma-logs > summary { list-style: none; }
      #${appId} details.ma-logs > summary::-webkit-details-marker { display: none; }
      /* compact rhythm + readable secondary text */
      #${appId} .ma-card { padding: 10px 12px 12px; margin-bottom: 10px; }
      #${appId} .ma-stat-note {
        grid-column: 1 / -1;
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 9px 12px;
        border-style: dashed;
        background: #f3f3f6;
        color: #50546a;
        font-size: 12px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #${appId} .ma-stat-note > span:last-child {
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #${appId} .ma-spin-dot {
        flex: 0 0 auto;
        width: 13px;
        height: 13px;
        border: 2px solid rgba(109, 187, 42, 0.22);
        border-top-color: #6dbb2a;
        border-radius: 50%;
        animation: ma-spin 0.8s linear infinite;
      }
      #${appId} .ma-stat { padding: 6px 8px; }
      #${appId} .ma-stat b { font-size: 13px; }
      #${appId} .ma-stat span { font-size: 9.5px; color: #484c60; }
      #${appId} .ma-hint,
      #${appId} .ma-build,
      #${appId} .ma-count,
      #${appId} .ma-tbl th,
      #${appId} .ma-job-ph,
      #${appId} .ma-id { color: #484c60; }
      #${appId} .ma-body::-webkit-scrollbar,
      #${appId} .ma-scroll::-webkit-scrollbar { width: 9px; height: 9px; }
      #${appId} .ma-body::-webkit-scrollbar-thumb,
      #${appId} .ma-scroll::-webkit-scrollbar-thumb {
        background: #d9dae2;
        border-radius: 6px;
      }
      #${appId} .ma-body::-webkit-scrollbar-track,
      #${appId} .ma-scroll::-webkit-scrollbar-track { background: #f2f3f7; }
      #${appId} .ma-sec { margin-bottom: 8px; }
      #${appId} .ma-summary {
        font-size: 12px;
        color: #181a26;
        padding: 6px 8px;
        border: 1px dashed #e0e1e7;
        border-radius: 8px;
        background: #f2f3f5;
      }
      #${appId} .ma-tbl tr.ma-sel td { background: #eaf8d8; }
      #${appId} .ma-tbl tr.ma-sel td:first-child {
        box-shadow: inset 3px 0 0 #6dbb2a;
      }
      #${appId} .ma-scroll {
        box-shadow: inset 0 -14px 14px -14px rgba(17, 24, 39, 0.256);
      }
      #${appId} details.ma-logs { background: #f2f2f5; }
      #${appId} details.ma-logs > summary { padding: 7px 16px; }
      /* row fields share the width evenly; only explicit .ma-narrow stays fixed */
      #${appId} .ma-row { align-items: flex-end; gap: 12px; }
      #${appId} .ma-row > .ma-field { flex: 1 1 0; min-width: 0; margin-bottom: 0; }
      #${appId} .ma-row > .ma-field.ma-narrow { flex: 0 0 200px; }
      #${appId} .ma-row > .ma-field.ma-source-account { flex: 0 0 260px; }
      #${appId} .ma-field > select,
      #${appId} .ma-field > input[type="text"],
      #${appId} .ma-field > input[type="file"] {
        width: 100%;
        height: 40px;
        box-sizing: border-box;
        padding: 0 10px;
        font-size: 13px;
      }
      #${appId} .ma-field > input[type="file"] {
        padding: 5px 10px;
        color: #1b1f2d;
      }
      #${appId} .ma-field > input[type="file"]::file-selector-button {
        height: 28px;
        margin-right: 10px;
        padding: 0 12px;
        border: 1px solid #d9dae2;
        border-radius: 6px;
        background: #e9eaef;
        color: #111827;
        font: inherit;
        cursor: pointer;
      }
      #${appId} .ma-field > input[type="file"]::file-selector-button:hover {
        background: #e4e5eb;
      }
      #${appId} .ma-bar .ma-primary,
      #${appId} .ma-bar .ma-secondary {
        min-width: 220px;
        padding-left: 20px;
        padding-right: 20px;
      }
      #${appId} .ma-log-head { cursor: pointer; }
      #${appId} .ma-log-t {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      #${appId} .ma-chev {
        display: block;
        color: #181a26;
        transition: transform 0.15s ease;
      }
      #${appId} details.ma-logs[open] .ma-chev { transform: rotate(90deg); }
      #${appId} .ma-report-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 6px;
      }
      #${appId} .ma-report-head h3 { margin: 0; font-size: 13px; color: #2f7d1b; }
      #${appId} button.ma-done {
        border-color: #d2ebd5;
        color: #20832e;
        background: #eff6f1;
      }
      /* the finished-operation verdict takes over the panel until it is closed */
      #${appId} .ma-overlay {
        position: absolute;
        inset: 0;
        z-index: 70;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        background: rgba(255, 255, 255, 0.68);
        backdrop-filter: blur(1.5px);
      }
      #${appId} .ma-overlay button {
        min-width: 0;
      }
      #${appId} .ma-report-card {
        width: min(440px, 100%);
        max-height: calc(100% - 16px);
        overflow: auto;
        margin: 0;
        border: 1px solid #d2d3d7;
        box-shadow: 0 20px 60px rgba(17, 24, 39, 0.208);
      }
      #${appId} .ma-report-card .ma-report-meta {
        color: #181a26;
        line-height: 1.45;
        margin-bottom: 6px;
      }
      #${appId} .ma-report-card .ma-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        align-items: center;
        gap: 8px;
        margin-top: 10px;
      }
      #${appId} .ma-report-card .ma-actions button {
        background: #e9eaef;
        color: #111827;
        border: 1px solid #d9dae2;
        font-weight: 600;
      }
      #${appId} .ma-report-card .ma-actions button:hover { background: #e4e5eb; }
      #${appId} .ma-report-card .ma-actions button.ma-primary {
        margin-left: auto;
        background: #b4f461;
        color: #111827;
        border-color: #6dbb2a;
      }
      #${appId} .ma-report-card .ma-actions button.ma-primary:hover { background: #a3ea4b; }
      /* fan page cell: avatar + listbox, because a native select cannot show a logo */
      #${appId} .ma-fp-cell { position: relative; min-width: 130px; }
      #${appId} .ma-fp-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        max-width: 168px;
        height: 40px;
        padding: 0 10px;
        border: 1px solid #d9dae2;
        border-radius: 6px;
        background: #eeeef2;
        color: #111827;
        font-size: 12px;
        text-align: left;
        cursor: pointer;
      }
      #${appId} .ma-fp-btn:hover { background: #eaeaee; }
      #${appId} .ma-fp-btn .ma-fp-name {
        flex: 1 1 auto;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      #${appId} .ma-caret { color: #50546a; font-size: 10px; }
      #${appId} .ma-fp-ico {
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border-radius: 5px;
        overflow: hidden;
        background: #e1e2e8;
        color: #2f7d1b;
        font-size: 11px;
        font-weight: 700;
      }
      #${appId} .ma-fp-ico img { width: 100%; height: 100%; object-fit: cover; display: block; }
      #${appId} .ma-fp-ico.ma-fp-auto { color: #2c2e3b; font-size: 9px; }
      #${appId} .ma-fp-pop {
        /* fixed, not absolute: the kabinet table scrolls and would clip it */
        position: fixed;
        z-index: 2147483000;
        top: 0;
        left: 0;
        margin-top: 4px;
        width: 260px;
        max-height: 240px;
        overflow: auto;
        padding: 4px;
        border: 1px solid #d9dae2;
        border-radius: 8px;
        background: #f0f1f4;
        box-shadow: 0 12px 30px rgba(17, 24, 39, 0.192);
      }
      #${appId} .ma-fp-item {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 5px 6px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: #111827;
        font-size: 12px;
        text-align: left;
        cursor: pointer;
      }
      #${appId} .ma-fp-item:hover { background: #e9eaed; }
      #${appId} .ma-fp-item.ma-on { background: #e4f5cd; }
      #${appId} .ma-fp-item .ma-fp-name {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      #${appId} .ma-pix { width: 112px; }
      #${appId} .ma-cat { width: 142px; }
      #${appId} .ma-tbl td select { max-width: 100%; }
      #${appId} .ma-copies {
        box-sizing: border-box;
        width: 58px;
        padding: 0 6px;
        border: 1px solid #d9dae2;
        background: #eeeef2;
        color: #111827;
        text-align: center;
      }
      #${appId} .ma-cur { white-space: nowrap; }
      #${appId} .ma-cur .ma-chip { padding: 2px 6px; font-size: 11px; }
      #${appId} .ma-tbl th, #${appId} .ma-tbl td { padding: 6px 6px; }
      #${appId} .ma-cur .ma-chip { cursor: help; }
      #${appId} .ma-rate {
        width: 66px;
        margin-left: 4px;
        height: 24px;
        padding: 0 4px;
        border: 1px solid #d9dae2;
        border-radius: 5px;
        background: #eeeef2;
        color: #111827;
        font-size: 11px;
      }
      #${appId} .ma-mass-list {
        max-height: 240px;
        overflow: auto;
        margin: 8px 0;
        font-size: 12px;
      }
      #${appId} .ma-mass-row {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        padding: 4px 2px;
        border-bottom: 1px solid #e9eaef;
      }
      #${appId} .ma-mass-row span { color: #2c2e3b; }
      #${appId} .ma-mass-message {
        max-width: 520px;
        margin-top: 3px;
        color: #2c2e3b;
        font-size: 11px;
        white-space: normal;
      }
      #${appId} .ma-mass-row.ma-success span { color: #20832e; }
      #${appId} .ma-mass-row.ma-failed span { color: #570000; }
      /* ---- collapsed: the window morphs into the mark pinned to the corner ---- */
      #${appId} .ma-shell { transition: opacity .16s ease, transform .16s ease; }
      #${appId} .ma-mini {
        display: none;
        position: fixed;
        top: 0;
        right: 0;
        width: 54px;
        height: 54px;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: 1px solid #d9dae2;
        border-radius: 14px;
        background: #f2f3f5;
        box-shadow: 0 10px 26px rgba(17, 24, 39, 0.176);
        cursor: grab;
        touch-action: none;
        pointer-events: auto;
      }
      #${appId} .ma-mini:active { cursor: grabbing; }
      #${appId} .ma-mini:hover { border-color: #6dbb2a; }
      #${appId} .ma-mini .ma-mark { width: 32px; height: 32px; }
      #${appId}.ma-min .ma-mini { display: inline-flex; }
      #${appId}.ma-min .ma-dock { display: none !important; }
      #${appId}.ma-min .ma-shell {
        opacity: 0;
        visibility: hidden;
        transform: scale(0.86);
        pointer-events: none;
      }
      #${appId} .ma-minimize { font-weight: 700; line-height: 1; padding-bottom: 3px; }
      /* ---- account search in the target section header ---- */
      #${appId} .ma-search {
        width: 190px;
        height: 28px;
        margin-left: 10px;
        padding: 0 9px;
        border: 1px solid #e3e3e7;
        border-radius: 7px;
        background: #efeff3;
        color: #111827;
        font-size: 12px;
        font-family: inherit;
      }
      #${appId} .ma-refresh { font-size: 16px; line-height: 1; }
      #${appId} .ma-refresh:hover { color: #2f7d1b; }
      /* The target header is split: title on the left, search filling the rest. */
      #${appId} .ma-sec-split { align-items: center; }
      #${appId} .ma-sec-split .ma-sec-title { flex: 0 0 auto; }
      #${appId} .ma-sec-split .ma-search { flex: 1 1 auto; width: auto; margin-left: auto; }
      #${appId} .ma-search::placeholder { color: #808496; }
      #${appId} .ma-search:focus { outline: none; border-color: #6dbb2a; }
      #${appId} .ma-note {
        margin-top: 8px;
        color: #656a81;
        font-size: 11px;
        line-height: 1.35;
      }
      /* ---- account type as an icon with a tooltip ---- */
      #${appId} .ma-acc { display: inline-flex; align-items: center; gap: 8px; }
      #${appId} .ma-acc-ico {
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border-radius: 5px;
        font-size: 10px;
        font-weight: 700;
        cursor: help;
      }
      #${appId} .ma-acc-ico.ma-bm { background: #e7ede7; color: #1e6e1e; border: 1px solid #dae3da; }
      #${appId} .ma-acc-ico.ma-personal { background: #e9eaef; color: #50546a; border: 1px solid #e3e3e7; }
      /* loading: the whole window dims, only the wheel stays lit and centered */
      #${appId} .ma-loading {
        position: absolute;
        inset: 0;
        z-index: 60;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(251, 251, 251, 0.72);
        pointer-events: auto;
      }
      #${appId} .ma-loading.ma-hidden { display: none !important; }
      #${appId} .ma-loading .ma-spinner {
        width: 52px;
        height: 52px;
        border-width: 5px;
      }
      @media (max-width: 800px) {
        #${appId} { inset: 10px; }
        #${appId} .ma-shell { max-height: calc(100vh - 20px); }
        #${appId} .ma-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        #${appId} .ma-summary-grid { grid-template-columns: 1fr; }
        #${appId} .ma-row { flex-direction: column; align-items: stretch; }
      }
    `;
}

/** Source switch: one labelled toggle, campaign on the left, JSON on the right. */
export const SOURCE_SWITCH_STYLES = `
#mirrorads-root .ma-source-row { display: flex; align-items: center; gap: 12px; margin: 0 0 12px; }
#mirrorads-root .ma-source-label { height: 40px; padding: 0; border: 0; background: transparent; color: #5e6279; font: inherit; font-weight: 600; cursor: pointer; }
#mirrorads-root .ma-source-label.is-on { color: #2f7d1b; }
#mirrorads-root .ma-source-label { font-size: 13px; letter-spacing: .01em; }
#mirrorads-root .ma-source-label:not(.is-on):hover { background: transparent; color: #131624; }
#mirrorads-root .ma-switch { position: relative; flex: 0 0 auto; width: 52px; height: 28px; padding: 0; border: 1px solid #e1e2e8; border-radius: 999px; background: #f2f3f5; cursor: pointer; transition: background .18s ease, border-color .18s ease; }
#mirrorads-root .ma-switch-knob { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #b4f461; transition: left .18s ease, background .18s ease; }
#mirrorads-root .ma-source-row[data-kind="json"] .ma-switch { background: #f2f3f5; border-color: #6dbb2a; }
#mirrorads-root .ma-source-row[data-kind="json"] .ma-switch-knob { left: 29px; }
.ma-drop { display: flex; flex-direction: column; gap: 4px; align-items: center; justify-content: center; padding: 14px; margin-bottom: 8px; border: 1.5px dashed #e1e2e8; border-radius: 11px; background: #f3f3f6; color: #5e6279; text-align: center; cursor: pointer; }
.ma-drop:hover { border-color: #6dbb2a; }
.ma-drop b { color: #111827; font-weight: 600; }
.ma-drop input[type="file"] { display: none; }
`;

/** Media slot table for a JSON package: chips, expected names, per-slot pick. */
export const MEDIA_SLOT_STYLES = `
.ma-chip { display: inline-flex; align-items: center; height: 20px; padding: 0 8px; border-radius: 6px; background: #e9eaef; color: #2c2e3b; font-size: 11px; }
.ma-chip-ok { background: #e9f6ed; color: #199655; }
.ma-chip-warn { background: #f0e7e7; color: #570000; }
.ma-file { font-family: ui-monospace, monospace; font-size: 11px; color: #2c2e3b; }
#app .ma-tbl .ma-select { height: 30px; width: 100%; }
`;
