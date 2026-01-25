import { db } from "./firebase.js";
import {
  collection,
  query,
  where,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/*************************************************
 * home.js - Stall Listing + Filters + Guest Mode (FULL)
 * - Guest mode: home.html?mode=guest
 * - Guest can VIEW stalls
 * - If guest tries to use search/filter/sort/location -> show locked screen (like your design)
 *************************************************/

// ✅ GUEST MODE
const params = new URLSearchParams(window.location.search);
const isGuest = params.get("mode") === "guest";

// Optional: hide / show UI parts if you use these classes in HTML
function applyGuestModeUI() {
  if (!isGuest) return;

  document.body.classList.add("guest");

  // Hide elements only for logged-in users (if you add these classes in HTML)
  document.querySelectorAll(".auth-only").forEach((el) => {
    el.style.display = "none";
  });

  // Show guest banner if you have it (optional)
  document.querySelectorAll(".guest-banner").forEach((el) => {
    el.style.display = "block";
  });
}

document.querySelectorAll(".viewBtn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const id = btn.dataset.id;
    window.location.href = `stall.html?id=${id}`;
  });
});

applyGuestModeUI();
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll('a[href="account.html"]').forEach((link) => {
    link.addEventListener("click", (e) => {
      if (isGuest) {
        e.preventDefault();
        window.location.href = "signin.html";
      }
    });
  });
});
/* ===============================
   DATA
================================ */

let stalls = [];

const els = {
  list: document.getElementById("list"),
  subline: document.getElementById("subline"),
  q: document.getElementById("q"),
  cuisine: document.getElementById("cuisine"),
  grade: document.getElementById("grade"),
  sort: document.getElementById("sort"),
  location: document.getElementById("location"),
  emptyState: document.getElementById("emptyState"),
  resetBtn: document.getElementById("resetFiltersBtn"),
};

async function loadHomeStalls() {
  const q = query(collection(db, "stalls"), where("active", "==", true));
  const snap = await getDocs(q);

  stalls = snap.docs.map((d) => {
    const s = d.data();
    return {
      id: d.id,
      name: s.stallName ?? s.name ?? d.id,
      cuisine: s.cuisine ?? "",
      grade: s.hygieneGrade ?? s.grade ?? "",
      popular: !!s.popular,
      location: s.location ?? "",
      desc: s.desc ?? "",
      img: s.imageUrl ?? s.img ?? "images/default-stall.png",
      openTime: s.openTime ?? "",
      closeTime: s.closeTime ?? "",
      unit: s.unitNo ?? s.unit ?? "",
      prepMin: s.prepMin ?? null,
      prepMax: s.prepMax ?? null,
    };
  });

  // render AFTER data exists
  renderCuisineOptions();
  applyFilters();
}

/* ===============================
   GUEST LOCK SCREEN (INSIDE LIST)
================================ */

function renderGuestLockedView() {
  els.list.innerHTML = `
    <div class="emptyState guestLocked">
      <h2 class="emptyTitle">Login to access personalised features</h2>
      <p class="emptyDesc">Unlock full access to ordering, favourite, and more.</p>

      <button class="resetBtn guestCTA" type="button" data-action="reset-filters">
        Reset Filters
      </button>

      <a class="resetBtn guestCTA secondary" href="signup.html">
        Register
      </a>
    </div>
  `;
}

function resetAllFilters() {
  els.q.value = "";
  els.cuisine.value = "";
  els.grade.value = "";
  els.sort.value = "popular";
  els.location.value = "";
}

/**
 * Guest can view default list.
 * If they touch any filter/search/sort/location -> show lock screen.
 */
function guestTriedToFilter() {
  if (!isGuest) return false;

  const touched =
    els.q.value.trim() !== "" ||
    els.cuisine.value !== "" ||
    els.grade.value !== "" ||
    els.location.value.trim() !== "" ||
    els.sort.value !== "popular";

  if (touched) {
    els.subline.textContent = "Guest Mode: Login to use search & filters";
    renderGuestLockedView();
    return true;
  }

  return false;
}

/* ===============================
   HELPERS
================================ */

function uniqueCuisines(data) {
  return Array.from(new Set(data.map((s) => s.cuisine))).sort((a, b) =>
    a.localeCompare(b),
  );
}

function avgPrep(s) {
  return (s.prepMin + s.prepMax) / 2;
}

function renderCuisineOptions() {
  const cs = uniqueCuisines(stalls);
  cs.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    els.cuisine.appendChild(opt);
  });
}

// ✅ helper: keep guest mode when navigating
function withGuestMode(url) {
  if (!isGuest) return url;
  return url.includes("?") ? `${url}&mode=guest` : `${url}?mode=guest`;
}

/* ===============================
   UI BUILDING
================================ */

