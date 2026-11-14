const MARK = `<svg class="mark" viewBox="0 0 96 96" aria-hidden="true"><rect x="4" y="4" width="88" height="88" rx="26" fill="#b4f461"/><path d="M24 68V30l22 20v18z" fill="#14280a"/><path d="M72 68V30L50 50v18z" fill="#14280a" fill-opacity="0.38"/></svg>`;

export const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const CSS = `
:root { --ink:#111827; --muted:#6b7280; --faint:#9ca3af; --line:#e5e7eb; --soft:#f6f7f9; --lime:#b4f461; --deep:#2f7d1b; --red:#b91c1c; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--soft); color: var(--ink); font: 15px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { width: min(var(--w, 760px), calc(100vw - 32px)); margin: 0 auto; padding: 40px 0 72px; }
a { color: var(--deep); }
.top { display: flex; align-items: center; gap: 12px; font-size: 20px; font-weight: 800; letter-spacing: -0.02em; }
.top a { color: inherit; text-decoration: none; }
.top nav { margin-left: auto; display: flex; gap: 16px; font-size: 14px; font-weight: 600; }
.top nav a { color: var(--muted); }
.mark { width: 36px; height: 36px; }
h1 { margin: 32px 0 8px; font-size: clamp(26px, 4vw, 36px); line-height: 1.15; letter-spacing: -0.03em; }
h2 { margin: 0 0 12px; font-size: 17px; }
.lead { margin: 0 0 24px; color: var(--muted); }
.card { padding: 22px; border: 1px solid var(--line); border-radius: 20px; background: #fff; box-shadow: 0 14px 40px rgba(17,24,39,.05); }
.card + .card { margin-top: 16px; }
label { display: block; margin: 0 0 14px; font-size: 13px; font-weight: 600; }
label span { font-weight: 400; color: var(--faint); }
input, select, textarea { accent-color: var(--deep); display: block; width: 100%; margin-top: 6px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; background: #fff; color: var(--ink); font: inherit; }
input:focus, select:focus, textarea:focus { outline: 2px solid var(--lime); border-color: var(--deep); }
button, .button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 42px; padding: 0 18px; border: 1px solid var(--line); border-radius: 999px; background: #fff; color: var(--ink); font-family: inherit; font-size: 14px; font-weight: 600; line-height: 1; text-decoration: none; cursor: pointer; }
button:hover, .button:hover { background: var(--soft); }
button.primary, .button.primary { border-color: transparent; background: var(--lime); }
button.primary:hover, .button.primary:hover { background: #a3ea4b; }
button:disabled { opacity: .55; cursor: default; }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.grow { flex: 1 1 200px; }
.muted { color: var(--muted); }
.small { font-size: 13px; }
.error { color: var(--red); font-size: 14px; }
.ok { color: var(--deep); }
.plans { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 16px; }
.plan { position: relative; padding: 18px; border: 2px solid var(--line); border-radius: 18px; background: #fff; cursor: pointer; }
.plan b { display: block; font-size: 15px; }
.plan .price { margin-top: 8px; font-size: 26px; font-weight: 800; letter-spacing: -0.02em; }
.plan .price small { font-size: 13px; font-weight: 500; color: var(--muted); }
.plan.on { border-color: var(--deep); box-shadow: 0 0 0 3px rgba(180,244,97,.6); }
.plan input { position: absolute; opacity: 0; pointer-events: none; }
.total { margin: 6px 0 16px; font-size: 18px; }
.total s { margin-left: 8px; color: var(--faint); font-size: 15px; }
.key { padding: 12px 14px; border-radius: 12px; background: var(--soft); font: 600 15px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
.bookmark { display: inline-flex; align-items: center; min-height: 52px; padding: 0 24px; border-radius: 999px; background: var(--lime); color: var(--ink); font-weight: 800; font-size: 16px; text-decoration: none; cursor: grab; box-shadow: 0 10px 24px rgba(127,201,46,.35); }
ol.steps { margin: 16px 0 0; padding-left: 20px; color: var(--muted); font-size: 14px; }
ol.steps li { margin: 6px 0; }
.status { display: inline-block; padding: 3px 10px; border-radius: 999px; background: var(--soft); color: var(--muted); font-size: 12px; font-weight: 600; }
.status.good { background: #dcf7c0; color: #1f6a10; }
.status.bad { background: #fee2e2; color: var(--red); }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); color: var(--muted); font-weight: 600; white-space: nowrap; }
td { padding: 8px 10px; border-bottom: 1px solid #f0f1f3; vertical-align: top; }
td button { min-height: 30px; padding: 0 10px; font-size: 12px; }
.tabs { display: flex; flex-wrap: wrap; gap: 6px; margin: 24px 0 16px; }
.tabs button.on { background: var(--ink); color: #fff; border-color: var(--ink); }
.warn { margin: 16px 0 0; padding: 12px 16px; border-radius: 14px; background: #fff7e0; color: #92590a; font-size: 14px; }
.hidden { display: none !important; }
`;

/** A full page in the MirrorAds style. */
export function page({ title, body, script = "", width = 760, nav = true }) {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex,nofollow" />
<title>${escapeHtml(title)}</title>
<style>${CSS}</style>
</head>
<body style="--w:${width}px">
<main>
<div class="top"><a href="/">${MARK}</a><a href="/">MirrorAds</a>${
    nav
      ? `<nav><a href="/buy">Купить</a><a href="/cabinet">Кабинет</a></nav>`
      : ""
  }</div>
${body}
</main>
${script ? `<script>${script}</script>` : ""}
</body>
</html>`;
}

export function htmlResponse(html, status = 200, headers = {}) {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
      "referrer-policy": "no-referrer",
      ...headers,
    },
  });
}

/** Client-side helpers every page script starts with. */
export const CLIENT_HELPERS = `
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const usd = (cents) => { const v = Math.round(Number(cents) || 0) / 100; return "$" + (Number.isInteger(v) ? v : v.toFixed(2)); };
const day = (ms) => { if (!ms) return ""; const d = new Date(Number(ms)); return String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + d.getFullYear(); };
async function api(path, body, extra) {
  const response = await fetch(path, { method: body ? "POST" : "GET", headers: Object.assign({ "content-type": "application/json" }, extra || {}), body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await response.json(); } catch (e) { json = null; }
  if (!response.ok || (json && json.error)) throw new Error((json && (json.message || json.error)) || ("HTTP " + response.status));
  return json;
}
async function copyText(text, button) {
  try { await navigator.clipboard.writeText(text); } catch (e) { const area = document.createElement("textarea"); area.value = text; document.body.appendChild(area); area.select(); document.execCommand("copy"); area.remove(); }
  if (button) { const label = button.textContent; button.textContent = "Скопировано"; setTimeout(() => { button.textContent = label; }, 1500); }
}
`;
