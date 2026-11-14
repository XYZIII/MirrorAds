import { APP_ID } from "../app/constants.mjs";
import { t } from "./i18n.mjs";

const WIDTH_KEY = "mirrorads.panel.width.v1";
const MODE_KEY = "mirrorads.panel.mode.v1";
const STYLE_ID = "mirrorads-page-dock";
const PUSHED = "mirrorads-pushed";
const RESIZING = "mirrorads-resizing";
const CONTAIN = "mirrorads-contain";

export const PANEL_WIDTH = Object.freeze({
  min: 540,
  standard: 700,
  max: 1200,
});
/** Ads Manager is never squeezed below this; on a small screen the panel overlays it. */
export const PAGE_MIN_WIDTH = 480;

/** The panel width that fits this viewport and leaves Ads Manager its room. */
export function clampPanelWidth(width, viewport) {
  const room = Math.max(PANEL_WIDTH.min, Number(viewport) - PAGE_MIN_WIDTH);
  const upper = Math.min(PANEL_WIDTH.max, room);
  const value = Number(width) > 0 ? Number(width) : PANEL_WIDTH.standard;
  return Math.round(Math.min(upper, Math.max(PANEL_WIDTH.min, value)));
}

/** True when Ads Manager should move aside for the panel. */
export function shouldPush({ mode, collapsed, viewport, width }) {
  return (
    mode !== "overlay" &&
    !collapsed &&
    Number(viewport) - Number(width) >= PAGE_MIN_WIDTH
  );
}

/**
 * The page's body is narrowed by the panel's width. On an app-like page that
 * does not scroll as a whole (Ads Manager), the body also becomes the
 * containing block of the page's own fixed elements — top bar, menus,
 * dialogs — at least a screen tall, so they stay in the narrowed area too.
 * The panel itself lives outside the body.
 */
export function dockStyles() {
  return `
html.${PUSHED} > body {
  width: calc(100% - var(--mirrorads-dock-w, ${PANEL_WIDTH.standard}px)) !important;
  max-width: calc(100% - var(--mirrorads-dock-w, ${PANEL_WIDTH.standard}px)) !important;
  min-width: 0 !important;
  margin-right: 0 !important;
}
html.${PUSHED}.${CONTAIN} > body {
  min-height: 100vh !important;
  transform: translateZ(0) !important;
}
html.${RESIZING}, html.${RESIZING} * {
  cursor: col-resize !important;
  user-select: none !important;
}
`;
}

/**
 * Places the MirrorAds panel next to Ads Manager instead of over it, and lets
 * the user drag the panel's left edge to change its width. "Overlay" brings
 * back the old behaviour; both choices are remembered in this browser.
 */
export class PageDock {
  constructor({ root, doc, win, storage } = {}) {
    this.root = root;
    this.doc = doc || root?.ownerDocument || globalThis.document;
    this.win = win || this.doc?.defaultView || globalThis.window;
    this.storage = storage === undefined ? this.win?.localStorage : storage;
    this.mode = this.read(MODE_KEY) === "overlay" ? "overlay" : "push";
    this.width = Number(this.read(WIDTH_KEY)) || PANEL_WIDTH.standard;
    this.pushed = false;
    this.appliedWidth = 0;
    this.resizing = false;
    this.notifying = false;
    this.frame = 0;
    this.onWindowResize = () => {
      if (!this.notifying) this.apply();
    };
  }

  read(key) {
    try {
      return this.storage?.getItem(key) ?? null;
    } catch (_error) {
      return null;
    }
  }

  write(key, value) {
    try {
      this.storage?.setItem(key, String(value));
    } catch (_error) {
      // Not remembered in this browser; it still works for this session.
    }
  }

