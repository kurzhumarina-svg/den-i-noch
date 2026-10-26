// Мини-приложение: каталог → квартира → выбор дат → данные уходят боту.
const tg = window.Telegram?.WebApp;
const inTelegram = Boolean(tg && tg.initData);  // открыто внутри Telegram, а не в браузере

const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const MONTHS_OF = ["января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря"];

// Занятые даты бот передаёт в адресе: ?busy={"1":[["2026-10-27","2026-10-31"]]}
let busy = {};
try { busy = JSON.parse(new URLSearchParams(location.search).get("busy") || "{}"); } catch (e) {}

let apartments = [];
let guestsFilter = null;
let current = null;           // открытая квартира
let from = null, to = null;   // выбранные даты в виде "ГГГГ-ММ-ДД"
let shownMonth;               // первое число показанного месяца

const $ = (id) => document.getElementById(id);

// --- Даты. Храним их строками "2026-10-27": такие строки удобно сравнивать ---

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const today = iso(new Date());

const nightsBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);

// Ночь занята, если попадает в чужую бронь: заезд ≤ ночь < выезд
function isBusy(day) {
  return (busy[current.id] || []).some(([a, b]) => a <= day && day < b);
}

// Все ночи с заезда до выезда свободны?
function rangeFree(a, b) {
  for (let d = a; d < b; d = addDays(d, 1)) if (isBusy(d)) return false;
  return true;
}

function period(a, b) {
  const da = parse(a), db = parse(b);
  return da.getMonth() === db.getMonth()
    ? `${da.getDate()}–${db.getDate()} ${MONTHS_OF[db.getMonth()]}`
    : `${da.getDate()} ${MONTHS_OF[da.getMonth()]} – ${db.getDate()} ${MONTHS_OF[db.getMonth()]}`;
}

function nightsWord(n) {
  if (n % 10 === 1 && n % 100 !== 11) return "ночь";
  if (n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14)) return "ночи";
  return "ночей";
}

const rub = (n) => n.toLocaleString("ru-RU") + " ₽";

function guestsText(n) {
  return n === 1 ? "1 гостя" : `${n} гостей`;
}

// --- Экран 1: список ---

function renderChips() {
  $("chips").innerHTML = "";
  for (const n of [1, 2, 3, 4, 5]) {
    const chip = document.createElement("button");
    chip.className = "chip" + (guestsFilter === n ? " on" : "");
    chip.textContent = n === 5 ? "5+" : n;
    // Повторное нажатие снимает фильтр
    chip.onclick = () => { guestsFilter = guestsFilter === n ? null : n; renderList(); };
    $("chips").append(chip);
  }
}

function renderList() {
  renderChips();
  const list = apartments.filter((a) => !guestsFilter || a.guests >= guestsFilter);
  $("cards").innerHTML = "";
  for (const a of list) {
    const card = document.createElement("button");
    card.className = "card";
    card.innerHTML = `
      <img src="${a.photo}" alt="">
      <span class="card-text">
        <span class="card-title">${a.title}</span>
        <span class="card-meta">${a.district} · до ${guestsText(a.guests)}</span>
        <span class="card-price"><b>${rub(a.price)}</b> за ночь</span>
      </span>`;
    card.onclick = () => openApartment(a);
    $("cards").append(card);
  }
  $("empty").hidden = list.length > 0;
}

function showList() {
  current = null;
  $("detail-view").hidden = true;
  $("list-view").hidden = false;
  if (inTelegram) { tg.BackButton.hide(); tg.MainButton.hide(); }
  window.scrollTo(0, 0);
}

// --- Экран 2: квартира и календарь ---

function openApartment(a) {
  current = a;
  from = to = null;
  const now = new Date();
  shownMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  $("d-photo").src = a.photo;
  $("d-title").textContent = a.title;
  $("d-meta").textContent = `${a.district} · до ${guestsText(a.guests)} · ${rub(a.price)} за ночь`;
  $("d-about").textContent = a.about;

  $("list-view").hidden = true;
  $("detail-view").hidden = false;
  if (inTelegram) tg.BackButton.show();
  window.scrollTo(0, 0);
  renderCalendar();
}

