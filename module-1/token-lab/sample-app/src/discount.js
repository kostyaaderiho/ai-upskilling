// Расчёт скидок по купонам.
// coupon: { code, kind: "percent" | "fixed", value }
// percent: value = 10 означает 10%. fixed: value = сумма скидки.

function round2(n) {
  return Math.round(n * 100) / 100;
}

function applyCoupon(total, coupon) {
  if (!coupon) return total;
  if (coupon.kind === "percent") {
    return round2(total - total * coupon.value);
  }
  return round2(Math.max(0, total - coupon.value));
}

module.exports = { applyCoupon, round2 };
