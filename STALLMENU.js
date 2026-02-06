/*************************************************
 *
 *   1) menu.html?centreId=...&stallId=...
 *   2) legacy menu.html?id=publicStallId (e.g. kopi-fellas)
 *      -> resolves using collectionGroup('stalls') where publicStallId == id
 * - Loads stall doc + menu subcollection from Firestore
 * - Renders in your existing card layout
 *************************************************/

import { getCartForUI } from "./cart.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  collectionGroup,
  setDoc,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =========================
   Firebase init (same as your menu.js)
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
   DOM
========================= */
const listEl = document.getElementById("menuList");
const searchEl = document.getElementById("menuQ");
const titleEl = document.getElementById("menuTitle");
const iconEl = document.getElementById("stallIcon");
const gradeEl = document.getElementById("gradePill");

/* =========================
   Helpers
========================= */
function slugify(str) {
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function money(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : "—";
}

function setTopUI({ stallName, imageUrl, hygieneGrade }) {
  if (titleEl) titleEl.textContent = `Menu — ${stallName || "Selected stall"}`;
  if (iconEl) iconEl.src = imageUrl || "images/menu/placeholder.png";
  if (gradeEl) gradeEl.textContent = `✓ Hygiene Grade: ${hygieneGrade || "—"}`;
}

/* =========================
   Cart badge (reuse your existing cart.js logic)
========================= */
async function updateCartDisplay() {
  try {
    const cart = await getCartForUI();

    let count = 0;
    let total = 0;

    for (const it of cart) {
      const qty = Number(it.qty ?? it.quantity ?? 1);
      count += Number.isFinite(qty) ? qty : 1;

      const line = Number(it.totalPrice);
      total += Number.isFinite(line) ? line : 0;
    }

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

    const totalEl = document.getElementById("cartTotal");
    if (totalEl) totalEl.textContent = total.toFixed(2);
  } catch (err) {
    console.warn("Cart badge update failed:", err);
  }
}

document.addEventListener("DOMContentLoaded", updateCartDisplay);
window.addEventListener("pageshow", updateCartDisplay);

/* =========================
   Resolve stall from URL
========================= */
const params = new URLSearchParams(window.location.search);
const centreId = params.get("centreId");
const stallId = params.get("stallId");

let CAN_LOAD = true;

if (!centreId || !stallId) {
  CAN_LOAD = false;
  if (listEl) {
    listEl.innerHTML = `<div class="emptyState">
      <h2 class="emptyTitle">Missing centreId or stallId in URL</h2>
      <p class="emptySub">Open like this: <b>menu.html?centreId=...&stallId=...</b></p>
    </div>`;
  }
} else {
  // only run when params exist
  searchEl?.addEventListener("input", (e) => renderMenu(e.target.value));

  loadStallAndMenu().catch((e) => {
    console.error(e);
    if (listEl) {
      listEl.innerHTML = `<div class="emptyState">
        <h2 class="emptyTitle">Failed to load menu</h2>
        <p class="emptySub">${e?.message || e}</p>
      </div>`;
    }
  });
}

/* =========================
   Load stall + menu
========================= */
let ALL_ITEMS = []; // normalized menu items for rendering/search

function renderMenu(filter) {
  if (!listEl) return;
  const q = String(filter || "")
    .toLowerCase()
    .trim();

  const filtered = ALL_ITEMS.filter((i) => i.name.toLowerCase().includes(q));

  // group by category
  const groups = new Map();
  for (const item of filtered) {
    const key = item.category || "Uncategorised";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  listEl.innerHTML = "";

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="emptyState">
      <h2 class="emptyTitle">No items found</h2>
    </div>`;
    return;
  }

  for (const [cat, items] of groups.entries()) {
    const catTitle = document.createElement("div");
    catTitle.className = "menuSectionTitle";
    catTitle.textContent = cat;
    listEl.appendChild(catTitle);

    for (const item of items) {
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

      // show "from" if priceFrom exists, else normal price
      if (item.priceFrom != null && item.priceFrom !== "") {
        price.textContent = `from $${money(item.priceFrom)}`;
      } else if (item.price != null && item.price !== "") {
        price.textContent = `$${money(item.price)}`;
      } else {
        price.textContent = `—`;
      }

      const likesRow = document.createElement("div");
      likesRow.classList.add("menuLikes");

      const likeKey = `hp_like_${stallId}_${item.id}`;
      let liked = localStorage.getItem(likeKey) === "1";

      const heartBtn = document.createElement("button");
      heartBtn.type = "button";
      heartBtn.classList.add("likeBtn");
      heartBtn.setAttribute("aria-label", liked ? "Unlike" : "Like");

      const heartImg = document.createElement("img");
      heartImg.className = "likeIcon";
      heartImg.src = liked ? "images/heart.png" : "images/like.png";
      heartImg.alt = liked ? "Unlike" : "Like";

      heartBtn.appendChild(heartImg);

      const likeCount = document.createElement("span");
      likeCount.classList.add("likeCount");
      likeCount.textContent = String(item.likes + (liked ? 1 : 0));

      if (liked) heartBtn.classList.add("active");

      heartBtn.addEventListener("click", async () => {
        // state BEFORE toggle
        const wasLiked = heartBtn.classList.contains("active");

        // ---------- Firestore save (menu items) ----------
        try {
          const auth = getAuth();
          const user = auth.currentUser;
          if (user) {
            const itemKey = `${stallId}::${item.id}`; // ✅ use item.id (exists)

            await setDoc(
              doc(db, "users", user.uid),
              {
                favouriteItems: wasLiked
                  ? arrayRemove(itemKey)
                  : arrayUnion(itemKey),
                updatedAt: serverTimestamp(),
              },
              { merge: true },
            );
          }
        } catch (err) {
          console.error("Save favourite item failed:", err);
        }

        // ---------- Existing UI + localStorage ----------
        liked = !liked;

        if (liked) {
          localStorage.setItem(likeKey, "1");
          heartBtn.classList.add("active");
          heartBtn.setAttribute("aria-label", "Unlike");
          heartImg.src = "images/heart.png";
          heartImg.alt = "Unlike";
          likeCount.textContent = String(Number(likeCount.textContent) + 1);
        } else {
          localStorage.removeItem(likeKey);
          heartBtn.classList.remove("active");
          heartBtn.setAttribute("aria-label", "Like");
          heartImg.src = "images/like.png";
          heartImg.alt = "Like";
          likeCount.textContent = String(
            Math.max(0, Number(likeCount.textContent) - 1),
          );
        }
      });

      likesRow.appendChild(heartBtn);
      likesRow.appendChild(likeCount);

      info.appendChild(name);
      info.appendChild(price);
      info.appendChild(likesRow);

      // right add button (go item.html)
      const addBtn = document.createElement("button");
      addBtn.classList.add("menuAddBtn");
      addBtn.type = "button";
      addBtn.textContent = "+";

      addBtn.addEventListener("click", () => {
        // Pass BOTH new + old param names so you don't break item.html
        const url =
          `item.html?centreId=${encodeURIComponent(centreId)}` +
          `&stallId=${encodeURIComponent(stallId)}` +
          `&itemId=${encodeURIComponent(item.id)}` +
          `&centre=${encodeURIComponent(centreId)}` +
          `&stallDoc=${encodeURIComponent(stallId)}` +
          `&item=${encodeURIComponent(item.id)}`;
        window.location.href = url;
      });

      card.appendChild(imgWrap);
      card.appendChild(info);
      card.appendChild(addBtn);

      listEl.appendChild(card);
    }
  }
}

async function loadStallAndMenu() {
  // 1) Load stall doc
  const stallRef = doc(db, "centres", centreId, "stalls", stallId);
  const stallSnap = await getDoc(stallRef);

  if (!stallSnap.exists()) {
    listEl.innerHTML = `<div class="emptyState">
      <h2 class="emptyTitle">Stall not found</h2>
      <p class="emptySub">centres/${centreId}/stalls/${stallId}</p>
    </div>`;
    return;
  }

  const stall = stallSnap.data();
  setTopUI({
    stallName: stall.stallName,
    imageUrl: stall.imageUrl,
    hygieneGrade: stall.hygieneGrade,
  });

  // 2) Load menu subcollection (no query/index needed)
  const menuRef = collection(
    db,
    "centres",
    centreId,
    "stalls",
    stallId,
    "menu",
  );
  const snap = await getDocs(menuRef);
  ALL_ITEMS = snap.docs
    .map((d) => {
      const it = d.data() || {};

      // --- PRICE NORMALIZATION ---
      // Case 1: normal stalls: price / priceFrom
      const directPrice = it.price ?? null;
      const directPriceFrom = it.priceFrom ?? null;

      // Case 2: beverage stalls: prices map (cold_s, cold_m, hot_s, etc.)
      const pricesMap =
        it.prices && typeof it.prices === "object" ? it.prices : null;

      // compute min price from prices map (for menu list "from $X.XX")
      let minVariantPrice = null;
      if (pricesMap) {
        const vals = Object.values(pricesMap)
          .map(Number)
          .filter((n) => Number.isFinite(n));
        if (vals.length) minVariantPrice = Math.min(...vals);
      }

      return {
        id: d.id,
        name: it.name || d.id,
        category: it.category || "Uncategorised",

        // if priceFrom/price exist use them, else use min from variants
        price: directPrice,
        priceFrom: directPriceFrom ?? minVariantPrice,

        // for item.html later (keep the variants available)
        prices: pricesMap,

        // --- IMAGE NORMALIZATION ---
        // prefer full Firebase Storage URL if present
        img: it.imageUrl || it.img || "images/menu/placeholder.png",

        likes: Number(it.likes ?? 0),
        active: it.active ?? true,
      };
    })
    .filter((it) => it.active !== false);

  renderMenu("");
}
