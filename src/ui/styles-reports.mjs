/** Styles of the Reports tab: totals, account rows and the bulk action bar. */
export function buildReportStyles(A) {
  return `
      /* ---- reports ---- */
      ${A} .ma-seg {
        display: inline-flex;
        padding: 3px;
        border-radius: 999px;
        background: #f1f2f5;
      }
      ${A} .ma-seg button {
        height: 30px;
        padding: 0 13px;
        border: 0;
        border-radius: 999px;
        background: transparent;
        color: var(--ma-muted);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      ${A} .ma-seg button em {
        margin-left: 6px;
        padding: 0 6px;
        border-radius: 999px;
        background: #e5e7eb;
        color: var(--ma-ink);
        font-size: 11px;
        font-style: normal;
        font-variant-numeric: tabular-nums;
      }
      ${A} .ma-seg button[data-report="status:live"] em { background: #dcf7c0; color: #1f6a10; }
      ${A} .ma-seg button[data-report="status:dead"] em { background: #ffe9e9; color: #b42318; }
      ${A} .ma-seg button:hover { background: transparent; color: var(--ma-ink); }
      ${A} .ma-seg button.is-on {
        background: #ffffff;
        color: var(--ma-ink);
        box-shadow: 0 1px 3px rgba(17, 24, 39, 0.14);
      }
      ${A} .ma-rep-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 2px 0 8px; }
      ${A} .ma-rep-refresh { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; }
      ${A} .ma-rep-refresh .ma-ico { width: 15px; height: 15px; }
      ${A} .ma-rep-custom { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 0 8px; }
      ${A} .ma-rep-custom input[type="date"] {
        height: 34px;
        padding: 0 10px;
        border: 1px solid #d9dce3;
        border-radius: 10px;
        background: #ffffff;
        color: var(--ma-ink);
        font: inherit;
        font-size: 12px;
      }
      ${A} .ma-rep-custom input[type="date"],
      ${A} .ma-rep-custom select { flex: 0 0 auto; width: auto; }
      ${A} .ma-rep-custom select { height: 34px; padding: 0 8px; font-size: 12px; }
      ${A} .ma-rep-custom > span { color: var(--ma-faint); }
      ${A} .ma-rep-time {
        height: 34px;
        padding: 0 12px;
        border: 1px solid #d9dce3;
        border-radius: 999px;
        background: #ffffff;
        color: var(--ma-muted);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      ${A} .ma-rep-time:hover { background: var(--ma-soft); color: var(--ma-ink); }
      ${A} .ma-rep-time.is-on { border-color: #6dbb2a; background: #ecfbd6; color: var(--ma-lime-deep); }
      ${A} button.ma-rep-apply { min-height: 34px; margin-left: auto; padding: 0 16px; font-size: 12px; }
      ${A} .ma-rep-zonepick { display: inline-flex; align-items: center; gap: 8px; margin-left: auto; }
      ${A} .ma-rep-zonepick span { font-size: 12px; color: var(--ma-muted); white-space: nowrap; }
      ${A} .ma-rep-zonepick select { flex: 0 0 auto; width: auto; }
      ${A} .ma-rep-zonepick select { height: 34px; max-width: 230px; font-size: 12px; }
      ${A} .ma-rep-camps { display: flex; flex-wrap: wrap; gap: 4px 6px; margin-top: 5px; }
      ${A} .ma-rep-camps i {
        white-space: nowrap;
        padding: 1px 8px;
        border-radius: 999px;
        font-size: 11px;
        font-style: normal;
        font-weight: 600;
      }
      ${A} .ma-rep-statusbar { margin: 0 0 12px; }
      ${A} .ma-rep-statusbar > span { font-size: 12px; color: var(--ma-muted); }
      ${A} .ma-rep-health { background: #f1f2f5; color: var(--ma-muted); }
      ${A} .ma-rep-health::before {
        content: "";
        display: inline-block;
        width: 6px;
        height: 6px;
        margin-right: 5px;
        border-radius: 50%;
        background: currentColor;
        vertical-align: 1px;
      }
      ${A} .ma-rep-health-live { background: transparent; padding-left: 0; color: #1f6a10; }
      ${A} .ma-rep-health-banned,
      ${A} .ma-rep-health-closed { background: #ffe9e9; color: #b42318; }
      ${A} .ma-rep-health-review,
      ${A} .ma-rep-health-billing { background: #fff7e0; color: #7a5200; }
      ${A} .ma-rep-stuck { background: #f1f2f5; color: var(--ma-muted); font-weight: 500; }
      ${A} .ma-rep-dead { background: #fffafa; border-color: #f6d5d5; }
      ${A} .ma-rep-dead .ma-rep-acct b { color: var(--ma-muted); }
      ${A} .ma-rep-on { background: #dcf7c0; color: #1f6a10; }
      ${A} .ma-rep-on.is-zero { background: #f1f2f5; color: var(--ma-faint); font-weight: 500; }
      ${A} .ma-rep-off { background: #f1f2f5; color: var(--ma-muted); font-weight: 500; }
      ${A} .ma-rep-zonehint { margin: 0 0 14px; font-size: 12px; color: var(--ma-muted); }
      ${A} .ma-rep-tiles { display: grid; grid-template-columns: 1.3fr 1fr 1fr; gap: 8px; margin: 0 0 14px; }
      ${A} .ma-rep-tile { padding: 12px 14px; border-radius: 14px; background: var(--ma-soft); }
      ${A} .ma-rep-tile:first-child { background: #111827; }
      ${A} .ma-rep-tile span {
        display: block;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--ma-faint);
      }
      ${A} .ma-rep-tile b {
        display: block;
        margin: 4px 0 2px;
        font-size: 22px;
        font-weight: 700;
        letter-spacing: -0.02em;
        color: var(--ma-ink);
        font-variant-numeric: tabular-nums;
      }
      ${A} .ma-rep-tile small { font-size: 12px; color: var(--ma-muted); }
      ${A} .ma-rep-tile:first-child b { color: var(--ma-lime); }
      ${A} .ma-rep-tile:first-child small { color: #9ca3af; }
      ${A} .ma-rep-warn {
        margin: 0 0 10px;
        padding: 9px 12px;
        border-radius: 10px;
        background: #fff7e0;
        color: #7a5200;
        font-size: 12px;
      }
      ${A} .ma-rep-head,
      ${A} .ma-rep-row {
        display: grid;
        grid-template-columns: 18px minmax(0, 1fr) 88px 76px 84px 34px;
        align-items: center;
        column-gap: 10px;
      }
      ${A} .ma-ovr-body .ma-row { display: grid; grid-template-columns: 1fr 1fr 1.25fr; gap: 10px; }
      ${A} .ma-ovr-body .ma-row > .ma-field { min-width: 0; margin: 0; }
      ${A} .ma-ovr-body .ma-row input { width: 100%; min-width: 0; box-sizing: border-box; }
      ${A} .ma-ovr-body .ma-row { align-items: end; }
      ${A} .ma-ovr-body input[type="datetime-local"] {
        height: 40px;
        padding: 0 8px;
        border: 1px solid var(--ma-line);
        border-radius: 10px;
        background: #ffffff;
        color: var(--ma-ink);
        font: inherit;
        font-size: 12px;
      }
      ${A} input.ma-rep-pick {
        appearance: auto;
        -webkit-appearance: auto;
        width: 16px;
        height: 16px;
        margin: 0;
        padding: 0;
        border-radius: 4px;
        accent-color: #6dbb2a;
        cursor: pointer;
      }
      ${A} .ma-rep-actbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        margin: 0 0 12px;
        padding: 10px 12px;
        border-radius: 14px;
        background: #111827;
        color: #ffffff;
      }
      ${A} .ma-rep-actbar.is-confirm { background: #3b1d1d; }
      ${A} .ma-rep-acttext { flex: 1 1 90px; min-width: 0; font-size: 12px; color: #d1d5db; }
      ${A} .ma-rep-acttext b { color: #ffffff; font-weight: 600; }
      ${A} .ma-rep-actbar button.ma-secondary,
      ${A} .ma-rep-actbar button.ma-danger,
      ${A} .ma-rep-actbar button.ma-primary { min-height: 32px; padding: 0 14px; font-size: 12px; }
      ${A} .ma-rep-actbar button.ma-secondary { border-color: #374151; background: transparent; color: #ffffff; }
      ${A} .ma-rep-actbar button.ma-secondary:hover { background: #1f2937; color: #ffffff; border-color: #4b5563; }
      ${A} .ma-rep-actbar button.ma-danger { border-color: #f87171; background: #ef4444; color: #ffffff; }
      ${A} .ma-rep-actbar button.ma-danger:hover { background: #dc2626; color: #ffffff; }
      ${A} .ma-rep-link {
        min-height: 0;
        padding: 0 4px;
        border: 0;
        background: transparent;
        color: #9ca3af;
        font-size: 12px;
        font-weight: 600;
        text-decoration: underline;
        cursor: pointer;
      }
      ${A} .ma-rep-link:hover { background: transparent; color: #ffffff; }
      ${A} .ma-rep-actbar .ma-seg { background: #1f2937; }
      ${A} .ma-rep-actbar .ma-seg button { color: #9ca3af; }
      ${A} .ma-rep-actbar .ma-seg button:hover { color: #ffffff; }
      ${A} .ma-rep-actbar .ma-seg button.is-on { background: #374151; color: #ffffff; box-shadow: none; }
      ${A} .ma-rep-actbar input[type="text"] { flex: 0 0 110px; width: 110px; height: 32px; }
      ${A} .ma-rep-acterr { flex: 1 1 100%; font-size: 11px; color: #fca5a5; word-break: break-word; }
      ${A} .ma-rep-head {
        padding: 0 12px 6px;
        font-size: 11px;
        font-weight: 500;
        color: var(--ma-faint);
      }
      ${A} .ma-rep-head span:not(:first-of-type) { text-align: right; }
      ${A} .ma-rep-row {
        margin: 0 0 6px;
        padding: 10px 12px;
        border: 1px solid var(--ma-line);
        border-radius: 14px;
        background: #ffffff;
      }
      ${A} .ma-rep-row:hover { border-color: #cfd3db; }
      ${A} .ma-rep-zero { background: var(--ma-soft); border-color: transparent; }
      ${A} .ma-rep-zero b { color: var(--ma-muted); font-weight: 500; }
      ${A} .ma-rep-acct { min-width: 0; }
      ${A} .ma-rep-acct b {
        display: block;
        font-size: 13px;
        font-weight: 600;
        color: var(--ma-ink);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      ${A} .ma-rep-acct > span { display: block; font-size: 11px; color: var(--ma-faint); font-variant-numeric: tabular-nums; }
      ${A} .ma-rep-note {
        display: inline-block;
        margin-top: 4px;
        padding: 1px 8px;
        border-radius: 999px;
        background: #fff7e0;
        color: #7a5200;
        font-size: 11px;
      }
      ${A} .ma-rep-note.ma-rep-err { background: #fff0f0; color: #b42318; }
      ${A} .ma-rep-num { text-align: right; font-variant-numeric: tabular-nums; }
      ${A} .ma-rep-num b { display: block; font-size: 13px; font-weight: 600; color: var(--ma-ink); }
      ${A} .ma-rep-num small { display: block; font-size: 11px; color: var(--ma-faint); }
      ${A} .ma-rep-open {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 10px;
        background: #f1f2f5;
        color: var(--ma-ink);
        text-decoration: none;
      }
      ${A} .ma-rep-open:hover { background: var(--ma-lime); color: #14280a; }
      ${A} .ma-rep-open .ma-ico { width: 16px; height: 16px; }
      ${A} .ma-rep-stale { opacity: 0.55; }
      ${A} .ma-rep-empty { padding: 28px 12px; text-align: center; color: var(--ma-muted); font-size: 13px; }
      ${A} .ma-rep-more {
        width: 100%;
        min-height: 36px;
        margin-top: 4px;
        border: 1px dashed #cfd3db;
        border-radius: 12px;
        background: transparent;
        color: var(--ma-muted);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      ${A} .ma-rep-more:hover { background: var(--ma-soft); color: var(--ma-ink); }

      ${A} .ma-rep-camps button.ma-rep-toggle {
        min-height: 0;
        height: auto;
        padding: 2px 8px;
        border: 0;
        border-radius: 999px;
        background: #dcf7c0;
        color: #1f6a10;
        font-size: 11px;
        font-weight: 600;
        line-height: 1.5;
        cursor: pointer;
      }
      ${A} .ma-rep-camps button.ma-rep-toggle:hover,
      ${A} .ma-rep-camps button.ma-rep-toggle.is-open { background: var(--ma-lime); color: var(--ma-ink); }
      ${A} .ma-rep-cl {
        margin: -4px 0 8px 18px;
        padding: 10px 12px;
        border: 1px solid var(--ma-line);
        border-top: 0;
        border-radius: 0 0 14px 14px;
        background: var(--ma-soft);
      }
      ${A} .ma-rep-cl-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 8px;
        font-size: 11px;
        font-weight: 600;
        color: var(--ma-muted);
      }
      ${A} .ma-rep-cl-note { font-size: 12px; color: var(--ma-muted); }
      ${A} .ma-rep-camp {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 7px 10px;
        margin-top: 4px;
        border-radius: 10px;
        background: #ffffff;
      }
      ${A} .ma-rep-camp > div { min-width: 0; }
      ${A} .ma-rep-camp b {
        display: block;
        overflow: hidden;
        font-size: 12px;
        font-weight: 600;
        color: var(--ma-ink);
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      ${A} .ma-rep-camp small { display: block; font-size: 11px; color: var(--ma-muted); word-break: break-word; }
      ${A} .ma-rep-camp small.ma-rep-err { color: #b91c1c; }
      ${A} .ma-rep-camp.is-off b { color: var(--ma-faint); text-decoration: line-through; }
      ${A} .ma-rep-offdone { flex: 0 0 auto; font-size: 11px; color: var(--ma-faint); }
      ${A} button.ma-rep-offbtn {
        flex: 0 0 auto;
        min-height: 28px;
        padding: 0 12px;
        border: 1px solid #fecaca;
        border-radius: 999px;
        background: #ffffff;
        color: #b91c1c;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
      }
      ${A} button.ma-rep-offbtn:hover { background: #fef2f2; color: #b91c1c; }
      ${A} button.ma-rep-offbtn.is-armed { border-color: #ef4444; background: #ef4444; color: #ffffff; }
      ${A} button.ma-rep-offbtn:disabled { opacity: 0.6; cursor: default; }
      ${A} .ma-rep-camps button.ma-rep-toggle.is-zero { background: #f1f2f5; color: var(--ma-muted); }
      ${A} .ma-rep-cl-sub { margin-top: 12px; }
      ${A} button.ma-rep-onbtn {
        flex: 0 0 auto;
        min-height: 28px;
        padding: 0 12px;
        border: 1px solid #bfe89a;
        border-radius: 999px;
        background: #ffffff;
        color: var(--ma-lime-deep);
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
      }
      ${A} button.ma-rep-onbtn:hover { background: #f3fde7; color: var(--ma-lime-deep); }
      ${A} button.ma-rep-onbtn.is-armed { border-color: var(--ma-lime); background: var(--ma-lime); color: var(--ma-ink); }
      ${A} button.ma-rep-onbtn:disabled { opacity: 0.6; cursor: default; }
      ${A} button.ma-rep-blink {
        display: inline-block;
        min-height: 0;
        height: auto;
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--ma-muted);
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
      }
      ${A} button.ma-rep-blink:hover { background: transparent; color: var(--ma-ink); text-decoration: underline; }
      ${A} .ma-rep-bedit { display: flex; align-items: center; gap: 6px; margin-top: 4px; }
      ${A} .ma-rep-bedit input[type="text"] { width: 84px; height: 28px; padding: 0 8px; font-size: 12px; }
      ${A} .ma-rep-bedit i { font-style: normal; font-size: 11px; color: var(--ma-muted); }
      ${A} button.ma-rep-bsave {
        min-height: 28px;
        padding: 0 12px;
        border: 0;
        border-radius: 999px;
        background: var(--ma-lime);
        color: var(--ma-ink);
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
      }
      ${A} .ma-rep-camp.is-off b { text-decoration: none; }

      /* ---- reports: accounts / groups switch ---- */
      ${A} .ma-rep-views {
        display: flex;
        gap: 4px;
        margin: 0 0 14px;
        padding: 4px;
        border-radius: 14px;
        background: #f1f2f5;
      }
      ${A} .ma-rep-views button {
        flex: 1 1 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        height: 38px;
        border: 0;
        border-radius: 11px;
        background: transparent;
        color: var(--ma-muted);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      }
      ${A} .ma-rep-views button .ma-ico { width: 17px; height: 17px; }
      ${A} .ma-rep-views button:hover { background: transparent; color: var(--ma-ink); }
      ${A} .ma-rep-views button.is-on {
        background: #ffffff;
        color: var(--ma-ink);
        box-shadow: 0 1px 3px rgba(17, 24, 39, 0.14);
      }

      /* ---- reports: automated rules of an account ---- */
      ${A} .ma-rep-norules {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 36px;
        margin-left: auto;
        padding: 0 12px;
        border: 1px solid #d9dce3;
        border-radius: 999px;
        background: #ffffff;
        color: var(--ma-muted);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      ${A} .ma-rep-norules .ma-ico { width: 14px; height: 14px; }
      ${A} .ma-rep-norules em {
        padding: 0 6px;
        border-radius: 999px;
        background: #e5e7eb;
        color: var(--ma-ink);
        font-size: 11px;
        font-style: normal;
        font-variant-numeric: tabular-nums;
      }
      ${A} .ma-rep-norules.has-some em { background: #ffe1e1; color: #b42318; }
      ${A} button.ma-rep-norules:hover:not(:disabled) { background: var(--ma-soft); color: var(--ma-ink); }
      ${A} button.ma-rep-norules.is-on,
      ${A} button.ma-rep-norules.is-on:hover:not(:disabled) { border-color: #f87171; background: #fff1f1; color: #b42318; }
      ${A} .ma-rules {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 1px 8px 1px 6px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 600;
        line-height: 1.5;
        white-space: nowrap;
        cursor: help;
        outline: none;
      }
      ${A} .ma-rules > .ma-ico { width: 12px; height: 12px; }
      ${A} .ma-rules-on { background: #efedff; color: #4338ca; }
      ${A} .ma-rules-off { background: #fff7e0; color: #7a5200; }
      ${A} .ma-rules-none { background: #ffe9e9; color: #b42318; }
      ${A} .ma-rules-unknown { background: #f1f2f5; color: var(--ma-muted); }
      ${A} .ma-rules:focus-visible { box-shadow: 0 0 0 2px #c7d2fe; }
      ${A} .ma-rules-pop {
        position: absolute;
        top: calc(100% + 8px);
        left: 0;
        z-index: 40;
        display: none;
        width: 310px;
        max-width: 72vw;
        padding: 10px 12px;
        border-radius: 12px;
        background: #111827;
        color: #e5e7eb;
        box-shadow: 0 12px 32px rgba(17, 24, 39, 0.3);
        font-weight: 500;
        text-align: left;
        white-space: normal;
        cursor: default;
      }
      ${A} .ma-rules-pop::before {
        content: "";
        position: absolute;
        top: -5px;
        left: 14px;
        width: 10px;
        height: 10px;
        background: #111827;
        transform: rotate(45deg);
      }
      /* A bridge over the gap, so the pointer can reach the card. */
      ${A} .ma-rules-pop::after {
        content: "";
        position: absolute;
        top: -10px;
        right: 0;
        left: 0;
        height: 10px;
      }
      ${A} .ma-rules:hover .ma-rules-pop,
      ${A} .ma-rules:focus .ma-rules-pop { display: block; }
      ${A} .ma-rules-title {
        display: block;
        margin-bottom: 6px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: #9ca3af;
      }
      ${A} .ma-rules-item { display: block; padding: 7px 0; border-top: 1px solid #1f2937; }
      ${A} .ma-rules-title + .ma-rules-item { padding-top: 0; border-top: 0; }
      ${A} .ma-rules-item:last-child { padding-bottom: 0; }
      ${A} .ma-rules-name { display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600; color: #ffffff; }
      ${A} .ma-rules-dot { flex: 0 0 auto; width: 7px; height: 7px; border-radius: 50%; background: #a3e635; }
      ${A} .ma-rules-item.is-off .ma-rules-dot { background: #6b7280; }
      ${A} .ma-rules-item.is-off .ma-rules-name { color: #9ca3af; }
      ${A} .ma-rules-name em {
        margin-left: auto;
        font-size: 10px;
        font-style: normal;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #9ca3af;
      }
      ${A} .ma-rules-item small { display: block; margin: 2px 0 0 14px; font-size: 11px; line-height: 1.45; color: #d1d5db; }
      ${A} .ma-rules-item small + small { color: #9ca3af; }
      ${A} .ma-rules-empty { font-size: 12px; color: #e5e7eb; }

      /* ---- reports: groups ---- */
      ${A} .ma-grp-by { display: flex; flex-direction: column; gap: 8px; margin: 2px 0 6px; }
      ${A} .ma-grp-by > span {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--ma-faint);
      }
      ${A} .ma-grp-pills { display: flex; flex-wrap: wrap; gap: 6px; }
      ${A} button.ma-grp-pill {
        min-height: 0;
        height: 32px;
        padding: 0 13px;
        border: 1px solid #d9dce3;
        border-radius: 999px;
        background: #ffffff;
        color: var(--ma-ink);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      ${A} button.ma-grp-pill:hover { border-color: #b9bec9; background: #fafafa; color: var(--ma-ink); }
      ${A} button.ma-grp-pill.is-on { border-color: #111827; background: #111827; color: var(--ma-lime); }
      ${A} .ma-grp-hint { margin: 0 0 14px; font-size: 12px; color: var(--ma-muted); }
      ${A} .ma-grp-head,
      ${A} .ma-grp-row,
      ${A} .ma-grp-total,
      ${A} .ma-grp-member {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 74px 88px 84px 92px 24px;
        align-items: center;
        column-gap: 10px;
      }
      ${A} .ma-grp-head { padding: 0 12px 6px; }
      ${A} button.ma-grp-sort {
        justify-self: end;
        min-height: 0;
        height: auto;
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--ma-faint);
        font-size: 11px;
        font-weight: 500;
        text-align: right;
        cursor: pointer;
      }
      ${A} button.ma-grp-sort:first-child { justify-self: start; text-align: left; }
      ${A} button.ma-grp-sort:hover { background: transparent; color: var(--ma-ink); }
      ${A} button.ma-grp-sort.is-on { color: var(--ma-ink); font-weight: 700; }
      ${A} .ma-grp-sort em { margin-left: 3px; font-style: normal; }
      ${A} .ma-grp-row {
        margin: 0 0 6px;
        padding: 11px 12px;
        border: 1px solid var(--ma-line);
        border-radius: 14px;
        background: #ffffff;
        cursor: pointer;
        outline: none;
      }
      ${A} .ma-grp-row:hover { border-color: #cfd3db; }
      ${A} .ma-grp-row:focus-visible { box-shadow: 0 0 0 2px #c7f08f; }
      ${A} .ma-grp-row.is-open {
        margin-bottom: 0;
        border-color: #111827;
        border-radius: 14px 14px 0 0;
      }
      ${A} .ma-grp-row.is-tail { border-color: transparent; background: var(--ma-soft); }
      ${A} .ma-grp-row.is-tail.is-open { border-color: #111827; }
      ${A} .ma-grp-row.is-tail .ma-grp-name b { color: var(--ma-muted); }
      ${A} .ma-grp-name { min-width: 0; }
      ${A} .ma-grp-name b {
        display: block;
        overflow: hidden;
        font-size: 13px;
        font-weight: 700;
        color: var(--ma-ink);
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      ${A} .ma-grp-bar { display: block; height: 5px; margin: 6px 0 3px; overflow: hidden; border-radius: 999px; background: #eef0f3; }
      ${A} .ma-grp-bar i { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, #bef264, #65a30d); }
      ${A} .ma-grp-name small { font-size: 11px; color: var(--ma-faint); font-variant-numeric: tabular-nums; }
      ${A} .ma-grp-accts { text-align: right; }
      ${A} .ma-grp-accts b {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 14px;
        font-weight: 700;
        color: var(--ma-ink);
        font-variant-numeric: tabular-nums;
      }
      ${A} .ma-grp-accts small { display: block; font-size: 11px; color: var(--ma-faint); }
      ${A} .ma-grp-dot {
        flex: 0 0 auto;
        display: inline-block;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #65a30d;
        box-shadow: 0 0 0 3px #e4f7cc;
      }
      ${A} .ma-grp-dot.is-off { background: #c4c8d0; box-shadow: none; }
      ${A} .ma-grp-chev { display: inline-flex; justify-content: center; color: var(--ma-faint); transition: transform 0.15s ease; }
      ${A} .ma-grp-chev .ma-ico { width: 16px; height: 16px; }
      ${A} .ma-grp-row:hover .ma-grp-chev { color: var(--ma-ink); }
      ${A} .ma-grp-row.is-open .ma-grp-chev { color: var(--ma-ink); transform: rotate(180deg); }
      ${A} .ma-grp-members {
        margin: 0 0 8px;
        padding: 4px 0;
        border: 1px solid #111827;
        border-top: 0;
        border-radius: 0 0 14px 14px;
        background: var(--ma-soft);
      }
      ${A} .ma-grp-member { padding: 8px 12px; }
      ${A} .ma-grp-member + .ma-grp-member { border-top: 1px solid #e7e9ee; }
      ${A} .ma-grp-who { display: flex; align-items: center; gap: 9px; min-width: 0; }
      ${A} .ma-grp-who .ma-rep-acct { min-width: 0; }
      ${A} .ma-grp-who .ma-rep-acct > b { font-size: 12px; }
      ${A} .ma-grp-who .ma-rep-acct > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      ${A} .ma-grp-member.is-idle .ma-rep-acct b { color: var(--ma-muted); font-weight: 500; }
      ${A} .ma-grp-state { font-size: 11px; font-weight: 600; text-align: right; color: #4d7c0f; }
      ${A} .ma-grp-member.is-idle .ma-grp-state { font-weight: 500; color: var(--ma-faint); }
      ${A} .ma-grp-member .ma-rep-num b { font-size: 12px; }
      ${A} .ma-grp-open {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: 8px;
        color: var(--ma-muted);
        text-decoration: none;
      }
      ${A} .ma-grp-open:hover { background: var(--ma-lime); color: #14280a; }
      ${A} .ma-grp-open .ma-ico { width: 14px; height: 14px; }
      ${A} .ma-grp-total { margin-top: 4px; padding: 12px; border-radius: 14px; background: #111827; }
      ${A} .ma-grp-total .ma-grp-name b { color: #ffffff; }
      ${A} .ma-grp-total .ma-grp-name small,
      ${A} .ma-grp-total .ma-grp-accts small,
      ${A} .ma-grp-total .ma-rep-num small { color: #9ca3af; }
      ${A} .ma-grp-total .ma-grp-accts b,
      ${A} .ma-grp-total .ma-rep-num b { color: #ffffff; }
      ${A} .ma-grp-total .is-spend b { color: var(--ma-lime); }
      ${A} .ma-grp-total .ma-grp-dot { box-shadow: 0 0 0 3px #1f3a0c; }
      ${A} .ma-grp-note { margin: 10px 2px 0; font-size: 11px; color: var(--ma-faint); }
      ${A} .ma-grp-loading { padding: 30px 12px; font-size: 12px; text-align: center; color: var(--ma-muted); }
      ${A} .ma-grp-progress {
        display: block;
        max-width: 280px;
        height: 6px;
        margin: 0 auto 10px;
        overflow: hidden;
        border-radius: 999px;
        background: #eef0f3;
      }
      ${A} .ma-grp-progress i { display: block; height: 100%; background: linear-gradient(90deg, #bef264, #65a30d); transition: width 0.2s ease; }
    `;
}
