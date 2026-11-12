#!/usr/bin/env node
// Лаборатория «Использование LLM через API». Каждый эксперимент — тело запроса в папке experiments/.
// Вы копируете тело, меняете одну вещь и смотрите, как изменился ответ. Код писать не нужно.
// Нужен Node.js 18+ и ключ в переменной ANTHROPIC_API_KEY.
// Команды (из корня проекта): ping | list | show <имя> | run <имя> | check | help
const fs = require("fs");
const path = require("path");
const { callModel } = require("./client.js");
const prices = require("./prices.json");

const ROOT = __dirname;
const EXP_DIR = path.join(ROOT, "experiments");
const RESULTS = path.join(ROOT, "results.json");
const RESULTS_MD = path.join(ROOT, "results.md");
const MODEL = "claude-haiku-5-5";
const n = (x) => x || 0;
const usd = (x) => "$" + x.toFixed(6);

const textOf = (r) => (r.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");

// Стоимость вызова по полю usage: лаборатория считает сама.
function costOf(usage) {
  const p = prices.models[MODEL];
  return (
    (n(usage.input_tokens) * p.input +
      n(usage.cache_read_input_tokens) * p.input * prices.cacheReadMult +
      n(usage.cache_creation_input_tokens) * p.input * prices.cacheWriteMult +
      n(usage.output_tokens) * p.output) / 1e6
  );
}

function record(name, entry) {
  const all = fs.existsSync(RESULTS) ? JSON.parse(fs.readFileSync(RESULTS, "utf8")) : {};
  all[name] = { ...entry, at: new Date().toISOString() };
  fs.writeFileSync(RESULTS, JSON.stringify(all, null, 2) + "\n");
}

function listExperiments() {
  return fs.readdirSync(EXP_DIR).filter((f) => f.endsWith(".json")).sort();
}

// Принимает точное имя («01-history-full») или уникальный префикс («01x», «04x»).
function resolveExperiment(query) {
  if (!query) throw new Error("укажите эксперимент, например: node module-1/api-lab/lab.js run 01");
  const names = listExperiments().map((f) => f.replace(/\.json$/, ""));
  const hits = names.filter((b) => b === query || b.startsWith(query + "-"));
  if (hits.length === 1) return path.join(EXP_DIR, hits[0] + ".json");
  if (hits.length > 1) throw new Error(`«${query}» подходит к нескольким: ${hits.join(", ")}. Укажите точнее`);
  const similar = names.filter((b) => b.startsWith(query));
  if (similar.length > 1) throw new Error(`«${query}» подходит к нескольким: ${similar.join(", ")}. Укажите точнее`);
  throw new Error(`нет эксперимента «${query}». Список: node module-1/api-lab/lab.js list`);
}

function printReply(r) {
  const u = r.usage;
  console.log(`Ответ: ${textOf(r)}`);
  r.content
    .filter((b) => b.type === "tool_use")
    .forEach((b) => console.log(`Модель просит инструмент: ${b.name}(${JSON.stringify(b.input)})`));
  console.log(`stop_reason: ${r.stop_reason}`);
  console.log(`usage: вход ${n(u.input_tokens)}, выход ${n(u.output_tokens)}`);
  console.log(`стоимость вызова: ${usd(costOf(u))}`);
}

/* ---------- Команды ---------- */

async function ping() {
  const r = await callModel({
    model: MODEL,
    max_tokens: 20,
    thinking: { type: "disabled" },
    messages: [{ role: "user", content: "Ответь одним словом: готово." }],
  });
  printReply(r);
}

function show(query) {
  const file = resolveExperiment(query);
  const body = JSON.parse(fs.readFileSync(file, "utf8"));
  console.log(JSON.stringify(body, null, 2));
  console.log("\nЭто тело уйдёт в POST https://api.anthropic.com/v1/messages. Ключ передаётся отдельно, в заголовке.");
}

async function run(query) {
  const file = resolveExperiment(query);
  const label = path.basename(file, ".json");
  const body = JSON.parse(fs.readFileSync(file, "utf8"));
  console.log(`Эксперимент: ${label}`);
  try {
    const r = await callModel(body);
    printReply(r);
    record(label, { ok: true, status: 200, stop_reason: r.stop_reason, text: textOf(r), content: r.content, usage: r.usage });
  } catch (e) {
    console.log(`Ошибка API: ${e.message}`);
    record(label, { ok: false, status: e.status || null, error_type: e.type || null, message: e.message });
  }
}

/* ---------- Проверка ---------- */

function check() {
  const problems = [];
  if (!fs.existsSync(RESULTS)) return ["нет results.json: сначала запустите базовые эксперименты (node module-1/api-lab/lab.js run 01)"];
  const res = JSON.parse(fs.readFileSync(RESULTS, "utf8"));

  const base = ["01-history-full", "03a-system-field", "04-max-tokens-10", "09-stop-sequence", "07-tool-request"];
  base.forEach((name) => { if (!res[name]) problems.push(`не запущен базовый эксперимент «${name}»`); });

  if (res["04-max-tokens-10"] && res["04-max-tokens-10"].stop_reason !== "max_tokens") {
    problems.push("04: при max_tokens 10 ожидался stop_reason «max_tokens»");
  }
  if (res["09-stop-sequence"] && res["09-stop-sequence"].stop_reason !== "stop_sequence") {
    problems.push("09: при stop_sequences [\".\"] ожидался stop_reason «stop_sequence». Повторите run 09");
  }
  if (res["07-tool-request"] && res["07-tool-request"].stop_reason !== "tool_use") {
    problems.push("07: ожидался stop_reason «tool_use». Ответ недетерминирован: повторите run 07");
  }

  if (!fs.existsSync(RESULTS_MD)) {
    problems.push("нет results.md");
  } else {
    const text = fs.readFileSync(RESULTS_MD, "utf8");
    if (/TODO/.test(text)) problems.push("results.md: замените TODO своими ответами");
    const parts = text.split(/^## /m).slice(1);
    if (parts.length < 5) problems.push("results.md: нужны пять разделов «## 1.» … «## 5.»");
    parts.forEach((s, i) => {
      const body = s.split("\n").slice(1).join("\n").trim();
      if (body.length < 120) problems.push(`results.md, раздел ${i + 1}: короче 120 символов`);
    });
  }
  return problems;
}

async function main() {
  const [cmd = "help", arg] = process.argv.slice(2);
  if (cmd === "help") {
    console.log("Команды (из корня проекта):");
    console.log("  node module-1/api-lab/lab.js ping          — проверить подключение к API");
    console.log("  node module-1/api-lab/lab.js list          — список экспериментов");
    console.log("  node module-1/api-lab/lab.js show <имя>    — показать тело запроса");
    console.log("  node module-1/api-lab/lab.js run <имя>     — отправить тело запроса в API и увидеть ответ");
    console.log("  node module-1/api-lab/lab.js check         — проверить результаты и results.md");
    return;
  }
  if (cmd === "ping") return ping();
  if (cmd === "list") return listExperiments().forEach((f) => console.log(f.replace(/\.json$/, "")));
  if (cmd === "show") return show(arg);
  if (cmd === "run") return run(arg);
  if (cmd === "check") {
    if (!process.env.ANTHROPIC_API_KEY) console.log("Ключ ANTHROPIC_API_KEY не задан в этом терминале (шаг 2 модуля 12).\n");
    const problems = check();
    if (problems.length) {
      console.log("✗ Не принято:");
      problems.forEach((x) => console.log(`    - ${x}`));
      process.exitCode = 1;
    } else {
      console.log("✓ Готово: результаты и results.md заполнены. Отправьте папку module-1/api-lab на проверку.");
    }
    return;
  }
  console.log(`Неизвестная команда: ${cmd}. Список команд: node module-1/api-lab/lab.js help`);
  process.exitCode = 1;
}

main().catch((e) => {
  console.error(`ошибка: ${e.message}`);
  process.exitCode = 1;
});
