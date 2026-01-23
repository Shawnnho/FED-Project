/*************************************************
 * item.js
 * - Reads ?stall=...&item=...
 * - Looks up item + addons
 * - Updates price based on addons + quantity
 * - Adds to localStorage cart
 *************************************************/

function money(n) {
  return `$${n.toFixed(2)}`;
}

function slugify(str) {
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/* ===== DATA: must match your menu page items ===== */
const menuByStall = {
  "ahmad-nasi-lemak": [
    {
      id: slugify("Nasi Lemak"),
      name: "Nasi Lemak",
      basePrice: 7.0,
      img: "images/stalls/nasilemak.jpg",
      desc:
        "Fragrant coconut rice served with sambal, crispy anchovies, peanuts, egg, and cucumber. Simple, satisfying, and a local favourite.",
      addons: [
        { id: "more-rice", label: "More Rice", price: 0.5 },
        { id: "more-chicken", label: "More Chicken", price: 2.0 },
        { id: "extra-egg-ikan-bilis", label: "Extra Egg and Ikan Bilis", price: 1.0 },
      ],
    },
    {
      id: slugify("Fried Noodles"),
      name: "Fried Noodles",
      basePrice: 6.7,
      img: "images/fried noodles.png",
      desc: "Wok-fried noodles with savoury seasoning, vegetables, and a satisfying bite.",
      addons: [
        { id: "extra-chilli", label: "Extra Chilli", price: 0.3 },
        { id: "add-egg", label: "Add Egg", price: 1.0 },
      ],
    },
    {
      id: slugify("Satay (1 Dozen)"),
      name: "Satay (1 Dozen)",
      basePrice: 10.5,
      img: "images/Satay 1D.png",
      desc: "Skewers grilled to perfection, served with rich peanut sauce and cucumber-onion relish.",
      addons: [
        { id: "extra-sauce", label: "Extra Peanut Sauce", price: 0.5 },
        { id: "more-satay", label: "Add 6 More Sticks", price: 4.5 },
      ],
    },
    {
      id: slugify("Assam Laksa"),
      name: "Assam Laksa",
      basePrice: 8.0,
      img: "images/Asaam Laks.png",
      desc: "Tangy, spicy, fish-based broth with noodles and fresh toppings.",
      addons: [
        { id: "more-noodles", label: "More Noodles", price: 0.8 },
        { id: "extra-fish", label: "Extra Fish", price: 2.0 },
      ],
    },
    {
      id: slugify("Roti Canai"),
      name: "Roti Canai",
      basePrice: 5.0,
      img: "images/Roti canai.png",
      desc: "Crispy, flaky roti served with fragrant curry.",
      addons: [
        { id: "add-curry", label: "Extra Curry", price: 0.6 },
        { id: "add-egg", label: "Add Egg", price: 1.0 },
      ],
    },
    {
      id: slugify("Chendul"),
      name: "Chendul",
      basePrice: 4.0,
      img: "images/Chendul.png",
      desc: "Classic icy dessert with gula melaka, coconut milk, and green jelly.",
      addons: [
        { id: "more-gula", label: "More Gula Melaka", price: 0.4 },
        { id: "more-coconut", label: "More Coconut Milk", price: 0.4 },
      ],
    },
  ],
};

/* ===== READ URL PARAMS ===== */
const params = new URLSearchParams(window.location.search);
const stallId = params.get("stall");
const itemId = params.get("item");

if (!stallId || !itemId || !menuByStall[stallId]) {
  window.location.href = "menu.html";
}

const item = (menuByStall[stallId] || []).find((x) => x.id === itemId);
if (!item) window.location.href = `menu.html?id=${encodeURIComponent(stallId)}`;

/* ===== DOM ===== */
const closeBtn = document.getElementById("closeBtn");
const itemImg = document.getElementById("itemImg");
const itemName = document.getElementById("itemName");
const itemBasePrice = document.getElementById("itemBasePrice");
const itemDesc = document.getElementById("itemDesc");
const addonsList = document.getElementById("addonsList");
const sideNote = document.getElementById("sideNote");
const qtyMinus = document.getElementById("qtyMinus");
const qtyPlus = document.getElementById("qtyPlus");
const qtyVal = document.getElementById("qtyVal");
const addToCartBtn = document.getElementById("addToCartBtn");

/* ===== STATE ===== */
let qty = 1;
const selectedAddons = new Set();

/* ===== INIT UI ===== */
itemImg.src = item.img;
itemImg.alt = item.name;
itemName.textContent = item.name;
itemBasePrice.textContent = money(item.basePrice);
itemDesc.textContent = item.desc || "";

/* Build addons */
addonsList.innerHTML = "";
(item.addons || []).forEach((a) => {
  const row = document.createElement("label");
  row.classList.add("addonRow");

  const cb = document.createElement("input");
  cb.type = "checkbox";

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
    if (selectedAddons.has(a.id)) sum += a.price;
  });
  return sum;
}

function updateTotal() {
  const perItem = item.basePrice + addonsTotal();
  const total = perItem * qty;
  addToCartBtn.textContent = `Add to Cart (${money(total)})`;
}

updateTotal();

/* ===== EVENTS ===== */
closeBtn.addEventListener("click", () => {
  window.location.href = `menbu.html?id=${encodeURIComponent(stallId)}`;
});

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

addToCartBtn.addEventListener("click", () => {
  const perItem = item.basePrice + addonsTotal();
  const total = perItem * qty;

  const cartItem = {
    stallId,
    itemId: item.id,
    name: item.name,
    img: item.img,
    qty,
    note: sideNote.value.trim(),
    addons: Array.from(selectedAddons),
    unitPrice: perItem,
    totalPrice: total,
  };

  // Store into localStorage cart
  const cart = JSON.parse(localStorage.getItem("hp_cart") || "[]");
  cart.push(cartItem);
  localStorage.setItem("hp_cart", JSON.stringify(cart));

// go back to that stall’s menu page
window.location.href = `menu.html?id=${encodeURIComponent(stallId)}`;

});
