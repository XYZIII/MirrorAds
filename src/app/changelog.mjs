/**
 * What changed, newest first, as the user sees it. Every release that changes
 * something visible adds an entry with its build number: the panel shows the
 * entries a user has not seen yet once, and the whole list on request.
 */
export const CHANGELOG = [
  {
    version: "201126b3",
    date: "2026-11-20",
    ru: [
      "Клон: отложенный старт переносится одним моментом — все копии стартуют ровно тогда же, когда источник, в каком бы поясе ни был кабинет. По часам кабинета время пересчитывается само.",
      "«Изменить при клонировании» → «Время старта»: переключатель «по часам кабинета» (каждый кабинет стартует во введённое время по своим часам — например, все в 05:00) или «по моему времени» (все в один момент по вашему поясу). Пояс выбирается тут же — это тот же «Мой пояс», что в отчётах. Под полем сразу видно, во сколько стартует каждый пояс кабинетов.",
    ],
    en: [
      "Clone: a scheduled start carries over as one moment: every copy starts exactly when the source does, whatever the account's time zone. The account's clock time is worked out by itself.",
      "Change when cloning → Start time is: a switch between account time (each account starts at the typed time on its own clock, say all at 05:00) and my time (all at one moment in your zone). The zone is picked right there, the same “my time” as in Reports. Below the field you see when each of the accounts' zones starts.",
    ],
  },
  {
    version: "201126b2",
    date: "2026-11-20",
    ru: [
      "Клон: отложенный запуск больше не теряется — раньше копии стартовали сразу, теперь у них остаётся запланированный старт.",
      "Клон каталожных кампаний: копия больше не сбрасывает товарный сет на «All products». Креатив каталога, у которого Meta не отдаёт сет, берёт сет своей группы объявлений, а кампания сохраняет свой каталог. В логе клона видно, какой сет записан в группы и креативы.",
    ],
    en: [
      "Clone: a scheduled start is no longer lost: the copies used to start right away, now they keep the planned start.",
      "Clone of catalog campaigns: the copy no longer falls back to All products. A catalog creative whose set Meta does not return takes the set of its ad set, and the campaign keeps its catalog. The clone log shows which set went into the ad sets and creatives.",
    ],
  },
  {
    version: "201126b1",
    date: "2026-11-20",
    ru: [
      "Панель открывается сразу на «Отчётах» — вкладка стоит первой, а отчёт загружается сам, как только подгрузятся кабинеты.",
      "Кабинеты из скрипта (отчёты, группы, история, итог клона) открываются в Ads Manager с датой «Сегодня» по времени самого кабинета, а не за последние 30 дней.",
      "Клонирование: у каждого кабинета виден часовой пояс — и в выборе кабинета-источника, и в списке кабинетов. Новый фильтр по поясу (например, только UTC+7) — скрытые кабинеты снимаются с выбора, а вставленный список ID пропускает кабинеты другого пояса.",
      "Правила: «Вставить список» — вставляете ID кабинетов столбиком, и они сразу становятся целями для копирования правил. Скрипт пишет, кого не нашёл, какие не работают и что источник пропущен.",
      "Объявления и их статусы: кампания, которая включена, но все объявления отклонены (или на проверке, на паузе), считается неактивной. В отчётах у кабинета чип «отклонено: N» (при наведении — какие кампании), в строке «Кампании» фильтр «Не крутят». В списке кампаний под каждой видны её объявления со статусом, причина отклонения — при наведении. В клоне в выборе кампании виден её статус, а в сводке источника — сколько объявлений отклонено.",
      "Новая вкладка «История»: при каждом открытии скрипт сравнивает кабинеты с прошлым разом и записывает новые, забаненные, с долгом, снова живые и пропавшие. О пропаже пишется только для живых кабинетов — удалённый забаненный кабинет не попадает. На вкладке — счётчик новых изменений, фильтры и переход в кабинет.",
      "Новая вкладка «Пиксели»: все пиксели и каталоги ваших кабинетов — скольким кабинетам доступен каждый, а по кнопке «нет в N» — в каких его нет. По умолчанию считаются только живые кабинеты.",
      "Отчёты: кнопка «График» — расход по часам (за день) или по дням (за период), с разбивкой: всего, по кабинетам, по поясам, по статусу. При наведении — суммы за час или день, есть вид таблицей. Включается и выключается, выбор запоминается.",
    ],
    en: [
      "The panel opens on Reports: the tab comes first, and the report loads by itself once the accounts are in.",
      "Accounts opened from the script (reports, groups, history, clone results) show Today in Ads Manager, by the account's own date, instead of the last 30 days.",
      "Clone: each account shows its time zone, in the source account picker and in the account list. A new time zone filter (say, only UTC+7): hidden accounts are unselected, and a pasted ID list skips accounts of another zone.",
      "Rules: “Paste a list” — paste ad account IDs, one per line, and they become the targets for the rules. The script says which ones it did not find, which do not work, and that the source was left out.",
      "Ads and their statuses: a campaign that is on but whose ads are all rejected (or in review, or paused) counts as inactive. In Reports, an account shows a “rejected: N” chip (hover for the campaigns), and the Campaigns row has a “Not running” filter. The campaign list shows each campaign's ads with their status, and the rejection reason on hover. In Clone, the campaign picker shows each campaign's status, and the source summary how many ads are rejected.",
      "New History tab: each open compares the accounts with the last one and notes new, banned, unpaid, live-again and missing accounts. Missing is noted only for live accounts: a banned account you removed does not show up. The tab has a counter of new changes, filters, and a link to each account.",
      "New Pixels tab: every pixel and catalog of your accounts, how many accounts can use each one, and with “missing in N”, which cannot. Live accounts only by default.",
      "Reports: a Chart button — spend by the hour (for a day) or by the day (for a period), split by total, account, time zone or status. Hover for the amounts of an hour or day; a table view too. It switches on and off, and the choice is remembered.",
    ],
  },
  {
    version: "161126b1",
    date: "2026-11-16",
    ru: [
      "Отчёты: у кабинетов с долгом по оплате видна сумма долга и карта, рядом кнопка «Оплатить». Сверху — «Оплатить все», а для отмеченных галочкой — «Оплатить выбранные». Сама оплата проходит на странице Meta (оплатить через API Meta не даёт): скрипт открывает страницы оплаты по очереди, а когда возвращаешься в Ads Manager, сам проверяет, какие кабинеты оплачены, — они снова становятся живыми.",
    ],
    en: [
      "Reports: accounts with an unpaid balance show the amount due and the card, with a Pay button next to them; above the list, Pay all, and Pay selected for the ticked ones. The payment itself happens on Meta's page (Meta has no API to pay): the script opens the payment pages one by one and, when you come back to Ads Manager, checks which accounts got paid; those turn live again.",
    ],
  },
  {
    version: "151126b13",
    date: "2026-11-15",
    ru: [
      "Отчёты: строка «Кампании» — Все / Активные / Неактивные / С расходом, с количеством кампаний по всем кабинетам. По умолчанию видно общее число, активные и неактивные. Кампании забаненных и других нерабочих кабинетов не считаются. Фильтр оставляет кабинеты с такими кампаниями; «С расходом» — потратили за выбранный период. В режиме «Активные» у кабинета видно, сколько включённых кампаний ничего не потратили.",
    ],
    en: [
      "Reports: a Campaigns row — All / Active / Inactive / With spend, with the number of campaigns across all accounts; by default the total, active and inactive ones. Campaigns of banned and other non-working accounts are not counted. The filter keeps the accounts with such campaigns; With spend means spent in the chosen period. In Active, each account shows how many switched-on campaigns spent nothing.",
    ],
  },
  {
    version: "151126b12",
    date: "2026-11-15",
    ru: [
      "Отчёты → «Группы»: кабинеты собираются по креативу, гео, агенту, часовому поясу, статусу, кампаниям, автоправилам, валюте или возрасту кабинета. По каждой группе видно, сколько кабинетов запущено, расход и его долю, лиды и CPL, продажи и CPA. Группа раскрывается списком своих кабинетов, колонки сортируются.",
      "Отчёты → «Кабинеты»: у каждого кабинета видны его автоправила — сколько включено, а при наведении какие именно, что делают и при каких условиях. Кнопка «Без правил» оставляет только кабинеты, где нет ни одного включённого правила.",
    ],
    en: [
      "Reports → Groups: accounts gathered by creative, geo, agent, time zone, status, campaigns, rules, currency or account age. Each group shows how many accounts run, spend and its share, leads and CPL, purchases and CPA. A group opens into its accounts; columns sort.",
      "Reports → Accounts: each account shows its automated rules — how many are on, and on hover which ones, what they do and when. The “No rules” button keeps only the accounts without a rule switched on.",
    ],
  },
  {
    version: "151126b11",
    date: "2026-11-15",
    ru: [
      "Смена сета работает и для сета другого креатива: из «creo_V4 NEW NEW» на «promo_V1» — creo_V4 в названиях станет promo_V1. Какая часть имени сета — креатив, скрипт смотрит по названиям объявлений, а лишние слова старого сета в новые названия не переносит.",
    ],
    en: [
      "The set switch also works for a set of another creative: from “creo_V4 NEW NEW” to “promo_V1”, creo_V4 in names becomes promo_V1. The ad names tell which part of the set's name is the creative, and the old set's extra words stay out of the new names.",
    ],
  },
  {
    version: "151126b10",
    date: "2026-11-15",
    ru: [
      "Название кампании собирается по шаблону {agent}_{id}_{geo}_{creo}: агент — первое слово названия источника, полный id целевого кабинета, гео — страны из таргетинга, креатив — из названий объявлений. Так названия одинаковые, как бы ни был назван источник. Автоматический режим {auto} убран. Если макросу нечего подставить, он пропадает вместе со своим разделителем.",
      "Смена сета: если в имени сета есть лишние слова (creo_V4 NEW NEW → creo_V5), меняется сам креатив — creo_V4 становится creo_V5 в названиях объявлений и групп, а через {creo} и в названии кампании.",
    ],
    en: [
      "Campaign names are built from the template {agent}_{id}_{geo}_{creo}: the agent is the first word of the source name, then the target account's full id, the targeted countries and the creative from the ad names — the same names whatever the source was called. {auto} is gone. A macro with nothing to put in disappears with its separator.",
      "Set switch: when a set's name has extra words (creo_V4 NEW NEW → creo_V5), the creative itself changes — creo_V4 becomes creo_V5 in ad and ad set names, and through {creo} in the campaign name.",
    ],
  },
  {
    version: "151126b9",
    date: "2026-11-15",
    ru: [
      "Смена сета: имя сета в названиях находится без учёта регистра и разделителей (creo_V4, creo v4, CREO-V4, creoV4), и даже если в имени сета есть лишнее слово. Под выбором сета видно, какие названия поменяются, а если ни одно — какие они сейчас.",
    ],
    en: [
      "Set switch: the set's name is found in names whatever the case and separators (creo_V4, creo v4, CREO-V4, creoV4), even when the set's name has an extra word. Under the set choice you see which names will change, or what they are when none will.",
    ],
  },
  {
    version: "151126b8",
    date: "2026-11-15",
    ru: [
      "Клонирование: в «Изменить при клонировании» можно выбрать другой сет того же каталога — например, creo_V5 вместо creo_V4. Где в названиях кампании, групп и объявлений стоит имя старого сета, будет имя нового.",
    ],
    en: [
      "Clone: “Change on clone” can switch the campaign to another set of the same catalog — e.g. creo_V5 instead of creo_V4. Where campaign, ad set and ad names contain the old set's name, the new one is used.",
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
      "{creo}: если объявления отличаются только номером — диапазон (creo_V1-3), иначе общая часть названия.",
    ],
    en: [
      "{creo}: ads that differ only in the number give a range (creo_V1-3), otherwise the shared part of the name.",
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
