#!/usr/bin/env node
// Учебная лаборатория «Модели и провайдеры». Без зависимостей, нужен только Node.js.
// Команды: models | cost | task | grade | adapter | cascade | pick | check | help
const fs = require("fs");
const path = require("path");
const MODELS = JSON.parse(fs.readFileSync(path.join(__dirname, "models.json"), "utf8")).models;
const byId = (id) => MODELS.find((m) => m.id === id);
const money = (x) => "$" + x.toFixed(x < 10 ? 4 : 2);

/* ---------- 11.1 Стоимость ---------- */
// Запрос описан в «эталонных» токенах. Токенизатор провайдера считает их по-своему: умножаем на m.tok.
function callCost(m, { inTok, outTok, cachedTok = 0 }) {
  const i = inTok * m.tok, o = outTok * m.tok, c = Math.min(cachedTok * m.tok, i);
  return ((i - c) * m.in + c * m.cached + o * m.out) / 1e6;
}
const monthCost = (m, r, calls) => callCost(m, r) * calls + m.hosting;
const fits = (m, r) => (r.inTok + r.outTok) * m.tok <= m.ctx;
// Сценарий задания 11.1
const S1 = { inTok: 6000, outTok: 300, cachedTok: 0, calls: 20000 };
const S1C = { ...S1, cachedTok: 5000 };

/* ---------- 11.2 Задачи для сравнения моделей ---------- */
const norm = (s) => String(s).toLowerCase().replace(/ё/g, "е").trim();
const answerOf = (s) => { const m = String(s).match(/ОТВЕТ\s*:\s*(.+)/i); return m ? m[1].trim() : null; };
const TASKS = {
  1: { level: "простая",
    text: "Определи тональность отзыва: positive, negative или neutral.\nОтзыв: «Ужасный сервис, ждал три часа, больше никогда не закажу.»",
    ok: (a) => norm(a).replace(/[^a-z]/g, "") === "negative" },
  2: { level: "простая",
    text: "Достань дату встречи из письма в формате ГГГГ-ММ-ДД.\nПисьмо: «Давайте созвонимся в четверг, 14 ноября 2024, в 15:00 по Москве.»",
    ok: (a) => /^2024-11-14$/.test(a.trim()) },
  3: { level: "средняя",
    text: "Посчитай итог к оплате в евро.\nСчёт: услуги 1 200,50 €, доставка 45 €. Скидка 10% действует только на услуги, на доставку не действует.",
    ok: (a) => Math.abs(parseFloat(a.replace(/\s/g, "").replace(",", ".").replace(/[^\d.]/g, "")) - 1125.45) < 0.006 },
  4: { level: "средняя",
    text: "Что вернёт вызов median([10, 9, 2, 100]) в этом коде? Код не меняй, просто выполни его «в уме».\n\nfunction median(a) {\n  a.sort();\n  return a[Math.floor(a.length / 2)];\n}",
    ok: (a) => a.trim() === "2" },
  5: { level: "сложная",
    text: "Пять человек сидят в ряд на местах 1–5 (слева направо): Анна, Борис, Вера, Глеб, Дина.\n1) Анна сидит не с краю.\n2) Вера сидит сразу справа от Бориса.\n3) Глеб сидит с краю.\n4) Дина сидит рядом с Анной.\n5) Дина сидит левее Бориса.\n6) Глеб сидит левее Анны.\n7) Анна и Борис не соседи.\nНазови порядок слева направо, имена через запятую.",
    ok: (a) => norm(a).split(/\s*,\s*/).join(",") === "глеб,анна,дина,борис,вера" },
  6: { level: "сложная",
    text: "Выполни программу и скажи, чему равно x в конце.\n\nx = 7\nповторить 5 раз:\n  если x чётное: x = x / 2\n  иначе: x = 3 * x + 1",
    ok: (a) => a.trim() === "52" },
};
const SUFFIX = "\n\nОтветь ТОЛЬКО одной строкой в формате «ОТВЕТ: …», без объяснений.";

