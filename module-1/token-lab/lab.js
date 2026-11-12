#!/usr/bin/env node
// Помощник лабораторной «Оптимизация токенов». Нужен только Node.js, без установки пакетов.
// Запуск из встроенного терминала IDE, из папки sample-app:  node ../lab.js <команда>
//
//   reset     вернуть sample-app в исходное состояние (баг на месте, CLAUDE.md и .claude удалены)
//   rules-bloated | rules-lean   положить в sample-app раздутый / короткий CLAUDE.md
//   deny      положить в sample-app/.claude/settings.json запрет на чтение docs/, legacy/, logs/
//   status    показать, что сейчас лежит в sample-app
//   check     проверить заполнение results.md перед отправкой

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const LAB = __dirname;
const APP = path.join(LAB, "sample-app");
const PRISTINE = path.join(LAB, "_pristine");
const RESULTS = process.argv[3] ? path.resolve(process.argv[3]) : path.join(LAB, "results.md");

function walk(dir, base = dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, base, out);
    else out.push(path.relative(base, full));
  }
  return out;
}

function reset() {
  // Работаем пофайлово, не удаляя саму папку: иначе IDE потеряет открытое рабочее пространство.
  const want = new Set(walk(PRISTINE));
  let restored = 0, removed = 0;
  for (const rel of walk(APP)) {
    if (!want.has(rel)) { fs.unlinkSync(path.join(APP, rel)); removed++; }
  }
  for (const rel of want) {
    const src = path.join(PRISTINE, rel), dst = path.join(APP, rel);
    const a = fs.readFileSync(src);
    if (!fs.existsSync(dst) || !fs.readFileSync(dst).equals(a)) {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.writeFileSync(dst, a);
      restored++;
    }
  }
  const claudeDir = path.join(APP, ".claude");
  if (fs.existsSync(claudeDir) && walk(claudeDir).length === 0) fs.rmSync(claudeDir, { recursive: true });
  console.log(`Проект сброшен: восстановлено файлов — ${restored}, удалено лишних — ${removed}.`);
  const r = spawnSync(process.execPath, ["tests/run-all.js", "--quiet"], { cwd: APP, encoding: "utf8" });
  console.log((r.stdout || "").trim().split("\n").pop());
  console.log("Теперь: начните НОВЫЙ чат в Claude Code (кнопка «+» или /clear).");
}

function put(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  console.log(`Готово: ${path.relative(APP, to)} (${fs.statSync(to).size} байт).`);
  console.log("Теперь: начните НОВЫЙ чат в Claude Code — файл читается только при старте чата.");
}

function status() {
  const claudeMd = path.join(APP, "CLAUDE.md");
  const settings = path.join(APP, ".claude", "settings.json");
  const sameAs = (f, g) => fs.existsSync(f) && fs.readFileSync(f).equals(fs.readFileSync(g));
  let rules = "нет";
  if (fs.existsSync(claudeMd)) {
    rules = sameAs(claudeMd, path.join(LAB, "rules", "CLAUDE.bloated.md")) ? "раздутый"
      : sameAs(claudeMd, path.join(LAB, "rules", "CLAUDE.lean.md")) ? "короткий" : "неизвестный";
  }
  const deny = fs.existsSync(settings) ? "есть" : "нет";
  const bug = fs.readFileSync(path.join(APP, "src", "discount.js"), "utf8").includes("total - total * coupon.value");
  console.log(`CLAUDE.md: ${rules}\nЗапрет на чтение шума (.claude/settings.json): ${deny}\nБаг в discount.js: ${bug ? "на месте" : "ИСПРАВЛЕН"}`);
}

// ---------- проверка results.md ----------

function num(s) {
  if (s == null) return null;
  let t = String(s).toLowerCase().replace(/[\s  ]/g, "").replace(/токен\w*/g, "").replace("~", "");
  let mult = 1;
  if (t.endsWith("k") || t.endsWith("к")) { mult = 1000; t = t.slice(0, -1); }
  t = t.replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return Math.round(parseFloat(t) * mult);
}

// какие поля обязательны в строке: ctx — контекст, turns — ходы, tests — тесты (да/нет)
const ROWS = {
  "1A": ["ctx", "turns", "tests"], "1B": ["ctx", "turns", "tests"],
  "2A": ["ctx", "turns", "tests"], "2B": ["ctx", "turns", "tests"],
  "3A": ["ctx", "turns"], "3B": ["ctx", "turns"],
  "4": ["ctx", "turns", "tests"],
  "5.1": ["ctx"], "5.2": ["ctx"], "5.3": ["ctx"], "5.4": ["ctx"],
};
const MIN_NOTE = 15;      // минимальная длина заметки
const MIN_CONCL = 100;    // минимальная длина каждого вывода

