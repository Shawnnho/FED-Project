/*************************************************
 * item.js
 * - Reads ?stall=...&item=...
 * - Shows layout + updates total with addons + qty
 * - Adds to localStorage hp_cart
 * - Back goes to menu.html?id=...
 *************************************************/

function slugify(str) {
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

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

/* ===== MENU DATA (must match stallmenu.js items) ===== */
const menuByStall = {
  "ahmad-nasi-lemak": [
    {
      name: "Nasi Lemak",
      price: 7.0,
      img: "images/stalls/nasilemak.jpg",
      desc:
        "Fragrant coconut rice served with sambal, crispy anchovies, peanuts, egg, and cucumber. Simple, satisfying, and a local favourite.",
      addons: [
        { id: "more-rice", label: "More Rice", price: 0.5 },
        { id: "more-chicken", label: "More Chicken", price: 2.0 },
        { id: "extra-egg", label: "Extra Egg and Ikan Bilis", price: 1.0 },
      ],
    },
    {
      name: "Fried Noodles",
      price: 6.7,
      img: "images/fried noodles.png",
      desc: "Wok-fried noodles with savoury seasoning and vegetables.",
      addons: [
        { id: "add-egg", label: "Add Egg", price: 1.0 },
        { id: "extra-chilli", label: "Extra Chilli", price: 0.3 },
      ],
    },
    {
      name: "Satay (1 Dozen)",
      price: 10.5,
      img: "images/Satay 1D.png",
      desc: "Skewers grilled to perfection, served with peanut sauce.",
      addons: [{ id: "extra-sauce", label: "Extra Peanut Sauce", price: 0.5 }],
    },
    {
      name: "Assam Laksa",
      price: 8.0,
      img: "images/Asaam Laks.png",
      desc: "Tangy, spicy broth with noodles and fresh toppings.",
      addons: [{ id: "more-noodles", label: "More Noodles", price: 0.8 }],
    },
    {
      name: "Roti Canai",
      price: 5.0,
      img: "images/Roti canai.png",
      desc: "Crispy, flaky roti served with fragrant curry.",
      addons: [{ id: "extra-curry", label: "Extra Curry", price: 0.6 }],
    },
    {
      name: "Chendul",
      price: 4.0,
      img: "images/Chendul.png",
      desc: "Classic icy dessert with gula melaka and coconut milk.",
      addons: [{ id: "more-gula", label: "More Gula Melaka", price: 0.4 }],
    },
  ],

  // add other stalls later (same structure)
};

/* ===== READ URL ===== */
const params = new URLSearchParams(window.location.search);
const stallId = params.get("stall") || "ahmad-nasi-lemak";
const itemSlug = params.get("item");

if (!itemSlug || !menuByStall[stallId]) {
  window.location.href = `menu.html?id=${encodeURIComponent(stallId)}`;
}

const item = (menuByStall[stallId] || []).find(
  (x) => slugify(x.name) === itemSlug,
);

if (!item) {
  window.location.href = `menu.html?id=${encodeURIComponent(stallId)}`;
}

/* ===== DOM ===== */
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

/* ===== INIT UI ===== */
itemImg.src = item.img;
itemImg.alt = item.name;
itemName.textContent = item.name;
itemBasePrice.textContent = money(item.price);
itemDesc.textContent = item.desc || "";

/* ===== STATE ===== */
let qty = 1;
const selectedAddons = new Set();

/* ===== ADDONS UI + EVENTS ===== */
addonsList.innerHTML = "";

(item.addons || []).forEach((a) => {
  const row = document.createElement("label");
  row.classList.add("addonRow");

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.value = a.id;

  const text = document.createElement("span");
  text.textContent = a.label;

  const price = document.createElement("span");
  price.classList.add("addonPrice");
  price.textContent = `+ ${money(a.price)}`;

  cb.addEventListener("change", () => {
    if (cb.checked) selectedAddons.add(a.id);
    else selectedAddons.delete(a.id);
    updateTotal();
  });

  row.appendChild(cb);
  row.appendChild(text);
  row.appendChild(price);

  addonsList.appendChild(row);
});

/* ===== PRICE CALC ===== */
function addonsTotal() {
  let sum = 0;
  (item.addons || []).forEach((a) => {
    if (selectedAddons.has(a.id)) sum += Number(a.price || 0);
  });
  return sum;
}

function unitPrice() {
  return Number(item.price || 0) + addonsTotal();
}

function updateTotal() {
  const total = unitPrice() * qty;
  addToCartBtn.textContent = `Add to Cart (${money(total)})`;
}

updateTotal();

/* ===== NAV ===== */
closeBtn.addEventListener("click", () => {
  window.location.href = `menu.html?id=${encodeURIComponent(stallId)}`;
});

/* ===== QTY ===== */
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

/* ===== ADD TO CART ===== */
addToCartBtn.addEventListener("click", () => {
  const perItem = unitPrice();
  const total = perItem * qty;

  // store addon objects (label + price) so you can display later easily
  const chosenAddons = (item.addons || [])
    .filter((a) => selectedAddons.has(a.id))
    .map((a) => ({ id: a.id, label: a.label, price: a.price }));

  const cartItem = {
    stallId,
    itemId: slugify(item.name),
    name: item.name,
    img: item.img,
    qty,
    note: (sideNoteEl?.value || "").trim(),
    addons: chosenAddons,
    unitPrice: perItem,
    totalPrice: total,
  };

  const cart = readCart();
  cart.push(cartItem);
  writeCart(cart);

  // go back to menu page (cart bar should update there)
  window.location.href = `menu.html?id=${encodeURIComponent(stallId)}`;
});
