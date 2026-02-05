/*************************************************
 * stall.js (module)
 * - Loads stall UI from local array
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
  getDocs,
  setDoc,
  arrayUnion,
  arrayRemove,
  onSnapshot,
  collection,
  query,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* Firebase Config */
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
const centreId = params.get("centreId");
const stallId = params.get("stallId");

if (!centreId || !stallId) {
  window.location.href = "home.html";
}

const stallRef = doc(db, "centres", centreId, "stalls", stallId);

let stall = null;

async function loadStall() {
  const snap = await getDoc(stallRef);

  if (!snap.exists()) {
    window.location.href = "home.html";
    return;
  }

  const d = snap.data();

  const dayKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][
    new Date().getDay()
  ];

  let openTime = "";
  let closeTime = "";

  if (d.operatingHours && typeof d.operatingHours === "object") {
    openTime = d.operatingHours?.[dayKey]?.open || "";
    closeTime = d.operatingHours?.[dayKey]?.close || "";
  } else {
    // fallback to old fields if any
    openTime = d.openTime ?? "";
    closeTime = d.closeTime ?? "";
  }

  stall = {
    id: stallId,
    centreId,
    reviewStallId: d.reviewStallId || stallId,
    name: d.stallName ?? d.name ?? stallId,
    cuisine: d.cuisine ?? "",
    grade: d.hygieneGrade ?? d.grade ?? "—",
    desc: d.desc ?? "",
    img: d.imageUrl ?? d.img ?? "images/default-stall.png",
    openTime,
    closeTime,
    unit: d.unitNo ?? "",
    location: d.location ?? "",
  };

  fillUI();
  refreshRatingsFromReviews().catch(console.error);
}

async function refreshRatingsFromReviews() {
  const reviewsRef = collection(db, "stalls", stall.reviewStallId, "reviews");
  const qs = query(reviewsRef, orderBy("createdAt", "desc"), limit(200));
  const snap = await getDocs(qs);

  let total = 0;
  let count = 0;

  snap.forEach((d) => {
    const r = d.data() || {};
    const stars = Number(r.rating ?? r.stars ?? 0); // supports rating or stars
    if (stars > 0) {
      total += stars;
      count += 1;
    }
  });

  const avg = count ? total / count : 0;

  if (avgText) avgText.textContent = avg.toFixed(1);
  if (countText) countText.textContent = `(${count})`;

  const pct = Math.max(0, Math.min(100, (avg / 5) * 100));
  if (starFill) starFill.style.width = pct + "%";
}

// HELPER

function to12h(hhmm) {
  if (!hhmm || !hhmm.includes(":")) return "";

  const [h, m] = hhmm.split(":").map(Number);
  const isPM = h >= 12;
  const hour12 = ((h + 11) % 12) + 1;

  return `${hour12}:${String(m).padStart(2, "0")}${isPM ? " PM" : " AM"}`;
}

function buildHours12(open, close) {
  if (!open || !close) return "—";
  return `${to12h(open)} – ${to12h(close)}`;
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
    stall.grade === "A"
      ? "gradeA"
      : stall.grade === "B"
        ? "gradeB"
        : stall.grade === "C"
          ? "gradeC"
          : "gradeD",
  );

  descEl.textContent = stall.desc;

  metaEl.textContent = `Open: ${buildHours12(stall.openTime, stall.closeTime)} • Unit ${stall.unit}`;

  if (locationEl) {
    locationEl.textContent = `📍 ${stall.location}`;
  }

  if (menuLink)
    menuLink.href = `menu.html?centreId=${centreId}&stallId=${stallId}`;
  if (callBtn) callBtn.href = "tel:+6590000000";
  if (dirBtn) {
    dirBtn.href =
      "https://www.google.com/maps?q=" +
      encodeURIComponent(stall.location || stall.name);
  }
  if (seeReviewLink) {
    seeReviewLink.href = `feedback.html?id=${encodeURIComponent(stall.reviewStallId)}`;
  }
}

// =========================
// Favourite (Firestore)
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
