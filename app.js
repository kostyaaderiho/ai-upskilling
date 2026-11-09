// Adds a "Копировать" button to every code block, makes inline commands
// click-to-copy, and enables smooth TOC highlighting.
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("pre").forEach((pre) => {
    const btn = document.createElement("button");
    btn.className = "copy-btn";
    btn.textContent = "Копировать";
    btn.addEventListener("click", async () => {
      const code = pre.querySelector("code");
      const text = code ? code.innerText : pre.innerText;
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = "Скопировано";
        setTimeout(() => (btn.textContent = "Копировать"), 1500);
      } catch {
        btn.textContent = "Ошибка";
      }
    });
    pre.appendChild(btn);
  });

  // Inline <code> с вызовом команды копируется кликом. Признак команды:
  // либо слэш-команда агента (/compact, /speckit-plan), либо первое слово —
  // известная программа и за ней есть аргументы.
  const BINARIES = new Set([
    "git",
    "npm",
    "npx",
    "node",
    "uv",
    "uvx",
    "pip",
    "pipx",
    "brew",
    "gh",
    "curl",
    "grep",
    "cd",
    "ls",
    "cat",
    "mkdir",
    "rm",
    "cp",
    "mv",
    "export",
    "chmod",
    "python",
    "python3",
    "claude",
    "specify",
    "tsc",
    "eslint",
    "vitest",
  ]);

  const asCommand = (raw) => {
    const text = raw.replace(/\s+/g, " ").trim();
    if (!text) return null;
    const first = text.split(" ")[0];
    if (/^\/[a-z]/i.test(first)) {
      // Слэш-команда, а не путь: /speckit-plan — да, /books/recent — нет.
      return first.slice(1).includes("/") ? null : text;
    }
    return BINARIES.has(first) && text.includes(" ") ? text : null;
  };

  let resetTimer = null;

  document.querySelectorAll(":not(pre) > code").forEach((code) => {
    const command = asCommand(code.textContent);
    if (!command) return;

    code.classList.add("cmd");
    code.dataset.command = command;
    code.setAttribute("role", "button");
    code.setAttribute("tabindex", "0");
    code.setAttribute("title", "Нажмите, чтобы скопировать");
    code.setAttribute("aria-label", `Скопировать команду: ${command}`);

    const copy = async () => {
      try {
        await navigator.clipboard.writeText(command);
        clearTimeout(resetTimer);
        document
          .querySelectorAll("code.cmd.copied")
          .forEach((el) => el.classList.remove("copied"));
        code.classList.add("copied");
        resetTimer = setTimeout(() => code.classList.remove("copied"), 1500);
      } catch {
        code.classList.add("copy-failed");
        setTimeout(() => code.classList.remove("copy-failed"), 1500);
      }
    };

    code.addEventListener("click", copy);
    code.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        void copy();
      }
    });
  });
});
