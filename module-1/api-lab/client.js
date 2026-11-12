// Клиент Claude Messages API на чистом fetch (нужен Node.js 18+, без зависимостей).
// Ключ берётся из переменной окружения ANTHROPIC_API_KEY, если не передан в opts.apiKey.

const URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

function apiError(status, type, message, requestId) {
  const err = new Error(`${type || "http_error"} (${status}): ${message}`);
  err.status = status;
  err.type = type || "http_error";
  err.requestId = requestId || null;
  return err;
}

// Отправляет тело запроса в Messages API и возвращает распарсенный ответ.
async function callModel(body, opts = {}) {
  const key = opts.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw apiError(401, "authentication_error", "переменная ANTHROPIC_API_KEY не задана, см. шаг 2 модуля 12");
  }
  let res;
  try {
    res = await fetch(URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": API_VERSION,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    const err = new Error(`network_error: ${e.message}`);
    err.type = "network_error";
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw apiError(res.status, data?.error?.type, data?.error?.message || res.statusText, res.headers.get("request-id"));
  }
  return data;
}

module.exports = { callModel, URL, API_VERSION };
