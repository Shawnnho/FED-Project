/*************************************************
 * item.js (Firebase version – FULL)
 * Data source:
 * centres/{centreId}/stalls/{stallId}/menu/{itemId}
 * centres/{centreId}/stalls/{stallId}/addons/{addonId}
 *************************************************/

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =========================
   FIREBASE INIT
========================= */
const firebaseConfig = {
  apiKey: "AIzaSyC-NTWADB-t1OGl7NbdyMVXjpVjnqjpTXg",
  authDomain: "fedproject-8d254.firebaseapp.com",
  projectId: "fedproject-8d254",
  storageBucket: "fedproject-8d254.firebasestorage.app",
  messagingSenderId: "477538553634",
  appId: "1:477538553634:web:a14b93bbd93d33b9281f7b",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* =========================
   URL PARAMS
========================= */
const params = new URLSearchParams(window.location.search);
const centreId = params.get("centreId");
const stallId = params.get("stallId");
const itemId = params.get("itemId");

if (!centreId || !stallId || !itemId) {
  console.error("Missing URL params");
  window.location.href = "home.html";
}

/* =========================
   DOM
========================= */
const closeBtn = document.getElementById("closeBtn");
const itemImg = document.getElementById("itemImg");
const itemName = document.getElementById("itemName");
const itemBasePrice = document.getElementById("itemBasePrice");
const itemDesc = document.getElementById("itemDesc");
const addonsList = document.getElementById("addonsList");
const sideNoteEl = document.getElementById("sideNote");

const qtyMinus = document.getElementById("qtyMinus");
const qtyPlus = document.getElementById("qtyPlus");
const qtyVal = document.getElementById("qtyVal");
const addToCartBtn = document.getElementById("addToCartBtn");

/* =========================
   STATE
========================= */
let ITEM = null;
let ADDONS = [];
let qty = 1;
const selectedAddons = new Set();

/* =========================
   HELPERS
========================= */
function money(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}

function readCart() {
  try {
    return JSON.parse(localStorage.getItem("hp_cart") || "[]");
  } catch {
    return [];
  }
}

function writeCart(cart) {
  localStorage.setItem("hp_cart", JSON.stringify(cart));
}

/* =========================
   LOAD ITEM
========================= */
async function loadItem() {
  const ref = doc(db, "centres", centreId, "stalls", stallId, "menu", itemId);

  const snap = await getDoc(ref);

  if (!snap.exists()) {
    console.error("Item not found");
    window.location.href = `menu.html?centreId=${centreId}&stallId=${stallId}`;
    return;
  }

  const d = snap.data();

  ITEM = {
    id: snap.id,
    name: d.name || snap.id,
    price: Number(d.price ?? d.priceFrom ?? 0),
    img: d.img || d.imageUrl || "images/menu/placeholder.png",
    desc: d.description || "",
  };

  renderItem();
}

/* =========================
   LOAD ADDONS
========================= */
async function loadAddons() {
  const ref = collection(db, "centres", centreId, "stalls", stallId, "addons");

  const snap = await getDocs(ref);

  ADDONS = snap.docs
    .map((d) => {
      const a = d.data();
      return {
        id: d.id,
        label: a.label || a.name || d.id,
        price: Number(a.price || 0),
        active: a.active !== false,
      };
    })
    .filter((a) => a.active);

  renderAddons();
}

/* =========================
   RENDER ITEM
========================= */
function renderItem() {
  itemImg.src = ITEM.img;
  itemImg.alt = ITEM.name;
  itemName.textContent = ITEM.name;
  itemBasePrice.textContent = money(ITEM.price);
  itemDesc.textContent = ITEM.desc || "";
  updateTotal();
}

/* =========================
   RENDER ADDONS
========================= */
function renderAddons() {
  addonsList.innerHTML = "";

  if (!ADDONS.length) {
    addonsList.innerHTML = `<div class="emptyAddons">No add-ons available.</div>`;
    return;
  }

  ADDONS.forEach((a) => {
    const row = document.createElement("label");
    row.className = "addonRow";

    const cb = document.createElement("input");
    cb.type = "checkbox";

    cb.addEventListener("change", () => {
      cb.checked ? selectedAddons.add(a.id) : selectedAddons.delete(a.id);
      updateTotal();
    });

    const text = document.createElement("span");
    text.textContent = a.label;

    const price = document.createElement("span");
    price.className = "addonPrice";
    price.textContent = `+ ${money(a.price)}`;

    row.append(cb, text, price);
    addonsList.appendChild(row);
  });
}

/* =========================
   PRICE CALC
========================= */
function addonsTotal() {
  return ADDONS.reduce(
    (sum, a) => sum + (selectedAddons.has(a.id) ? a.price : 0),
    0,
  );
}

function unitPrice() {
  return ITEM.price + addonsTotal();
}

function updateTotal() {
  const total = unitPrice() * qty;
  addToCartBtn.textContent = `Add to Cart (${money(total)})`;
}

/* =========================
   QTY
========================= */
qtyMinus.addEventListener("click", () => {
  qty = Math.max(1, qty - 1);
  qtyVal.textContent = qty;
  updateTotal();
});

qtyPlus.addEventListener("click", () => {
  qty += 1;
  qtyVal.textContent = qty;
  updateTotal();
});

/* =========================
   ADD TO CART
========================= */
addToCartBtn.addEventListener("click", () => {
  const cart = readCart();

  cart.push({
    centreId,
    stallId,
    stallPath: `centres/${centreId}/stalls/${stallId}`,
    itemId: ITEM.id,
    name: ITEM.name,
    img: ITEM.img,
    qty,
    note: sideNoteEl?.value || "",
    addons: ADDONS.filter((a) => selectedAddons.has(a.id)),
    unitPrice: unitPrice(),
    totalPrice: unitPrice() * qty,
  });

  writeCart(cart);

  window.location.href = `menu.html?centreId=${centreId}&stallId=${stallId}`;
});

/* =========================
   NAV
========================= */
closeBtn.addEventListener("click", () => {
  window.location.href = `menu.html?centreId=${centreId}&stallId=${stallId}`;
});

/* =========================
   INIT
========================= */
Promise.all([loadItem(), loadAddons()]);