/* ---------- 11.3 Адаптер: тесты ---------- */
const REQ_IN = {
  system: "Ты помощник поддержки.",
  messages: [
    { role: "user", content: "Привет" },
    { role: "assistant", content: "Здравствуйте!" },
    { role: "user", content: "Сбрось пароль" },
  ],
  maxTokens: 200,
  temperature: 1.5,
};
const REQ_NOSYS = { ...REQ_IN, system: undefined, temperature: 0.2 };
const EXPECT_REQ = {
  aurora: {
    system: "Ты помощник поддержки.",
    messages: REQ_IN.messages,
    max_tokens: 200,
    temperature: 1,
  },
  borealis: {
    systemInstruction: { parts: [{ text: "Ты помощник поддержки." }] },
    contents: [
      { role: "user", parts: [{ text: "Привет" }] },
      { role: "model", parts: [{ text: "Здравствуйте!" }] },
      { role: "user", parts: [{ text: "Сбрось пароль" }] },
    ],
    generationConfig: { maxOutputTokens: 200, temperature: 1.5 },
  },
  cirrus: {
    messages: [{ role: "system", content: "Ты помощник поддержки." }, ...REQ_IN.messages],
    max_tokens: 200,
    temperature: 1.5,
  },
};
const EXPECT_NOSYS = {
  aurora: { messages: REQ_IN.messages, max_tokens: 200, temperature: 0.2 },
  borealis: { contents: EXPECT_REQ.borealis.contents, generationConfig: { maxOutputTokens: 200, temperature: 0.2 } },
  cirrus: { messages: REQ_IN.messages, max_tokens: 200, temperature: 0.2 },
};
const CUT = "Шаг 1. Откройте настройки. Шаг 2. Выбери";
const EXPECT_RES = {
  aurora:   { ok: ["Пароль сброшен.", "end", 41, 6], cut: [CUT, "length", 52, 12], refused: ["", "filter", 30, 0] },
  borealis: { ok: ["Пароль сброшен.", "end", 37, 5], cut: [CUT, "length", 47, 11], refused: ["", "filter", 27, 0] },
  cirrus:   { ok: ["Пароль сброшен.", "end", 47, 7], cut: [CUT, "length", 60, 14], refused: ["", "filter", 35, 0] },
};
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object")
    return Object.fromEntries(Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}
const same = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
function runAdapterTests(verbose) {
  let adapter;
  try { delete require.cache[require.resolve("./adapter.js")]; adapter = require("./adapter.js"); }
  catch (e) { console.log("✗ adapter.js не загружается: " + e.message); return { pass: 0, total: 0, loadError: true }; }
  let pass = 0, total = 0;
  const t = (name, fn, hint) => {
    total++;
    try {
      const r = fn();
      if (r === true) { pass++; if (verbose) console.log("✓ " + name); }
      else console.log("✗ " + name + (hint ? "  — " + hint : "") + (typeof r === "string" ? "\n    " + r : ""));
    } catch (e) { console.log("✗ " + name + "\n    ошибка: " + e.message.split("\n")[0]); }
  };
  for (const p of ["aurora", "borealis", "cirrus"]) {
    t(`запрос → ${p}`, () => { const got = adapter.toRequest(p, REQ_IN); return same(got, EXPECT_REQ[p]) || "ожидалось: " + JSON.stringify(EXPECT_REQ[p]) + "\n    получено:  " + JSON.stringify(got); });
    t(`запрос без system → ${p}`, () => { const got = adapter.toRequest(p, REQ_NOSYS); return same(got, EXPECT_NOSYS[p]) || "ожидалось: " + JSON.stringify(EXPECT_NOSYS[p]) + "\n    получено:  " + JSON.stringify(got); }, "если system нет, лишних полей быть не должно");
    const fx = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", p + ".json"), "utf8"));
    for (const k of ["ok", "cut", "refused"]) {
      t(`ответ ${p}/${k}`, () => {
        const g = adapter.fromResponse(p, fx[k]);
        const e = EXPECT_RES[p][k];
        const got = [g.text, g.stop, g.inputTokens, g.outputTokens];
        return JSON.stringify(got) === JSON.stringify(e) || "ожидалось " + JSON.stringify(e) + ", получено " + JSON.stringify(got);
      });
    }
  }
  console.log(`\nТестов пройдено: ${pass} из ${total}`);
  return { pass, total };
}

