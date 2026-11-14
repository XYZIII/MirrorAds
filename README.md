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

`hosting/` holds the loader that becomes the bookmark, the gate it downloads
and the install page. `node tools/build-site.mjs` turns the committed
`mirrorads.js` into a site in `dist/`:

- `index.html` — the install page with the bookmark;
- `mirrorads/latest/manifest.html` and `mirrorads/latest/og/gate-*.html` —
  the gate (`hosting/gate.js`), published as link-preview pages;
- `mirrorads/latest/og/main-*.html` — the script itself, encrypted with
  AES-256-GCM under a fresh key for every build;
- `mirrorads/latest/loader.txt` — the loader with a `__LICENSE_KEY__` slot,
  from which the cabinet makes personal bookmarks.

It also writes `worker/generated/build.mjs` (never committed): the version,
the script key and where the pieces are, for the licence server.

Ads Manager refuses code and requests from outside sites, so nothing is
downloaded from the host directly. Facebook reads the published pages
itself, and the loader reads Facebook's copy through the Ads Manager session.
Every browser asks Facebook to re-read the manifest at most once in 20
minutes, so a new build reaches users on their own, and nothing is run that
does not match its checksum.

The gate checks the licence the same way: it asks Facebook to read
`/l/<licence id>/<sealed request>` (or `/l/free/<nonce>` without a key). The
request and the answer are encrypted with a key derived from the licence
secret, which never travels. A pass carries the script key; it is saved for
12 hours, re-checked in the background after that, and keeps the script
running for up to 7 days when the check cannot be made.

## Licences and payments

`worker/` is the licence server (a Cloudflare Worker with one SQLite-backed
Durable Object, so there is no database to create). It serves:

- `/buy` — plans, promo codes, payment in crypto through OxaPay;
- `/order/<id>/<code>` — the order page that shows the key once paid;
- `/cabinet` — key status, renewal and the personal bookmark;
- `/admin` — keys, payments, plans, promo codes and the switch that makes a
  key required (off by default: everyone works without a key until then);
- `/api/oxapay/webhook` — OxaPay's signed payment notifications.

Cloudflare settings: build command `node tools/build-site.mjs`, deploy
command `npx wrangler deploy`. Secrets (Settings → Variables and Secrets):
`ADMIN_PASSWORD` for `/admin` (any user name), `OXAPAY_MERCHANT_KEY` for
payments. The site address comes from `hosting/site.json` (or
`MIRRORADS_BASE_URL`).
