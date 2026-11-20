import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { AccountHistory } from "../src/accounts/account-history.mjs";
import {
  compareAccounts,
  filterCounts,
  filterEvents,
} from "../src/domain/account-history.mjs";
import { setLang } from "../src/ui/i18n.mjs";
import { HistoryView, eventText } from "../src/ui/history-view.mjs";

const account = (id, name, status) => ({
  id,
  name,
  raw: { account_status: status },
});
const HOUR = 60 * 60 * 1000;
const T0 = Date.UTC(2026, 10, 18, 9);

/** A storage that behaves like localStorage, in memory. */
function memoryStorage() {
  const items = new Map();
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
    items,
  };
}

test("the first open is the starting point; the next ones note what changed", () => {
  const first = compareAccounts(
    null,
    [
      account("1", "Alpha", 1),
      account("2", "Beta", 1),
      account("3", "Gamma", 2),
      account("4", "Delta", 1),
      account("5", "Eps", 3),
    ],
    T0,
  );
  assert.deepEqual(first.events, [
    {
      t: T0,
      k: "start",
      count: 5,
      counts: { live: 3, banned: 1, billing: 1 },
    },
  ]);
  assert.equal(first.snapshot.first, T0);

  const second = compareAccounts(
    first.snapshot,
    [
      account("1", "Alpha", 2), // banned
      account("2", "Beta", 3), // unpaid
      // 3 (banned) was removed: no event
      // 4 (live) is gone: an event
      account("5", "Eps", 1), // paid, works again
      account("6", "Zeta", 1), // new
    ],
    T0 + HOUR,
  );
  assert.deepEqual(
    second.events.map((event) => [event.k, event.id, event.from, event.to]),
    [
      ["banned", "1", "live", "banned"],
      ["billing", "2", "live", "billing"],
      ["live", "5", "billing", "live"],
      ["new", "6", undefined, "live"],
      ["gone", "4", "live", undefined],
    ],
  );
  assert.equal(second.snapshot.first, T0, "the history keeps its start");
  assert.ok(second.snapshot.accounts["4"].g, "a gone account is remembered");

  // It comes back later: "back", not "new".
  const third = compareAccounts(
    second.snapshot,
    [
      account("1", "Alpha", 2),
      account("2", "Beta", 3),
      account("5", "Eps", 1),
      account("6", "Zeta", 1),
      account("4", "Delta", 1),
    ],
    T0 + 2 * HOUR,
  );
  assert.deepEqual(
    third.events.map((event) => [event.k, event.id]),
    [["returned", "4"]],
  );
});

test("nothing changes on an empty list, an unknown status or a repeat", () => {
  const { snapshot } = compareAccounts(null, [account("1", "A", 1)], T0);
  assert.deepEqual(compareAccounts(snapshot, [], T0 + HOUR), {
    snapshot,
    events: [],
  });
  const unknown = compareAccounts(
    snapshot,
    [{ id: "1", name: "A", raw: {} }],
    T0 + HOUR,
  );
  assert.deepEqual(unknown.events, []);
  assert.equal(
    unknown.snapshot.accounts["1"].h,
    "live",
    "last known status kept",
  );
  const repeat = compareAccounts(
    unknown.snapshot,
    [account("1", "A", 1)],
    T0 + 2 * HOUR,
  );
  assert.deepEqual(repeat.events, []);
});

test("filters group the kinds of change", () => {
  const events = [
    { t: 1, k: "start" },
    { t: 2, k: "new" },
    { t: 3, k: "banned" },
    { t: 4, k: "review" },
    { t: 5, k: "billing" },
    { t: 6, k: "gone" },
    { t: 7, k: "returned" },
    { t: 8, k: "live" },
  ];
  assert.deepEqual(filterCounts(events), {
    all: 7,
    new: 2,
    banned: 2,
    billing: 1,
    gone: 1,
    live: 1,
  });
  assert.deepEqual(
    filterEvents(events, "new").map((event) => event.t),
    [7, 2],
    "newest first",
  );
});

