# MirrorAds

MirrorAds clones Facebook Ads Manager campaigns between ad accounts from a side panel inside Ads Manager.

## What it does

- Clones a campaign into any number of ad accounts, as drafts or as live objects.
- Names every clone for its account: the account marker in the campaign name (the source account id, its first four digits or the account label) is replaced by the full id of the target account, so `PEAK_1840AU Matt_V2` becomes `PEAK_1745662286529117AU Matt_V2`. The panel shows each name before the run and lets you edit it per account.
- Carries value rules over: the rule set attached to an ad set is reused in a target account that already has the same rules, and created there otherwise.
- Maps pages, pixels and catalogs per account, converts budgets between currencies, rolls back a failed account and continues with the rest.
- Reports spend, leads and purchases per ad account in USD, either by each account's own day or by one day in your time zone, with a link that opens the account in Ads Manager.
- Exports a campaign to JSON with its media and imports it back.

## Install

1. `npm ci && npm run build:payload` builds `mirrorads.js`.
2. Create a browser bookmark from the single line in `tools/mirrorads-bookmark-launch.txt`.
3. Open Ads Manager, click the bookmark and choose `mirrorads.js` (or a `.txt` copy of it) once. The file is cached in the browser.
4. To switch to a newer build, use the bookmark from `tools/mirrorads-bookmark-update.txt` and choose the new file.

## Development

- `src/` is the only editable source; `mirrorads.js` is generated.
- `npm run check` runs lint, tests and the payload checks.
- `npm run bump:build` sets the build version (`DDMMYYbN`).
- `npm run bookmarks` regenerates the bookmark lines from `tools/local-loader.js`.

## Hosted install (one bookmark, automatic updates)

`hosting/` holds the loader that becomes the bookmark and the install page.
`node tools/build-site.mjs` turns the committed `mirrorads.js` into a static
site in `dist/`:

- `index.html` — the install page with the bookmark;
- `mirrorads/latest/manifest.html` and `mirrorads/latest/og/chunk-*.html` —
  the current build, published as link-preview pages.

Ads Manager refuses code and requests from outside sites, so the loader does
not download the script from the host. Facebook reads the published pages
itself, and the loader reads Facebook's copy through the Ads Manager session.
Every browser asks Facebook to re-read the manifest at most once in 20
minutes, so a new build reaches users on their own, and a script is only run
when it matches the manifest's checksum.

On Cloudflare Pages: build command `node tools/build-site.mjs`, output
directory `dist`. The site address is detected from the Pages environment;
for a custom domain put `{"baseUrl": "https://your.domain"}` into
`hosting/site.json` (or set `MIRRORADS_BASE_URL`).
