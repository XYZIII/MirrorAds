import { EVENT_LIMIT, compareAccounts } from "../domain/account-history.mjs";

const KEY_PREFIX = "mirrorads.history.v1.";

/**
 * Keeps the account history of the signed-in profile in the browser: the
 * last snapshot of its accounts and the events seen since the first open.
 * Each Facebook profile has its own history.
 */
export class AccountHistory {
  constructor(dependencies = {}) {
    this.dependencies = dependencies;
    this.listeners = new Set();
    this.record = this.record.bind(this);
  }

  get storage() {
    if (this.dependencies.storage !== undefined) {
      return this.dependencies.storage;
    }
    try {
      return globalThis.localStorage || null;
    } catch {
      return null;
    }
  }

  now() {
    return this.dependencies.now ? this.dependencies.now() : Date.now();
  }

  key() {
    const actor = String(this.dependencies.actorId?.() || "default");
    return `${KEY_PREFIX}${actor}`;
  }

  /** The stored history: { snapshot, events, seen }. Never throws. */
  read() {
    try {
      const saved = JSON.parse(this.storage?.getItem(this.key()) || "null");
      if (saved && typeof saved === "object") {
        return {
          snapshot: saved.snapshot || null,
          events: Array.isArray(saved.events) ? saved.events : [],
          seen: Number(saved.seen) || 0,
        };
      }
    } catch {
      // A broken entry starts the history afresh.
    }
    return { snapshot: null, events: [], seen: 0 };
  }

  write(history) {
    try {
      this.storage?.setItem(this.key(), JSON.stringify(history));
      return true;
    } catch {
      // A full or blocked storage keeps the panel working without history.
      return false;
    }
  }

  /** Compares the accounts with the last open and keeps what changed. */
  record(accounts) {
    const history = this.read();
    const { snapshot, events } = compareAccounts(
      history.snapshot,
      accounts,
      this.now(),
    );
    if (!snapshot) return [];
    const all = [...history.events, ...events].slice(-EVENT_LIMIT);
    // The first open has nothing to report: it is the starting point.
    const seen = history.snapshot ? history.seen : this.now();
    this.write({ snapshot, events: all, seen });
    this.notify();
    return events;
  }

  /** Events, newest last. */
  events() {
    return this.read().events;
  }

  snapshot() {
    return this.read().snapshot;
  }

  /** Changes since the History tab was last opened ("start" not counted). */
  unseenCount() {
    const { events, seen } = this.read();
    return events.filter((event) => event.k !== "start" && event.t > seen)
      .length;
  }

  /** The History tab was opened: everything up to now is seen. */
  markSeen() {
    const history = this.read();
    const previous = history.seen;
    history.seen = this.now();
    this.write(history);
    this.notify();
    return previous;
  }

  /** Starts the history afresh from the accounts seen last. */
  clear() {
    const history = this.read();
    const now = this.now();
    this.write({
      snapshot: history.snapshot ? { ...history.snapshot, first: now } : null,
      events: [],
      seen: now,
    });
    this.notify();
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // A listener's failure does not stop the others.
      }
    }
  }
}