function renderCalendar() {
  const y = shownMonth.getFullYear(), m = shownMonth.getMonth();
  $("month").textContent = `${MONTHS[m][0].toUpperCase() + MONTHS[m].slice(1)} ${y}`;

  // Листать можно от текущего месяца и на полгода вперёд
  const now = new Date();
  const monthsAhead = (y - now.getFullYear()) * 12 + m - now.getMonth();
  $("prev").disabled = monthsAhead <= 0;
  $("next").disabled = monthsAhead >= 6;

  const grid = $("grid");
  grid.innerHTML = "";
  // Пустые клетки до первого числа (неделя начинается с понедельника)
  const offset = (new Date(y, m, 1).getDay() + 6) % 7;
  for (let i = 0; i < offset; i++) grid.append(document.createElement("span"));

  const daysInMonth = new Date(y, m + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const day = iso(new Date(y, m, d));
    const cell = document.createElement("button");
    cell.className = "day";
    cell.textContent = d;
    if (day < today) cell.classList.add("past");
    else if (isBusy(day)) cell.classList.add("busy");
    if (day === from) cell.classList.add("from");
    if (from && to && day === from) cell.classList.add("has-to");
    if (day === to) cell.classList.add("to");
    if (from && to && day > from && day < to) cell.classList.add("range");
    cell.onclick = () => pickDay(day);
    grid.append(cell);
  }
  updateSummary();
}

function pickDay(day) {
  if (day < today) return;
  tg?.HapticFeedback?.selectionChanged();

  // Первое нажатие — заезд. Ночь заезда должна быть свободна.
  if (!from || to || day <= from) {
    if (isBusy(day)) return hint("Эта ночь уже занята, выберите другой день заезда.");
    from = day;
    to = null;
  } else {
    // Второе нажатие — выезд. День выезда может совпадать с чужим заездом.
    if (!rangeFree(from, day)) return hint("Между этими датами есть занятые ночи.");
    if (nightsBetween(from, day) > 30) return hint("Онлайн бронируем до 30 ночей.");
    to = day;
  }
  renderCalendar();
}

function hint(html) {
  $("hint").innerHTML = html;
}

function updateSummary() {
  if (!from) hint("Выберите день заезда");
  else if (!to) hint("Теперь день выезда");
  else {
    const n = nightsBetween(from, to);
    hint(`<b>${period(from, to)}</b>, ${n} ${nightsWord(n)} · <b>${rub(n * current.price)}</b>`);
  }

  const label = to ? `Забронировать · ${rub(nightsBetween(from, to) * current.price)}` : "";
  if (inTelegram) {
    if (to) tg.MainButton.setText(label).show();
    else tg.MainButton.hide();
  } else {
    $("fallback-btn").hidden = !to;
    $("fallback-btn").textContent = label;
  }
}

// Отдаём выбор боту. После sendData Telegram сам закрывает мини-приложение.
function book() {
  const data = JSON.stringify({ apartment_id: current.id, from, to });
  if (inTelegram) tg.sendData(data);
  else alert("В Telegram боту уйдёт: " + data);
}

// --- Запуск ---

function applyTheme() {
  // Светлая тема Telegram — «день», тёмная — «ночь»
  const dark = inTelegram ? tg.colorScheme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  if (inTelegram) {
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    tg.setHeaderColor(bg);
    tg.setBackgroundColor(bg);
  }
}

$("prev").onclick = () => { shownMonth.setMonth(shownMonth.getMonth() - 1); renderCalendar(); };
$("next").onclick = () => { shownMonth.setMonth(shownMonth.getMonth() + 1); renderCalendar(); };
$("fallback-btn").onclick = book;

if (inTelegram) {
  tg.ready();
  tg.expand();
  tg.BackButton.onClick(showList);
  tg.MainButton.onClick(book);
  tg.onEvent("themeChanged", applyTheme);
}
applyTheme();

fetch("apartments.json")
  .then((r) => r.json())
  .then((data) => { apartments = data; renderList(); });