test("the history is kept per profile, with what is new since the last look", () => {
  const storage = memoryStorage();
  let now = T0;
  let actor = "100";
  const history = new AccountHistory({
    storage,
    now: () => now,
    actorId: () => actor,
  });
  history.record([account("1", "A", 1), account("2", "B", 1)]);
  assert.equal(history.unseenCount(), 0, "the start is not news");
  now += HOUR;
  history.record([account("1", "A", 2), account("2", "B", 1)]);
  now += HOUR;
  history.record([account("1", "A", 2), account("2", "B", 3)]);
  assert.equal(history.unseenCount(), 2);
  now += HOUR;
  history.markSeen();
  assert.equal(history.unseenCount(), 0);
  // Another profile has a history of its own.
  actor = "200";
  assert.deepEqual(history.events(), []);
  actor = "100";
  assert.equal(history.events().length, 3);
  assert.ok(storage.items.has("mirrorads.history.v1.100"));
  // Clearing keeps the accounts as the new starting point.
  history.clear();
  assert.deepEqual(history.events(), []);
  now += HOUR;
  assert.deepEqual(
    history
      .record([account("1", "A", 2), account("2", "B", 3)])
      .map((event) => event.k),
    [],
  );
  // A broken entry starts afresh instead of breaking the panel.
  storage.setItem("mirrorads.history.v1.100", "{not json");
  assert.deepEqual(history.read(), { snapshot: null, events: [], seen: 0 });
});

test("the History tab lists the changes by day with a badge for new ones", () => {
  setLang("en");
  const { window } = new JSDOM(
    `<div id="root"><button class="ma-tab" data-tab="history">History</button><div id="mirrorads-root-panel-history"></div></div>`,
  );
  const root = window.document.getElementById("root");
  const storage = memoryStorage();
  // Noon yesterday, then noon today: "Yesterday" and "Today" at any hour.
  const noon = new Date();
  noon.setHours(12, 0, 0, 0);
  let now = noon.getTime() - 24 * HOUR;
  const history = new AccountHistory({
    storage,
    now: () => now,
    actorId: () => "1",
  });
  history.record([account("1", "Alpha", 1), account("2", "Beta", 1)]);
  now = noon.getTime();
  history.record([account("1", "Alpha", 2), account("3", "Gamma", 1)]);
  const state = { activeTab: "reports" };
  const view = new HistoryView({
    state,
    dom: { root },
    appId: "mirrorads-root",
    accountHistory: history,
  });
  view.bind(root);
  const badge = () => root.querySelector(".ma-tab-badge")?.textContent || "";
  assert.equal(badge(), "3");

  state.activeTab = "history";
  view.open();
  assert.equal(badge(), "", "seen once the tab is open");
  const panel = root.querySelector("#mirrorads-root-panel-history");
  const rows = () =>
    [...panel.querySelectorAll(".ma-his-row")].map((row) => [
      row.querySelector(".ma-his-kind").textContent,
      row.querySelector(".ma-his-acct b").textContent,
      row.querySelector(".ma-his-change").textContent,
      row.classList.contains("is-unseen"),
    ]);
  assert.deepEqual(rows(), [
    ["Banned", "Alpha", "live → banned", true],
    ["New", "Gamma", "appeared in the profile · live", true],
    ["Gone", "Beta", "no longer in the profile (was live)", true],
    ["Start", "Profile", "History started: 2 accounts (live 2)", false],
  ]);
  assert.deepEqual(
    [...panel.querySelectorAll(".ma-his-day")].map((day) => day.textContent),
    ["Today", "Yesterday"],
  );
  assert.match(
    panel.querySelector(".ma-his-row a").href,
    /act=1&date=\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}%2Ctoday/,
  );
  panel.querySelector('[data-history="filter:banned"]').click();
  assert.deepEqual(
    rows().map((row) => row[1]),
    ["Alpha"],
  );
  // Clearing asks once more.
  panel.querySelector('[data-history="clear"]').click();
  assert.equal(history.events().length, 4);
  panel.querySelector('[data-history="clear"]').click();
  assert.equal(history.events().length, 0);
  assert.equal(
    eventText({ k: "billing", from: "live", to: "billing" }),
    "live → unpaid balance",
  );
});
