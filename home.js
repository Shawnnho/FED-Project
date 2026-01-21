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
    desc: "Tender poached chicken served with fragrant rice, accompanied by chilli and ginger sauces.",
    img: "images/stalls/chickenrice.png",
  },
  {
    id: "asia-wok",
    name: "Asia Wok",
    cuisine: "Chinese",
    grade: "A",
    prepMin: 5,
    prepMax: 10,
    popular: false,
    location: "Ayer Rajah Creasent",
    desc: "Tze Char is affordable Singapore Chinese home-style cooking with a wide variety of dishes meant for sharing.",
    img: "images/stalls/asiawok.jpg",
  },
  {
    id: "ahmad-nasi-lemak",
    name: "Ahmad Nasi Lemak",
    cuisine: "Malay",
    grade: "B",
    prepMin: 2,
    prepMax: 5,
    popular: false,
    location: "Maxwell",
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
    location: "Bukit Timah Road",
    desc: "Bold, aromatic dishes made with rich spices, featuring curries, breads, rice, and savoury sides.",
    img: "images/stalls/al-azhar.jpg",
  },
  {
    id: "fat-buddies",
    name: "Fat Buddies Western Food",
    cuisine: "Western",
    grade: "B",
    prepMin: 5,
    prepMax: 10,
    popular: false,
    location: "Maxwell",
    desc: "Hearty Western favourites served hot in flavour, from juicy grilled meats to comforting sides.",
    img: "images/stalls/fatbuddies.png",
  },
];

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

  // Button click (route later)
  card.querySelector(".viewBtn").addEventListener("click", () => {
    // Example: go to stall page with query string
    window.location.href = `stall.html?id=${encodeURIComponent(stall.id)}`;
  });

  return card;
}

function applyFilters() {
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

  els.subline.textContent = `Showing ${data.length} Stalls . Sorted by ${sortLabel(sortValue)}`;
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

els.list.addEventListener("click", (e) => {
  const btn = e.target.closest('[data-action="reset-filters"]');
  if (!btn) return;

  els.q.value = "";
  els.cuisine.value = "";
  els.grade.value = "";
  els.sort.value = "popular";
  els.location.value = "";

  applyFilters();
});

// init
renderCuisineOptions();
applyFilters();

// listeners
["input", "change"].forEach((evt) => {
  els.q.addEventListener(evt, applyFilters);
  els.location.addEventListener(evt, applyFilters);
});
els.cuisine.addEventListener("change", applyFilters);
els.grade.addEventListener("change", applyFilters);
els.sort.addEventListener("change", applyFilters);

/* ===============================
   MOBILE HAMBURGER MENU
================================ */

document.addEventListener("DOMContentLoaded", () => {
  const menuBtn = document.getElementById("menuBtn");
  const navMobile = document.getElementById("navMobile");
  const navBackdrop = document.getElementById("navBackdrop");

  // safety check (prevents errors on other pages)
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
    const isOpen = navMobile.classList.contains("open");
    isOpen ? closeMenu() : openMenu();
  });

  navBackdrop.addEventListener("click", closeMenu);

  // close menu when clicking a link
  navMobile.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  // ESC key closes menu
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });
});
