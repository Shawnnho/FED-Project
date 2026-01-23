
const menuBtn = document.getElementById("menuBtn");
const navMobile = document.getElementById("navMobile");
const navBackdrop = document.getElementById("navBackdrop");

function toggleMenu(open) {
  document.body.classList.toggle("menuOpen", open);
  navMobile.classList.toggle("open", open);
  navBackdrop.classList.toggle("open", open);
}

menuBtn?.addEventListener("click", () =>
  toggleMenu(!navMobile.classList.contains("open"))
);
navBackdrop?.addEventListener("click", () => toggleMenu(false));

// =========================
// Stall + menu data
// =========================
const stalls = [
  {
    id: "ahmad-nasi-lemak",
    name: "Ahmad Nasi Lemak",
    grade: "B",
    icon: "images/stalls/nasilemak.jpg",
  },
  {
    id: "tiong-bahru",
    name: "Tiong Bahru Chicken Rice",
    grade: "A",
    icon: "images/chickenrice-hero.jpg",
  },
];

const menuByStall = {
  "ahmad-nasi-lemak": [
    { name: "Nasi Lemak", price: 7.0, likes: 277, img: "images/stalls/nasilemak.jpg" },
    { name: "Fried Noodles", price: 6.7, likes: 67, img: "images/fried noodles.png" },
    { name: "Satay (1 Dozen)", price: 10.5, likes: 300, img: "images/Satay 1D.png" },
    { name: "Assam Laksa", price: 8.0, likes: 50, img: "images/Asaam Laks.png" },
    { name: "Roti Canai", price: 5.0, likes: 99, img: "images/Roti canai.png" },
    { name: "Chendul", price: 4.0, likes: 32, img: "images/Chendul.png" },
  ],


  "tiong-bahru": [
    { name: "Chicken Rice (Steamed)", price: 5.0, likes: 210, img: "images/chickenrice-hero.jpg" },
    { name: "Chicken Rice (Roasted)", price: 5.5, likes: 188, img: "images/chickenrice-hero.jpg" },
  ],
};

// =========================
// Get stall id from URL
// =========================
const params = new URLSearchParams(window.location.search);
const stallId = params.get("id") || "ahmad-nasi-lemak";

const stall = stalls.find((s) => s.id === stallId);
const items = menuByStall[stallId] || [];

// =========================
// Fill top UI
// =========================
document.getElementById("menuTitle").textContent = `Menu — ${stall.name}`;
document.getElementById("stallIcon").src = stall.icon;
document.getElementById("gradePill").textContent = `✓ Hygiene Grade: ${stall.grade}`;

// =========================
// Cart state
// =========================
let cartCount = 0;
let cartTotal = 0;

const cartCountEl = document.getElementById("cartCount");
const cartTotalEl = document.getElementById("cartTotal");

function updateCart() {
  cartCountEl.textContent = cartCount;
  cartTotalEl.textContent = cartTotal.toFixed(2);
}

// =========================
// Render menu
// =========================
const listEl = document.getElementById("menuList");
const searchEl = document.getElementById("menuQ");

function renderMenu(filter = "") {
  listEl.innerHTML = "";
  const q = filter.toLowerCase();

  const filtered = items.filter((i) => i.name.toLowerCase().includes(q));

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="emptyState">
        <h2 class="emptyTitle">No items found</h2>
      </div>
    `;
    return;
  }

  filtered.forEach((item) => {
    const card = document.createElement("article");
    card.className = "menuCard";

    card.innerHTML = `
      <div class="menuImgWrap">
        <img src="${item.img}" alt="${item.name}">
      </div>

      <div class="menuInfo">
        <h3 class="menuName">${item.name}</h3>
        <p class="menuPrice">$${item.price.toFixed(2)}+</p>
        <div class="menuLikes">
          <span class="heart">♥</span>
          <span>${item.likes}</span>
        </div>
      </div>

      <button class="menuAddBtn">+</button>
    `;

    card.querySelector(".menuAddBtn").addEventListener("click", () => {
      cartCount++;
      cartTotal += item.price;
      updateCart();
    });

    listEl.appendChild(card);
  });
}

renderMenu();
searchEl.addEventListener("input", (e) => renderMenu(e.target.value));
updateCart();
