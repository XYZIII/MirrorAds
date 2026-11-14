import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { CHANGELOG } from "../src/app/changelog.mjs";
import { compareBuilds, isBuildVersion } from "../src/domain/build-version.mjs";
import {
  PAGE_MIN_WIDTH,
  PANEL_WIDTH,
  PageDock,
  clampPanelWidth,
  shouldPush,
} from "../src/ui/page-dock.mjs";
import {
  LicenseInfo,
  REMIND_DAYS,
  licenseNotice,
} from "../src/ui/license-info.mjs";
import {
  SEEN_KEY,
  WhatsNew,
  isReturningUser,
  launchPlan,
} from "../src/ui/whats-new.mjs";

const settle = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function page(width = 1600) {
  const browser = new JSDOM(
    `<!doctype html><html><head></head><body><div id="app">Ads Manager</div></body></html>`,
    { url: "https://adsmanager.facebook.com/adsmanager/manage/campaigns" },
  );
  const { window } = browser;
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    get: () => width,
  });
  const doc = window.document;
  const root = doc.createElement("div");
  root.id = "mirrorads-root";
  root.innerHTML = `<div class="ma-shell"><div class="ma-head"><div class="ma-build">build</div></div></div>
    <div id="mirrorads-root-service-menu" class="ma-menu"><button>Clear drafts</button><div class="ma-version-note"></div></div>`;
  doc.documentElement.appendChild(root);
  return {
    window,
    doc,
    root,
    resize(next) {
      width = next;
      window.dispatchEvent(new window.Event("resize"));
    },
    close: () => window.close(),
  };
}

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    data,
  };
}

test("build numbers are ordered by date, then by build", () => {
  assert.equal(isBuildVersion("151126b1"), true);
  assert.equal(isBuildVersion("__MIRRORADS_VERSION__"), false);
  assert.ok(compareBuilds("151126b1", "141126b13") > 0);
  assert.ok(compareBuilds("141126b13", "141126b9") > 0);
  assert.ok(compareBuilds("010127b1", "311226b40") > 0, "a new year wins");
  assert.equal(compareBuilds("141126b5", "141126b5"), 0);
});

test("the panel width fits the screen and leaves Ads Manager its room", () => {
  assert.equal(clampPanelWidth(undefined, 1920), PANEL_WIDTH.standard);
  assert.equal(clampPanelWidth(300, 1920), PANEL_WIDTH.min);
  assert.equal(clampPanelWidth(5000, 1920), PANEL_WIDTH.max);
  // A 1366 px laptop: the panel can grow until Ads Manager keeps 480 px.
  assert.equal(clampPanelWidth(1100, 1366), 1366 - PAGE_MIN_WIDTH);
  assert.equal(
    shouldPush({ mode: "push", collapsed: false, viewport: 1366, width: 700 }),
    true,
  );
  assert.equal(
    shouldPush({
      mode: "overlay",
      collapsed: false,
      viewport: 1920,
      width: 700,
    }),
    false,
  );
  assert.equal(
    shouldPush({ mode: "push", collapsed: true, viewport: 1920, width: 700 }),
    false,
  );
  // Too small a screen to share: the panel lies over the page.
  assert.equal(
    shouldPush({ mode: "push", collapsed: false, viewport: 900, width: 540 }),
    false,
  );
});

