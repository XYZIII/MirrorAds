import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { createServices } from "../src/app/create-services.mjs";
import { MirrorAdsState } from "../src/state/mirror-ads-state.mjs";
import { setLang } from "../src/ui/i18n.mjs";

const ACCOUNTS = {
  111: { name: "Live", status: 1 },
  222: { name: "Owes A", status: 3, balance: "1500", card: "Visa *1111" },
  333: { name: "Owes B", status: 3, balance: "900" },
  444: { name: "Settling", status: 8, balance: "700" },
};

function fakeGraph() {
  const id = (path) => path.match(/act_(\d+)/)[1];
  return {
    graphFetch: async (path) => {
      const account = ACCOUNTS[id(path)];
      return {
        currency: "USD",
        timezone_name: "Europe/Kiev",
        timezone_offset_hours_utc: 2,
        account_status: account.status,
        balance: account.balance,
        funding_source_details: account.card
          ? { display_string: account.card }
          : undefined,
        campaigns: { data: [] },
      };
    },
    graphGetAll: async () => [],
  };
}

async function settle(rounds = 20) {
  for (let index = 0; index < rounds; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

test("Reports opens Meta's payment pages one by one and sees the debts paid", async () => {
  const browser = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=111",
  });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    localStorage: globalThis.localStorage,
  };
  Object.assign(globalThis, {
    window: browser.window,
    document: browser.window.document,
    localStorage: browser.window.localStorage,
  });
  setLang("en");
  try {
    const state = new MirrorAdsState();
    Object.assign(state, {
      sessionReady: true,
      token: "x",
      accounts: Object.entries(ACCOUNTS).map(([id, account]) => ({
        id,
        name: account.name,
      })),
    });
    const dom = {};
    const services = createServices({
      state,
      dom,
      logger: { log() {} },
      overrides: {
        graphClient: fakeGraph(),
        sessionService: { initializeSession: async () => {} },
      },
    });
    services.panelController.mount();
    const panel = () => dom.root.querySelector("#mirrorads-root-panel-reports");
    const text = (selector) =>
      panel().querySelector(selector)?.textContent.replace(/\s+/g, " ").trim();
    await services.reportsView.load();
    // Debts and payments under way are listed even without spend.
    assert.deepEqual(
      [...panel().querySelectorAll(".ma-rep-row .ma-rep-acct > b")].map(
        (name) => name.textContent,
      ),
      ["Owes A", "Owes B", "Settling"],
    );
    state.reportShowEmpty = true;
    services.reportsView.render();

    // The debts, all in one bar, and on each line.
    assert.equal(
      text(".ma-rep-paybar .ma-rep-payhead > b"),
      "Unpaid balance: 2 accounts · ≈ $24.00",
    );
    const payAll = panel().querySelector('[data-report-pay="all"]');
    assert.equal(payAll.textContent.trim(), "Pay all (2)");
    assert.match(payAll.href, /billing_hub\/payment_settings\/\?asset_id=222/);
    assert.equal(payAll.target, "_blank");
    const line = (name) =>
      [...panel().querySelectorAll(".ma-rep-row")].find(
        (row) => row.querySelector(".ma-rep-acct > b").textContent === name,
      );
    assert.equal(
      line("Owes A").querySelector(".ma-rep-debt").textContent,
      "due 15.00 USD · Visa *1111",
    );
    assert.ok(line("Owes B").querySelector('[data-report-pay="row:333"]'));
    assert.equal(
      line("Settling").querySelector(".ma-rep-settling").textContent,
      "payment processing",
    );
    assert.equal(line("Settling").querySelector("[data-report-pay]"), null);
    assert.equal(line("Live").querySelector("[data-report-pay]"), null);

    // A selection that owes something can be paid on its own.
    const pick = line("Owes B").querySelector("[data-report-pick]");
    pick.checked = true;
    pick.dispatchEvent(new browser.window.Event("change", { bubbles: true }));
    assert.equal(
      panel().querySelector('[data-report-pay="selected"]').textContent.trim(),
      "Pay selected (1)",
    );
    panel().querySelector('[data-report="act:clear"]').click();

    // "Pay all" opens the first page and walks on from there.
    panel().querySelector('[data-report-pay="all"]').click();
    await settle();
    assert.equal(
      text(".ma-rep-paybar .ma-rep-payhead > b"),
      "Paying debts: 1 of 2 opened · 0 paid",
    );
    const next = panel().querySelector('[data-report-pay="next:333"]');
    assert.match(next.textContent, /Next: Owes B/);

    // Back in Ads Manager: the opened account is read again; it is paid.
    ACCOUNTS[222].status = 1;
    browser.window.dispatchEvent(new browser.window.Event("focus"));
    await settle();
    assert.equal(
      text(".ma-rep-paybar .ma-rep-payhead > b"),
      "Paying debts: 1 of 2 opened · 1 paid",
    );
    assert.equal(
      line("Owes A").querySelector(".ma-rep-paid").textContent,
      "paid ✓",
    );
    assert.ok(!line("Owes A").classList.contains("ma-rep-dead"));

    panel().querySelector('[data-report-pay="next:333"]').click();
    await settle();
    assert.match(text(".ma-rep-paybar > small"), /All payment pages are open/);
    // Not paid yet: the check says so by changing nothing.
    panel().querySelector('[data-report="paycheck"]').click();
    await settle();
    assert.equal(
      text(".ma-rep-paybar .ma-rep-payhead > b"),
      "Paying debts: 2 of 2 opened · 1 paid",
    );
    ACCOUNTS[333].status = 1;
    panel().querySelector('[data-report="paycheck"]').click();
    await settle();
    assert.equal(
      text(".ma-rep-paybar .ma-rep-payhead > b"),
      "All debts are paid ✓",
    );
    panel().querySelector('[data-report="payend"]').click();
    assert.equal(panel().querySelector(".ma-rep-paybar"), null);
    // The status filter counts the accounts as live now.
    assert.equal(
      panel().querySelector('[data-report="status:live"] em').textContent,
      "3",
    );
    services.panelController.destroy();
  } finally {
    Object.assign(globalThis, previous);
    browser.window.close();
  }
});
