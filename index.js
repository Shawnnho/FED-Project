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
  getDocs,
  query,
  where,
  collectionGroup,
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

// =========================
// Stall data from Firebase
// =========================
let stalls = [];

// =========================
// DOM
// =========================
const featuredTrack = document.getElementById("featuredTrack");
const listEl = document.getElementById("discoverList");
const emptyEl = document.getElementById("discoverEmpty");
const searchEl = document.getElementById("discoverSearch");
const chipRow = document.getElementById("chipRow");
const resetBtn = document.getElementById("discoverReset");

// =========================
// State
// =========================
let activeCat = "all";
let currentUid = null;
let favSet = new Set(); // stall ids (we will store full path: centres/{centreId}/stalls/{stallId})

function isExpired(p) {
  return p.expiresAt && Date.now() > p.expiresAt;
}

async function loadDiscoverPromos() {
  const snap = await getDocs(collection(db, "promotions"));

  const discoverPromos = snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        expiresAt: data.expiresAt?.toMillis ? data.expiresAt.toMillis() : 0,
      };
    })
    .filter((p) => !isExpired(p))
    .sort((a, b) => (b.popular === true) - (a.popular === true))
    .slice(0, 6);

  renderPromoStrip(discoverPromos);
}

// =========================
// Helpers
// =========================
function esc(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showDToast(msg) {
  const el = document.getElementById("dToast");
  if (!el) return;

  el.textContent = msg;
  el.classList.add("show");

  clearTimeout(showDToast._t);
  showDToast._t = setTimeout(() => el.classList.remove("show"), 1400);
}

function timeLabel(s) {
  return `${s.prepMin}–${s.prepMax} min`;
}

function prepClass(s) {
  if (s.prepMax <= 5) return "good";
  if (s.prepMax <= 10) return "ok";
  return "slow";
}

function catTokens(s) {
  const tokens = [];
  if (s.cuisine) tokens.push(s.cuisine.toLowerCase());
  if (s.popular) tokens.push("popular");
  if (s.grade === "A") tokens.push("top");
  if (s.prepMax <= 10) tokens.push("fast");
  return tokens.join(" ");
}

function menuUrl(s) {
  // IMPORTANT: this matches your new menu.html params
  return `menu.html?centreId=${encodeURIComponent(s.centreId)}&stallId=${encodeURIComponent(s.stallDocId)}`;
}

// =========================
// Dynamic chip generation
// =========================
function buildChipsFromData(data) {
  const cuisines = [
    ...new Set(data.map((s) => (s.cuisine || "").trim()).filter(Boolean)),
  ];

  const cuisineEmojis = {
    chinese: "🥢",
    malay: "🍃",
    indian: "🍛",
    western: "🍳",
    beverages: "☕",
  };

  const cuisineBtns = cuisines
    .sort()
    .map((c) => {
      const key = c.toLowerCase();
      const emoji = cuisineEmojis[key] || "🍽️";
      return `
        <button class="chipBtn" data-cat="${esc(key)}" type="button">
          ${emoji} ${esc(c)}
        </button>`;
    })
    .join("");

  const specialBtns = `
    <button class="chipBtn" data-cat="popular" type="button">🔥 Popular</button>
    <button class="chipBtn" data-cat="top" type="button">⭐ Top Rated</button>
    <button class="chipBtn" data-cat="fast" type="button">⏱️ Fast</button>
  `;

  chipRow.innerHTML = `
    <button class="chipBtn active" data-cat="all" type="button">All</button>
    ${cuisineBtns}
    ${specialBtns}
  `;
}

// =========================
// Render
// =========================
function renderFeatured(data) {
  const featured = data.filter((s) => s.popular);

  featuredTrack.innerHTML = featured
    .map((s) => {
      return `
      <a class="featuredCard" href="${menuUrl(s)}">
        <div class="featuredImg" style="background-image:url('${esc(s.img)}')"></div>
        <div class="featuredBody">
          <div class="featuredBadge">${s.grade === "A" ? "Top Pick" : "Popular"}</div>
          <div class="featuredName">${esc(s.name)}</div>
          <div class="featuredMeta">
            ${esc(s.cuisine)} · Grade ${esc(s.grade)} · ⏱️ ${timeLabel(s)}
          </div>
        </div>
      </a>`;
    })
    .join("");
}

function renderList(data) {
  listEl.innerHTML = data
    .map((s) => {
      const favOn = favSet.has(s.id);
      return `
      <article class="card dCard" data-cat="${esc(catTokens(s))}">
        <div class="cardImg">
          <div class="imgFrame">
            <img src="${esc(s.img)}" alt="${esc(s.name)}" />
          </div>
        </div>

        <div class="cardBody">
          <div class="cardTop">
            <h3 class="title">${esc(s.name)}</h3>
            ${s.popular ? `<span class="badgePopular">Popular</span>` : ``}
          </div>

          <div class="meta">
            <span class="tag">${esc(s.cuisine)}</span>
            <span class="grade ${esc(s.grade)}">${esc(s.grade)}</span>
          </div>

          <p class="desc">${esc(s.desc)}</p>

          <div class="cardBottom">
            <span class="prep dPrep ${prepClass(s)}">⏱️ ${timeLabel(s)}</span>

            <div class="dActions">
              <button class="dFav ${favOn ? "on" : ""}" type="button" data-stall="${esc(
                s.id,
              )}" aria-label="Favourite">
                <span class="heart">${favOn ? "♥" : "♡"}</span>
              </button>

              <a class="viewBtn" href="${menuUrl(s)}">
                View <span class="arrow">→</span>
              </a>
            </div>
          </div>
        </div>
      </article>`;
    })
    .join("");
}

function renderPromoStrip(data) {
  const track = document.getElementById("promoTrack");
  if (!track) return;

  track.innerHTML = data
    .map(
      (p) => `
      <article class="promoCard">
        <a class="promoLink" href="promotions.html">
          <div class="promoImg" style="background-image:url('${esc(
            p.img || "images/stalls/feature1.jpg",
          )}')"></div>
        </a>

        <div class="promoBody">
          <div class="promoTitle">${esc(p.title)}</div>
          <div class="promoDesc">${esc(p.desc)}</div>

          <div class="promoFooter">
            <div class="promoCode">${esc(p.code)}</div>
            <button class="promoClaimBtn" type="button" data-code="${esc(p.code)}">
              Claim
            </button>
          </div>
        </div>
      </article>
    `,
    )
    .join("");
}

function applyFilters() {
  const q = (searchEl?.value || "").trim().toLowerCase();
  const cards = Array.from(document.querySelectorAll(".dCard"));

  let visible = 0;
  for (const card of cards) {
    const cat = (card.getAttribute("data-cat") || "").toLowerCase();
    const text = card.innerText.toLowerCase();

    const okCat = activeCat === "all" || cat.includes(activeCat);
    const okQ = !q || text.includes(q);

    const show = okCat && okQ;
    card.style.display = show ? "" : "none";
    if (show) visible++;
  }

  emptyEl.hidden = visible !== 0;
}

// =========================
// Favourites (Firestore)
// =========================
function watchFavourites(uid) {
  const userRef = doc(db, "users", uid);

  return onSnapshot(userRef, (snap) => {
    const data = snap.data() || {};
    const favs = Array.isArray(data.favourites) ? data.favourites : [];
    favSet = new Set(favs);

    renderList(stalls);
    applyFilters();
  });
}

async function toggleFavourite(stallId) {
  if (!currentUid) {
    showDToast("Please sign in to save favourites.");
    return;
  }

  const userRef = doc(db, "users", currentUid);
  const isFav = favSet.has(stallId);

  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) {
    await setDoc(userRef, { favourites: [] });
  }

  if (isFav) {
    await setDoc(
      userRef,
      { favourites: arrayRemove(stallId) },
      { merge: true },
    );
  } else {
    await setDoc(userRef, { favourites: arrayUnion(stallId) }, { merge: true });
  }
}