function check() {
  if (!fs.existsSync(RESULTS)) { console.log("Не найден results.md"); process.exit(1); }
  const text = fs.readFileSync(RESULTS, "utf8");
  const errors = [], warns = [], val = {};

  const rows = {};
  for (const line of text.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const c = line.trim().replace(/^\||\|$/g, "").split("|").map((x) => x.trim());
    if (c.length >= 7 && c[0] in ROWS) rows[c[0]] = c;
  }
  // колонки: Шаг | Вариант | Контекст | Стоимость | Ходы | Тесты | Заметка
  for (const [id, need] of Object.entries(ROWS)) {
    const c = rows[id];
    if (!c) { errors.push(`Нет строки «${id}» в таблице`); continue; }
    const ctx = num(c[2]);
    if (need.includes("ctx")) {
      if (ctx == null) errors.push(`Строка ${id}: «Контекст» — нужно число токенов (например 18400 или 18.4k)`);
      else if (ctx < 500 || ctx > 1000000) warns.push(`Строка ${id}: контекст ${ctx} выглядит странно — вы взяли «Total» из /context?`);
      else val[id] = ctx;
    }
    if (need.includes("turns")) {
      const t = num(c[4]);
      if (t == null || t > 200) errors.push(`Строка ${id}: «Ходы» — нужно целое число вызовов инструментов (0 тоже допустимо)`);
      else val[id + ":t"] = t;
    }
    if (need.includes("tests") && !/^(да|нет)/i.test(c[5])) errors.push(`Строка ${id}: «Тесты зелёные?» — напишите «да» или «нет»`);
    if (c[6].length < MIN_NOTE) errors.push(`Строка ${id}: заполните «Что заметил» (хотя бы ${MIN_NOTE} символов, что именно вы увидели)`);
  }

  // выводы
  const section = (text.split(/^##\s+Выводы.*$/m)[1] || "").replace(/<!--[\s\S]*?-->/g, "");
  const bodies = {};
  let cur = null;
  for (const line of section.split("\n")) {
    const q = line.match(/^\s*([1-3])\.\s/);
    if (q) { cur = q[1]; bodies[cur] = ""; continue; }
    if (cur) bodies[cur] += line.trim() + " ";
  }
  for (let i = 1; i <= 3; i++) {
    const len = (bodies[i] || "").trim().length;
    if (len < MIN_CONCL) errors.push(`Вывод ${i}: нужно минимум ${MIN_CONCL} символов своими словами под вопросом (сейчас ${len})`);
  }
  // шапка
  for (const f of ["Имя", "IDE", "Модель"]) {
    const m = text.match(new RegExp("^\\s*[-*]\\s*" + f + "[^:]*:\\s*(.*)$", "m"));
    if (!m || m[1].replace(/<!--[\s\S]*?-->/g, "").trim().length < 2) errors.push(`Шапка: заполните поле «${f}»`);
  }

  // здравый смысл (предупреждения, не ошибки)
  const lt = (a, b, msg) => { if (val[a] != null && val[b] != null && !(val[a] < val[b])) warns.push(msg); };
  lt("1B", "1A", "Ожидается: точный промпт (1B) даёт меньше контекста, чем размытый (1A). Проверьте замеры.");
  lt("2B", "2A", "Ожидается: короткий CLAUDE.md (2B) даёт меньше контекста, чем раздутый (2A).");
  lt("3B", "3A", "Ожидается: тихий вывод тестов (3B) даёт меньше контекста, чем подробный (3A).");
  lt("5.1", "5.2", "Ожидается: контекст растёт от 5.1 к 5.2.");
  lt("5.2", "5.3", "Ожидается: контекст растёт от 5.2 к 5.3.");
  lt("5.4", "5.3", "Ожидается: после /compact (5.4) контекст меньше, чем до него (5.3).");

  console.log("=== Проверка results.md ===");
  if (errors.length) { console.log("\nОШИБКИ (исправьте до отправки):"); errors.forEach((e) => console.log(" ✗ " + e)); }
  if (warns.length) { console.log("\nПРЕДУПРЕЖДЕНИЯ (проверьте себя):"); warns.forEach((e) => console.log(" ! " + e)); }

  const pct = (a, b) => (val[a] && val[b] ? Math.round((1 - val[b] / val[a]) * 100) + "%" : "—");
  console.log("\nСводка экономии контекста (чем больше, тем лучше):");
  console.log(`  1A → 1B   (точный промпт):      ${pct("1A", "1B")}`);
  console.log(`  2A → 2B   (короткий CLAUDE.md): ${pct("2A", "2B")}`);
  console.log(`  3A → 3B   (тихий вывод):        ${pct("3A", "3B")}`);
  console.log(`  1A → 4    (запрет на шум):      ${pct("1A", "4")}`);
  console.log(`  5.3 → 5.4 (/compact):           ${pct("5.3", "5.4")}`);

  if (errors.length) { console.log(`\nНе готово: ошибок — ${errors.length}.`); process.exit(1); }
  console.log("\nГотово: results.md заполнен. Отправьте файл на проверку.");
}

const cmd = process.argv[2];
switch (cmd) {
  case "reset": reset(); break;
  case "rules-bloated": put(path.join(LAB, "rules", "CLAUDE.bloated.md"), path.join(APP, "CLAUDE.md")); break;
  case "rules-lean": put(path.join(LAB, "rules", "CLAUDE.lean.md"), path.join(APP, "CLAUDE.md")); break;
  case "deny": put(path.join(LAB, "settings", "deny-noise.json"), path.join(APP, ".claude", "settings.json")); break;
  case "status": status(); break;
  case "check": check(); break;
  default:
    console.log("Команды: reset | rules-bloated | rules-lean | deny | status | check\nЗапуск: node ../lab.js <команда> (из папки sample-app)");
    process.exit(cmd ? 1 : 0);
}
