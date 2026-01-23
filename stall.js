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
// Local stall data
// =========================
const stalls = [
  {
    id: "tiong-bahru",
    name: "Tiong Bahru Chicken Rice",
    cuisine: "Chinese",
    grade: "A",
    prepMin: 2,
    prepMax: 5,
    popular: true,
    location: "Tiong Bahru",
    openTime: "7:00 AM",
    closeTime: "9:00 PM",
    unit: "#01-10",
    desc: "Tender poached chicken served with fragrant rice, accompanied by chilli and ginger sauces.",
    img: "images/chickenrice-hero.jpg",
  },
  {
    id: "asia-wok",
    name: "Asia Wok",
    cuisine: "Chinese",
    grade: "A",
    prepMin: 5,
    prepMax: 10,
    popular: false,
    openTime: "12:00 PM",
    closeTime: "8:00 PM",
    unit: "#01-15",
    location: "Ayer Rajah Creasent",
    desc: "Tze Char is affordable Singapore Chinese home-style cooking with a wide variety of dishes meant for sharing.",
    img: "images/asiawok-hero.jpg",
  },
  {
    id: "ahmad-nasi-lemak",
    name: "Ahmad Nasi Lemak",
    cuisine: "Malay",
    grade: "B",
    prepMin: 2,
    prepMax: 5,
    popular: false,
    openTime: "6:00 AM",
    closeTime: "3:00 PM",
    unit: "#01-13",
    location: "Maxwell Food Centre",
    desc: "Fragrant coconut rice served with spicy sambal, crispy anchovies, peanuts, egg, and cucumber.",
    img: "images/stalls/nasilemak.jpg",
  },
  {
    id: "al-azhar",
    name: "Al-Azhar Restaurant",
    cuisine: "Indian",
    grade: "C",
    prepMin: 5,
    prepMax: 10,
    popular: false,
    openTime: "7:00 AM",
    closeTime: "3:00 AM",
    unit: "#01-01",
    location: "Bukit Timah Road",
    desc: "Bold, aromatic dishes made with rich spices, featuring curries, breads, rice, and savoury sides.",
    img: "images/al-azhar-hero.jpg",
  },
  {
    id: "fat-buddies",
    name: "Fat Buddies Western Food",
    cuisine: "Western",
    grade: "B",
    prepMin: 5,
    prepMax: 10,
    popular: false,
    openTime: "11:00 AM",
    closeTime: "9:00 PM",
    unit: "#01-32",
    location: "Maxwell Food Centre",
    desc: "Hearty Western favourites served hot in flavour, from juicy grilled meats to comforting sides.",
    img: "images/stalls/fatbuddies.png",
  },
  {
    id: "kopi-fellas",
    name: "Kopi Fellas",
    cuisine: "Beverages",
    grade: "A",
    prepMin: 1,
    prepMax: 3,
    popular: true,
    openTime: "8:00 AM",
    closeTime: "5:30 PM",
    unit: "#01-07",
    location: "Ayer Rajah Crescent",
    desc: "Traditional kopi and teh brewed the old-school way, serving local favourites like Kopi O, Kopi C, Teh Peng, and Yuan Yang.",
    img: "images/kopifellas-hero.jpg",
  },
];

// =========================
// Get stall id from URL
// =========================
const params = new URLSearchParams(window.location.search);
const id = params.get("id") || "tiong-bahru";
const stall = stalls.find((s) => s.id === id);

if (!stall) window.location.href = "home.html";

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

// =========================
// Fill UI
// =========================
heroEl.src = stall.img;
heroEl.alt = `${stall.name} hero image`;

nameEl.textContent = stall.name;
cuisineEl.textContent = stall.cuisine;

gradeEl.textContent = stall.grade;
gradeEl.classList.remove("gradeA", "gradeB", "gradeC");
gradeEl.classList.add(
  stall.grade === "A" ? "gradeA" : stall.grade === "B" ? "gradeB" : "gradeC",
);

descEl.textContent = stall.desc;

// Top meta line
metaEl.textContent = `Open: ${stall.openTime} - ${stall.closeTime} > Unit ${stall.unit}`;

// Location line (if you added it in HTML)
if (locationEl) {
  locationEl.textContent = `📍 ${stall.location} • Unit ${stall.unit}`;
}

// Links
if (menuLink) menuLink.href = `menu.html?id=${stall.id}`;
if (callBtn) callBtn.href = "tel:+6590000000";
if (dirBtn) {
  dirBtn.href =
    "https://www.google.com/maps?q=" +
    encodeURIComponent(stall.location || stall.name);
}

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
  if (!favBtn) return;

  // If not logged in, block favourites
  if (!user) {
    setFavUI(false);
    favBtn.addEventListener("click", () => {
      alert("Please login to use favourites.");
      window.location.href = "index.html";
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
