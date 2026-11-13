import { MirrorAdsApp } from "./app/mirror-ads-app.mjs";

/**
 * Mounts one MirrorAds instance. Kept as a function so the refresh control can
 * rebuild the whole interface without reloading the Ads Manager page.
 */
function mountMirrorAds() {
  const app = new MirrorAdsApp();
  const api = app.toPublicApi();
  api.refresh = () => {
    if (window.MirrorAds?.destroy?.() === false) return false;
    mountMirrorAds();
    return true;
  };
  window.MirrorAds = api;
  app.mount();
}

if (window.MirrorAds?.destroy?.() !== false) {
  mountMirrorAds();
}
