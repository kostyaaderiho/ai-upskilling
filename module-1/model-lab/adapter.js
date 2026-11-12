// Задание 11.3: единый интерфейс к трём провайдерам.
// Реализуйте обе функции. Проверка: node lab.js adapter
//
// toRequest(provider, { system, messages, maxTokens, temperature })
//   provider: "aurora" | "borealis" | "cirrus"
//   messages: [{ role: "user" | "assistant", content: "текст" }, ...]
//   Возвращает JSON-тело запроса в формате провайдера (см. таблицу форматов на странице модуля 11).
//
// fromResponse(provider, raw)
//   Возвращает { text, stop, inputTokens, outputTokens }, где
//   stop: "end" (закончил сам) | "length" (обрезан лимитом) | "filter" (отказ или фильтр),
//   text: всегда строка (пустая, если текста нет).

function toRequest(provider, { system, messages, maxTokens, temperature }) {
  // TODO
  throw new Error("toRequest не реализован для " + provider);
}

function fromResponse(provider, raw) {
  // TODO
  throw new Error("fromResponse не реализован для " + provider);
}

module.exports = { toRequest, fromResponse };
