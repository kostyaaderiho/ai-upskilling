#!/usr/bin/env node
// Учебная лаборатория «Как работают LLM». Без зависимостей, нужен только Node.js.
// Команды: tokens | next | gen | window | quiz | check | help
const fs = require("fs");
const path = require("path");
const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");

/* ---------- 1. Токенизатор (упрощённый BPE, обучается на corpus-bpe.txt) ---------- */
const MERGES = 700;
function bytesOf(str) {
  return Array.from(Buffer.from(str, "utf8")).map((b) => String.fromCharCode(b));
}
function trainBpe() {
  const words = new Map();
  for (const w of read("corpus-bpe.txt").match(/ ?[^\s]+|\n/g) || []) {
    words.set(w, (words.get(w) || 0) + 1);
  }
  let seqs = [...words].map(([w, c]) => ({ s: bytesOf(w), c }));
  const merges = [];
  for (let i = 0; i < MERGES; i++) {
    const pairs = new Map();
    for (const { s, c } of seqs)
      for (let j = 0; j < s.length - 1; j++) {
        const k = s[j] + "\u0000" + s[j + 1];
        pairs.set(k, (pairs.get(k) || 0) + c);
      }
    let best = null;
    for (const [k, c] of pairs)
      if (!best || c > best[1] || (c === best[1] && k < best[0])) best = [k, c];
    if (!best || best[1] < 2) break;
    const [a, b] = best[0].split("\u0000");
    merges.push([a, b]);
    for (const q of seqs) {
      const out = [];
      for (let j = 0; j < q.s.length; j++) {
        if (q.s[j] === a && q.s[j + 1] === b) { out.push(a + b); j++; }
        else out.push(q.s[j]);
      }
      q.s = out;
    }
  }
  return merges;
}
let _merges;
function encode(text) {
  _merges = _merges || trainBpe();
  const out = [];
  for (const w of text.match(/ ?[^\s]+|\s+/g) || []) {
    let s = bytesOf(w);
    for (const [a, b] of _merges) {
      const n = [];
      for (let j = 0; j < s.length; j++) {
        if (s[j] === a && s[j + 1] === b) { n.push(a + b); j++; }
        else n.push(s[j]);
      }
      s = n;
    }
    out.push(...s);
  }
  return out;
}
function show(tok) {
  const t = Buffer.from(tok, "latin1").toString("utf8");
  if (t.includes("\ufffd")) return "<" + Buffer.from(tok, "latin1").toString("hex") + ">";
  return t.replace(/\n/g, "\\n").replace(/ /g, "·");
}
const countTokens = (t) => encode(t).length;

/* ---------- 2. Языковая модель на словах (n-граммы) ---------- */
function lmWords(s) { return s.toLowerCase().match(/[^\s]+/g) || []; }
function buildLm() {
  const sents = read("corpus-lm.txt").split("\n").filter(Boolean).map(lmWords);
  const tables = { 1: new Map(), 2: new Map() };
  for (const w of sents)
    for (let i = 1; i < w.length; i++)
      for (const n of [1, 2]) {
        if (i - n < 0) continue;
        const key = w.slice(i - n, i).join(" ");
        const m = tables[n].get(key) || new Map();
        m.set(w[i], (m.get(w[i]) || 0) + 1);
        tables[n].set(key, m);
      }
  return tables;
}
function dist(tables, words, order) {
  for (let n = Math.min(order, words.length); n >= 1; n--) {
    const m = tables[n].get(words.slice(-n).join(" "));
    if (m) {
      const total = [...m.values()].reduce((a, b) => a + b, 0);
      return { ctx: words.slice(-n).join(" "), total, items: [...m].map(([w, c]) => ({ w, c, p: c / total })).sort((a, b) => b.c - a.c || (a.w < b.w ? -1 : 1)) };
    }
  }
  return null;
}
function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function pick(items, temp, rand) {
  if (temp <= 0) return items[0].w;
  const w = items.map((x) => Math.pow(x.p, 1 / temp));
  const sum = w.reduce((a, b) => a + b, 0);
  let r = rand() * sum;
  for (let i = 0; i < items.length; i++) { r -= w[i]; if (r <= 0) return items[i].w; }
  return items[items.length - 1].w;
}

