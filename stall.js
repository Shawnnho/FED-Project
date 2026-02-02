/*************************************************
 * stall.js (module)
 * - Loads stall UI from local array
 * - ✅ Add/Remove Favourite (Firestore users/{uid}.favourites)
 *************************************************/

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  arrayUnion,
  arrayRemove,
  onSnapshot,
  collection,
  query,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ✅ SAME config as your other pages */
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

// =========================
// Load stall from Firestore
// =========================
const params = new URLSearchParams(window.location.search);
const id = params.get("id");

if (!id) window.location.href = "home.html";

const stallRef = doc(db, "stalls", id);

let stall = null;

async function loadStall() {
  const snap = await getDoc(stallRef);

  if (!snap.exists()) {
    window.location.href = "home.html";
    return;
  }

  const d = snap.data();

  stall = {
    id,
    name: d.stallName ?? d.name ?? id,
    cuisine: d.cuisine ?? "",
    grade: d.hygieneGrade ?? d.grade ?? "—",
    desc: d.desc ?? "",
    img: d.imageUrl ?? d.img ?? "images/default-stall.png",
    openTime: d.openTime ?? "",
    closeTime: d.closeTime ?? "",
    unit: d.unitNo ?? "",
    location: d.location ?? "",
  };

  fillUI();
}

// =========================
// DOM
// =========================
const heroEl = document.getElementById("stallHero");
const nameEl = document.getElementById("stallName");
const cuisineEl = document.getElementById("stallCuisine");
const gradeEl = document.getElementById("stallGrade");
const descEl = document.getElementById("stallDesc");
const metaEl = document.getElementById("stallMeta");

const locationEl = document.getElementById("stallLocation");

const menuLink = document.getElementById("menuLink");
const callBtn = document.getElementById("callBtn");
const dirBtn = document.getElementById("dirBtn");

const favBtn = document.getElementById("favBtn");

const avgText = document.getElementById("avgText");
const countText = document.getElementById("countText");
const starFill = document.getElementById("starFill");

const seeReviewLink = document.getElementById("seeReviewLink");

function fillUI() {
  heroEl.src = stall.img;
  heroEl.alt = `${stall.name} hero image`;

  nameEl.textContent = stall.name;
  cuisineEl.textContent = stall.cuisine;

  gradeEl.textContent = stall.grade;
  gradeEl.classList.remove("gradeA", "gradeB", "gradeC", "gradeD");
  gradeEl.classList.add(
    stall.grade === "A" ? "gradeA" : 
    stall.grade === "B" ? "gradeB" : 
    stall.grade === "C" ? "gradeC" : "gradeD",
  );

  descEl.textContent = stall.desc;

  metaEl.textContent = `Open: ${stall.openTime} - ${stall.closeTime} • Unit ${stall.unit}`;

  if (locationEl) {
    locationEl.textContent = `📍 ${stall.location}`;
  }

  if (menuLink) menuLink.href = `menu.html?id=${stall.id}`;
  if (callBtn) callBtn.href = "tel:+6590000000";
  if (dirBtn) {
    dirBtn.href =
      "https://www.google.com/maps?q=" +
      encodeURIComponent(stall.location || stall.name);
  }
}

onSnapshot(stallRef, (snap) => {
  const d = snap.exists() ? snap.data() : {};
  const total = Number(d.ratingTotal || 0);
  const count = Number(d.ratingCount || 0);
  const avg = count ? total / count : 0;

  if (avgText) avgText.textContent = avg.toFixed(1);
  if (countText) countText.textContent = `(${count})`;

  const pct = Math.max(0, Math.min(100, (avg / 5) * 100));
  if (starFill) starFill.style.width = pct + "%";
});

// =========================
// ✅ Favourite (Firestore)
// =========================
function setFavUI(isFav) {
  if (!favBtn) return;
  favBtn.classList.toggle("active", isFav);
  favBtn.setAttribute("aria-pressed", String(isFav));
  favBtn.setAttribute(
    "aria-label",
    isFav ? "Remove favourite" : "Add to favourite",
  );
}

onAuthStateChanged(auth, async (user) => {
  await loadStall();

  if (!favBtn) return;

  // If not logged in, block favourites
  if (!user) {
    setFavUI(false);
    favBtn.addEventListener("click", () => {
      alert("Please login to use favourites.");
      window.location.href = "signin.html";
    });
    return;
  }

  const userRef = doc(db, "users", user.uid);

  // Load favourites
  let isFav = false;
  try {
    const snap = await getDoc(userRef);
    const data = snap.exists() ? snap.data() : {};
    const favs = Array.isArray(data.favourites) ? data.favourites : [];
    isFav = favs.includes(stall.id);
    setFavUI(isFav);
  } catch (e) {
    console.error("Failed to load favourites:", e);
    setFavUI(false);
  }

  // Toggle favourite
  favBtn.addEventListener("click", async () => {
    try {
      isFav = !isFav;
      setFavUI(isFav);

      await setDoc(
        userRef,
        {
          favourites: isFav ? arrayUnion(stall.id) : arrayRemove(stall.id),
        },
        { merge: true },
      );
    } catch (e) {
      console.error("Failed to update favourite:", e);

      // rollback
      isFav = !isFav;
      setFavUI(isFav);

      alert("Failed to update favourite. Try again.");
    }
  });
});
