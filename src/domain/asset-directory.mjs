/**
 * Pixels and catalogs across a profile's ad accounts: which accounts can use
 * each one and which cannot.
 */

/**
 * Builds the directory from what each account sees:
 * entries [{ accountId, name, ok, pixels: [{ id, name }], catalogs }].
 * Accounts that could not be read (`ok` false) count for nothing.
 * Returns { pixels, catalogs }, each [{ id, name, accounts: [accountId] }],
 * the widest-shared first.
 */
export function buildAssetDirectory(entries) {
  const pixels = new Map();
  const catalogs = new Map();
  const add = (map, item, accountId) => {
    const id = String(item?.id || "");
    if (!id) return;
    if (!map.has(id)) map.set(id, { id, name: "", accounts: [] });
    const asset = map.get(id);
    if (!asset.name && item.name && String(item.name) !== id) {
      asset.name = String(item.name);
    }
    if (!asset.accounts.includes(accountId)) asset.accounts.push(accountId);
  };
  for (const entry of entries || []) {
    if (!entry?.ok) continue;
    for (const pixel of entry.pixels || []) add(pixels, pixel, entry.accountId);
    for (const catalog of entry.catalogs || []) {
      add(catalogs, catalog, entry.accountId);
    }
  }
  const sorted = (map) =>
    [...map.values()]
      .map((asset) => ({ ...asset, name: asset.name || asset.id }))
      .sort(
        (a, b) =>
          b.accounts.length - a.accounts.length || a.name.localeCompare(b.name),
      );
  return { pixels: sorted(pixels), catalogs: sorted(catalogs) };
}

/** The accounts, of those read, that cannot use an asset. */
export function accountsWithout(asset, entries) {
  const has = new Set(asset?.accounts || []);
  return (entries || []).filter(
    (entry) => entry?.ok && !has.has(entry.accountId),
  );
}

/** Assets whose name or id contains the query (any case). */
export function searchAssets(assets, query) {
  const text = String(query || "")
    .trim()
    .toLowerCase();
  if (!text) return assets || [];
  return (assets || []).filter(
    (asset) =>
      asset.name.toLowerCase().includes(text) || asset.id.includes(text),
  );
}