/* ---------- 3. Контекстное окно ---------- */
function uniqueRuns(t, temp) {
  const set = new Set();
  for (let seed = 1; seed <= 10; seed++) {
    const rand = rng(seed), words = ["the", "cat"];
    for (let i = 0; i < 12; i++) { const d = dist(t, words, 2); if (!d) break; words.push(pick(d.items, temp, rand)); }
    set.add(words.join(" "));
  }
  return set.size;
}
function windowDemo(size, pinFirst) {
  const msgs = read("dialog.txt").split("\n").filter(Boolean).map((l) => ({ l, n: countTokens(l) }));
  const kept = new Set();
  let used = 0;
  if (pinFirst && msgs[0].n <= size) { kept.add(0); used += msgs[0].n; }
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (kept.has(i)) continue;
    if (used + msgs[i].n > size) break;
    kept.add(i); used += msgs[i].n;
  }
  const total = msgs.reduce((a, m) => a + m.n, 0);
  console.log(`Окно: ${size} токенов${pinFirst ? " (первое сообщение закреплено)" : ""}. Весь диалог: ${total} токенов.\n`);
  msgs.forEach((m, i) => console.log(`${kept.has(i) ? "[в окне ]" : "[ забыто]"} ${String(m.n).padStart(3)} ток  ${m.l}`));
  const seen = msgs.filter((_, i) => kept.has(i)).map((m) => m.l).join("\n");
  const name = seen.match(/name is (\w+)/i);
  console.log(`\nВопрос: «What is my name?»`);
  console.log(`Ответ модели: ${name ? "Your name is " + name[1] + "." : "I don't know your name."}  (в окне ${kept.size} из ${msgs.length} сообщений, занято ${used})`);
  return { kept: kept.size, used, remembers: !!name, total };
}

/* ---------- 4. Квиз для задания на рассуждение ---------- */
const QUIZ = {
  q1: { text: "3847 × 2915", answer: String(3847 * 2915) },
  q2: { text: "Сколько раз буква «с» встречается в слове «ассоциативность»?", answer: String(("ассоциативность".match(/с/g) || []).length) },
};

/* ---------- Фиксированные тексты для задания 10.1 ---------- */
const T = {
  en: "The customer cannot log in after the password reset.",
  ru: "Клиент не может войти после сброса пароля.",
  rare: "unbelievably",
  common: "The",
  num1: "1234567890",
  num2: "1 234 567 890",
};

/* ---------- Проверка results.md ---------- */
function parseResults() {
  const kv = {};
  let last = null;
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
  const num = (k) => { if (!need(k)) return null; const v = Number(String(kv[k]).replace(",", ".")); if (Number.isNaN(v)) { errors.push(`${k}: нужно число`); return null; } return v; };
  const exact = (k, truth, hint) => { const v = num(k); if (v !== null && v !== truth) errors.push(`${k}: у вас ${v}, а команда даёт ${truth}${hint ? " (" + hint + ")" : ""}`); };
  ["имя", "ide", "модель"].forEach(need);

  // 10.1 — детерминированные значения
  exact("1_en_tokens", countTokens(T.en), "node lab.js tokens \"…\"");
  exact("1_ru_tokens", countTokens(T.ru));
  exact("1_rare_tokens", countTokens(T.rare));
  exact("1_common_tokens", countTokens(T.common));
  exact("1_num1_tokens", countTokens(T.num1));
  exact("1_num2_tokens", countTokens(T.num2));
  need("1_наблюдение");

  // 10.2
  const t = buildLm();
  const d1 = dist(t, ["the"], 1), d2 = dist(t, ["on", "the"], 2), d3 = dist(t, ["sat", "on", "the"], 1);
  const near = (k, truth) => { const v = num(k); if (v !== null && Math.abs(v - truth) > 0.011) errors.push(`${k}: у вас ${v}, ожидается около ${truth.toFixed(2)}`); };
  near("2_p_mat_order2", d2.items.find((x) => x.w === "mat").p);
  near("2_p_mat_order1", dist(t, ["the"], 1).items.find((x) => x.w === "mat").p);
  exact("2_unique_t0", uniqueRuns(t, 0), "seed 1..10");
  exact("2_unique_t15", uniqueRuns(t, 1.5), "seed 1..10");
  ["2_наблюдение"].forEach(need);

  // 10.3
  const minSize = num("3_min_size");
  if (minSize !== null) {
    let truth = null;
    for (let s = 1; s < 500; s++) { const orig = console.log; console.log = () => {}; const r = windowDemo(s, false); console.log = orig; if (r.remembers) { truth = s; break; } }
    if (minSize !== truth) errors.push(`3_min_size: у вас ${minSize}, а точное значение ${truth} (подбирайте --size, пока имя не вспомнится)`);
  }
  if (num("3_pin_size") !== null) { let tr = null; for (let s = 1; s < 500 && tr === null; s++) { const o = console.log; console.log = () => {}; const r = windowDemo(s, true); console.log = o; if (r.remembers) tr = s; } if (Number(kv["3_pin_size"]) !== tr) errors.push(`3_pin_size: у вас ${kv["3_pin_size"]}, а точное значение ${tr}`); }
  need("3_наблюдение");

  // 10.4
  ["4_a_limit", "4_a_refund", "4_a_sure", "4_b_limit", "4_b_refund", "4_c_answer", "4_наблюдение"].forEach(need);
  if (kv["4_b_limit"] && !/120/.test(kv["4_b_limit"])) warns.push("4_b_limit: в документе лимит 120 в минуту");
  if (kv["4_b_refund"] && !/45/.test(kv["4_b_refund"])) warns.push("4_b_refund: в документе срок 45 дней");

  // 10.5
  for (const q of ["q1", "q2"]) {
    ["a", "b"].forEach((v) => {
      const k = `5_${q}_${v}`;
      if (!need(k)) return;
      const said = (kv[k].match(/-?\d[\d\s]*/) || [""])[0].replace(/\s/g, "");
      const ok = kv[`${k}_верно`];
      if (!ok) { errors.push(`пусто: ${k}_верно (да/нет)`); return; }
      const truth = said === QUIZ[q].answer;
      if ((ok.toLowerCase().startsWith("д")) !== truth) warns.push(`${k}_верно: отметка не совпадает с правильным ответом ${QUIZ[q].answer}`);
    });
  }
  need("5_наблюдение");

  // выводы
  ["вывод1", "вывод2", "вывод3"].forEach((k) => { if (need(k) && kv[k].length < 80) errors.push(`${k}: слишком коротко (нужно 3–5 предложений)`); });

  warns.forEach((x) => console.log("⚠ " + x));
  errors.forEach((x) => console.log("✗ " + x));
  console.log(errors.length ? `\nОшибок: ${errors.length}. Исправьте и запустите снова.` : "\nГотово: results.md заполнен.");
  process.exit(errors.length ? 1 : 0);
}

