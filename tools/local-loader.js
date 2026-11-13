(function mirrorAdsLocalLoader(FORCE_PICK) {
  "use strict";
  // Runs a MirrorAds build chosen from disk and remembers it in this browser.
  const KEY = "mirrorads.payload.v1";
  const BOX_ID = "mirrorads-loader";
  if (!/(^|\.)facebook\.com$/.test(location.hostname)) {
    location.href = "https://adsmanager.facebook.com/";
    return;
  }
  const run = (source) => {
    const blob = new Blob(
      ['(function(){\n"use strict";\n', source, "\n}).call(window);"],
      { type: "application/javascript" },
    );
    const url = URL.createObjectURL(blob);
    const script = document.createElement("script");
    script.src = url;
    script.onload = script.onerror = () => {
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      script.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  };
  const read = () => {
    try {
      return localStorage.getItem(KEY) || "";
    } catch (error) {
      return "";
    }
  };
  const showPicker = (isUpdate) => {
    document.getElementById(BOX_ID)?.remove();
    const box = document.createElement("div");
    box.id = BOX_ID;
    box.style.cssText =
      "position:fixed;z-index:2147483647;top:16px;right:16px;padding:14px 16px;" +
      "background:#111827;color:#fff;font:14px/1.4 system-ui,sans-serif;" +
      "border:1px solid #b4f461;border-radius:14px;display:flex;gap:10px;" +
      "align-items:center;box-shadow:0 18px 48px rgba(0,0,0,.5)";
    const label = document.createElement("span");
    label.textContent = isUpdate
      ? "MirrorAds: выберите новый файл mirrorads"
      : "MirrorAds: выберите файл mirrorads";
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt,.js,text/plain,text/javascript";
    input.style.color = "#fff";
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.style.cssText =
      "background:none;border:0;color:#fff;font-size:18px;cursor:pointer";
    close.onclick = () => box.remove();
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const source = await file.text();
      if (!/MirrorAds VERSION/.test(source.slice(0, 300))) {
        label.textContent = "Это не файл MirrorAds. Выберите другой.";
        input.value = "";
        return;
      }
      try {
        localStorage.setItem(KEY, source);
      } catch (error) {
        console.warn("[MirrorAds] Could not cache the file.", error);
      }
      box.remove();
      run(source);
    };
    box.append(label, input, close);
    document.body.appendChild(box);
  };
  const cached = FORCE_PICK ? "" : read();
  if (cached) {
    run(cached);
    return;
  }
  showPicker(FORCE_PICK);
})(__FORCE__);
