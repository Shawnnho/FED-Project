/**************************************
 * menu.js (Auth + Role based nav)
 * - Hides Promotions/Hygiene for guests
 * - Shows for logged-in non-guest users
 **************************************/

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
  serverTimestamp,
  arrayUnion,
  arrayRemove,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

const params = new URLSearchParams(window.location.search);
const stallId = params.get("stallId");

async function toggleFavouriteStore(uid, stallId, isFav) {
  const userRef = doc(db, "users", uid);

  await setDoc(
    userRef,
    {
      favourites: isFav ? arrayRemove(stallId) : arrayUnion(stallId),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/* Hide / show any link pointing to restricted pages (works for pills + hamburger) */
function setRestrictedLinksVisible(visible) {
  const selectors = ['a[href$="promotions.html"]', 'a[href$="hygiene.html"]'];
  document.querySelectorAll(selectors.join(",")).forEach((a) => {
    a.style.display = visible ? "" : "none";
  });
}

/* Active link highlight */
function markActiveLinks() {
  const current = (
    window.location.pathname.split("/").pop() || "home.html"
  ).toLowerCase();
  document.querySelectorAll(".nav a.pill, #navMobile a.mLink").forEach((a) => {
    const href = (a.getAttribute("href") || "").split("?")[0].toLowerCase();
    a.classList.toggle("active", href === current);
  });
}

/* Hamburger wiring */
function wireHamburger() {
  const menuBtn = document.getElementById("menuBtn");
  const navMobile = document.getElementById("navMobile");
  const navBackdrop = document.getElementById("navBackdrop");

  if (!menuBtn || !navMobile || !navBackdrop) return;

  function openMenu() {
    navMobile.classList.add("open");
    navBackdrop.classList.add("open");
    document.body.classList.add("menuOpen");
    menuBtn.setAttribute("aria-expanded", "true");
  }

  function closeMenu() {
    navMobile.classList.remove("open");
    navBackdrop.classList.remove("open");
    document.body.classList.remove("menuOpen");
    menuBtn.setAttribute("aria-expanded", "false");
  }

  menuBtn.addEventListener("click", () => {
    navMobile.classList.contains("open") ? closeMenu() : openMenu();
  });

  navBackdrop.addEventListener("click", closeMenu);
  navMobile
    .querySelectorAll("a")
    .forEach((link) => link.addEventListener("click", closeMenu));
  document.addEventListener(
    "keydown",
    (e) => e.key === "Escape" && closeMenu(),
  );
}

async function getRole(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? snap.data().role || "customer" : "customer";
  } catch {
    return "customer";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  wireHamburger();
  markActiveLinks();

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      setRestrictedLinksVisible(false);
      return;
    }

    const role = await getRole(user.uid);
    setRestrictedLinksVisible(role !== "guest");
  });
});

document.addEventListener(
  "click",
  async (e) => {
    const heart = e.target.closest(".likeBtn");
    if (!heart) return; 

    const user = auth.currentUser;
    if (!user) return;

    if (!stallId) {
      console.error("Missing stallId in URL");
      return;
    }

    const isFavBeforeToggle = heart.classList.contains("active");

    try {
      await toggleFavouriteStore(user.uid, stallId, isFavBeforeToggle);
    } catch (err) {
      console.error("Failed to save favourite:", err);
    }
  },
  true,
);
