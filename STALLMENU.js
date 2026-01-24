/*************************************************
 * stallmenu.js
 * - Loads menu for stall via menu.html?id=...
 * - Renders menu list in your screenshot style
 * - Clicking "+" navigates to item.html
 *************************************************/

const menuBtn = document.getElementById("menuBtn");
const navMobile = document.getElementById("navMobile");
const navBackdrop = document.getElementById("navBackdrop");

function toggleMenu(open) {
  document.body.classList.toggle("menuOpen", open);
  navMobile?.classList.toggle("open", open);
  navBackdrop?.classList.toggle("open", open);
}

menuBtn?.addEventListener("click", () =>
  toggleMenu(!navMobile?.classList.contains("open")),
);
navBackdrop?.addEventListener("click", () => toggleMenu(false));

function slugify(str) {
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

/* ===== STALL INFO (logos) ===== */
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
  {
    id: "asia-wok",
    name: "Asia Wok",
    grade: "A",
    icon: "images/asiawok-hero.jpg",
  },
  {
    id: "al-azhar",
    name: "Al-Azhar Restaurant",
    grade: "C",
    icon: "images/al-azhar-hero.jpg",
  },
  {
    id: "fat-buddies",
    name: "Fat Buddies Western Food",
    grade: "B",
    icon: "images/stalls/Fatbuddies.png",
  },
  {
    id: "kopi-fellas",
    name: "Kopi Fellas",
    grade: "A",
    icon: "images/stalls/kopifellas.jpg",
  },
];

/* ===== MENU ITEMS (you can expand later) ===== */
const menuByStall = {
  "ahmad-nasi-lemak": [
    {
      name: "Nasi Lemak",
      price: 7.0,
      likes: 277,
      img: "images/stalls/nasilemak.jpg",
    },
    {
      name: "Fried Noodles",
      price: 6.7,
      likes: 67,
      img: "images/fried noodles.png",
    },
    {
      name: "Satay (1 Dozen)",
      price: 10.5,
      likes: 300,
      img: "images/Satay 1D.png",
    },
    {
      name: "Assam Laksa",
      price: 8.0,
      likes: 50,
      img: "images/Asaam Laks.png",
    },
    { name: "Roti Canai", price: 5.0, likes: 99, img: "images/Roti canai.png" },
    { name: "Chendul", price: 4.0, likes: 32, img: "images/Chendul.png" },
  ],

  "asia-wok": [
    {
      name: "Mee Goreng",
      price: 6.0,
      likes: 141,
      img: "images/mee goreng.png",
    },
    {
      name: "Fried Beef Dry Hor Fun",
      price: 8.0,
      likes: 200,
      img: "images/dry hor.png",
    },
    {
      name: "Cereal Sliced Fish Rice",
      price: 8.5,
      likes: 96,
      img: "images/sliced fish.png",
    },
    {
      name: "Seafood White Bee Hoon",
      price: 9.0,
      likes: 153,
      img: "images/whitebeehoon.png",
    },
    {
      name: "Hong Kong Noodle",
      price: 7.0,
      likes: 85,
      img: "images/hk noodle.png",
    },
    {
      name: "Black Pepper Chicken Cube Rice",
      price: 6.7,
      likes: 67,
      img: "images/BP.png",
    },
  ],

  "tiong-bahru": [
    {
      name: "Chicken Rice",
      price: 5.0,
      likes: 420,
      img: "images/stalls/chickenrice.png",
    },
    {
      name: "Chicken Cutlet Rice",
      price: 5.5,
      likes: 198,
      img: "images/ChicCut.png",
    },
    { name: "Fried Rice", price: 5.5, likes: 67, img: "images/friedrice.png" },
    {
      name: "Shredded Chicken Porridge",
      price: 6.0,
      likes: 34,
      img: "images/ShredChicPorr.png",
    },
    {
      name: "Shredded Chicken Kway Teow",
      price: 6.0,
      likes: 55,
      img: "images/ShredChicKway.png",
    },
    {
      name: "Chicken Wings",
      price: 4.0,
      likes: 85,
      img: "images/ChicWing.png",
    },
  ],

  "al-azhar": [
    {
      name: "Butter Chicken",
      price: 13.0,
      likes: 823,
      img: "images/ButtChic.png",
    },
    {
      name: "Mutton Biryani",
      price: 13.0,
      likes: 219,
      img: "images/MuttBir.png",
    },
    {
      name: "Chicken Biryani",
      price: 11.5,
      likes: 200,
      img: "images/ChicBir.png",
    },
    {
      name: "Beef Biryani",
      price: 12.0,
      likes: 238,
      img: "images/BeefBir.png",
    },
    {
      name: "Nasi Sambal Goreng Chicken",
      price: 10.0,
      likes: 104,
      img: "images/NasiSam.png",
    },
    {
      name: "Tandoori Chicken",
      price: 9.0,
      likes: 190,
      img: "images/Tandoori.png",
    },
  ],

  "fat-buddies": [
    {
      name: "Chicken Bolognese",
      price: 8.0,
      likes: 230,
      img: "images/ChicBolog.png",
    },
    { name: "Fish and Chips", price: 10.0, likes: 512, img: "images/F&C.png" },
    { name: "Carbonara", price: 8.5, likes: 67, img: "images/CarbP.png" },
    { name: "Beef Burger", price: 9.0, likes: 89, img: "images/BeefBurg.png" },
    {
      name: "Chicken Burger",
      price: 8.0,
      likes: 42,
      img: "images/ChicBurg.png",
    },
    { name: "Curly Fries", price: 4.0, likes: 103, img: "images/CurlyFri.png" },
  ],

  "kopi-fellas": [
    { name: "Kopi O", price: 2.0, likes: 210, img: "images/kopi-o.png" },
    { name: "Kopi C", price: 2.3, likes: 199, img: "images/kopi-c.png" },
    { name: "Teh Peng", price: 2.5, likes: 160, img: "images/teh-peng.png" },
    { name: "Yuan Yang", price: 2.8, likes: 144, img: "images/yuan-yang.png" },
    { name: "Ice Milo", price: 3.0, likes: 290, img: "images/ice-milo.png" },
    {
      name: "Honey Lemon",
      price: 3.1,
      likes: 232,
      img: "images/honey-lemon.png",
    },
  ],
};