/* ---------- CLI ---------- */
const [cmd, ...rest] = process.argv.slice(2);
const flag = (n, d) => { const i = rest.indexOf("--" + n); return i >= 0 ? rest[i + 1] : d; };
const positional = rest.filter((x, i) => !x.startsWith("--") && !(i > 0 && rest[i - 1].startsWith("--")));

if (cmd === "tokens") {
  const text = positional.join(" ");
  if (!text) { console.log('Использование: node lab.js tokens "ваш текст"'); process.exit(1); }
  const toks = encode(text);
  console.log(toks.map(show).join(" | "));
  console.log(`\nСимволов: ${[...text].length} · байт UTF-8: ${Buffer.byteLength(text)} · токенов: ${toks.length}`);
  console.log("(· — пробел; <xx> — часть символа, не имеющая смысла отдельно)");
} else if (cmd === "next") {
  const words = lmWords(positional.join(" "));
  const order = Number(flag("order", 2));
  const d = dist(buildLm(), words, order);
  if (!d) { console.log("Такого контекста в корпусе нет."); process.exit(0); }
  console.log(`Контекст: «${d.ctx}» (встречался ${d.total} раз; порядок модели ${order})\n`);
  d.items.forEach((x) => console.log(`${x.w.padEnd(8)} ${String(x.c).padStart(2)}/${d.total}  p=${x.p.toFixed(2)}  ${"█".repeat(Math.round(x.p * 30))}`));
} else if (cmd === "gen") {
  const t = buildLm();
  let words = lmWords(positional.join(" "));
  const temp = Number(flag("temp", 1)), seed = Number(flag("seed", 1)), len = Number(flag("len", 12)), order = Number(flag("order", 2));
  const rand = rng(seed);
  for (let i = 0; i < len; i++) {
    const d = dist(t, words, order);
    if (!d) break;
    words.push(pick(d.items, temp, rand));
  }
  console.log(words.join(" "));
} else if (cmd === "window") {
  windowDemo(Number(flag("size", 100)), rest.includes("--pin-first"));
} else if (cmd === "quiz") {
  console.log("Вопрос 1: " + QUIZ.q1.text + "\nВопрос 2: " + QUIZ.q2.text + "\n\n(правильные ответы проверит команда check)");
} else if (cmd === "unique") {
  console.log(uniqueRuns(buildLm(), Number(flag("temp", 1))));
} else if (cmd === "check") {
  check();
} else {
  console.log(`Команды:
  node lab.js tokens "текст"                 как текст режется на токены
  node lab.js next "the cat" [--order 1|2]   вероятности следующего слова
  node lab.js gen "the cat" --temp 0.8 --seed 3 [--len 12] [--order 2]
  node lab.js window --size 60 [--pin-first] окно контекста и «забывание»
  node lab.js quiz                           вопросы для задания 10.5
  node lab.js check                          проверка results.md`);
}
