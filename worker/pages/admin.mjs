import { CLIENT_HELPERS, page } from "./layout.mjs";

export function adminPage() {
  return page({
    title: "MirrorAds — админка",
    width: 1100,
    nav: false,
    body: `
<h1>Админка</h1>
<div id="warn"></div>
<div class="tabs" id="tabs">
  <button type="button" data-tab="licenses" class="on">Ключи</button>
  <button type="button" data-tab="orders">Оплаты</button>
  <button type="button" data-tab="plans">Тарифы</button>
  <button type="button" data-tab="promos">Промокоды</button>
  <button type="button" data-tab="settings">Настройки</button>
</div>

<section id="tab-licenses">
  <div class="card">
    <h2>Выдать ключ вручную</h2>
    <div class="row">
      <label class="grow">Дней <span>(0 — бессрочно)</span><input id="lic-days" type="number" min="0" value="30" /></label>
      <label class="grow">Заметка <span>(кому)</span><input id="lic-note" /></label>
      <label class="grow">Контакт<input id="lic-contact" /></label>
    </div>
    <button class="primary" type="button" id="lic-create">Создать ключ</button>
    <div id="lic-result" class="hidden" style="margin-top:14px"></div>
  </div>
  <div class="card">
    <div class="row"><h2 style="margin:0" class="grow">Ключи</h2><input id="lic-search" placeholder="Поиск: ключ, заметка, контакт" style="max-width:320px;margin:0" /></div>
    <div style="overflow:auto;margin-top:12px"><table><thead><tr><th>Ключ</th><th>Заметка / контакт</th><th>До</th><th>Статус</th><th title="Разных соцов за 7 дней / всего">Соцы</th><th>Последний запуск</th><th></th></tr></thead><tbody id="lic-rows"></tbody></table></div>
  </div>
</section>

<section id="tab-orders" class="hidden">
  <div class="card"><div style="overflow:auto"><table><thead><tr><th>Дата</th><th>Тариф</th><th>Сумма</th><th>Промокод</th><th>Статус</th><th>Контакт</th><th>Ключ</th><th>OxaPay</th></tr></thead><tbody id="order-rows"></tbody></table></div></div>
</section>

<section id="tab-plans" class="hidden">
  <div class="card">
    <h2 id="plan-title">Новый тариф</h2>
    <input type="hidden" id="plan-id" />
    <div class="row">
      <label class="grow">Название<input id="plan-name" placeholder="Подписка на месяц" /></label>
      <label class="grow">Дней<input id="plan-days" type="number" min="1" value="30" /></label>
      <label class="grow">Цена, $<input id="plan-price" placeholder="49" /></label>
      <label class="grow">Порядок<input id="plan-sort" type="number" value="0" /></label>
    </div>
    <label><input type="checkbox" id="plan-active" checked style="display:inline;width:auto;margin:0 6px 0 0" />Показывать покупателям</label>
    <div class="row"><button class="primary" type="button" id="plan-save">Сохранить тариф</button><button type="button" id="plan-new">Новый</button></div>
  </div>
  <div class="card"><table><thead><tr><th>Название</th><th>Дней</th><th>Цена</th><th>На сайте</th><th>Порядок</th><th></th></tr></thead><tbody id="plan-rows"></tbody></table></div>
</section>

<section id="tab-promos" class="hidden">
  <div class="card">
    <h2>Промокод</h2>
    <div class="row">
      <label class="grow">Код<input id="promo-code" placeholder="PARTNER20" /></label>
      <label class="grow">Тип<select id="promo-kind"><option value="percent">Процент</option><option value="amount">Сумма, $</option></select></label>
      <label class="grow">Скидка<input id="promo-value" placeholder="20" /></label>
      <label class="grow">Лимит <span>(пусто — без лимита)</span><input id="promo-max" type="number" min="1" /></label>
      <label class="grow">Действует до <span>(пусто — всегда)</span><input id="promo-until" type="date" /></label>
    </div>
    <div class="row">
      <label class="grow">Только для тарифов <span>(пусто — для всех)</span><select id="promo-plans" multiple size="3"></select></label>
      <label class="grow">Заметка <span>(например, партнёр)</span><input id="promo-note" /></label>
    </div>
    <label><input type="checkbox" id="promo-active" checked style="display:inline;width:auto;margin:0 6px 0 0" />Активен</label>
    <button class="primary" type="button" id="promo-save">Сохранить промокод</button>
  </div>
  <div class="card"><table><thead><tr><th>Код</th><th>Скидка</th><th>Использован</th><th>До</th><th>Тарифы</th><th>Заметка</th><th>Активен</th><th></th></tr></thead><tbody id="promo-rows"></tbody></table></div>
</section>

<section id="tab-settings" class="hidden">
  <div class="card">
    <label><input type="checkbox" id="set-enforce" style="display:inline;width:auto;margin:0 6px 0 0" />Требовать ключ лицензии</label>
    <p class="muted small" style="margin:-8px 0 16px">Пока выключено, MirrorAds работает у всех без ключа (ключи только учитываются). Включите, когда выдадите ключи себе и команде.</p>
    <label><input type="checkbox" id="set-sandbox" style="display:inline;width:auto;margin:0 6px 0 0" />Тестовый режим OxaPay</label>
    <p class="muted small" style="margin:-8px 0 16px">Счета создаются тестовые: можно проверить покупку целиком без настоящих денег.</p>
    <label>Ссылка на поддержку <span>(например, https://t.me/имя)</span><input id="set-support" /></label>
    <button class="primary" type="button" id="set-save">Сохранить</button>
    <span id="set-msg" class="small ok"></span>
  </div>
  <div class="card small muted" id="sys"></div>
</section>`,
    script: `${CLIENT_HELPERS}
const H = { "x-mirrorads": "admin" };
const call = (path, body) => api(path, body, H);
let state = null;
document.querySelectorAll("#tabs button").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b === button));
  document.querySelectorAll("section[id^=tab-]").forEach((s) => s.classList.toggle("hidden", s.id !== "tab-" + button.dataset.tab));
}));
const statusOf = (l) => l.status === "blocked" ? '<span class="status bad">блок</span>' : (l.expires_at && l.expires_at < Date.now() ? '<span class="status bad">истёк</span>' : '<span class="status good">активен</span>');
function renderLicenses() {
  const q = $("#lic-search").value.trim().toLowerCase();
  const rows = state.licenses.filter((l) => !q || [l.id, l.note, l.contact].join(" ").toLowerCase().includes(q));
  $("#lic-rows").innerHTML = rows.map((l) => '<tr><td><b>MA-' + esc(l.id) + '</b><div class="muted small">' + (l.source === "order" ? "куплен" : "вручную") + ' ' + day(l.created_at) + '</div></td><td>' + esc(l.note) + '<div class="muted small">' + esc(l.contact) + '</div></td><td>' + (l.expires_at ? day(l.expires_at) : "бессрочно") + '</td><td>' + statusOf(l) + '</td><td>' + (l.seats_week || 0) + ' / ' + (l.seats_total || 0) + '</td><td>' + (l.last_seen ? day(l.last_seen) : "—") + '</td><td style="white-space:nowrap"><button data-act="extend" data-id="' + esc(l.id) + '">+30 дн.</button> <button data-act="' + (l.status === "blocked" ? "unblock" : "block") + '" data-id="' + esc(l.id) + '">' + (l.status === "blocked" ? "Разблок." : "Блок") + '</button> <button data-act="key" data-id="' + esc(l.id) + '">Ключ</button></td></tr>').join("") || '<tr><td colspan="7" class="muted">Ключей пока нет.</td></tr>';
}
function renderOrders() {
  const names = { pending: "ждёт оплату", paid: "оплачен", expired: "истёк", failed: "ошибка" };
  $("#order-rows").innerHTML = state.orders.map((o) => '<tr><td>' + day(o.created_at) + '</td><td>' + esc(o.plan_name) + (o.renew ? ' <span class="muted small">продление</span>' : "") + '</td><td>' + usd(o.amount_cents) + (o.amount_cents !== o.price_cents ? ' <s class="muted">' + usd(o.price_cents) + '</s>' : "") + '</td><td>' + esc(o.promo || "") + '</td><td><span class="status' + (o.status === "paid" ? " good" : o.status === "failed" ? " bad" : "") + '">' + esc(names[o.status] || o.status) + '</span>' + (o.note ? '<div class="error small">' + esc(o.note) + '</div>' : "") + '</td><td>' + esc(o.contact) + '</td><td>' + (o.license_id ? "MA-" + esc(o.license_id) : "") + '</td><td class="muted small">' + esc(o.track_id || "") + '</td></tr>').join("") || '<tr><td colspan="8" class="muted">Оплат пока нет.</td></tr>';
}
function renderPlans() {
  $("#plan-rows").innerHTML = state.plans.map((p) => '<tr><td>' + esc(p.name) + '</td><td>' + p.days + '</td><td>' + usd(p.price_cents) + '</td><td>' + (p.active ? "да" : "нет") + '</td><td>' + p.sort + '</td><td><button data-plan="' + esc(p.id) + '">Изменить</button></td></tr>').join("") || '<tr><td colspan="6" class="muted">Тарифов нет — добавьте первый.</td></tr>';
  $("#promo-plans").innerHTML = state.plans.map((p) => '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>').join("");
}
function renderPromos() {
  $("#promo-rows").innerHTML = state.promos.map((p) => '<tr><td><b>' + esc(p.code) + '</b></td><td>' + (p.kind === "amount" ? usd(p.value) : p.value + "%") + '</td><td>' + p.uses + (p.max_uses ? " из " + p.max_uses : "") + '</td><td>' + (p.expires_at ? day(p.expires_at) : "—") + '</td><td class="small">' + esc((p.plan_ids || "").split(",").filter(Boolean).map((id) => (state.plans.find((x) => x.id === id) || { name: id }).name).join(", ") || "все") + '</td><td>' + esc(p.note) + '</td><td>' + (p.active ? "да" : "нет") + '</td><td><button data-promo="' + esc(p.code) + '">Изменить</button></td></tr>').join("") || '<tr><td colspan="8" class="muted">Промокодов нет.</td></tr>';
}
function renderSettings() {
  $("#set-enforce").checked = state.settings.enforce === "1";
  $("#set-sandbox").checked = state.settings.sandbox === "1";
  $("#set-support").value = state.settings.support || "";
  $("#sys").innerHTML = "OxaPay: " + (state.oxapay ? '<span class="ok">подключён</span>' : '<span class="error">не подключён</span>') + "<br>Уведомления об оплате приходят на " + esc(state.origin) + "/api/oxapay/webhook<br>Сборка скрипта: " + esc(state.build);
  const warn = [];
  if (!state.oxapay) warn.push("OxaPay не подключён: добавьте в Cloudflare секрет OXAPAY_MERCHANT_KEY, иначе покупка не работает.");
  if (!state.plans.some((p) => p.active)) warn.push("Нет активных тарифов — на странице покупки пусто.");
  $("#warn").innerHTML = warn.map((text) => '<div class="warn">' + esc(text) + '</div>').join("");
}
function render() { renderLicenses(); renderOrders(); renderPlans(); renderPromos(); renderSettings(); }
async function load() { state = await call("/api/admin/state"); render(); }
$("#lic-search").addEventListener("input", renderLicenses);
$("#lic-create").addEventListener("click", async () => {
  const result = await call("/api/admin/license/create", { days: Number($("#lic-days").value) || 0, note: $("#lic-note").value, contact: $("#lic-contact").value });
  const box = $("#lic-result"); box.classList.remove("hidden");
  box.innerHTML = '<div class="key">' + esc(result.key) + '</div><div class="row" style="margin-top:10px"><button type="button" id="copy-key">Скопировать ключ</button><button type="button" id="copy-cab">Скопировать ссылку на кабинет</button></div><p class="muted small">Отправьте человеку ссылку на кабинет: там его ключ и личная закладка.</p>';
  $("#copy-key").onclick = () => copyText(result.key, $("#copy-key"));
  $("#copy-cab").onclick = () => copyText(result.cabinet, $("#copy-cab"));
  load();
});
$("#lic-rows").addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-act]"); if (!button) return;
  const result = await call("/api/admin/license/action", { id: button.dataset.id, action: button.dataset.act, days: 30 });
  if (button.dataset.act === "key") { await copyText(result.cabinet); prompt("Ключ (ссылка на кабинет уже скопирована):", result.key); }
  load();
});
function editPlan(plan) {
  $("#plan-title").textContent = plan ? "Изменить тариф" : "Новый тариф";
  $("#plan-id").value = plan ? plan.id : ""; $("#plan-name").value = plan ? plan.name : "";
  $("#plan-days").value = plan ? plan.days : 30; $("#plan-price").value = plan ? plan.price_cents / 100 : "";
  $("#plan-sort").value = plan ? plan.sort : 0; $("#plan-active").checked = plan ? Boolean(plan.active) : true;
}
$("#plan-rows").addEventListener("click", (event) => { const b = event.target.closest("button[data-plan]"); if (b) editPlan(state.plans.find((p) => p.id === b.dataset.plan)); });
$("#plan-new").addEventListener("click", () => editPlan(null));
$("#plan-save").addEventListener("click", async () => {
  try { await call("/api/admin/plan", { id: $("#plan-id").value, name: $("#plan-name").value, days: Number($("#plan-days").value), price: $("#plan-price").value, sort: Number($("#plan-sort").value), active: $("#plan-active").checked }); editPlan(null); load(); }
  catch (error) { alert(error.message); }
});
$("#promo-rows").addEventListener("click", (event) => {
  const b = event.target.closest("button[data-promo]"); if (!b) return;
  const p = state.promos.find((x) => x.code === b.dataset.promo);
  $("#promo-code").value = p.code; $("#promo-kind").value = p.kind; $("#promo-value").value = p.kind === "amount" ? p.value / 100 : p.value;
  $("#promo-max").value = p.max_uses || ""; $("#promo-until").value = p.expires_at ? new Date(p.expires_at - 1).toISOString().slice(0, 10) : "";
  const ids = (p.plan_ids || "").split(","); [...$("#promo-plans").options].forEach((o) => { o.selected = ids.includes(o.value); });
  $("#promo-note").value = p.note || ""; $("#promo-active").checked = Boolean(p.active);
});
$("#promo-save").addEventListener("click", async () => {
  try {
    await call("/api/admin/promo", { code: $("#promo-code").value, kind: $("#promo-kind").value, value: $("#promo-value").value, max_uses: $("#promo-max").value, until: $("#promo-until").value, plan_ids: [...$("#promo-plans").selectedOptions].map((o) => o.value).join(","), note: $("#promo-note").value, active: $("#promo-active").checked });
    load();
  } catch (error) { alert(error.message); }
});
$("#set-save").addEventListener("click", async () => {
  await call("/api/admin/settings", { enforce: $("#set-enforce").checked ? "1" : "0", sandbox: $("#set-sandbox").checked ? "1" : "0", support: $("#set-support").value.trim() });
  $("#set-msg").textContent = "Сохранено"; setTimeout(() => { $("#set-msg").textContent = ""; }, 2000); load();
});
load().catch((error) => { $("#warn").innerHTML = '<div class="warn">' + esc(error.message) + '</div>'; });`,
  });
}