/* ---------- 11.4 Каскад: симуляция ---------- */
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp = (x) => Math.max(0, Math.min(1, x));
const CASCADE_REQ = { inTok: 2000, outTok: 300, cachedTok: 0 };
function makeTasks(calibrated) {
  const r = rng(2024), out = [];
  for (let i = 0; i < 1000; i++) {
    const hard = r() < 0.35;
    const smallOk = r() < (hard ? 0.35 : 0.96);
    const largeOk = r() < (hard ? 0.9 : 0.99);
    const conf = calibrated ? clamp((smallOk ? 0.88 : 0.5) + (r() - 0.5) * 0.5) : clamp(0.85 + (r() - 0.5) * 0.3);
    out.push({ hard, smallOk, largeOk, conf });
  }
  return out;
}
function cascade(th, calibrated) {
  const tasks = makeTasks(calibrated);
  const cs = callCost(byId("aurora-lite"), CASCADE_REQ), cl = callCost(byId("aurora-max"), CASCADE_REQ);
  let ok = 0, cost = 0, esc = 0;
  for (const t of tasks) {
    cost += cs;
    if (t.conf >= th) ok += t.smallOk ? 1 : 0;
    else { esc++; cost += cl; ok += t.largeOk ? 1 : 0; }
  }
  const n = tasks.length;
  return { acc: ok / n, cost, esc: esc / n, cs, cl, n };
}
const allSmall = (cal) => { const t = makeTasks(cal); return t.filter((x) => x.smallOk).length / t.length; };
const allLarge = (cal) => { const t = makeTasks(cal); return t.filter((x) => x.largeOk).length / t.length; };
// «Всё в большую»: порог выше любой уверенности не нужен — большая вызывается без попытки малой.
const largeOnlyCost = () => callCost(byId("aurora-max"), CASCADE_REQ) * 1000;
function bestThreshold(cal, minAcc) {
  let best = null;
  for (let i = 0; i <= 20; i++) {
    const th = i / 20, r = cascade(th, cal);
    if (r.acc >= minAcc && (!best || r.cost < best.cost - 1e-12)) best = { th, ...r };
  }
  return best;
}

/* ---------- 11.5 Выбор под ограничения ---------- */
const SCEN = {
  1: { title: "Бот поддержки (чат на сайте)", calls: 30000, inTok: 1500, outTok: 250, cachedTok: 1000, minQ: 2, maxLat: 2000, goal: "cheapest" },
  2: { title: "Разбор договоров, документы по 300 тыс. токенов, данные только в ЕС", calls: 500, inTok: 300000, outTok: 2000, minQ: 4, region: "EU", goal: "cheapest" },
  3: { title: "Медзаписи: данные не должны покидать собственный контур", calls: 50000, inTok: 2000, outTok: 400, minQ: 3, region: "self", goal: "cheapest" },
  4: { title: "Разбор скриншотов (нужно зрение), бюджет $400/мес", calls: 200000, inTok: 1200, outTok: 50, vision: true, budget: 400, goal: "quality" },
  5: { title: "Сложные рефакторинги кода, нужен топовый уровень качества", calls: 3000, inTok: 20000, outTok: 3000, cachedTok: 15000, minQ: 5, goal: "cheapest" },
};
function evalPick(s, m) {
  const bad = [];
  const req = { inTok: s.inTok, outTok: s.outTok, cachedTok: s.cachedTok || 0 };
  const cost = monthCost(m, req, s.calls);
  if (!fits(m, req)) bad.push(`запрос не влезает в окно (${Math.round((req.inTok + req.outTok) * m.tok)} токенов у этого провайдера > ${m.ctx})`);
  if (s.minQ && m.quality < s.minQ) bad.push(`качество ${m.quality} < требуемых ${s.minQ}`);
  if (s.vision && !m.vision) bad.push("нет работы с изображениями");
  if (s.region && !m.regions.includes(s.region)) bad.push(`нет региона ${s.region} (есть: ${m.regions.join(", ")})`);
  if (s.maxLat && m.p95_ms > s.maxLat) bad.push(`p95 ${m.p95_ms} мс > допустимых ${s.maxLat}`);
  if (s.budget && cost > s.budget) bad.push(`стоит ${cost.toFixed(0)} $/мес > бюджета ${s.budget}`);
  return { bad, cost };
}
function bestPick(s) {
  const ok = MODELS.map((m) => ({ m, ...evalPick(s, m) })).filter((x) => !x.bad.length);
  ok.sort((a, b) => (s.goal === "quality" ? b.m.quality - a.m.quality || a.cost - b.cost : a.cost - b.cost));
  return ok[0] || null;
}

