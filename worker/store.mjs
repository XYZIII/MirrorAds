/**
 * The licence data lives in the SQLite database of one Durable Object: it is
 * part of the Worker itself, so there is nothing to create or connect in
 * Cloudflare. Its SQL API is synchronous; this adapter gives it the small
 * promise-based interface (prepare/bind/first/all/run/batch) the server uses.
 */
const bindable = (value) => {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
};

export function sqlDatabase(storage) {
  const exec = (query, params) => storage.sql.exec(query, ...params);
  const statement = (query, params = []) => ({
    query,
    params,
    bind: (...values) => statement(query, values.map(bindable)),
    first: async () => exec(query, params).toArray()[0] ?? null,
    all: async () => ({ results: exec(query, params).toArray() }),
    run: async () => {
      const cursor = exec(query, params);
      cursor.toArray();
      return { meta: { rows_written: cursor.rowsWritten } };
    },
  });
  return {
    prepare: (query) => statement(query),
    // Everything in one transaction: all of it is written, or none.
    batch: async (statements) =>
      storage.transactionSync(() =>
        statements.map((item) => ({
          results: exec(item.query, item.params).toArray(),
        })),
      ),
  };
}
