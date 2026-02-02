/*************************************************
 * cart.js — Hawker Point (Account-based Cart)
 * - Logged in: Firestore carts/{uid}.items
 * - Guest: localStorage hp_cart
 * - Renders cart page + updates badges
 * - Payment method selector + Proceed button states
 *************************************************/

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* SAME config as your other files */
const firebaseConfig = {
  apiKey: "AIzaSyC-NTWADB-t1OGl7NbdyMVXjpVjnqjpTXg",
  authDomain: "fedproject-8d254.firebaseapp.com",
  projectId: "fedproject-8d254",
  storageBucket: "fedproject-8d254.firebasestorage.app",
  messagingSenderId: "477538553634",
  appId: "1:477538553634:web:a14b93bbd93d33b9281f7b",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const CART_KEY = "hp_cart";
let currentUser = null;

const cartDocRef = (uid) => doc(db, "carts", uid);

/* ------------------------------
   LocalStorage helpers (guest)
--------------------------------*/
function readLocalCart() {
  try {
    const cart = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    return Array.isArray(cart) ? cart : [];
  } catch {
    return [];
  }
}
function writeLocalCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart || []));
}
function clearLocalCart() {
  localStorage.removeItem(CART_KEY);
}

/* ------------------------------
   Firestore helpers (account)
--------------------------------*/
async function readCloudCart(uid) {
  const snap = await getDoc(cartDocRef(uid));
  return snap.exists() ? snap.data().items || [] : [];
}
async function writeCloudCart(uid, cart) {
  await setDoc(cartDocRef(uid), { items: cart, updatedAt: serverTimestamp() }, { merge: true });
}

/* ------------------------------
   Unified cart IO
--------------------------------*/
async function readCart() {
  if (!currentUser) return readLocalCart();
  return await readCloudCart(currentUser.uid);
}
async function saveCart(cart) {
  if (!currentUser) {
    writeLocalCart(cart);
    return;
  }
  await writeCloudCart(currentUser.uid, cart);
}

/* ------------------------------
   UI helpers
--------------------------------*/
function money(n) {
  return (Number(n) || 0).toFixed(2);
}
function calcCount(cart) {
  let c = 0;
  for (const it of cart) c += Number(it.qty ?? it.quantity ?? 1) || 1;
  return c;
}
function updateBadges(count) {
  const el = document.getElementById("cartCount");
  if (el) {
    el.textContent = String(count);
    el.classList.toggle("isZero", count <= 0);
  }
  const elM = document.getElementById("cartCountMobile");
  if (elM) {
    elM.textContent = String(count);
    elM.classList.toggle("isZero", count <= 0);
  }
}

/* ------------------------------
   Merge helper: guest -> account
--------------------------------*/
function mergeCarts(existing = [], incoming = []) {
  // Merge by: stallId + itemId + addons + required + note (so different options stay separate)
  const key = (x) =>
    `${x.stallId || ""}|${x.itemId || x.id || x.name || ""}|` +
    `${JSON.stringify(x.addons || [])}|${JSON.stringify(x.required || [])}|${(x.note || "").trim()}`;

  const map = new Map();
  for (const x of existing) map.set(key(x), { ...x });

  for (const x of incoming) {
    const k = key(x);
    if (!map.has(k)) {
      map.set(k, { ...x });
    } else {
      const cur = map.get(k);
      const addQty = Number(x.qty ?? 1) || 1;
      cur.qty = (Number(cur.qty ?? 1) || 1) + addQty;

      const unit = Number(cur.unitPrice ?? cur.basePrice ?? cur.price ?? 0) || 0;
      cur.totalPrice = unit * (Number(cur.qty ?? 1) || 1);

      map.set(k, cur);
    }
  }

  return Array.from(map.values());
}

/* ------------------------------
   Payment method + Proceed button
--------------------------------*/
function getSelectedPayMethod() {
  const checked = document.querySelector('input[name="payMethod"]:checked');
  return checked ? checked.value : "";
}

function syncProceedBtn() {
  const btn = document.getElementById("checkoutBtn");
  if (!btn) return;

  const selected = getSelectedPayMethod();
  const ready = Boolean(selected);

  btn.classList.toggle("isReady", ready);
  btn.classList.toggle("isLocked", !ready);

  // disable when not selected
  btn.disabled = !ready;
}

function clearPaySelection() {
  document.querySelectorAll('input[name="payMethod"]').forEach((r) => (r.checked = false));
  syncProceedBtn();
}

// When user changes payment method, update button color/state
document.addEventListener("change", (e) => {
  if (!e.target.matches('input[name="payMethod"]')) return;
  syncProceedBtn();
});

