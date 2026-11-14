(function mirrorAdsLoader(config) {
  "use strict";

  // MirrorAds loader: the whole bookmark. It keeps the last script in the
  // browser, asks Facebook for the published version and updates itself.
  //
  // Ads Manager refuses code and requests from outside sites, so the script
  // is published as link-preview pages: Facebook reads them itself, and the
  // loader reads Facebook's copy through the Ads Manager session.
  const settings = Object.assign(
    {
      app: "MirrorAds",
      manifestUrl: "__MANIFEST_URL__",
      cacheKey: "mirrorads.loader.cache.v1",
      refreshKey: "mirrorads.loader.refresh.v1",
      // How often one browser asks Facebook to re-read the published pages.
      refreshMs: 20 * 60 * 1000,
      timeoutMs: 45000,
      retryDelayMs: 2500,
    },
    config || {},
  );
  const guardKey = "__MirrorAdsLoader";
  const tag = `[${settings.app} loader]`;

  if (!/(^|\.)facebook\.com$/.test(String(location.hostname || ""))) {
    location.href = "https://adsmanager.facebook.com/";
    return;
  }
  if (window[guardKey]?.loading) return;
  const running = window.MirrorAds?.state;
  if (running?.busy || running?.operationActive || running?.massRunning) {
    alert(`${settings.app}: дождитесь окончания текущей операции.`);
    return;
  }
  const guard = { loading: true, build: "", source: "", startedAt: Date.now() };
  window[guardKey] = guard;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const withTimeout = (promise, label) =>
    Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`${label}: нет ответа`)),
          settings.timeoutMs,
        ),
      ),
    ]);

  function accessToken() {
    if (window.__accessToken) return window.__accessToken;
    for (const entry of performance.getEntriesByType("resource")) {
      const url = String(entry.name || "");
      if (!url.includes("access_token=")) continue;
      try {
        const token = new URL(url).searchParams.get("access_token");
        if (token) return token;
      } catch (_error) {
        // Not a URL we can read; keep looking.
      }
    }
    throw new Error(
      "не найден токен Ads Manager. Откройте Ads Manager, дождитесь загрузки и нажмите закладку ещё раз",
    );
  }

  async function graph(url, init) {
    const response = await withTimeout(
      fetch(
        url,
        Object.assign({ credentials: "include", cache: "no-store" }, init),
      ),
      "Facebook",
    );
    const text = (await response.text()).replace(/^for\s*\(;;\);\s*/, "");
    let json = null;
    try {
      json = JSON.parse(text);
    } catch (_error) {
      throw new Error(`Facebook ответил не JSON (${response.status})`);
    }
    if (!response.ok || json?.error) {
      throw new Error(json?.error?.message || `Facebook ${response.status}`);
    }
    return json;
  }

  const byUrl = (pageUrl, scrape) =>
    `https://graph.facebook.com/v23.0/?id=${encodeURIComponent(pageUrl)}&fields=og_object` +
    `${scrape ? "&scrape=true" : ""}&access_token=${encodeURIComponent(accessToken())}`;

  /** Asks Facebook to read a published page again. */
  const scrape = (pageUrl) => graph(byUrl(pageUrl, true), { method: "POST" });

  /** Facebook's current copy of a published page: `{ title, description }`. */
  async function readPage(pageUrl) {
    let id = (await graph(byUrl(pageUrl, false)))?.og_object?.id;
    if (!id) id = (await scrape(pageUrl))?.og_object?.id;
    if (!id) throw new Error("Facebook не видит страницу обновления");
    return graph(
      `https://adsmanager-graph.facebook.com/v23.0/${encodeURIComponent(id)}` +
        `?fields=title,description&access_token=${encodeURIComponent(accessToken())}`,
    );
  }

  function decode(base64) {
    const binary = atob(String(base64 || "").replace(/\s+/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  async function sha256(text) {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(text),
    );
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  /** Orders builds like 141126b13: by year, month, day, then number. */
  function compareBuilds(left, right) {
    const parse = (value) => {
      const match = String(value || "").match(/^(\d{2})(\d{2})(\d{2})b(\d+)$/i);
      return match
        ? [match[3], match[2], match[1], match[4]].map(Number)
        : null;
    };
    const a = parse(left);
    const b = parse(right);
    if (!a || !b) return String(left || "").localeCompare(String(right || ""));
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
  }

  function readCache() {
    try {
      const cached = JSON.parse(localStorage.getItem(settings.cacheKey));
      return cached?.source && cached?.version ? cached : null;
    } catch (_error) {
      return null;
    }
  }

  function writeCache(version, source) {
    try {
      localStorage.setItem(
        settings.cacheKey,
        JSON.stringify({ version, source, savedAt: new Date().toISOString() }),
      );
    } catch (error) {
      console.warn(
        tag,
        "Версия загружена, но не сохранилась в браузере.",
        error,
      );
    }
  }

  async function readManifest() {
    const page = await readPage(settings.manifestUrl);
    const manifest = JSON.parse(decode(page?.description));
    if (
      manifest?.app !== settings.app ||
      !manifest?.version ||
      !manifest?.payload?.sha256 ||
      !Array.isArray(manifest.chunks) ||
      !manifest.chunks.length
    ) {
      throw new Error("страница обновления повреждена");
    }
    return manifest;
  }

  /**
   * Downloads the script named by the manifest. Facebook may still hold the
   * previous build's pieces, so a script that does not match the manifest's
   * checksum is never accepted: the pieces are re-read and tried again.
   */
  async function download(manifest) {
    let lastError = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        if (attempt > 0) {
          await Promise.all(manifest.chunks.map((chunk) => scrape(chunk.url)));
          await sleep(settings.retryDelayMs);
        }
        const pages = await Promise.all(
          manifest.chunks.map((chunk) => readPage(chunk.url)),
        );
        const source = decode(
          pages.map((page) => page?.description || "").join(""),
        );
        if ((await sha256(source)) === manifest.payload.sha256) return source;
        lastError = new Error("Facebook ещё не обновил части скрипта");
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  /** In the background: let Facebook re-read the manifest for the next launch. */
  function refreshLater() {
    try {
      const last = Number(localStorage.getItem(settings.refreshKey)) || 0;
      if (Date.now() - last < settings.refreshMs) return;
      localStorage.setItem(settings.refreshKey, String(Date.now()));
    } catch (_error) {
      return;
    }
    scrape(settings.manifestUrl).catch(() => {});
  }

  async function choose() {
    const cached = readCache();
    let manifest = null;
    try {
      manifest = await readManifest();
    } catch (error) {
      if (!cached) throw error;
      console.warn(tag, `Проверка обновления не удалась: ${error.message}`);
      guard.source = "cache-offline";
      return cached;
    }
    refreshLater();
    if (cached && compareBuilds(cached.version, manifest.version) >= 0) {
      guard.source = "cache";
      return cached;
    }
    try {
      const source = await download(manifest);
      writeCache(manifest.version, source);
      guard.source = "remote";
      return { version: manifest.version, source };
    } catch (error) {
      if (!cached) throw error;
      console.warn(
        tag,
        `Обновление до ${manifest.version} не загрузилось (${error.message}); запускаю ${cached.version}.`,
      );
      guard.source = "cache-update-failed";
      return cached;
    }
  }

  function execute(source, version) {
    return new Promise((resolve, reject) => {
      const blobUrl = URL.createObjectURL(
        new Blob(
          [
            '(function(){\n"use strict";\n',
            source,
            `\n}).call(window);\n//# sourceURL=mirrorads://${version}/payload.js`,
          ],
          { type: "application/javascript" },
        ),
      );
      const script = document.createElement("script");
      script.src = blobUrl;
      script.onload = () => {
        script.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        resolve();
      };
      script.onerror = () => {
        script.remove();
        URL.revokeObjectURL(blobUrl);
        reject(new Error("браузер не дал запустить скрипт"));
      };
      (document.head || document.documentElement).appendChild(script);
    });
  }

  guard.done = (async () => {
    try {
      const chosen = await choose();
      await execute(chosen.source, chosen.version);
      guard.build = chosen.version;
      console.log(tag, `запущена сборка ${chosen.version} (${guard.source}).`);
    } catch (error) {
      guard.error = String(error?.message || error);
      console.error(tag, error);
      alert(`${settings.app} не запустился: ${guard.error}`);
    } finally {
      guard.loading = false;
    }
  })();
})();