  attach() {
    const { doc, root } = this;
    if (!root || !doc) return this;
    if (!doc.getElementById(STYLE_ID)) {
      const style = doc.createElement("style");
      style.id = STYLE_ID;
      style.textContent = dockStyles();
      (doc.head || doc.documentElement).appendChild(style);
    }
    this.handle = doc.createElement("div");
    this.handle.className = "ma-resize";
    this.handle.setAttribute("role", "separator");
    this.handle.setAttribute("aria-orientation", "vertical");
    this.handle.title = t("dock.resize");
    this.handle.addEventListener("pointerdown", (event) =>
      this.startResize(event),
    );
    this.handle.addEventListener("dblclick", () =>
      this.setWidth(PANEL_WIDTH.standard),
    );
    root.appendChild(this.handle);

    const menu = root.querySelector(`#${APP_ID}-service-menu`);
    if (menu) {
      this.toggle = doc.createElement("button");
      this.toggle.type = "button";
      this.toggle.className = "ma-menu-check";
      this.toggle.dataset.alwaysEnabled = "";
      this.toggle.setAttribute("role", "menuitemcheckbox");
      this.toggle.addEventListener("click", () =>
        this.setMode(this.mode === "push" ? "overlay" : "push"),
      );
      menu.insertBefore(this.toggle, menu.firstChild);
    }

    // Collapsing the panel gives Ads Manager its full width back.
    if (typeof this.win?.MutationObserver === "function") {
      this.observer = new this.win.MutationObserver(() => this.apply());
      this.observer.observe(root, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }
    this.win?.addEventListener?.("resize", this.onWindowResize);
    this.apply();
    return this;
  }

  setMode(mode) {
    this.mode = mode === "overlay" ? "overlay" : "push";
    this.write(MODE_KEY, this.mode);
    this.apply();
  }

  setWidth(width) {
    this.width = clampPanelWidth(width, this.win?.innerWidth);
    this.write(WIDTH_KEY, this.width);
    this.apply();
  }

  apply() {
    const { root, doc, win } = this;
    if (!root || !doc || !root.isConnected) return;
    const viewport = Number(win?.innerWidth) || PANEL_WIDTH.standard * 2;
    const width = clampPanelWidth(this.width, viewport);
    root.style.setProperty("--ma-panel-w", `${width}px`);
    const push = shouldPush({
      mode: this.mode,
      collapsed: root.classList.contains("ma-min"),
      viewport,
      width,
    });
    const html = doc.documentElement;
    if (push) html.style.setProperty("--mirrorads-dock-w", `${width}px`);
    else html.style.removeProperty("--mirrorads-dock-w");
    html.classList.toggle(PUSHED, push);
    // A page that scrolls as a whole would carry its fixed bars away with
    // the scroll if they were contained, so only the width changes there.
    html.classList.toggle(CONTAIN, push && !this.documentScrolls());
    const changed =
      push !== this.pushed || (push && width !== this.appliedWidth);
    this.pushed = push;
    this.appliedWidth = push ? width : 0;
    this.renderToggle();
    // Ads Manager sizes some parts from window events; tell it once the
    // layout settles, not on every step of a drag.
    if (changed && !this.resizing) this.notify();
  }

  documentScrolls() {
    const scroller = this.doc.scrollingElement || this.doc.documentElement;
    return (
      Number(scroller?.scrollHeight) - Number(this.win?.innerHeight || 0) > 4
    );
  }

  renderToggle() {
    if (!this.toggle) return;
    const on = this.mode === "push";
    this.toggle.setAttribute("aria-checked", on ? "true" : "false");
    this.toggle.textContent = t("dock.toggle");
    this.toggle.title = t(on ? "dock.onHint" : "dock.offHint");
  }

  startResize(event) {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault?.();
    const handle = event.currentTarget || this.handle;
    try {
      handle.setPointerCapture?.(event.pointerId);
    } catch (_error) {
      // Capture is a nicety; the drag works without it while over the handle.
    }
    this.resizing = true;
    this.doc.documentElement.classList.add(RESIZING);
    const move = (next) => {
      this.width = clampPanelWidth(
        this.win.innerWidth - next.clientX,
        this.win.innerWidth,
      );
      this.schedule();
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      this.doc.documentElement.classList.remove(RESIZING);
      this.resizing = false;
      this.write(WIDTH_KEY, this.width);
      this.appliedWidth = -1;
      this.apply();
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }

  schedule() {
    if (this.frame) return;
    const run = () => {
      this.frame = 0;
      this.apply();
    };
    this.frame =
      typeof this.win?.requestAnimationFrame === "function"
        ? this.win.requestAnimationFrame(run)
        : (setTimeout(run, 16), 1);
  }

  notify() {
    this.notifying = true;
    try {
      this.win?.dispatchEvent?.(new this.win.Event("resize"));
    } catch (_error) {
      // A page without window events has nothing to recompute.
    } finally {
      this.notifying = false;
    }
  }

  /** Gives the page its full width back and removes everything this added. */
  release() {
    const { doc, win } = this;
    if (this.frame && typeof win?.cancelAnimationFrame === "function") {
      win.cancelAnimationFrame(this.frame);
    }
    this.frame = 0;
    this.observer?.disconnect();
    this.observer = null;
    win?.removeEventListener?.("resize", this.onWindowResize);
    this.handle?.remove();
    this.toggle?.remove();
    if (!doc) return;
    const html = doc.documentElement;
    const wasPushed = html.classList.contains(PUSHED);
    html.classList.remove(PUSHED, RESIZING, CONTAIN);
    html.style.removeProperty("--mirrorads-dock-w");
    doc.getElementById(STYLE_ID)?.remove();
    this.pushed = false;
    if (wasPushed) this.notify();
  }
}
