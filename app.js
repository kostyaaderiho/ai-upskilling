// Adds a "Копировать" button to every code block and enables smooth TOC highlighting.
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
});
