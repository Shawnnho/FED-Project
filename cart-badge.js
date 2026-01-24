// cart-badge.js — works on every page

import { getCartForUI } from "./cart.js";

export async function updateCartBadges() {
  const cart = await getCartForUI();

  let count = 0;
  for (const it of cart) {
    count += Number(it.qty ?? 1);
  }

  document.getElementById("cartCount")?.textContent = count;
  document.getElementById("cartCountMobile")?.textContent = count;
}

document.addEventListener("DOMContentLoaded", updateCartBadges);
window.addEventListener("pageshow", updateCartBadges);

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