function createCard(stall) {
  const card = document.createElement("article");
  card.className = "card";

  card.innerHTML = `
    <div class="cardImg">
      <div class="imgFrame">
        <img src="${stall.img}" alt="${stall.name}">
      </div>
    </div>

    <div class="cardBody">
      <div class="cardTop">
        <h3 class="title">${stall.name}</h3>
        ${stall.popular ? `<span class="badgePopular">Most Popular</span>` : ""}
      </div>

      <div class="meta">
        <span class="tag">${stall.cuisine}</span>
        <span class="grade ${stall.grade}">${stall.grade}</span>
      </div>

      <p class="desc">${stall.desc}</p>

      <div class="cardBottom">
        <span class="prep">Prep Time: ${stall.prepMin}-${stall.prepMax} min</span>
        <button class="viewBtn" data-id="${stall.id}">
          View Stall 
          <img src="images/right-arrow.png" alt="" class="arrowIcon" />
        </button>
      </div>
    </div>
  `;

  card.querySelector(".viewBtn").addEventListener("click", () => {
    const target = withGuestMode(
      `stall.html?id=${encodeURIComponent(stall.id)}`,
    );
    window.location.href = target;
  });

  return card;
}

/* ===============================
   FILTERING / RENDER
================================ */

function applyFilters() {
  // ✅ if guest tries to use filters, show locked view and stop
  if (guestTriedToFilter()) return;

  const q = els.q.value.trim().toLowerCase();
  const cuisine = els.cuisine.value;
  const grade = els.grade.value;
  const loc = els.location.value.trim().toLowerCase();
  const sort = els.sort.value;

  let filtered = stalls.filter((s) => {
    const matchesQ =
      !q ||
      s.name.toLowerCase().includes(q) ||
      s.cuisine.toLowerCase().includes(q) ||
      s.desc.toLowerCase().includes(q);

    const matchesCuisine = !cuisine || s.cuisine === cuisine;
    const matchesGrade = !grade || s.grade === grade;
    const matchesLoc = !loc || s.location.toLowerCase().includes(loc);

    return matchesQ && matchesCuisine && matchesGrade && matchesLoc;
  });

  // sorting
  if (sort === "popular") {
    filtered.sort((a, b) => (b.popular === true) - (a.popular === true));
  } else if (sort === "prepAsc") {
    filtered.sort((a, b) => avgPrep(a) - avgPrep(b));
  } else if (sort === "prepDesc") {
    filtered.sort((a, b) => avgPrep(b) - avgPrep(a));
  } else if (sort === "nameAsc") {
    filtered.sort((a, b) => a.name.localeCompare(b.name));
  }

  renderList(filtered, sort);
}

function sortLabel(v) {
  if (v === "popular") return "Most Popular";
  if (v === "prepAsc") return "Fastest Prep";
  if (v === "prepDesc") return "Slowest Prep";
  if (v === "nameAsc") return "Name A–Z";
  return "Most Popular";
}

function renderList(data, sortValue) {
  els.list.innerHTML = "";

  els.subline.textContent = `Showing ${data.length} Stalls . Sorted by ${sortLabel(
    sortValue,
  )}`;

  const showReset = hasActiveFilters();

  // EMPTY STATE
  if (data.length === 0) {
    els.list.innerHTML = `
      <div class="emptyState">
        <h2 class="emptyTitle">No stalls match your filters</h2>
        ${
          showReset
            ? `
          <button class="resetBtn" type="button" data-action="reset-filters">
            Reset Filters
          </button>
        `
            : ""
        }
      </div>
    `;
    return;
  }

  // NORMAL LIST
  data.forEach((s) => els.list.appendChild(createCard(s)));

  // ✅ Bottom reset button ONLY if filters are active
  if (showReset) {
    els.list.insertAdjacentHTML(
      "beforeend",
      `
        <div class="bottomReset">
          <button class="resetBtn" type="button" data-action="reset-filters">
            Reset Filters
          </button>
        </div>
      `,
    );
  }
}

function hasActiveFilters() {
  return (
    els.q.value.trim() !== "" ||
    els.cuisine.value !== "" ||
    els.grade.value !== "" ||
    els.location.value.trim() !== "" ||
    els.sort.value !== "popular"
  );
}

/* ===============================
   RESET BUTTON HANDLING
================================ */

els.list.addEventListener("click", (e) => {
  const btn = e.target.closest('[data-action="reset-filters"]');
  if (!btn) return;

  resetAllFilters();
  applyFilters();
});

/* ===============================
   INIT
================================ */

loadHomeStalls();
/* ===============================
   LISTENERS
================================ */

// Guest lock is handled inside applyFilters()
["input", "change"].forEach((evt) => {
  els.q.addEventListener(evt, applyFilters);
  els.location.addEventListener(evt, applyFilters);
});
els.cuisine.addEventListener("change", applyFilters);
els.grade.addEventListener("change", applyFilters);
els.sort.addEventListener("change", applyFilters);