test("Ads Manager moves aside, comes back when the panel is collapsed or switched to overlay", async () => {
  const view = page(1600);
  const storage = memoryStorage();
  try {
    const resizes = [];
    view.window.addEventListener("resize", () =>
      resizes.push(view.window.innerWidth),
    );
    const dock = new PageDock({ root: view.root, storage }).attach();
    const html = view.doc.documentElement;
    assert.ok(html.classList.contains("mirrorads-pushed"));
    assert.equal(html.style.getPropertyValue("--mirrorads-dock-w"), "700px");
    assert.equal(view.root.style.getPropertyValue("--ma-panel-w"), "700px");
    assert.match(
      view.doc.getElementById("mirrorads-page-dock").textContent,
      /mirrorads-contain > body \{\s+min-height: 100vh !important;\s+transform: translateZ\(0\)/,
    );
    assert.ok(
      html.classList.contains("mirrorads-contain"),
      "a page that does not scroll keeps its fixed bars inside",
    );
    assert.equal(resizes.length, 1, "Ads Manager is told the layout changed");

    // The toggle sits first in the ⚙ menu and is never locked.
    const toggle = view.root.querySelector(
      "#mirrorads-root-service-menu",
    ).firstElementChild;
    assert.equal(toggle.getAttribute("aria-checked"), "true");
    assert.equal(toggle.dataset.alwaysEnabled, "");

    view.root.classList.add("ma-min");
    await settle();
    assert.equal(html.classList.contains("mirrorads-pushed"), false);
    view.root.classList.remove("ma-min");
    await settle();
    assert.ok(html.classList.contains("mirrorads-pushed"));

    toggle.click();
    assert.equal(html.classList.contains("mirrorads-pushed"), false);
    assert.equal(storage.getItem("mirrorads.panel.mode.v1"), "overlay");
    assert.equal(toggle.getAttribute("aria-checked"), "false");
    toggle.click();
    assert.ok(html.classList.contains("mirrorads-pushed"));

    // A narrower window shrinks the panel; a tiny one stops sharing.
    view.resize(1100);
    assert.equal(
      view.root.style.getPropertyValue("--ma-panel-w"),
      `${1100 - PAGE_MIN_WIDTH}px`,
    );
    view.resize(900);
    assert.equal(html.classList.contains("mirrorads-pushed"), false);
    view.resize(1600);
    assert.ok(html.classList.contains("mirrorads-pushed"));

    // A page that scrolls as a whole is only narrowed.
    Object.defineProperty(view.doc.documentElement, "scrollHeight", {
      configurable: true,
      get: () => 5000,
    });
    view.resize(1601);
    assert.ok(html.classList.contains("mirrorads-pushed"));
    assert.equal(html.classList.contains("mirrorads-contain"), false);

    dock.release();
    assert.equal(html.classList.contains("mirrorads-pushed"), false);
    assert.equal(html.classList.contains("mirrorads-contain"), false);
    assert.equal(view.doc.getElementById("mirrorads-page-dock"), null);
    assert.equal(view.root.querySelector(".ma-resize"), null);
    assert.equal(view.root.querySelector(".ma-menu-check"), null);
  } finally {
    view.close();
  }
});

test("dragging the left edge resizes the panel and is remembered", async () => {
  const view = page(1600);
  const storage = memoryStorage({ "mirrorads.panel.width.v1": "640" });
  try {
    const dock = new PageDock({ root: view.root, storage }).attach();
    assert.equal(view.root.style.getPropertyValue("--ma-panel-w"), "640px");
    const handle = view.root.querySelector(".ma-resize");
    const pointer = (type, clientX) =>
      handle.dispatchEvent(
        new view.window.MouseEvent(type, { clientX, button: 0, bubbles: true }),
      );
    pointer("pointerdown", 960);
    assert.ok(
      view.doc.documentElement.classList.contains("mirrorads-resizing"),
    );
    pointer("pointermove", 700);
    await settle(30);
    assert.equal(view.root.style.getPropertyValue("--ma-panel-w"), "900px");
    pointer("pointerup", 700);
    assert.equal(
      view.doc.documentElement.classList.contains("mirrorads-resizing"),
      false,
    );
    assert.equal(storage.getItem("mirrorads.panel.width.v1"), "900");
    assert.equal(
      view.doc.documentElement.style.getPropertyValue("--mirrorads-dock-w"),
      "900px",
    );
    handle.dispatchEvent(
      new view.window.MouseEvent("dblclick", { bubbles: true }),
    );
    assert.equal(
      view.root.style.getPropertyValue("--ma-panel-w"),
      `${PANEL_WIDTH.standard}px`,
    );
    dock.release();
  } finally {
    view.close();
  }
});

test("returning users see the latest changes once; new users see nothing", () => {
  const changelog = [
    { version: "161126b1", ru: ["future"], en: ["future"] },
    { version: "151126b2", ru: ["c"], en: ["c"] },
    { version: "151126b1", ru: ["b"], en: ["b"] },
    { version: "141126b13", ru: ["a"], en: ["a"] },
  ];
  const versions = (plan) => plan.show.map((entry) => entry.version);
  let plan = launchPlan({
    changelog,
    seen: null,
    current: "151126b2",
    returning: false,
  });
  assert.deepEqual([versions(plan), plan.remember], [[], "151126b2"]);
  plan = launchPlan({
    changelog,
    seen: null,
    current: "151126b2",
    returning: true,
  });
  assert.deepEqual([versions(plan), plan.remember], [["151126b2"], "151126b2"]);
  plan = launchPlan({
    changelog,
    seen: "141126b13",
    current: "151126b2",
    returning: true,
  });
  assert.deepEqual(versions(plan), ["151126b2", "151126b1"]);
  plan = launchPlan({
    changelog,
    seen: "151126b2",
    current: "151126b2",
    returning: true,
  });
  assert.deepEqual(versions(plan), []);
  // Running an older build (rolled back) shows nothing and forgets nothing.
  plan = launchPlan({
    changelog,
    seen: "151126b2",
    current: "151126b1",
    returning: true,
  });
  assert.deepEqual([versions(plan), plan.remember], [[], "151126b2"]);
  plan = launchPlan({
    changelog,
    seen: null,
    current: "__MIRRORADS_VERSION__",
    returning: true,
  });
  assert.deepEqual(versions(plan), []);

  assert.equal(
    isReturningUser([
      "mirrorads.loader.cache.v1",
      "mirrorads.loader.refresh.v1",
      "other",
    ]),
    false,
  );
  assert.equal(
    isReturningUser(["mirrorads.loader.cache.v1", "mirrorads.panel.lang"]),
    true,
  );
  assert.equal(
    isReturningUser(["mirrorads.payload.v1"]),
    true,
    "the file loader counts",
  );
});

test("the window shows once, the build number opens the full history", async () => {
  const view = page(1600);
  const storage = memoryStorage({ "mirrorads.panel.lang": "ru" });
  const changelog = [
    {
      version: "151126b1",
      date: "2026-11-15",
      ru: ["<b>новое</b>"],
      en: ["new"],
    },
    { version: "141126b13", date: "2026-11-14", ru: ["старое"], en: ["old"] },
  ];
  try {
    new WhatsNew({
      root: view.root,
      storage,
      version: "151126b1",
      changelog,
      delayMs: 0,
    }).attach();
    assert.equal(storage.getItem(SEEN_KEY), "151126b1");
    await settle(5);
    let overlay = view.root.querySelector(".ma-overlay[data-news='new']");
    assert.ok(overlay, "the window is shown");
    assert.equal(overlay.querySelectorAll(".ma-news-entry").length, 1);
    assert.equal(
      overlay.querySelectorAll(".ma-news-entry b").length,
      1,
      "item text is escaped",
    );
    assert.ok(overlay.querySelector("[data-news-all]"));
    overlay.querySelector("[data-news-all]").click();
    overlay = view.root.querySelector(".ma-overlay[data-news='history']");
    assert.equal(overlay.querySelectorAll(".ma-news-entry").length, 2);
    overlay.querySelector("[data-news-close]").click();
    assert.equal(view.root.querySelector(".ma-overlay"), null);

    // Next launch of the same build: nothing pops up.
    const second = page(1600);
    try {
      new WhatsNew({
        root: second.root,
        storage,
        version: "151126b1",
        changelog,
        delayMs: 0,
      }).attach();
      await settle(5);
      assert.equal(second.root.querySelector(".ma-overlay"), null);
      second.root.querySelector(".ma-build").click();
      assert.equal(
        second.root.querySelectorAll(
          ".ma-overlay[data-news='history'] .ma-news-entry",
        ).length,
        2,
      );
      const item = second.root.querySelector("[data-news-open]");
      assert.equal(item.dataset.alwaysEnabled, "");
    } finally {
      second.close();
    }
  } finally {
    view.close();
  }
});

test("the changelog is well formed and never ahead of the release", () => {
  const { version } = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.ok(CHANGELOG.length > 0);
  CHANGELOG.forEach((entry, index) => {
    assert.ok(isBuildVersion(entry.version), entry.version);
    assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(
      entry.ru.length > 0 && entry.ru.length === entry.en.length,
      entry.version,
    );
    if (index > 0)
      assert.ok(compareBuilds(CHANGELOG[index - 1].version, entry.version) > 0);
  });
  assert.ok(
    compareBuilds(CHANGELOG[0].version, version) <= 0,
    `changelog entry ${CHANGELOG[0].version} is ahead of package version ${version}`,
  );
});

test("the licence: key and end date in the ⚙ menu, a reminder in the last days", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.UTC(2026, 10, 15, 12);
  const base = {
    mode: "key",
    key: "MA-ABCDEFGH",
    renewUrl: "https://mirrorads.example/buy#renew=MA-ABCDEFGH-X",
    cabinetUrl: "https://mirrorads.example/cabinet#MA-ABCDEFGH-X",
  };
  assert.equal(licenseNotice(undefined, now), null);
  assert.equal(licenseNotice({ mode: "free" }, now), null);
  const far = licenseNotice({ ...base, expiresAt: now + 20 * DAY }, now);
  assert.deepEqual([far.daysLeft, far.remind, far.expired], [20, false, false]);
  const near = licenseNotice(
    { ...base, expiresAt: now + REMIND_DAYS * DAY },
    now,
  );
  assert.equal(near.remind, true);
  const ended = licenseNotice({ ...base, expiresAt: now - DAY }, now);
  assert.deepEqual([ended.expired, ended.remind], [true, true]);
  assert.equal(licenseNotice({ ...base, expiresAt: null }, now).remind, false);
  assert.equal(
    licenseNotice({ ...base, renewUrl: "javascript:alert(1)" }, now).renewUrl,
    "",
    "only https links",
  );

  const view = page();
  new LicenseInfo({
    root: view.root,
    license: { ...base, expiresAt: now + 3 * DAY },
    now,
  }).attach();
  const block = view.root.querySelector(".ma-menu .ma-license");
  assert.match(block.textContent, /MA-ABCDEFGH/);
  assert.match(block.textContent, /until \d{2}\.\d{2}\.2026/);
  assert.deepEqual(
    [...block.querySelectorAll("a")].map((link) => link.href),
    [base.renewUrl, base.cabinetUrl],
  );
  assert.ok(
    block.nextElementSibling.classList.contains("ma-version-note"),
    "placed above the version note",
  );
  const banner = view.root.querySelector(".ma-head + .ma-license-banner");
  assert.match(banner.textContent, /ends in 3 d\./);
  banner.querySelector("[data-license-hide]").click();
  assert.equal(view.root.querySelector(".ma-license-banner"), null);
  view.close();

  // A key without an end date: no renewal link, no reminder.
  const lifetime = page();
  new LicenseInfo({
    root: lifetime.root,
    license: { ...base, expiresAt: null },
    now,
  }).attach();
  assert.match(
    lifetime.root.querySelector(".ma-license").textContent,
    /no end date/,
  );
  assert.equal(lifetime.root.querySelectorAll(".ma-license a").length, 1);
  assert.equal(lifetime.root.querySelector(".ma-license-banner"), null);
  lifetime.close();

  // Without a key the panel says nothing about licences.
  const free = page();
  new LicenseInfo({ root: free.root, license: { mode: "free" } }).attach();
  new LicenseInfo({ root: free.root, license: undefined }).attach();
  assert.equal(
    free.root.querySelector(".ma-license, .ma-license-banner"),
    null,
  );
  free.close();
});