/* ---------- Проверка results.md ---------- */
const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
function parseResults() {
  const kv = {}; let last = null;
  for (const line of read("results.md").split("\n")) {
    const m = line.match(/^([a-zA-Z0-9_а-яА-Я.]+):[ \t]*(.*)$/);
    if (m) { last = m[1]; kv[last] = m[2].trim(); }
    else if (last && line.trim() && !line.startsWith("#") && !line.startsWith("<!--")) kv[last] += " " + line.trim();
  }
  return kv;
}
function check() {
  const kv = parseResults();
  const errors = [], warns = [];
  const need = (k) => { if (!kv[k]) { errors.push(`пусто: ${k}`); return false; } return true; };
  const num = (k) => {
    if (!need(k)) return null;
    const v = Number(String(kv[k]).replace(/\s/g, "").replace(",", ".").replace("$", "").replace("%", ""));
    if (Number.isNaN(v)) { errors.push(`${k}: нужно число`); return null; }
    return v;
  };
  const near = (k, truth, tol, hint) => {
    const v = num(k);
    if (v !== null && Math.abs(v - truth) > Math.max(tol * Math.abs(truth), 1e-9))
      errors.push(`${k}: у вас ${v}, ожидается около ${truth < 10 ? truth.toFixed(2) : Math.round(truth)}${hint ? " (" + hint + ")" : ""}`);
  };
  ["имя", "ide", "модель"].forEach(need);

  // 11.1
  const q = (id, r) => monthCost(byId(id), r, r.calls);
  near("1_lite", q("aurora-lite", S1), 0.015, "node lab.js cost aurora-lite --in 6000 --out 300 --calls 20000");
  near("1_std", q("aurora-std", S1), 0.015);
  near("1_max", q("aurora-max", S1), 0.015);
  near("1_mini", q("borealis-mini", S1), 0.015);
  near("1_pro", q("borealis-pro", S1), 0.015);
  near("1_std_cache", q("aurora-std", S1C), 0.015, "добавьте --cached 5000");
  near("1_pro_cache", q("borealis-pro", S1C), 0.015);
  const fit115 = MODELS.filter((m) => fits(m, { inTok: 115000, outTok: 2000 })).length;
  const v = num("1_fit115");
  if (v !== null && v !== fit115) errors.push(`1_fit115: у вас ${v}, а документ в 115 000 эталонных токенов + ответ влезает в ${fit115} моделей (учитывайте токенизатор провайдера: node lab.js models --doc 115000)`);
  near("1_breakeven", 4800 / callCost(byId("aurora-std"), S1), 0.03, "при скольких запросах в месяц хостинг cirrus-70b ($4800) дешевле aurora-std без кэша");
  need("1_наблюдение");

  // 11.2
  const sm = kv["2_small_model"], lg = kv["2_large_model"];
  need("2_small_model"); need("2_large_model");
  if (sm && lg && norm(sm) === norm(lg)) errors.push("2_small_model и 2_large_model одинаковые — нужны две разные модели");
  const score = { small: 0, large: 0 };
  for (const n of Object.keys(TASKS)) for (const w of ["small", "large"]) {
    const k = `2_t${n}_${w}`;
    if (!need(k)) continue;
    const a = answerOf(kv[k]);
    if (a === null) { warns.push(`${k}: нет строки «ОТВЕТ: …», проверить нечем`); continue; }
    if (TASKS[n].ok(a)) score[w]++;
  }
  console.log(`Автопроверка 11.2: маленькая модель верно ${score.small} из 6, большая верно ${score.large} из 6.`);
  need("2_fix"); need("2_наблюдение");

  // 11.3
  const a = runAdapterTests(false);
  if (a.loadError || a.pass !== a.total || a.total === 0) errors.push(`11.3: adapter.js проходит ${a.pass} из ${a.total} тестов (node lab.js adapter)`);
  ["3_system", "3_text", "3_stop", "3_наблюдение"].forEach(need);

  // 11.4
  near("4_small_acc", allSmall(true) * 100, 0.011, "в процентах: строка «всё в малую» в node lab.js cascade");
  near("4_large_acc", allLarge(true) * 100, 0.011, "в процентах: строка «всё в большую» в node lab.js cascade");
  const b90 = bestThreshold(true, 0.9);
  const k90 = num("4_th90");
  if (k90 !== null && Math.abs(k90 - b90.th) > 0.026) errors.push(`4_th90: у вас ${k90}, лучший порог (шаг 0.05) около ${b90.th}`);
  const large = largeOnlyCost();
  near("4_save90", (1 - b90.cost / large) * 100, 0.1, "экономия против «всё в большую», %");
  const bad90 = bestThreshold(false, 0.9);
  const sb = num("4_bad_save90");
  const truthBad = bad90 ? Math.max(0, (1 - bad90.cost / large) * 100) : 0;
  if (sb !== null && Math.abs(sb - truthBad) > Math.max(2, 0.1 * truthBad))
    errors.push(`4_bad_save90: у вас ${sb}, при --calibration bad получается около ${truthBad.toFixed(0)}% (0, если дешевле «всё в большую» не выйти)`);
  need("4_наблюдение");

  // 11.5
  for (const n of Object.keys(SCEN)) {
    const best = bestPick(SCEN[n]);
    const k = `5_s${n}`;
    if (need(k) && norm(kv[k]).split(/\s+/)[0] !== best.m.id) errors.push(`${k}: у вас «${kv[k]}» — ожидалась другая модель (проверьте: node lab.js pick ${n} <модель>)`);
    near(`5_s${n}_cost`, best.cost, 0.02);
  }
  need("5_наблюдение");

  ["вывод1", "вывод2", "вывод3"].forEach((k) => { if (need(k) && kv[k].length < 80) errors.push(`${k}: слишком коротко (нужно 3–5 предложений)`); });
  warns.forEach((x) => console.log("⚠ " + x));
  errors.forEach((x) => console.log("✗ " + x));
  console.log(errors.length ? `\nОшибок: ${errors.length}. Исправьте и запустите снова.` : "\nГотово: results.md заполнен.");
  process.exit(errors.length ? 1 : 0);
}

