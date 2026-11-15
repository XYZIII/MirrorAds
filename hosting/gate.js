(function mirrorAdsGate(config) {
  "use strict";

  // MirrorAds gate. The bookmark downloads it like an update and runs it; it
  // checks the licence, then opens and starts the script. The script is
  // published encrypted, and its key comes only with a licence check that
  // passed. The check, like everything else, goes through Facebook: Ads
  // Manager refuses requests to outside sites, but Facebook reads the
  // licence server's answer page for us.
  const settings = Object.assign(
    {
      app: "MirrorAds",
      base: "__BASE_URL__",
      build: "__BUILD__",
      keyStore: "mirrorads.license.key.v1",
      stateStore: "mirrorads.license.state.v1",
      appStore: "mirrorads.app.cache.v2",
      // A passed check is trusted this long before the next one.
      recheckMs: 12 * 60 * 60 * 1000,
      // How long the script keeps starting when the check cannot be made.
      graceMs: 7 * 24 * 60 * 60 * 1000,
      timeoutMs: 45000,
      retryDelayMs: 2500,
    },
    config || {},
  );
  const tag = `[${settings.app}]`;
  if (window.__MirrorAdsGate?.busy) return;
  const gate = { busy: true, build: settings.build, source: "", error: "" };
  window.__MirrorAdsGate = gate;
  const loader = window.__MirrorAdsLoader || {};

  /* ---------------- text ---------------- */

  const lang = (() => {
    try {
      const stored = localStorage.getItem("mirrorads.panel.lang");
      if (stored === "ru" || stored === "en") return stored;
    } catch (_error) {
      // No storage: fall back to the browser language.
    }
    return /^(ru|uk|be|kk)\b/i.test(globalThis.navigator?.language || "")
      ? "ru"
      : "en";
  })();
  const TEXT = {
    ru: {
      need_key: "Нужен ключ лицензии",
      need_key_text: "Введите ключ: он пришёл после оплаты и есть в кабинете.",
      bad_key: "Ключ не подошёл",
      bad_key_text: "Проверьте, что ключ скопирован целиком.",
      bad_bookmark: "Ключ из закладки не найден",
      bad_bookmark_text:
        "Откройте кабинет и поставьте закладку заново, или напишите в поддержку.",
      expired: "Подписка закончилась",
      expired_text: "Продлите подписку — ключ останется тем же.",
      blocked: "Ключ заблокирован",
      blocked_text: "Напишите в поддержку.",
      error: "MirrorAds не запустился",
      error_text: "Проверьте интернет и нажмите «Повторить».",
      check_failed: "Не удалось проверить ключ",
      activate: "Активировать",
      checking: "Проверяю…",
      buy: "Купить подписку",
      renew: "Продлить",
      cabinet: "Кабинет",
      support: "Поддержка",
      retry: "Повторить",
      close: "Закрыть",
      other: "Ввести другой ключ",
      format: "Ключ выглядит так: MA-XXXXXXXX-XXXXXXXXXXXXXXXXXXXX",
      bad_answer: "сервер лицензий ответил непонятно",
      stale: "Facebook ещё не обновил части скрипта",
      broken: "сохранённая копия скрипта повреждена, нажмите закладку ещё раз",
      not_started: "не запустился",
    },
    en: {
      need_key: "A licence key is needed",
      need_key_text:
        "Enter your key: it came after payment and is in your cabinet.",
      bad_key: "This key does not work",
      bad_key_text: "Check that the whole key was copied.",
      bad_bookmark: "The bookmark's key was not found",
      bad_bookmark_text:
        "Open your cabinet and install the bookmark again, or contact support.",
      expired: "Your subscription has ended",
      expired_text: "Renew it — the key stays the same.",
      blocked: "This key is blocked",
      blocked_text: "Please contact support.",
      error: "MirrorAds did not start",
      error_text: "Check the connection and press “Try again”.",
      check_failed: "The key could not be checked",
      activate: "Activate",
      checking: "Checking…",
      buy: "Buy a subscription",
      renew: "Renew",
      cabinet: "Cabinet",
      support: "Support",
      retry: "Try again",
      close: "Close",
      other: "Enter another key",
      format: "A key looks like MA-XXXXXXXX-XXXXXXXXXXXXXXXXXXXX",
      bad_answer: "the licence server's answer is unreadable",
      stale: "Facebook has not refreshed the script's pieces yet",
      broken:
        "the saved copy of the script is damaged, click the bookmark again",
      not_started: "did not start",
    },
  };
  const t = (key) => TEXT[lang][key] ?? TEXT.en[key] ?? key;
  const day = (ms) => {
    const date = new Date(Number(ms));
    return [date.getDate(), date.getMonth() + 1]
      .map((part) => String(part).padStart(2, "0"))
      .concat(date.getFullYear())
      .join(".");
  };

  /* ---------------- small helpers ---------------- */

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  function bytesFromBase64(text, url) {
    let clean = String(text || "").replace(/\s+/g, "");
    if (url) clean = clean.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(clean + "===".slice((clean.length + 3) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function base64Url(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  async function sha256Hex(text) {
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  function readJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch (_error) {
      return null;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn(tag, "Не сохранилось в браузере:", key, error);
      return false;
    }
  }

  function forget(key) {
    try {
      localStorage.removeItem(key);
    } catch (_error) {
      // Nothing to forget.
    }
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

  /* ---------------- licence key ---------------- */

  const KEY =
    /^MA-([ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8})-([ABCDEFGHJKMNPQRSTUVWXYZ23456789]{20})$/;

  function parseKey(text) {
    const clean = String(text || "")
      .replace(/\s+/g, "")
      .toUpperCase();
    const match = clean.match(KEY);
    return match ? { id: match[1], secret: match[2], key: clean } : null;
  }

  const bookmarkKey = parseKey(loader.licenseKey);
  /** A key in the bookmark wins; otherwise the one entered in this browser. */
  function currentKey() {
    if (bookmarkKey) return bookmarkKey;
    try {
      return parseKey(localStorage.getItem(settings.keyStore));
    } catch (_error) {
      return null;
    }
  }

  /* ---------------- Facebook ---------------- */

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
      "не найден токен Ads Manager. Дождитесь загрузки Ads Manager и нажмите закладку ещё раз",
    );
  }

  const HOSTS = ["adsmanager-graph.facebook.com", "graph.facebook.com"];

  /** The browser's own fetch from a blank frame: Ads Manager wraps the page's. */
  function pageFetch() {
    const id = "mirrorads-loader-fetch-frame";
    try {
      let frame = document.getElementById(id);
      if (!frame || typeof frame.contentWindow?.fetch !== "function") {
        frame = document.createElement("iframe");
        frame.id = id;
        frame.setAttribute("aria-hidden", "true");
        frame.style.cssText =
          "display:none!important;width:0;height:0;border:0;position:absolute;left:-9999px;";
        document.documentElement.appendChild(frame);
      }
      const frameWindow = frame.contentWindow;
      if (typeof frameWindow?.fetch === "function") {
        return (url, init) => frameWindow.fetch(url, init);
      }
    } catch (_error) {
      // No frame available: fall back to the page's fetch.
    }
    return (url, init) => fetch(url, init);
  }

  async function request(url, init) {
    const response = await Promise.race([
      pageFetch()(url, Object.assign({ credentials: "include" }, init)),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Facebook: нет ответа")),
          settings.timeoutMs,
        ),
      ),
    ]);
    const text = (await response.text()).replace(/^for\s*\(;;\);\s*/, "");
    let json = null;
    try {
      json = JSON.parse(text);
    } catch (_error) {
      throw new Error(`ответ не JSON (${response.status})`);
    }
    if (!response.ok || json?.error) {
      throw new Error(json?.error?.message || `код ${response.status}`);
    }
    return json;
  }

  async function graph(step, pathAndQuery, init) {
    const failures = [];
    for (const host of HOSTS) {
      try {
        return await request(`https://${host}/v23.0/${pathAndQuery}`, init);
      } catch (error) {
        failures.push(`${host.split(".")[0]}: ${error?.message || error}`);
      }
    }
    throw new Error(`${step} — ${failures.join("; ")}`);
  }

  const token = () => `access_token=${encodeURIComponent(accessToken())}`;
  const byUrl = (pageUrl, scrape) =>
    `?id=${encodeURIComponent(pageUrl)}&fields=og_object${scrape ? "&scrape=true" : ""}&${token()}`;
  const scrape = (pageUrl) =>
    graph("обновление страницы в Facebook", byUrl(pageUrl, true), {
      method: "POST",
    });
  const lookup = async (pageUrl) =>
    (await graph("поиск страницы", byUrl(pageUrl, false)))?.og_object?.id;
  const readObject = (id) =>
    graph(
      "чтение страницы",
      `${encodeURIComponent(id)}?fields=title,description&${token()}`,
    );

  /** Waits for Facebook to finish reading a page it was asked to read. */
  async function settle(pageUrl, answer) {
    let id = answer?.og_object?.id;
    for (let attempt = 0; !id && attempt < 8; attempt += 1) {
      await sleep(settings.retryDelayMs);
      id = await lookup(pageUrl);
    }
    if (!id) {
      throw new Error(
        `Facebook не смог прочитать страницу ${pageUrl.split("/").slice(0, 5).join("/")}… (ответ: ${JSON.stringify(answer).slice(0, 200)})`,
      );
    }
    return readObject(id);
  }

  /** Facebook's copy of a published page: `{ title, description }`. */
  async function readPage(pageUrl) {
    const id = await lookup(pageUrl);
    if (id) return readObject(id);
    return settle(pageUrl, await scrape(pageUrl));
  }

  /** A page Facebook has never seen (each licence check has its own address). */
  async function readNew(pageUrl) {
    return settle(pageUrl, await scrape(pageUrl));
  }

  /* ---------------- licence check ---------------- */

  async function licenseCipher(secret) {
    const hmac = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const raw = await crypto.subtle.sign(
      "HMAC",
      hmac,
      encoder.encode("mirrorads/license/v1"),
    );
    return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ]);
  }

  async function seal(cipher, value) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        cipher,
        encoder.encode(JSON.stringify(value)),
      ),
    );
    const out = new Uint8Array(12 + data.length);
    out.set(iv, 0);
    out.set(data, 12);
    return base64Url(out);
  }

  async function unseal(cipher, text) {
    const bytes = bytesFromBase64(text, true);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.subarray(0, 12) },
      cipher,
      bytes.subarray(12),
    );
    return JSON.parse(decoder.decode(plain));
  }

  /** The Facebook profile, hashed: the server counts profiles, never sees them. */
  async function seatOf(licenseId) {
    let user = "";
    try {
      user =
        (String(document.cookie).match(/(?:^|;\s*)c_user=(\d+)/) || [])[1] ||
        "";
    } catch (_error) {
      user = "";
    }
    if (!user) return "unknown";
    return (await sha256Hex(`mirrorads-seat:${licenseId}:${user}`)).slice(
      0,
      32,
    );
  }

  async function answerFrom(description, cipher, nonce) {
    const text = String(description || "");
    let answer = null;
    try {
      if (text.startsWith("S1.") && cipher)
        answer = await unseal(cipher, text.slice(3));
      else if (text.startsWith("P1.")) {
        answer = JSON.parse(
          decoder.decode(bytesFromBase64(text.slice(3), true)),
        );
      }
    } catch (_error) {
      answer = null;
    }
    const sealed = text.startsWith("S1.");
    const usable =
      answer &&
      typeof answer.ok === "boolean" &&
      (!answer.ok ||
        (answer.n === nonce &&
          (sealed || !cipher) &&
          answer.ck &&
          answer.main?.sha &&
          answer.main?.iv &&
          answer.main?.parts > 0));
    if (!usable) throw new Error(t("bad_answer"));
    return answer;
  }

  /** Asks the licence server, through Facebook. */
  async function check(key) {
    const nonce = base64Url(crypto.getRandomValues(new Uint8Array(12)));
    if (!key) {
      const page = await readNew(`${settings.base}/l/free/${nonce}`);
      return answerFrom(page?.description, null, nonce);
    }
    const cipher = await licenseCipher(key.secret);
    const sealed = await seal(cipher, {
      s: await seatOf(key.id),
      n: nonce,
      t: Date.now(),
      b: settings.build,
    });
    const page = await readNew(`${settings.base}/l/${key.id}/${sealed}`);
    return answerFrom(page?.description, cipher, nonce);
  }

  /** Keeps the server's answer: a pass becomes the saved state, a refusal clears it. */
  function record(answer, key) {
    const keyId = key?.id || "";
    if (!answer.ok) {
      // The script key from an earlier pass goes with the refusal.
      if (readJson(settings.stateStore)?.keyId === keyId)
        forget(settings.stateStore);
      return { denied: answer };
    }
    const now = Date.now();
    const state = {
      ok: true,
      keyId,
      mode: answer.mode,
      build: answer.build,
      ck: answer.ck,
      main: answer.main,
      exp: answer.exp ?? null,
      buy: answer.buy || `${settings.base}/buy`,
      cabinet: answer.cabinet || `${settings.base}/cabinet`,
      support: answer.support || "",
      checkedAt: now,
      okAt: now,
    };
    writeJson(settings.stateStore, state);
    return { state };
  }

  /** A check that does not hold up the start; its answer counts next time. */
  function checkLater(key) {
    gate.refresh = check(key)
      .then((answer) => record(answer, key))
      .catch((error) =>
        console.warn(tag, `Проверка ключа отложена: ${error.message}`),
      );
  }

  /**
   * The licence state to start with: `{ state }`, or `{ denied }` with the
   * server's refusal. A pass for this key and build starts the script at
   * once; after 12 hours it is re-checked in the background. When the
   * server cannot be reached, a pass from the last 7 days keeps working.
   */
  async function obtain(key, { force = false } = {}) {
    const saved = readJson(settings.stateStore);
    const keyId = key?.id || "";
    const mine = Boolean(
      saved?.ok && saved.ck && saved.main && saved.keyId === keyId,
    );
    const now = Date.now();
    const recent = mine && now - Number(saved.okAt || 0) < settings.graceMs;
    if (!force && recent && compareBuilds(saved.build, settings.build) >= 0) {
      if (now - Number(saved.checkedAt || 0) >= settings.recheckMs)
        checkLater(key);
      return { state: saved };
    }
    let answer;
    try {
      answer = await check(key);
    } catch (error) {
      if (!force && recent) {
        console.warn(
          tag,
          `Ключ не проверен (${error.message}); работаю по проверке от ${new Date(saved.okAt).toLocaleString()}.`,
        );
        return { state: saved };
      }
      throw error;
    }
    return record(answer, key);
  }

  /* ---------------- the script ---------------- */

  async function sha256Bytes(bytes) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * The encrypted script from Facebook's copies of its pieces. Facebook may
   * tidy a description (spaces, "=" padding), so only the letters of the
   * encoding count, and the checksum is taken over the decoded bytes.
   */
  async function downloadMain(main) {
    const urls = Array.from(
      { length: main.parts },
      (_, index) =>
        `${settings.base}/mirrorads/latest/og/main-${main.sha.slice(0, 12)}-${String(index + 1).padStart(3, "0")}`,
    );
    let lastError = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        if (attempt > 0) {
          await Promise.all(urls.map((url) => scrape(url).catch(() => null)));
          await sleep(settings.retryDelayMs);
        }
        const pages = await Promise.all(urls.map((url) => readPage(url)));
        const texts = pages.map((page) =>
          String(page?.description || "").replace(/[^A-Za-z0-9+/_-]/g, ""),
        );
        const text = texts.join("");
        const bytes = bytesFromBase64(text, true);
        if ((await sha256Bytes(bytes)) === main.sha) return { bytes, text };
        // What arrived, piece by piece, against what was published.
        const sizes = texts
          .map(
            (part, index) => `${part.length}/${main.lengths?.[index] ?? "?"}`,
          )
          .join(", ");
        lastError = new Error(
          `${t("stale")} [${sizes}; ${bytes.length}/${main.size ?? "?"}]`,
        );
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  async function decrypt(bytes, state) {
    const key = await crypto.subtle.importKey(
      "raw",
      bytesFromBase64(state.ck, true),
      "AES-GCM",
      false,
      ["decrypt"],
    );
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytesFromBase64(state.main.iv, true) },
      key,
      bytes,
    );
    return decoder.decode(plain);
  }

  /** The script for this licence state: from this browser, else from Facebook. */
  async function openScript(state) {
    const cached = readJson(settings.appStore);
    if (cached?.sha === state.main.sha && typeof cached.data === "string") {
      try {
        const source = await decrypt(bytesFromBase64(cached.data, true), state);
        gate.source = "cache";
        return source;
      } catch (_error) {
        forget(settings.appStore);
      }
    }
    const { bytes, text } = await downloadMain(state.main);
    let source;
    try {
      source = await decrypt(bytes, state);
    } catch (_error) {
      forget(settings.stateStore);
      throw new Error(t("broken"));
    }
    writeJson(settings.appStore, {
      build: state.build,
      sha: state.main.sha,
      data: text,
      savedAt: new Date().toISOString(),
    });
    gate.source = "remote";
    return source;
  }

  function execute(source, version) {
    return new Promise((resolve, reject) => {
      const blobUrl = URL.createObjectURL(
        new Blob(
          [
            '(function(){\n"use strict";\n',
            source,
            `\n}).call(window);\n//# sourceURL=mirrorads://${version}/app.js`,
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

  /** What the panel shows about the licence. */
  function describe(state, key) {
    return Object.freeze({
      mode: state.mode,
      key: key ? `MA-${key.id}` : "",
      expiresAt: state.exp ?? null,
      buyUrl: state.buy,
      renewUrl: key ? `${state.buy}#renew=${encodeURIComponent(key.key)}` : "",
      cabinetUrl: key ? `${state.cabinet}#${key.key}` : state.cabinet,
      supportUrl: state.support,
      checkedAt: state.checkedAt,
      fromBookmark: Boolean(bookmarkKey),
    });
  }

  /* ---------------- the dialog ---------------- */

  const STYLE = `
    :host { all: initial; }
    .back { position: fixed; inset: 0; display: grid; place-items: center; background: rgba(17,24,39,.38); font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #111827; }
    .card { position: relative; width: min(440px, calc(100vw - 32px)); padding: 26px; border-radius: 22px; background: #fff; box-shadow: 0 30px 80px rgba(17,24,39,.3); }
    .brand { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 15px; }
    .brand svg { width: 28px; height: 28px; }
    h2 { margin: 18px 0 6px; font-size: 20px; line-height: 1.25; letter-spacing: -0.02em; }
    p { margin: 0 0 16px; color: #6b7280; }
    input { display: block; width: 100%; box-sizing: border-box; margin: 0 0 10px; padding: 11px 13px; border: 1px solid #e5e7eb; border-radius: 12px; font: 600 14px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace; color: #111827; background: #fff; }
    input:focus { outline: 2px solid #b4f461; border-color: #2f7d1b; }
    .row { display: flex; flex-wrap: wrap; gap: 8px; }
    button { min-height: 40px; padding: 0 16px; border: 1px solid #e5e7eb; border-radius: 999px; background: #fff; color: #111827; font-family: inherit; font-size: 13px; font-weight: 600; line-height: 1; cursor: pointer; }
    button:hover { background: #f6f7f9; }
    button.primary { border-color: transparent; background: #b4f461; }
    button.primary:hover { background: #a3ea4b; }
    button:disabled { opacity: .6; cursor: default; }
    .x { position: absolute; top: 14px; right: 14px; min-height: 32px; width: 32px; padding: 0; font-size: 15px; }
    .msg { margin: -2px 0 12px; color: #b91c1c; font-size: 13px; }
    .msg:empty { display: none; }
    .hidden { display: none; }`;
  const MARK =
    '<svg viewBox="0 0 96 96" aria-hidden="true"><rect x="4" y="4" width="88" height="88" rx="26" fill="#b4f461"/><path d="M24 68V30l22 20v18z" fill="#14280a"/><path d="M72 68V30L50 50v18z" fill="#14280a" fill-opacity="0.38"/></svg>';

  const escapeHtml = (value) =>
    String(value ?? "").replace(
      /[&<>"]/g,
      (char) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char],
    );

  /**
   * Explains a refusal or a failed check. Resolves with `{ state, key }` once
   * a key entered here passes, `{ retry: true }`, or null when closed.
   */
  function dialog({ code, key, links = {}, detail = "" }) {
    return new Promise((resolve) => {
      document.getElementById("mirrorads-gate")?.remove();
      const host = document.createElement("div");
      host.id = "mirrorads-gate";
      host.style.cssText = "position:fixed;inset:0;z-index:2147483647;";
      const shadow = host.attachShadow({ mode: "open" });
      const titleKey =
        code === "bad_key" && bookmarkKey ? "bad_bookmark" : code;
      let title = t(titleKey);
      if (code === "expired" && links.exp) title += ` ${day(links.exp)}`;
      const text =
        code === "error"
          ? [detail, t("error_text")].filter(Boolean).join(" — ")
          : detail || t(`${titleKey}_text`);
      const canEnter = !bookmarkKey && code !== "error";
      const startOpen = canEnter && ["need_key", "bad_key"].includes(code);
      const buttons = [];
      if (code === "expired" && key)
        buttons.push(["renew", "primary", "renew"]);
      if (code === "error") buttons.push(["retry", "primary", "retry"]);
      if (["need_key", "bad_key"].includes(code))
        buttons.push(["buy", "", "buy"]);
      if (code === "bad_key" && bookmarkKey)
        buttons.push(["cabinet", "", "cabinet"]);
      if (links.support && ["blocked", "bad_key", "error"].includes(code)) {
        buttons.push(["support", "", "support"]);
      }
      if (canEnter && !startOpen) buttons.push(["other", "", "other"]);
      if (canEnter) {
        buttons.unshift([
          "activate",
          startOpen ? "primary" : "primary hidden",
          "activate",
        ]);
      }
      shadow.innerHTML = `<style>${STYLE}</style>
        <div class="back"><section class="card" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
          <button type="button" class="x" data-act="close" aria-label="${escapeHtml(t("close"))}">✕</button>
          <div class="brand">${MARK}${escapeHtml(settings.app)}</div>
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(text)}</p>
          <form class="${startOpen ? "" : "hidden"}" data-form>
            <input name="key" autocomplete="off" spellcheck="false" placeholder="MA-XXXXXXXX-XXXXXXXXXXXXXXXXXXXX" />
            <div class="msg" data-msg></div>
          </form>
          <div class="row" data-buttons>${buttons
            .map(
              ([act, kind, label]) =>
                `<button type="button" class="${kind}" data-act="${act}">${escapeHtml(t(label))}</button>`,
            )
            .join("")}</div>
        </section></div>`;
      const $ = (selector) => shadow.querySelector(selector);
      const form = $("[data-form]");
      const message = $("[data-msg]");
      const close = (value) => {
        host.remove();
        resolve(value);
      };
      const open = (url) => {
        if (url) window.open(url, "_blank", "noopener");
      };
      shadow.addEventListener("click", (event) => {
        const act = event.target?.closest?.("[data-act]")?.dataset?.act;
        if (act === "close") close(null);
        else if (act === "retry") close({ retry: true });
        else if (act === "buy") open(links.buy || `${settings.base}/buy`);
        else if (act === "renew") {
          open(
            `${links.buy || `${settings.base}/buy`}#renew=${encodeURIComponent(key.key)}`,
          );
        } else if (act === "cabinet")
          open(links.cabinet || `${settings.base}/cabinet`);
        else if (act === "support") open(links.support);
        else if (act === "activate") activate();
        else if (act === "other") {
          form.classList.remove("hidden");
          $('[data-act="activate"]').classList.remove("hidden");
          $('[data-act="other"]').classList.add("hidden");
          input.focus();
        }
      });
      const input = form.querySelector("input");
      const activate = async () => {
        const entered = parseKey(input.value);
        if (!entered) {
          message.textContent = t("format");
          return;
        }
        const button = $('[data-act="activate"]');
        button.disabled = true;
        button.textContent = t("checking");
        message.textContent = "";
        try {
          const result = await obtain(entered, { force: true });
          if (result.state) {
            close({ state: result.state, key: entered });
            return;
          }
          const refused = result.denied.code;
          message.textContent = `${t(refused)}. ${t(`${refused}_text`)}`;
        } catch (error) {
          message.textContent = `${t("check_failed")}: ${error.message}`;
        }
        button.disabled = false;
        button.textContent = t("activate");
      };
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        activate();
      });
      document.documentElement.appendChild(host);
      if (startOpen) setTimeout(() => input.focus(), 0);
    });
  }

  /* ---------------- start ---------------- */

  async function start() {
    let key = currentKey();
    for (;;) {
      try {
        let state;
        const result = await obtain(key);
        if (result.denied) {
          const choice = await dialog({
            code: result.denied.code,
            key,
            links: result.denied,
          });
          if (choice?.retry) continue;
          if (!choice?.state) return;
          key = choice.key;
          try {
            localStorage.setItem(settings.keyStore, key.key);
          } catch (_error) {
            // Not kept: the key will be asked for again next time.
          }
          state = choice.state;
        } else {
          state = result.state;
        }
        const source = await openScript(state);
        window.__MirrorAdsLicense = describe(state, key);
        await execute(source, state.build);
        gate.build = state.build;
        console.log(
          tag,
          `запущена сборка ${state.build} (${gate.source}, ${state.mode === "key" ? `ключ MA-${key.id}` : "без ключа"}).`,
        );
        return;
      } catch (error) {
        console.error(tag, error);
        const choice = await dialog({
          code: "error",
          key,
          detail: error.message,
        });
        if (!choice?.retry) return;
      }
    }
  }

  gate.done = (async () => {
    try {
      await start();
    } catch (error) {
      gate.error = String(error?.message || error);
      console.error(tag, error);
      alert(`${settings.app} ${t("not_started")}: ${gate.error}`);
    } finally {
      gate.busy = false;
    }
  })();
})();
