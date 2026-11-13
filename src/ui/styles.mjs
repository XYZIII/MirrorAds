import { buildLayoutStyles } from "./styles-layout.mjs";
import {
  MEDIA_SLOT_STYLES,
  SOURCE_SWITCH_STYLES,
  buildStudioStyles,
} from "./styles-studio.mjs";

export function buildMirrorAdsStyles(appId) {
  return `
      #${appId} {
        position: fixed;
        inset: 18px;
        z-index: 2147483647;
        pointer-events: none;
        font-family: "Segoe UI", "Trebuchet MS", sans-serif;
      }
      #${appId} * { box-sizing: border-box; }
      #${appId} .ma-shell {
        position: relative;
        max-width: 580px;
        margin: 0 auto;
        background: #f3f3f6;
        color: #111827;
        border: 2px solid #6dbb2a;
        border-radius: 10px;
        box-shadow: 0 12px 40px rgba(17, 24, 39, 0.224);
        padding: 18px;
        pointer-events: auto;
        overflow: auto;
        max-height: calc(100vh - 36px);
      }
      #${appId} .ma-head {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        justify-content: space-between;
        margin-bottom: 14px;
      }
      #${appId} .ma-title-row {
        display: inline-flex;
        align-items: center;
        gap: 10px;
      }
      #${appId} .ma-mark {
        width: 34px;
        height: 34px;
        display: block;
        flex: 0 0 auto;
        filter: drop-shadow(0 6px 14px rgba(109, 187, 42, 0.18));
      }
      #${appId} .ma-head h2 {
        margin: 0;
        color: #2f7d1b;
        font-size: 22px;
        letter-spacing: 0.02em;
      }
      #${appId} .ma-build {
        font-size: 11px;
        font-weight: 400;
        color: #676b83;
        letter-spacing: 0.04em;
      }
      #${appId} .ma-head-actions {
        display: flex;
        gap: 8px;
        align-items: flex-start;
        position: relative;
        flex-shrink: 0;
      }
      #${appId} .ma-actions,
      #${appId} .ma-row,
      #${appId} .ma-log-head {
        display: flex;
        gap: 10px;
        align-items: center;
        justify-content: space-between;
      }
      #${appId} .ma-loading-overlay {
        position: absolute;
        inset: 0;
        border-radius: 10px;
        background: rgba(247, 247, 247, 0.92);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10;
      }
      #${appId} .ma-spinner {
        width: 48px;
        height: 48px;
        border: 4px solid rgba(109, 187, 42, 0.2);
        border-top-color: #6dbb2a;
        border-radius: 50%;
        animation: ma-spin 0.8s linear infinite;
      }
      @keyframes ma-spin { to { transform: rotate(360deg); } }
      #${appId} .ma-service-button {
        width: 30px !important;
        height: 30px;
        padding: 0 !important;
        border-radius: 50% !important;
        background: #e5e6eb !important;
        border: 1px solid #d3d4dd !important;
        color: #1a1c28 !important;
        font-size: 17px;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        font-weight: 400 !important;
      }
      #${appId} .ma-service-button:hover,
      #${appId} .ma-service-button.ma-active {
        background: #d3d4dd !important;
        color: #111827 !important;
      }
      #${appId} .ma-service-menu {
        position: absolute;
        top: 36px;
        right: 38px;
        min-width: 176px;
        padding: 6px;
        border-radius: 8px;
        border: 1px solid #d3d4dd;
        background: #eeeff2;
        box-shadow: 0 10px 28px rgba(17, 24, 39, 0.16);
        z-index: 20;
      }
      #${appId} .ma-service-menu button {
        width: 100% !important;
        justify-content: flex-start;
        background: transparent !important;
        color: #111827 !important;
        border: 0 !important;
        padding: 9px 10px !important;
        text-align: left;
        font-weight: 600 !important;
      }
      #${appId} .ma-service-menu button:hover:not(:disabled) {
        background: rgba(109, 187, 42, 0.12) !important;
        color: #2f7d1b !important;
      }
      #${appId} .ma-version-note {
        max-width: 280px;
        padding: 6px 10px 9px;
        color: #2f313e;
        font-size: 12px;
        line-height: 1.4;
      }
      #${appId} .ma-tab-panel { margin-top: 14px; }
      #${appId} .ma-hidden { display: none !important; }
      #${appId} .ma-mass-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-height: 320px;
        overflow: auto;
        margin-top: 12px;
        padding-right: 4px;
      }
      #${appId} .ma-mass-row {
        display: grid;
        grid-template-columns: minmax(150px, 1fr) minmax(150px, 1fr) auto;
        align-items: center;
        gap: 8px;
        background: #f1f2f4;
        border: 1px solid #e1e2e8;
        border-radius: 6px;
        padding: 6px 9px;
      }
      #${appId} .ma-mass-row.ma-mass-off { opacity: 0.55; }
      #${appId} .ma-mass-pick {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
      }
      #${appId} .ma-mass-pick input { width: auto; }
      #${appId} .ma-mass-id {
        display: block;
        color: #8b8f9e;
        font-size: 11px;
      }
      #${appId} .ma-mass-row select { padding: 6px 8px; font-size: 12px; }
      #${appId} .ma-mass-progress {
        display: flex;
        flex-direction: column;
        gap: 5px;
        margin-top: 12px;
      }
      #${appId} .ma-mass-result {
        display: grid;
        grid-template-columns: minmax(120px, 1fr) auto;
        gap: 4px 10px;
        border-left: 3px solid #d3d4dd;
        background: #f1f2f4;
        border-radius: 4px;
        padding: 6px 9px;
        font-size: 12px;
      }
      #${appId} .ma-mass-result em {
        grid-column: 1 / -1;
        color: #5d2e2e;
        font-style: normal;
        font-size: 11px;
      }
      #${appId} .ma-mass-success { border-left-color: #75c378; }
      #${appId} .ma-mass-failed { border-left-color: #901b1b; }
      #${appId} .ma-mass-skipped { border-left-color: #bc7000; }
      #${appId} .ma-mass-running { border-left-color: #095c9f; }
      #${appId} .ma-badge-warn { color: #bc7000; border-color: #bc7000; }
      #${appId} .ma-card > .ma-actions {
        margin-top: 18px;
        justify-content: flex-start;
        flex-wrap: wrap;
      }
      #${appId} .ma-operation-report,
      #${appId} .ma-logs { margin-top: 14px; }
      #${appId} .ma-operation-report h3 {
        color: #2f7d1b;
        font-size: 16px;
        margin: 0 0 10px;
      }
      #${appId} .ma-operation-report p { margin: 12px 0; }
      #${appId} .ma-operation-report summary { cursor: pointer; }
      #${appId} .ma-card,
      #${appId} .ma-logs {
        background: #eeeff2;
        border: 1px solid #dcdde5;
        border-radius: 8px;
        padding: 14px;
      }
      #${appId} button,
      #${appId} select,
      #${appId} input {
        width: 100%;
        border-radius: 6px;
        border: 1px solid #d3d4dd;
        background: #e9eaef;
        color: #111827;
        padding: 10px 12px;
        font-size: 14px;
      }
      #${appId} button {
        width: auto;
        cursor: pointer;
        background: #b4f461;
        color: #f7f7f9;
        border: none;
        font-weight: 700;
      }
      #${appId} button:hover:not(:disabled) {
        background: #a3ea4b;
      }
      #${appId} button.ma-secondary {
        background: #e9eaef;
        color: #111827;
        border: 1px solid #d9dae2;
      }
      #${appId} button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      #${appId} .ma-status,
      #${appId} .ma-note,
      #${appId} .ma-empty,
      #${appId} .ma-creative-file,
      #${appId} .ma-summary-grid span {
        color: #3f4353;
        font-size: 13px;
      }
      #${appId} .ma-clone-summary {
        margin: 8px 0 14px;
      }
      #${appId} .ma-clone-summary strong {
        color: #111827;
      }
      #${appId} .ma-warning {
        color: #96640b;
        margin-bottom: 8px;
      }
      #${appId} .ma-inline-loading {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 72px;
        padding: 14px 16px;
        margin: 8px 0 14px;
        border: 1px solid #e2e2e6;
        border-radius: 8px;
        background: #ececf1;
        color: #1b1f2d;
        font-size: 13px;
      }
      #${appId} .ma-inline-spinner {
        width: 18px;
        height: 18px;
        border: 2px solid rgba(109, 187, 42, 0.25);
        border-top-color: #6dbb2a;
        border-radius: 50%;
        animation: ma-spin 0.8s linear infinite;
        flex-shrink: 0;
      }
      #${appId} .ma-field {
        display: grid;
        gap: 6px;
        margin-bottom: 10px;
      }
      #${appId} .ma-inline {
        flex: 1;
        margin-bottom: 0;
      }
      #${appId} .ma-check {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        white-space: nowrap;
      }
      #${appId} .ma-check input {
        width: auto;
      }
      #${appId} .ma-compact {
        align-items: end;
      }
      #${appId} .ma-summary-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }
      #${appId} .ma-summary-grid > div:first-child { grid-column: 1 / -1; }
      #${appId} .ma-summary-grid div {
        background: #e9eaef;
        border-radius: 8px;
        padding: 10px;
        display: grid;
        gap: 6px;
      }
      #${appId} .ma-subtitle {
        font-size: 12px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: #2f7d1b;
        margin-bottom: 10px;
      }
      #${appId} .ma-mapping-block + .ma-mapping-block {
        margin-top: 14px;
      }
      #${appId} .ma-creative-row {
        display: grid;
        gap: 8px;
        padding: 10px;
        background: #e9eaef;
        border-radius: 8px;
      }
      #${appId} .ma-creative-row + .ma-creative-row {
        margin-top: 8px;
      }
      #${appId} .ma-creative-info {
        display: grid;
        gap: 4px;
      }
      #${appId} .ma-creative-name {
        display: flex;
        gap: 8px;
        align-items: center;
        font-weight: 600;
      }
      #${appId} .ma-file-trigger {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: fit-content;
        min-width: 104px;
        padding: 8px 12px;
        border-radius: 8px;
        border: 1px solid #d4d5d9;
        background: #f0f1f4;
        color: #111827;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
      }
      #${appId} .ma-file-trigger:hover {
        border-color: #6dbb2a;
      }
      #${appId} .ma-file-input {
        display: none;
      }
      #${appId} .ma-badge {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        padding: 2px 7px;
        border-radius: 4px;
        flex-shrink: 0;
      }
      #${appId} .ma-badge-image {
        background: rgba(10, 89, 217, 0.25);
        color: #022e60;
      }
      #${appId} .ma-badge-video {
        background: rgba(83, 150, 38, 0.25);
        color: #1a300c;
      }
      #${appId} .ma-log-summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        cursor: pointer;
      }
      #${appId} .ma-log-summary::-webkit-details-marker {
        display: none;
      }
      #${appId} .ma-log-summary::before {
        content: "▸";
        color: #2f7d1b;
        font-size: 13px;
        line-height: 1;
        transition: transform 0.16s ease;
      }
      #${appId} .ma-logs[open] .ma-log-summary::before {
        transform: rotate(90deg);
      }
      #${appId} .ma-log-summary span {
        margin-right: auto;
      }
      #${appId} .ma-log-download {
        flex-shrink: 0;
        padding: 6px 10px;
        font-size: 12px;
      }
      #${appId} .ma-log-area {
        width: 100%;
        height: 150px;
        margin-top: 10px;
        resize: vertical;
        background: #f7f7f9;
        color: #1a1c28;
        border: 1px solid #dcdde5;
        border-radius: 6px;
        padding: 8px;
        font-family: "Consolas", "Courier New", monospace;
        font-size: 11px;
        line-height: 1.4;
        white-space: pre;
        overflow: auto;
      }
      ${buildStudioStyles(appId)}
      ${SOURCE_SWITCH_STYLES}
      ${MEDIA_SLOT_STYLES}
      ${buildLayoutStyles(appId)}
    `;
}
