/*************************************************
 * item.js (Firebase version – UPDATED)
 * Supports:
 *  - old schema: price, imageUrl/description
 *  - new schema: prices (map), img, desc
 * Path:
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
const selectedVariantText = document.getElementById("selectedVariantText");

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

function isHttpUrl(s) {
  return typeof s === "string" && /^https?:\/\//i.test(s);
}

function pickImage(d) {
  // Prefer Storage URL if present (works everywhere)
  if (isHttpUrl(d.imageUrl)) return d.imageUrl;

  // If img is already a URL, use it
  if (isHttpUrl(d.img)) return d.img;

  // If img looks like a local path, only use it if you actually host it
  // (Most projects don't host "/menu/xxx.png" at root, so fallback)
  if (typeof d.img === "string" && d.img.trim()) {
    // If your local images are under "images/", allow those
    if (d.img.startsWith("images/")) return d.img;
    // Otherwise, don't risk broken image
  }

  return "images/menu/placeholder.png";
}

function normalizePricesMap(prices) {
  if (!prices || typeof prices !== "object") return null;
  const out = {};
  for (const [k, v] of Object.entries(prices)) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) out[k] = n;
  }
  return Object.keys(out).length ? out : null;
}

const PRICE_LABELS = {
  hot: "Hot",
  cold_s: "Cold (S)",
  cold_m: "Cold (M)",
  cold_l: "Cold (L)",
};

function pickDefaultPriceKey(pricesObj) {
  // preferred order
  const pref = ["hot", "cold_s", "cold_m", "cold_l"];
  for (const k of pref) if (pricesObj[k] != null) return k;
  // otherwise first key
  return Object.keys(pricesObj)[0];
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
   VARIANT UI (sizes/prices)
========================= */
let variantWrap = null;

function ensureVariantUI() {
  if (variantWrap) return variantWrap;

  // Put it under the description (nice + simple)
  variantWrap = document.createElement("div");
  variantWrap.id = "variantWrap";
  variantWrap.style.margin = "12px 0 6px";
  variantWrap.style.display = "grid";
  variantWrap.style.gap = "10px";

  const title = document.createElement("div");
  title.style.fontWeight = "900";
  title.style.fontSize = "13px";
  title.style.opacity = "0.85";
  title.textContent = "Choose option";

  const row = document.createElement("div");
  row.id = "variantRow";
  row.style.display = "flex";
  row.style.flexWrap = "wrap";
  row.style.gap = "10px";

  variantWrap.append(title, row);

  // Insert after itemDesc
  itemDesc?.insertAdjacentElement("afterend", variantWrap);

  return variantWrap;
}

function renderVariantsIfAny() {
  const prices = ITEM?.prices;
  if (!prices) return;

  const wrap = ensureVariantUI();
  const row = wrap.querySelector("#variantRow");

  row.innerHTML = "";

  Object.keys(prices).forEach((key) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.style.padding = "10px 12px";
    btn.style.borderRadius = "999px";
    btn.style.border = "1px solid rgba(0,0,0,0.12)";
    btn.style.background = "white";
    btn.style.fontWeight = "900";
    btn.style.cursor = "pointer";

    const label = PRICE_LABELS[key] || key;
    btn.textContent = `${label} • ${money(prices[key])}`;

    const isActive = ITEM.variantKey === key;
    btn.style.outline = isActive ? "2px solid rgba(200, 60, 80, 0.7)" : "none";

    btn.addEventListener("click", () => {
      ITEM.variantKey = key;
      ITEM.variantLabel = label;
      ITEM.price = prices[key];
      itemBasePrice.textContent = money(ITEM.price);

      if (selectedVariantText)
        selectedVariantText.textContent = `Selected: ${label}`;
      renderVariantsIfAny(); // re-outline buttons
      updateTotal();
    });

    row.appendChild(btn);
  });
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

  const pricesMap = normalizePricesMap(d.prices);
  const singlePrice = Number(d.price);

  // Decide base price:
  // - if single price exists, use it
  // - else if prices map exists, use default key from map
  // - else 0
  let price = 0;
  let variantKey = null;
  let variantLabel = "";

  if (Number.isFinite(singlePrice) && singlePrice > 0) {
    price = singlePrice;
  } else if (pricesMap) {
    variantKey = pickDefaultPriceKey(pricesMap);
    variantLabel = PRICE_LABELS[variantKey] || variantKey;
    price = pricesMap[variantKey];
  }

  ITEM = {
    id: snap.id,
    name: d.name || snap.id,
    desc: d.desc || d.description || "",
    img: pickImage(d),

    // pricing
    price,
    prices: pricesMap, // null or object
    variantKey,
    variantLabel,
  };

  renderItem();
  renderVariantsIfAny();

  if (selectedVariantText) {
    selectedVariantText.textContent = ITEM.variantLabel
      ? `Selected: ${ITEM.variantLabel}`
      : "";
  }
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
  return (ITEM?.price || 0) + addonsTotal();
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

    // variant support
    variantKey: ITEM.variantKey || null,
    variantLabel: ITEM.variantLabel || "",

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