/* ===== READ URL (?id=stallId) ===== */
const params = new URLSearchParams(window.location.search);
const stallId = params.get("id") || "ahmad-nasi-lemak";

const stall = stalls.find((s) => s.id === stallId) || stalls[0];
const items = menuByStall[stall.id] || [];

/* ===== FILL TOP UI ===== */
document.getElementById("menuTitle").textContent = `Menu — ${stall.name}`;
document.getElementById("stallIcon").src = stall.icon;
document.getElementById("gradePill").textContent =
  `✓ Hygiene Grade: ${stall.grade}`;

/* ===== CART (badge display — safe even if footer removed) ===== */
/* ===== CART (badge display) ===== */
const CART_KEY = "hp_cart";

function readCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
  } catch {
    return [];
  }
}

function updateCartDisplay() {
  const cart = readCart();

  let count = 0;
  let total = 0;

  for (const it of cart) {
    const qty = Number(it.qty ?? it.quantity ?? 1);
    count += Number.isFinite(qty) ? qty : 1;

    const line = Number(it.totalPrice);
    total += Number.isFinite(line) ? line : 0;
  }

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

  // OPTIONAL (won’t crash if footer/cart total removed)
  const totalEl = document.getElementById("cartTotal");
  if (totalEl) totalEl.textContent = total.toFixed(2);
}

updateCartDisplay();
window.addEventListener("pageshow", updateCartDisplay);
window.addEventListener("storage", (e) => {
  if (e.key === CART_KEY) updateCartDisplay();
});

/* ===== RENDER MENU ===== */
const listEl = document.getElementById("menuList");
const searchEl = document.getElementById("menuQ");

function setCartBadge(count) {
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

function renderMenu(filter = "") {
  listEl.innerHTML = "";
  const q = filter.toLowerCase();

  const filtered = items.filter((i) => i.name.toLowerCase().includes(q));

  filtered.forEach((item) => {
    const card = document.createElement("article");
    card.classList.add("menuCard");

    // left image
    const imgWrap = document.createElement("div");
    imgWrap.classList.add("menuImgWrap");
    const img = document.createElement("img");
    img.src = item.img;
    img.alt = item.name;
    imgWrap.appendChild(img);

    // middle info
    const info = document.createElement("div");
    info.classList.add("menuInfo");

    const name = document.createElement("div");
    name.classList.add("menuName");
    name.textContent = item.name;

    const price = document.createElement("div");
    price.classList.add("menuPrice");
    price.textContent = `$${item.price.toFixed(2)}+`;

    const likesRow = document.createElement("div");
    likesRow.classList.add("menuLikes");

    // unique key per stall + item
    const likeKey = `hp_like_${stall.id}_${slugify(item.name)}`;

    // load liked state
    let liked = localStorage.getItem(likeKey) === "1";

    // build heart button
    const heartBtn = document.createElement("button");
    heartBtn.type = "button";
    heartBtn.classList.add("likeBtn");
    heartBtn.setAttribute("aria-label", liked ? "Unlike" : "Like");
    heartBtn.textContent = "♥";

    // count
    const likeCount = document.createElement("span");
    likeCount.classList.add("likeCount");

    // if liked before, display +1
    const shownLikes = item.likes + (liked ? 1 : 0);
    likeCount.textContent = shownLikes;

    // set UI state
    if (liked) heartBtn.classList.add("active");

    // click toggle
    heartBtn.addEventListener("click", () => {
      liked = !liked;

      if (liked) {
        localStorage.setItem(likeKey, "1");
        heartBtn.classList.add("active");
        heartBtn.setAttribute("aria-label", "Unlike");
        likeCount.textContent = Number(likeCount.textContent) + 1;
      } else {
        localStorage.removeItem(likeKey);
        heartBtn.classList.remove("active");
        heartBtn.setAttribute("aria-label", "Like");
        likeCount.textContent = Math.max(0, Number(likeCount.textContent) - 1);
      }
    });

    likesRow.appendChild(heartBtn);
    likesRow.appendChild(likeCount);

    info.appendChild(name);
    info.appendChild(price);
    info.appendChild(likesRow);

    // right add button
    const addBtn = document.createElement("button");
    addBtn.classList.add("menuAddBtn");
    addBtn.type = "button";
    addBtn.textContent = "+";

    addBtn.addEventListener("click", () => {
      const itemKey = slugify(item.name);
      window.location.href = `item.html?stall=${encodeURIComponent(stall.id)}&item=${encodeURIComponent(itemKey)}`;
    });

    card.appendChild(imgWrap);
    card.appendChild(info);
    card.appendChild(addBtn);

    listEl.appendChild(card);
  });

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.classList.add("emptyState");
    empty.innerHTML = `<h2 class="emptyTitle">No items found</h2>`;
    listEl.appendChild(empty);
  }
}

renderMenu();
searchEl.addEventListener("input", (e) => renderMenu(e.target.value));
