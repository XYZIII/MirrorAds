import { CLIENT_HELPERS, escapeHtml, page } from "./layout.mjs";

const SUPPORT = (support) =>
  support
    ? `<p class="muted small">Вопросы и помощь: <a href="${escapeHtml(support)}" target="_blank" rel="noopener">${escapeHtml(support.replace(/^https?:\/\//, ""))}</a></p>`
    : "";

export function buyPage({ support }) {
  return page({
    title: "MirrorAds — подписка",
    body: `
<h1 id="title">Подписка MirrorAds</h1>
<p class="lead" id="lead">Оплата криптой. Ключ появится сразу после оплаты.</p>
<div id="plans" class="plans"><div class="muted">Загружаю тарифы…</div></div>
<div class="card">
  <div class="row">
    <label class="grow">Промокод <span>(если есть)</span><input id="promo" autocomplete="off" /></label>
    <button id="apply" type="button" style="margin-top:8px">Применить</button>
  </div>
  <div id="promo-msg" class="small" style="margin:-6px 0 12px"></div>
  <label id="contact-row">Telegram или email <span>(по желанию — чтобы мы могли помочь)</span><input id="contact" autocomplete="off" /></label>
  <div class="total">К оплате: <b id="total">—</b><s id="old"></s></div>
  <button id="pay" class="primary" type="button" disabled>Оплатить криптой</button>
  <div id="error" class="error" style="margin-top:12px"></div>
</div>
<p class="muted small" style="margin-top:16px">После оплаты откроется страница с ключом и личной закладкой. Сохраните ссылку на неё.</p>
${SUPPORT(support)}`,
    script: `${CLIENT_HELPERS}
const renew = new URLSearchParams(location.hash.slice(1)).get("renew") || "";
let plans = [], selected = "", promoOk = "";
if (renew) {
  $("#title").textContent = "Продление подписки";
  $("#lead").textContent = "Ключ " + renew.slice(0, 11) + "… — дни добавятся к текущему сроку.";
  $("#contact-row").classList.add("hidden");
}
function render() {
  $("#plans").innerHTML = plans.length ? plans.map((p) =>
    '<label class="plan' + (p.id === selected ? " on" : "") + '"><input type="radio" name="plan" value="' + esc(p.id) + '"' + (p.id === selected ? " checked" : "") + ' /><b>' + esc(p.name) + '</b><div class="price">' + usd(p.price_cents) + ' <small>/ ' + p.days + ' дн.</small></div></label>'
  ).join("") : '<div class="muted">Тарифов пока нет.</div>';
  $("#pay").disabled = !selected || !window.paymentsOn;
}
async function updateTotal() {
  if (!selected) return;
  const code = $("#promo").value.trim();
  try {
    const q = await api("/api/quote", { plan: selected, promo: code });
    $("#total").textContent = usd(q.amount_cents);
    $("#old").textContent = q.discount_cents ? usd(q.price_cents) : "";
    const msg = $("#promo-msg");
    if (!code) { msg.textContent = ""; promoOk = ""; }
    else if (q.problem) { msg.className = "small error"; msg.textContent = q.message; promoOk = ""; }
    else { msg.className = "small ok"; msg.textContent = "Скидка " + usd(q.discount_cents); promoOk = code; }
  } catch (error) { $("#error").textContent = error.message; }
}
$("#plans").addEventListener("change", (event) => { selected = event.target.value; render(); updateTotal(); });
$("#apply").addEventListener("click", updateTotal);
$("#pay").addEventListener("click", async () => {
  $("#error").textContent = ""; $("#pay").disabled = true; $("#pay").textContent = "Создаю счёт…";
  try {
    const result = await api("/api/order", { plan: selected, promo: $("#promo").value.trim(), contact: $("#contact").value.trim(), renew_key: renew });
    location.href = result.payUrl || result.orderUrl;
  } catch (error) {
    $("#error").textContent = error.message; $("#pay").disabled = false; $("#pay").textContent = "Оплатить криптой";
  }
});
api("/api/plans").then((data) => {
  plans = data.plans; window.paymentsOn = data.payments; selected = plans[0] ? plans[0].id : "";
  if (!data.payments) $("#error").textContent = "Оплата пока не подключена.";
  render(); updateTotal();
}).catch((error) => { $("#plans").innerHTML = '<div class="error">' + esc(error.message) + '</div>'; });`,
  });
}

