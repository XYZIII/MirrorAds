import { DatabaseSync } from "node:sqlite";

/**
 * Durable Object storage with its SQL API, backed by Node's in-memory SQLite.
 * Like the real one it refuses values SQLite cannot store (undefined,
 * booleans), so tests catch them.
 */
export function createStorage() {
  const sqlite = new DatabaseSync(":memory:");
  return {
    sqlite,
    sql: {
      exec(query, ...params) {
        const rows = sqlite
          .prepare(query)
          .all(...params)
          .map((row) => ({ ...row }));
        const written = /^\s*(insert|update|delete|replace)\b/i.test(query)
          ? Number(sqlite.prepare("SELECT changes() AS c").get().c)
          : 0;
        return {
          toArray: () => rows,
          one: () => rows[0],
          rowsRead: rows.length,
          rowsWritten: written,
        };
      },
    },
    transactionSync(callback) {
      sqlite.exec("BEGIN");
      try {
        const result = callback();
        sqlite.exec("COMMIT");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
