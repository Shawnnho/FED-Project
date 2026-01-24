// cart-badge.js — account-based badge (works on every page)
import { getCartForUI } from "./cart.js";

function calcCount(cart) {
  let count = 0;
  for (const it of cart) {
    const qty = Number(it.qty ?? it.quantity ?? 1);
    count += Number.isFinite(qty) ? qty : 1;
  }
  return count;
}

export async function updateCartBadges() {
  try {
    const cart = await getCartForUI();
    const count = calcCount(cart);

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
  } catch (err) {
    console.warn("updateCartBadges failed:", err);
  }
}

// Run on load + when coming back to tab/page
document.addEventListener("DOMContentLoaded", updateCartBadges);
window.addEventListener("pageshow", updateCartBadges);