/* ------------------------------
   Render cart page
--------------------------------*/
async function render() {
  const list = document.getElementById("cartList");
  const empty = document.getElementById("cartEmpty");
  const summary = document.getElementById("cartSummary");
  const subText = document.getElementById("cartSub");

  const cart = await readCart();
  const count = calcCount(cart);

  updateBadges(count);
  if (subText) subText.textContent = `${count} item${count === 1 ? "" : "s"}`;

  if (!list) return; // not on cart page

  list.innerHTML = "";

  const payBox = document.getElementById("payBox");
  const proceedBtn = document.getElementById("checkoutBtn");

  if (cart.length === 0) {
    empty && (empty.hidden = false);
    summary && (summary.style.display = "none");
    payBox && (payBox.style.display = "none");
    proceedBtn && (proceedBtn.style.display = "none");
    return;
  }

  empty && (empty.hidden = true);
  summary && (summary.style.display = "");
  payBox && (payBox.style.display = "");
  proceedBtn && (proceedBtn.style.display = "");

  // Requirement: by default (every time you open cart), no payment method selected
  clearPaySelection();

  let subtotal = 0;

  cart.forEach((it, idx) => {
    const qty = Number(it.qty ?? it.quantity ?? 1) || 1;

    const name = it.name ?? it.itemName ?? "Item";
    const img = it.img ?? it.image ?? "images/defaultFood.png";
    const note = it.note ?? it.sideNote ?? "";
    const addons = Array.isArray(it.addons) ? it.addons : [];
    const required = Array.isArray(it.required) ? it.required : [];

    const unitPrice = Number(it.unitPrice ?? it.basePrice ?? it.price ?? 0) || 0;
    const line = Number(it.totalPrice) || unitPrice * qty;

    subtotal += line;

    const card = document.createElement("article");
    card.className = "menuCard cartCard";

    card.innerHTML = `
      <div class="menuImgWrap">
        <img src="${img}" alt="${name}" />
      </div>

      <div class="menuInfo">
        <div class="menuName">${name}</div>
        <div class="menuPrice">$${money(line)}</div>

        <div class="cartMeta">
          ${
            addons.length
              ? `<div class="cartMetaLine"><strong>Add-ons:</strong> ${addons
                  .map((a) => {
                    const label = a.label ?? a.name ?? "";
                    const price = Number(a.price);
                    return Number.isFinite(price) && price > 0
                      ? `${label} (+$${price.toFixed(2)})`
                      : label;
                  })
                  .join(", ")}</div>`
              : ""
          }
          ${
            required.length
              ? `<div class="cartMetaLine"><strong>Options:</strong> ${required
                  .map((r) => `${r.groupTitle}: ${r.optionLabel}`)
                  .join(", ")}</div>`
              : ""
          }
          ${note ? `<div class="cartMetaLine"><strong>Note:</strong> ${note}</div>` : ""}
        </div>
      </div>

      <div class="cartQtyWrap">
        <button class="cartQtyBtn" data-act="plus" data-i="${idx}" type="button">+</button>
        <div class="cartQtyNum">${qty}</div>
        <button class="cartQtyBtn" data-act="minus" data-i="${idx}" type="button">−</button>
      </div>
    `;

    list.appendChild(card);
  });

  const delivery = 0;
  document.getElementById("sumSubtotal").textContent = money(subtotal);
  document.getElementById("sumDelivery").textContent = money(delivery);
  document.getElementById("sumTotal").textContent = money(subtotal + delivery);

  // Keep button in correct state after render
  syncProceedBtn();
}

/* ------------------------------
   Qty buttons (cart page)
--------------------------------*/
document.addEventListener("click", async (e) => {
  // Proceed button click
  const proceed = e.target.closest("#checkoutBtn");
  if (proceed) {
    const method = getSelectedPayMethod();
    if (!method) {
      // should be disabled anyway, but just in case
      alert("Please select a payment method first.");
      return;
    }
    alert(`Proceeding with payment method: ${method}`);
    return;
  }

  // +/- qty buttons
  const btn = e.target.closest("[data-act]");
  if (!btn) return;

  const act = btn.getAttribute("data-act");
  const i = Number(btn.getAttribute("data-i"));

  const cart = await readCart();
  if (!cart[i]) return;

  const qty = Number(cart[i].qty ?? cart[i].quantity ?? 1) || 1;

  if (act === "plus") cart[i].qty = qty + 1;

  if (act === "minus") {
    if (qty <= 1) cart.splice(i, 1);
    else cart[i].qty = qty - 1;
  }

  // Recompute totalPrice if unitPrice exists
  const unit = Number(cart[i]?.unitPrice ?? cart[i]?.basePrice ?? cart[i]?.price ?? 0) || 0;
  if (cart[i]) cart[i].totalPrice = unit * (Number(cart[i].qty ?? 1) || 1);

  await saveCart(cart);
  render();
});

/* ------------------------------
   Auth state: migrate + rerender
--------------------------------*/
onAuthStateChanged(auth, async (u) => {
  currentUser = u;

  // migrate guest localStorage cart into account cart once
  if (u) {
    const local = readLocalCart();
    if (local.length) {
      const cloud = await readCloudCart(u.uid);
      const merged = mergeCarts(cloud, local);
      await writeCloudCart(u.uid, merged);
      clearLocalCart();
    }
  }

  render();
});

/* ------------------------------
   Lifecycle hooks
--------------------------------*/
document.addEventListener("DOMContentLoaded", render);
window.addEventListener("pageshow", render);
window.addEventListener("storage", (e) => e.key === CART_KEY && render());

/* ------------------------------
   For other pages (badge/menu)
--------------------------------*/
export async function getCartForUI() {
  return await readCart();
}
