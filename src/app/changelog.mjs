/**
 * What changed, newest first, as the user sees it. Every release that changes
 * something visible adds an entry with its build number: the panel shows the
 * entries a user has not seen yet once, and the whole list on request.
 */
export const CHANGELOG = [
  {
    version: "151126b9",
    date: "2026-11-15",
    ru: [
      "Смена сета: имя сета в названиях находится без учёта регистра и разделителей (Gina_V4, gina v4, GINA-V4, GinaV4), и даже если в имени сета есть лишнее слово. Под выбором сета видно, какие названия поменяются, а если ни одно — какие они сейчас.",
    ],
    en: [
      "Set switch: the set's name is found in names whatever the case and separators (Gina_V4, gina v4, GINA-V4, GinaV4), even when the set's name has an extra word. Under the set choice you see which names will change, or what they are when none will.",
    ],
  },
  {
    version: "151126b8",
    date: "2026-11-15",
    ru: [
      "Клонирование: в «Изменить при клонировании» можно выбрать другой сет того же каталога — например, Gina_V5 вместо Gina_V4. Где в названиях кампании, групп и объявлений стоит имя старого сета, будет имя нового.",
    ],
    en: [
      "Clone: “Change on clone” can switch the campaign to another set of the same catalog — e.g. Gina_V5 instead of Gina_V4. Where campaign, ad set and ad names contain the old set's name, the new one is used.",
    ],
  },
  {
    version: "151126b7",
    date: "2026-11-15",
    ru: [
      "Обновления приходят быстрее: после запуска MirrorAds сам проверяет, не вышла ли новая версия, и подсказывает внизу слева — достаточно нажать закладку ещё раз.",
    ],
    en: [
      "Updates arrive faster: after starting, MirrorAds checks for a new version and says so at the bottom left — just click the bookmark again.",
    ],
  },
  {
    version: "151126b6",
    date: "2026-11-15",
    ru: [
      "Клонирование: строка «Для выбранных» над списком — страница, пиксель и каталог ставятся сразу во все выбранные кабинеты. Если где-то такой страницы или пикселя нет, покажет, в каких кабинетах.",
    ],
    en: [
      "Clone: the “For the selected” row above the list sets the page, pixel and catalog in every selected account at once, and names the accounts that do not have that page or pixel.",
    ],
  },
  {
    version: "151126b5",
    date: "2026-11-15",
    ru: [
      "Клонирование: у каждого кабинета видно, есть ли в нём уже кампании. Кнопка «Без кампаний» оставляет в списке только пустые кабинеты, и в скрытые ничего не клонируется.",
      "Кнопка «Вставить ID»: вставьте список ID от агента — эти кабинеты выберутся сами. Покажет, каких нет в профиле, какие отключены или без карты и где уже есть кампании.",
    ],
    en: [
      "Clone: every account shows whether it already has campaigns. The “Without campaigns” button keeps only empty accounts in the list, and nothing is cloned into hidden ones.",
      "“Paste IDs”: paste an agent's list of account IDs and those accounts are selected. It tells you which are missing from the profile, disabled or without a card, or already have campaigns.",
    ],
  },
  {
    version: "151126b3",
    date: "2026-11-15",
    ru: [
      "Исправлен запуск после прошлого обновления: скрипт не загружался с ошибкой «Facebook ещё не обновил части скрипта».",
    ],
    en: [
      "Fixed the start after the previous update: the script did not load, saying Facebook had not refreshed its pieces.",
    ],
  },
  {
    version: "151126b2",
    date: "2026-11-15",
    ru: [
      "Подписка по ключу: в меню ⚙ видно ваш ключ и до какого числа он действует. За 5 дней до конца появится напоминание с кнопкой «Продлить».",
      "Кабинет на сайте: ключ, продление и личная закладка, в которой ключ уже записан, — её достаточно поставить в каждый браузер.",
      "Ключ проверяется в фоне и не замедляет запуск. Без интернета MirrorAds работает по последней проверке до 7 дней.",
    ],
    en: [
      "Subscription keys: the ⚙ menu shows your key and its end date. Five days before the end a reminder with a Renew button appears.",
      "A cabinet on the site: your key, renewal and a personal bookmark with the key already inside — install it in every browser.",
      "The key is checked in the background and does not slow the start. Offline, MirrorAds keeps working on the last check for up to 7 days.",
    ],
  },
  {
    version: "151126b1",
    date: "2026-11-15",
    ru: [
      "Окно MirrorAds больше не закрывает Ads Manager: страница сдвигается влево и занимает оставшееся место. Старый режим «поверх» включается в меню ⚙.",
      "Ширину окна можно менять: потяните за левый край. Двойной клик по краю возвращает стандартную ширину.",
      "Это окно: после каждого обновления один раз показываем, что изменилось. Вся история — по клику на номер сборки вверху или в меню ⚙ → «Что нового».",
      "Установка одной закладкой со страницы установки, обновления приходят сами.",
    ],
    en: [
      "The MirrorAds window no longer covers Ads Manager: the page moves left and uses the remaining space. The old overlay mode is in the ⚙ menu.",
      "Drag the window's left edge to change its width. Double-click the edge for the standard width.",
      "This window: after every update it shows once what changed. The full history is behind the build number at the top and in ⚙ → What's new.",
      "Install with one bookmark from the install page; updates arrive by themselves.",
    ],
  },
  {
    version: "141126b13",
    date: "2026-11-14",
    ru: [
      "Правила: суммы в деньгах пересчитываются в валюту кабинета по курсу Meta — $100 становится той же суммой в VND, EUR и т. д.",
    ],
    en: [
      "Rules: money amounts are converted to the account currency at Meta's rate — $100 becomes the same money in VND, EUR, etc.",
    ],
  },
  {
    version: "141126b12",
    date: "2026-11-14",
    ru: [
      "Клонирование идёт сразу в 3 кабинета — в 2–3 раза быстрее.",
      "Окно подтверждения каталога больше не появляется на каждый кабинет.",
      "Кнопка «Повторить упавшие» в итоге клонирования.",
      "Новая вкладка «Правила»: копирование автоправил между кабинетами.",
      "Отчёты: выключенные кампании видны в списке, их можно включить; дневной бюджет кампании меняется прямо в списке.",
    ],
    en: [
      "Cloning runs in 3 accounts at once — 2–3 times faster.",
      "The catalog confirmation no longer appears for every account.",
      "“Retry failed” button in the clone summary.",
      "New Rules tab: copy automated rules between accounts.",
      "Reports: switched-off campaigns are listed and can be switched on; a campaign's daily budget is edited right in the list.",
    ],
  },
  {
    version: "141126b11",
    date: "2026-11-14",
    ru: [
      "{creo}: если объявления отличаются только номером — диапазон (Shugairi_V1-3), иначе общая часть названия.",
    ],
    en: [
      "{creo}: ads that differ only in the number give a range (Shugairi_V1-3), otherwise the shared part of the name.",
    ],
  },
  {
    version: "141126b10",
    date: "2026-11-14",
    ru: [
      "Отчёты: по клику на «активных: N» открывается список кампаний кабинета с кнопками «Выключить» и «Выключить все».",
      "{creo} берётся из названия объявления.",
      "Публикация в режимах ACTIVE и PAUSED быстрее.",
    ],
    en: [
      "Reports: clicking “active: N” opens the account's campaigns with “Switch off” and “Switch off all”.",
      "{creo} is taken from the ad name.",
      "Publishing in ACTIVE and PAUSED modes is faster.",
    ],
  },
  {
    version: "141126b9",
    date: "2026-11-14",
    ru: [
      "Адсеты и объявления в клоне всегда включены. Режим решает только кампанию: ACTIVE — включена, PAUSED — выключена, DRAFT — черновик.",
    ],
    en: [
      "Ad sets and ads of a clone are always on. The mode decides only the campaign: ACTIVE — on, PAUSED — off, DRAFT — a draft.",
    ],
  },
  {
    version: "141126b8",
    date: "2026-11-14",
    ru: [
      "Кнопка «Клонировать» снова активна после запуска — перезапускать скрипт не нужно.",
      "Объявления публикуются по три одновременно.",
    ],
    en: [
      "The Clone button is active again after a run — no need to restart the script.",
      "Ads are published three at a time.",
    ],
  },
  {
    version: "141126b7",
    date: "2026-11-14",
    ru: [
      "Кампании с каталогом публикуются в выбранном режиме, а не только черновиком.",
      "Клонирование в черновики быстрее.",
    ],
    en: [
      "Catalog campaigns are published in the chosen mode, not only as drafts.",
      "Cloning into drafts is faster.",
    ],
  },
  {
    version: "141126b6",
    date: "2026-11-14",
    ru: [
      "Value Rules переносятся и при бюджете на уровне кампании.",
      "Макросы вставляются в шаблон названия кликом.",
      "Новое окно итога клонирования.",
    ],
    en: [
      "Value Rules are carried over with a campaign budget too.",
      "Click a macro to insert it into the name template.",
      "New clone summary window.",
    ],
  },
  {
    version: "141126b5",
    date: "2026-11-14",
    ru: [
      "Правки при клонировании: бюджет, ставка и время старта для всех клонов сразу.",
      "Отчёты: выключение кампаний и изменение бюджетов сразу в отмеченных кабинетах.",
    ],
    en: [
      "Changes on clone: budget, bid and start time for all clones at once.",
      "Reports: switch off campaigns and change budgets in the selected accounts at once.",
    ],
  },
  {
    version: "141126b4",
    date: "2026-11-14",
    ru: [
      "Новый интерфейс MirrorAds.",
      "Value Rules копируются вместе с кампанией и создаются в кабинете, где их нет.",
      "Автоназвание кампании с полным ID кабинета; название можно поправить для каждого кабинета.",
      "Прямая публикация в режимах ACTIVE и PAUSED.",
      "Вкладка «Отчёты»: расход, лиды, CPL, покупки и CPA в долларах; пояс кабинета или свой; живые и забаненные кабинеты.",
    ],
    en: [
      "New MirrorAds interface.",
      "Value Rules are copied with the campaign and created where an account lacks them.",
      "Automatic campaign name with the full account ID; editable per account.",
      "Direct publishing in ACTIVE and PAUSED modes.",
      "Reports tab: spend, leads, CPL, purchases and CPA in dollars; account or own time zone; live and banned accounts.",
    ],
  },
];