/* ---------- CLI ---------- */
const [cmd, ...rest] = process.argv.slice(2);
const flag = (n, d) => { const i = rest.indexOf("--" + n); return i >= 0 ? rest[i + 1] : d; };
const BOOL = new Set(["nolarge", "steps"]);
const positional = rest.filter((x, i) => !x.startsWith("--") && !(i > 0 && rest[i - 1].startsWith("--") && !BOOL.has(rest[i - 1].slice(2))));
const pad = (s, n) => String(s).padEnd(n);

if (cmd === "models") {
  const doc = Number(flag("doc", 0));
  console.log(pad("модель", 15) + pad("пров.", 10) + pad("кач.", 5) + pad("окно", 9) + pad("in $/М", 8) + pad("out $/М", 9) + pad("cache", 7) + pad("токен.", 7) + pad("зрение", 7) + pad("регионы", 10) + pad("p95, мс", 8) + (doc ? "влезает " + doc : ""));
  for (const m of MODELS) {
    console.log(pad(m.id, 15) + pad(m.provider.split(" ")[0], 10) + pad(m.quality, 5) + pad(m.ctx, 9) + pad(m.in, 8) + pad(m.out, 9) + pad(m.cached, 7) + pad("×" + m.tok, 7) + pad(m.vision ? "да" : "нет", 7) + pad(m.regions.join("/"), 10) + pad(m.p95_ms, 8) + (doc ? (doc * m.tok <= m.ctx ? "да (" + Math.round(doc * m.tok) + ")" : "НЕТ (" + Math.round(doc * m.tok) + ")") : ""));
  }
  console.log("\nin/out — цена за 1 млн токенов; cache — цена входа, прочитанного из кэша; токен. — во сколько раз токенизатор провайдера считает больше или меньше «эталонного». У cirrus цена токена 0, но есть ежемесячный хостинг (cirrus-8b — $600, cirrus-70b — $4800).");
} else if (cmd === "cost") {
  const m = byId(positional[0]);
  if (!m) { console.log("Использование: node lab.js cost <модель> --in 6000 --out 300 --calls 20000 [--cached 5000]\nМодели: " + MODELS.map((x) => x.id).join(", ")); process.exit(1); }
  const r = { inTok: Number(flag("in", 1000)), outTok: Number(flag("out", 200)), cachedTok: Number(flag("cached", 0)) };
  const calls = Number(flag("calls", 1));
  const per = callCost(m, r);
  console.log(`${m.id}: токенов у этого провайдера: вход ${Math.round(r.inTok * m.tok)}, выход ${Math.round(r.outTok * m.tok)}${r.cachedTok ? ", из входа в кэше " + Math.round(r.cachedTok * m.tok) : ""}`);
  console.log(`Один запрос: ${money(per)}`);
  console.log(`${calls} запросов: ${money(per * calls)}${m.hosting ? " + хостинг " + m.hosting + " = " + money(per * calls + m.hosting) : ""}`);
  console.log(fits(m, r) ? "Окно: помещается." : `Окно: НЕ помещается (${Math.round((r.inTok + r.outTok) * m.tok)} > ${m.ctx}).`);
} else if (cmd === "task") {
  const t = TASKS[positional[0]];
  if (!t) { console.log("Использование: node lab.js task 1..6 [--steps]"); process.exit(1); }
  console.log(`--- Задача ${positional[0]} (${t.level}). Копируйте всё, что ниже этой строки ---\n`);
  console.log("Не открывай файлы и не используй инструменты.\n\n" + t.text + (rest.includes("--steps") ? "\n\nРассуждай по шагам, затем в последней строке напиши «ОТВЕТ: …»." : SUFFIX));
} else if (cmd === "grade") {
  const t = TASKS[positional[0]];
  if (!t) { console.log('Использование: node lab.js grade 1..6 "ОТВЕТ: …"'); process.exit(1); }
  const a = answerOf(positional.slice(1).join(" "));
  if (a === null) { console.log("Не нашёл строку «ОТВЕТ: …»."); process.exit(1); }
  console.log(t.ok(a) ? `Задача ${positional[0]}: верно` : `Задача ${positional[0]}: НЕВЕРНО`);
} else if (cmd === "adapter") {
  const r = runAdapterTests(true);
  process.exit(r.pass === r.total && r.total > 0 ? 0 : 1);
} else if (cmd === "cascade") {
  const cal = flag("calibration", "good") !== "bad";
  const th = Number(flag("threshold", 0.8));
  const r = cascade(th, cal);
  console.log(`Симуляция ${r.n} задач · калибровка уверенности: ${cal ? "хорошая" : "плохая"} · малая aurora-lite (${money(r.cs)}/вызов), большая aurora-max (${money(r.cl)}/вызов)`);
  if (rest.includes("--nolarge")) {
    console.log(`\nТолько малая: точность ${(allSmall(cal) * 100).toFixed(1)}%, стоимость 1000 задач ${money(r.cs * r.n)}`);
  } else {
    console.log(`Порог уверенности ${th}: если малая уверена ≥ порога, берём её ответ, иначе зовём большую (платим за обе).`);
    console.log(`\nТочность:             ${(r.acc * 100).toFixed(1)}%`);
    console.log(`Эскалировано:         ${(r.esc * 100).toFixed(1)}% задач`);
    console.log(`Стоимость 1000 задач: ${money(r.cost)}`);
    console.log(`Для сравнения: всё в большую — ${(allLarge(cal) * 100).toFixed(1)}%, ${money(largeOnlyCost())}; всё в малую — ${(allSmall(cal) * 100).toFixed(1)}%, ${money(r.cs * r.n)}`);
    console.log("(порог 0 = верим малой всегда; чем выше порог, тем больше задач уходит в большую)");
  }
} else if (cmd === "pick") {
  const s = SCEN[positional[0]];
  if (!s) {
    console.log("Использование: node lab.js pick <1..5> [модель …]\n");
    Object.entries(SCEN).forEach(([k, v]) => console.log(`${k}. ${v.title}\n   ${v.calls} запросов/мес, вход ${v.inTok}, выход ${v.outTok}${v.cachedTok ? ", из входа в кэше " + v.cachedTok : ""}${v.minQ ? ", качество ≥ " + v.minQ : ""}${v.maxLat ? ", p95 ≤ " + v.maxLat + " мс" : ""}${v.region ? ", регион " + v.region : ""}${v.vision ? ", нужно зрение" : ""}${v.budget ? ", бюджет $" + v.budget + "/мес" : ""}\n   цель: ${v.goal === "quality" ? "максимум качества в рамках бюджета (при равном качестве — дешевле)" : "самая дешёвая из подходящих"}\n`));
    process.exit(0);
  }
  const ids = positional.slice(1).length ? positional.slice(1) : MODELS.map((m) => m.id);
  console.log(s.title);
  for (const id of ids) {
    const m = byId(id);
    if (!m) { console.log("нет модели " + id); continue; }
    const e = evalPick(s, m);
    console.log(`${pad(m.id, 15)} ${pad("$" + e.cost.toFixed(0) + "/мес", 13)} ${e.bad.length ? "✗ " + e.bad.join("; ") : "✓ подходит"}`);
  }
} else if (cmd === "check") {
  check();
} else {
  console.log(`Команды:
  node lab.js models [--doc 150000]                 каталог моделей
  node lab.js cost <модель> --in N --out N --calls N [--cached N]
  node lab.js task 1..6 [--steps]                   текст задачи для чата
  node lab.js grade 1..6 "ОТВЕТ: …"                 проверить ответ модели
  node lab.js adapter                               тесты вашего adapter.js
  node lab.js cascade --threshold 0.8 [--calibration bad]
  node lab.js pick [1..5] [модель …]                подходит ли модель сценарию
  node lab.js check                                 проверка results.md`);
}