export function orderPage({ orderId, view, support }) {
  return page({
    title: "MirrorAds — оплата",
    body: `
<h1 id="title">Проверяю оплату…</h1>
<p class="lead" id="lead"></p>
<div class="card hidden" id="paid">
  <h2>Ваш ключ</h2>
  <div class="key" id="key"></div>
  <div class="row" style="margin-top:14px">
    <a class="button primary" id="cabinet" href="/cabinet">Открыть кабинет и установить</a>
    <button type="button" id="copy">Скопировать ключ</button>
  </div>
  <p class="muted small" style="margin-bottom:0">Сохраните ключ или ссылку на кабинет: по ним вы продлеваете подписку и ставите скрипт в новые браузеры.</p>
</div>
<div class="row hidden" id="pending"><a class="button primary" id="pay" href="#">Перейти к оплате</a><span class="muted small">Страница обновится сама после оплаты.</span></div>
${SUPPORT(support)}`,
    script: `${CLIENT_HELPERS}
const id = ${JSON.stringify(orderId)}, view = ${JSON.stringify(view)};
async function poll() {
  try {
    const o = await api("/api/order/status", { id, view });
    if (o.status === "paid") {
      $("#title").textContent = o.renew ? "Подписка продлена" : "Оплата получена";
      $("#lead").textContent = o.expires_at ? "Подписка действует до " + day(o.expires_at) + "." : "";
      $("#paid").classList.remove("hidden"); $("#pending").classList.add("hidden");
      $("#key").textContent = o.key; $("#cabinet").href = "/cabinet#" + o.key;
      $("#copy").onclick = () => copyText(o.key, $("#copy"));
      return;
    }
    if (o.status === "expired" || o.status === "failed") {
      $("#title").textContent = o.status === "expired" ? "Время на оплату вышло" : "Счёт не создан";
      $("#lead").innerHTML = 'Если вы уже заплатили — напишите в поддержку. Иначе <a href="/buy">начните заново</a>.';
      $("#pending").classList.add("hidden"); return;
    }
    $("#title").textContent = "Ждём оплату";
    $("#lead").textContent = o.plan_name + " — " + usd(o.amount_cents) + ". После поступления средств ключ появится здесь.";
    if (o.pay_url) { $("#pending").classList.remove("hidden"); $("#pay").href = o.pay_url; }
  } catch (error) { $("#title").textContent = "Заказ не найден"; $("#lead").textContent = error.message; return; }
  setTimeout(poll, 5000);
}
poll();`,
  });
}

export function cabinetPage({ support }) {
  return page({
    title: "MirrorAds — кабинет",
    body: `
<h1>Кабинет</h1>
<div class="card" id="enter">
  <label>Ключ лицензии<input id="key-input" placeholder="MA-XXXXXXXX-…" autocomplete="off" /></label>
  <button class="primary" type="button" id="open">Открыть</button>
  <div class="error" id="error" style="margin-top:12px"></div>
</div>
<div id="info" class="hidden">
  <div class="card">
    <div class="row"><h2 style="margin:0" id="state"></h2><span class="status" id="badge"></span></div>
    <p class="muted" id="details" style="margin:8px 0 14px"></p>
    <div class="key" id="key"></div>
    <div class="row" style="margin-top:14px">
      <a class="button primary" id="renew" href="/buy">Продлить</a>
      <button type="button" id="copy">Скопировать ключ</button>
    </div>
  </div>
  <div class="card">
    <h2>Установка в браузер</h2>
    <p class="muted small" style="margin-top:0">Личная закладка — ключ уже внутри. Поставьте её в каждый браузер, где работаете: перетащите кнопку на панель закладок или скопируйте код.</p>
    <div class="row"><a class="bookmark" id="bookmark" href="#">MirrorAds</a><button type="button" id="copy-bookmark">Скопировать код закладки</button></div>
    <ol class="steps">
      <li>Покажите панель закладок: Ctrl+Shift+B (на Mac ⌘+Shift+B).</li>
      <li>Перетащите зелёную кнопку на панель. Или: правый клик по панели → «Добавить страницу» → в поле URL вставьте код.</li>
      <li>Откройте Ads Manager и нажмите закладку.</li>
    </ol>
  </div>
</div>
${SUPPORT(support)}`,
    script: `${CLIENT_HELPERS}
let loaderCode = "";
async function show(key) {
  $("#error").textContent = "";
  try {
    const info = await api("/api/cabinet", { key });
    history.replaceState(null, "", "#" + info.key);
    $("#enter").classList.add("hidden"); $("#info").classList.remove("hidden");
    const now = Date.now();
    const badge = $("#badge");
    if (info.status === "blocked") { $("#state").textContent = "Ключ заблокирован"; badge.textContent = "заблокирован"; badge.className = "status bad"; }
    else if (info.expires_at && info.expires_at < now) { $("#state").textContent = "Подписка закончилась " + day(info.expires_at); badge.textContent = "истекла"; badge.className = "status bad"; }
    else { $("#state").textContent = info.expires_at ? "Подписка активна до " + day(info.expires_at) : "Бессрочный ключ"; badge.textContent = "активна"; badge.className = "status good"; }
    $("#details").textContent = "Соцов, где запускали MirrorAds за 7 дней: " + (info.seats_week || 0) + ".";
    $("#key").textContent = info.key;
    $("#copy").onclick = () => copyText(info.key, $("#copy"));
    $("#renew").href = "/buy#renew=" + encodeURIComponent(info.key);
    $("#renew").classList.toggle("hidden", !info.expires_at);
    if (!loaderCode) loaderCode = await (await fetch("/mirrorads/latest/loader.txt", { cache: "no-store" })).text();
    const href = "javascript:" + encodeURIComponent(loaderCode.replace("__LICENSE_KEY__", info.key));
    $("#bookmark").href = href;
    $("#bookmark").onclick = (event) => { event.preventDefault(); };
    $("#copy-bookmark").onclick = () => copyText(href, $("#copy-bookmark"));
  } catch (error) { $("#enter").classList.remove("hidden"); $("#info").classList.add("hidden"); $("#error").textContent = error.message; }
}
$("#open").addEventListener("click", () => show($("#key-input").value));
$("#key-input").addEventListener("keydown", (event) => { if (event.key === "Enter") show($("#key-input").value); });
const fromHash = decodeURIComponent(location.hash.slice(1));
if (fromHash) { $("#key-input").value = fromHash; show(fromHash); }`,
  });
}

export function messagePage({ title, text }) {
  return page({
    title,
    body: `<h1>${escapeHtml(title)}</h1><p class="lead">${escapeHtml(text)}</p>`,
  });
}
