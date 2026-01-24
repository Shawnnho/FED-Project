// cart-badge.js — works on every page
const CART_KEY = "hp_cart";

function readCart() {
  try {
    const cart = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    return Array.isArray(cart) ? cart : [];
  } catch {
    return [];
  }
}

function calcCount(cart) {
  let count = 0;
  for (const it of cart) {
    const qty = Number(it.qty ?? it.quantity ?? 1);
    count += Number.isFinite(qty) ? qty : 1;
  }
  return count;
}

export function updateCartBadges() {
  const count = calcCount(readCart());

  // Desktop badge
  const el = document.getElementById("cartCount");
  if (el) {
    el.textContent = String(count);
    el.classList.toggle("isZero", count <= 0);
  }

  // Mobile badge
  const elM = document.getElementById("cartCountMobile");
  if (elM) {
    elM.textContent = String(count);
    elM.classList.toggle("isZero", count <= 0);
  }
}

// Run on load + when coming back to tab/page
document.addEventListener("DOMContentLoaded", updateCartBadges);
window.addEventListener("pageshow", updateCartBadges);

// Sync across tabs/windows
window.addEventListener("storage", (e) => {
  if (e.key === CART_KEY) updateCartBadges();
});
