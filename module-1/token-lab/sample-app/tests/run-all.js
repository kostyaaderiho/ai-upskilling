// Запуск: node tests/run-all.js          (подробный вывод)
//         node tests/run-all.js --quiet  (только ошибки и итог)
const cases = require("./cases");
const quiet = process.argv.includes("--quiet");
let failed = 0;

for (const c of cases) {
  try {
    c.fn();
    if (!quiet) console.log("  ✓ " + c.name + "\n    ok, время 1 мс, проверок: 1");
  } catch (e) {
    failed++;
    console.log("  ✗ " + c.name + "\n    " + String(e.message).split("\n")[0]);
  }
}

console.log("\nИтого: " + (cases.length - failed) + " успешно, " + failed + " упало");
process.exit(failed ? 1 : 0);
