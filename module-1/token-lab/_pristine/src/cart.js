const { applyCoupon } = require("./discount");

function subtotal(items) {
  return items.reduce((sum, i) => sum + i.price * i.qty, 0);
}

function cartTotal(items, coupon) {
  return applyCoupon(subtotal(items), coupon);
}

module.exports = { subtotal, cartTotal };
