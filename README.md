# MirrorAds

MirrorAds clones Facebook Ads Manager campaigns between ad accounts from a side panel inside Ads Manager.

## What it does

- Clones a campaign into any number of ad accounts, as drafts or as live objects.
- Names every clone for its account: the account marker in the campaign name (the source account id, its first four digits or the account label) is replaced by the full id of the target account, so `PEAK_1840AU Matt_V2` becomes `PEAK_1745662286529117AU Matt_V2`. The panel shows each name before the run and lets you edit it per account.
- Carries value rules over: the rule set attached to an ad set is reused in a target account that already has the same rules, and created there otherwise.
- Maps pages, pixels and catalogs per account, converts budgets between currencies, rolls back a failed account and continues with the rest.
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
