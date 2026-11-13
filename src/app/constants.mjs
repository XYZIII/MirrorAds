export const APP_ID = "mirrorads-root";
export const APP_TITLE = "MirrorAds";
export function appMarkSvg() {
  // An "M" folded along a mirror line: the left half solid, the right half its reflection.
  return `<svg class="ma-mark" viewBox="0 0 96 96" aria-hidden="true"><rect x="4" y="4" width="88" height="88" rx="26" fill="#b4f461"/><path d="M24 68V30l22 20v18z" fill="#14280a"/><path d="M72 68V30L50 50v18z" fill="#14280a" fill-opacity="0.38"/></svg>`;
}

export const APP_MARK_SVG = appMarkSvg();

export const NATIVE_FETCH_FRAME_ID = `${APP_ID}-native-fetch-frame`;
export const PAGE_IDENTITY_HINTS_KEY = "mirrorads.pageIdentityHints.v1";
