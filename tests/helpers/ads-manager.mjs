import { webcrypto } from "node:crypto";
import { JSDOM, VirtualConsole } from "jsdom";

/** The bookmark's code, from an install page or the cabinet's loader.txt. */
export function bookmarkFrom(html) {
  return html
    .match(/id="bookmark" href="([^"]+)"/)[1]
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * An Ads Manager tab in which a bookmark is clicked. Like the real page it
 * refuses the page's own fetch (the blank frame's fetch reaches Facebook),
 * keeps localStorage between launches through `storage`, and runs the
 * scripts the loader and the gate start from blob: addresses.
 */
export async function clickBookmark({
  facebook,
  bookmark,
  storage = {},
  busy = false,
  cUser = "100012345678",
  interact = null,
}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => errors.push(error));
  const dom = new JSDOM(
    "<!doctype html><html><head></head><body></body></html>",
    {
      url: "https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=101",
      runScripts: "outside-only",
      virtualConsole,
    },
  );
  const { window } = dom;
  const { document } = window;
  for (const [key, value] of Object.entries(storage)) {
    window.localStorage.setItem(key, value);
  }
  if (cUser) document.cookie = `c_user=${cUser}`;
  const alerts = [];
  const opened = [];
  const executed = [];
  const blobs = new Map();
  Object.defineProperty(window, "crypto", {
    value: webcrypto,
    configurable: true,
  });
  window.__accessToken = "TOKEN";
  if (busy) window.MirrorAds = { state: { busy: true } };
  window.alert = (message) => alerts.push(String(message));
  window.open = (url) => {
    opened.push(url);
    return null;
  };
  window.console = { log() {}, info() {}, warn() {}, error() {}, debug() {} };
  window.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  // Waits are cut short; time-outs stay real but never hold the tests.
  window.setTimeout = (callback, ms = 0, ...args) => {
    const long = ms >= 10000;
    const timer = setTimeout(callback, long ? ms : 0, ...args);
    if (long) timer.unref?.();
    return timer;
  };
  window.Blob = class {
    constructor(parts) {
      this.text = parts.join("");
    }
  };
  window.URL.createObjectURL = (blob) => {
    const url = `blob:https://adsmanager.facebook.com/${blobs.size + 1}`;
    blobs.set(url, blob.text);
    return url;
  };
  window.URL.revokeObjectURL = () => {};
  const root = document.documentElement;
  const appendToRoot = root.appendChild.bind(root);
  root.appendChild = (node) => {
    const result = appendToRoot(node);
    if (node.tagName === "IFRAME" && node.contentWindow) {
      node.contentWindow.fetch = facebook.fetch;
    }
    return result;
  };
  const head = document.head;
  const appendToHead = head.appendChild.bind(head);
  head.appendChild = (node) => {
    const code =
      node.tagName === "SCRIPT" && blobs.get(node.getAttribute("src"));
    if (!code) return appendToHead(node);
    setTimeout(() => {
      executed.push(code);
      try {
        window.eval(code);
        node.onload?.();
      } catch (error) {
        errors.push(error);
        node.onerror?.();
      }
    }, 0);
    return node;
  };

  window.eval(decodeURIComponent(bookmark.slice("javascript:".length)));
  await window.__MirrorAdsLoader?.done;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const dialog = () =>
    document.getElementById("mirrorads-gate")?.shadowRoot || null;
  /** Until the gate is done — or, with `stopOnDialog`, waits for the user. */
  const settle = async (stopOnDialog) => {
    for (let i = 0; i < 1500; i += 1) {
      const gate = window.__MirrorAdsGate;
      if (gate && !gate.busy) return;
      if (!gate && !executed.length && i > 20) return;
      if (stopOnDialog && dialog()) return;
      await sleep(2);
    }
  };
  await settle(true);
  if (interact) {
    await interact({ dialog, window, opened });
    await settle(false);
  }
  await window.__MirrorAdsGate?.refresh;
  const saved = {};
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    saved[key] = window.localStorage.getItem(key);
  }
  return {
    window,
    alerts,
    opened,
    errors,
    executed,
    ran: Array.from(window.__ran || []),
    loader: window.__MirrorAdsLoader,
    gate: window.__MirrorAdsGate,
    license: window.__MirrorAdsLicense,
    dialog: dialog(),
    storage: saved,
  };
}
