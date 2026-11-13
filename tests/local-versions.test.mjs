import test from "node:test";
import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { Config } from "../src/config.mjs";
import {
  LocalVersions,
  VERSION_HISTORY_KEY,
} from "../src/app/local-versions.mjs";

const cacheKey = "mirrorads.loader.cache.v1";
const payload = (version) => ({
  app: "MirrorAds",
  version,
  source: `window.loaded = '${version}';`,
  sha256: createHash("sha256")
    .update(`window.loaded = '${version}';`)
    .digest("hex"),
});
function storage(entries = {}) {
  const data = new Map(
    Object.entries(entries).map(([key, value]) => [key, JSON.stringify(value)]),
  );
  return {
    getItem: (key) => data.get(key) || null,
    setItem: (key, value) => data.set(key, value),
  };
}

test("old bookmarklets retain previous observed version across reloads, never rotate on rollback", () => {
  const previousWindow = globalThis.window;
  const previousVersion = Config.VERSION;
  const localStorage = storage({ [cacheKey]: payload("070926b1") });
  globalThis.window = { localStorage };
  const history = new LocalVersions({ logging: { log() {} } });
  try {
    Config.VERSION = "070926b1";
    history.captureCurrent();
    assert.equal(history.previous(), null);
    localStorage.setItem(cacheKey, JSON.stringify(payload("070926b2")));
    Config.VERSION = "070926b2";
    history.captureCurrent();
    assert.equal(history.previous().version, "070926b1");
    const saved = localStorage.getItem(VERSION_HISTORY_KEY);
    history.captureCurrent();
    assert.equal(localStorage.getItem(VERSION_HISTORY_KEY), saved);
    Config.VERSION = "070926b1";
    history.captureCurrent();
    assert.equal(localStorage.getItem(VERSION_HISTORY_KEY), saved);
  } finally {
    globalThis.window = previousWindow;
    Config.VERSION = previousVersion;
  }
});

test("local rollback refuses damaged source and busy operations without replacing the app", async () => {
  const previousWindow = globalThis.window;
  const old = payload("070926b1");
  old.source += "corruption";
  const app = {};
  globalThis.window = {
    localStorage: storage({ [VERSION_HISTORY_KEY]: { previous: old } }),
    crypto: webcrypto,
    MirrorAds: app,
  };
  const state = { busy: true };
  const service = new LocalVersions({
    state,
    logging: { log() {} },
    panelView: { renderButtons() {} },
  });
  try {
    assert.equal(await service.loadPrevious(), false);
    assert.equal(service.warning, "");
    state.busy = false;
    assert.equal(await service.loadPrevious(), false);
    assert.match(service.warning, /damaged/);
    assert.equal(window.MirrorAds, app);
    assert.equal(state.versionLoading, false);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("storage quota failure does not prevent the current application from opening", () => {
  const previousWindow = globalThis.window;
  const previousVersion = Config.VERSION;
  Config.VERSION = "070926b2";
  globalThis.window = {
    localStorage: {
      getItem: (key) =>
        key === cacheKey ? JSON.stringify(payload(Config.VERSION)) : null,
      setItem() {
        throw new Error("quota");
      },
    },
  };
  try {
    const service = new LocalVersions({ logging: { log() {} } });
    assert.doesNotThrow(() => service.captureCurrent());
    assert.match(service.warning, /could not be saved/);
  } finally {
    globalThis.window = previousWindow;
    Config.VERSION = previousVersion;
  }
});
