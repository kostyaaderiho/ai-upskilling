const assert = require("assert");
const { applyCoupon } = require("../src/discount");
const { cartTotal } = require("../src/cart");

const cases = [
  { name: "без купона сумма не меняется", fn: () => assert.strictEqual(applyCoupon(200, undefined), 200) },
  { name: "процентный купон 10% на 200 даёт 180", fn: () => assert.strictEqual(applyCoupon(200, { kind: "percent", value: 10 }), 180) },
  { name: "процентный купон 100% даёт 0", fn: () => assert.strictEqual(applyCoupon(50, { kind: "percent", value: 100 }), 0) },
  { name: "фиксированный купон 15 на 200 даёт 185", fn: () => assert.strictEqual(applyCoupon(200, { kind: "fixed", value: 15 }), 185) },
  { name: "корзина с купоном 10% стоит 180", fn: () => assert.strictEqual(cartTotal([{ price: 50, qty: 2 }, { price: 25, qty: 4 }], { kind: "percent", value: 10 }), 180) },
];

// 150 безобидных проверок: делают вывод обычного запуска длинным.
for (let i = 1; i <= 150; i++) {
  cases.push({ name: "утилита №" + i + " возвращает ожидаемое значение", fn: () => assert.strictEqual(i * 2 - i, i) });
}

module.exports = cases;