document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".promoClaimBtn");
  if (!btn) return;

  const code = btn.dataset.code;
  if (!code) return;

  if (!currentUid) {
    showDToast("Please sign in to claim this promotion.");
    setTimeout(() => (window.location.href = "signin.html"), 650);
    return;
  }

  const userRef = doc(db, "users", currentUid);

  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    await setDoc(userRef, { claimedPromos: [] });
  }

  await setDoc(userRef, { claimedPromos: arrayUnion(code) }, { merge: true });

  btn.textContent = "Claimed";
  btn.disabled = true;
});

// =========================
// Events
// =========================
chipRow?.addEventListener("click", (e) => {
  const btn = e.target.closest(".chipBtn");
  if (!btn) return;

  activeCat = btn.dataset.cat || "all";

  chipRow
    .querySelectorAll(".chipBtn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");

  applyFilters();
});

searchEl?.addEventListener("input", applyFilters);

resetBtn?.addEventListener("click", () => {
  activeCat = "all";
  if (searchEl) searchEl.value = "";

  chipRow
    ?.querySelectorAll(".chipBtn")
    .forEach((b) => b.classList.remove("active"));
  chipRow?.querySelector('.chipBtn[data-cat="all"]')?.classList.add("active");

  applyFilters();
});

listEl?.addEventListener("click", (e) => {
  const favBtn = e.target.closest(".dFav");
  if (!favBtn) return;

  const stallId = favBtn.getAttribute("data-stall");
  if (!stallId) return;

  toggleFavourite(stallId);
});

// =========================
// Init
// =========================
loadStalls();
loadDiscoverPromos();

async function loadStalls() {
  const snap = await getDocs(
    query(collectionGroup(db, "stalls"), where("active", "==", true)),
  );

  const map = new Map(); // key = centres/{centreId}/stalls/{stallId}

  snap.forEach((d) => {
    // Only keep docs that are actually under centres/{centreId}/stalls/{stallId}
    // Top-level stalls look like: "stalls/{id}" -> we skip them.
    if (!d.ref.path.startsWith("centres/")) return;

    const data = d.data() || {};

    const centreIdFromPath = d.ref.parent.parent.id; // centres/{centreId}
    const stallDocId = d.id;

    const stallPathId = `centres/${centreIdFromPath}/stalls/${stallDocId}`;

    map.set(stallPathId, {
      id: stallPathId,
      centreId: centreIdFromPath,
      stallDocId,

      name: data.stallName || data.name || "Unnamed Stall",
      cuisine: data.cuisine || "",
      grade: data.hygieneGrade || data.grade || "B",
      prepMin: data.prepMin ?? 5,
      prepMax: data.prepMax ?? 10,
      popular: data.popular ?? false,
      img: data.imageUrl || data.img || "images/stalls/placeholder.jpg",
      desc: data.desc || "",
      location: data.location || "",
      openTime: data.openTime,
      closeTime: data.closeTime,
      unit: data.unitNo || data.unit || "",
    });
  });

  stalls = Array.from(map.values());

  buildChipsFromData(stalls);
  renderFeatured(stalls);
  renderList(stalls);
  applyFilters();
}


let stopFavWatch = null;

onAuthStateChanged(auth, (user) => {
  currentUid = user?.uid || null;

  if (stopFavWatch) {
    stopFavWatch();
    stopFavWatch = null;
  }

  if (currentUid) {
    stopFavWatch = watchFavourites(currentUid);
  } else {
    favSet = new Set();
    renderList(stalls);
    applyFilters();
  }
});
