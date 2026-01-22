// same stall data (or import it if shared)
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
];

// ===== Get stall id from URL =====
const params = new URLSearchParams(window.location.search);
const id = params.get("id") || "tiong-bahru"; // default fallback
const stall = stalls.find((s) => s.id === id);

if (!stall) {
  window.location.href = "home.html";
}

// ===== Elements (match your stall.html) =====
const heroEl = document.getElementById("stallHero");
const nameEl = document.getElementById("stallName");
const cuisineEl = document.getElementById("stallCuisine");
const gradeEl = document.getElementById("stallGrade");
const descEl = document.getElementById("stallDesc");
const metaEl = document.getElementById("stallMeta");
const hoursEl = document.getElementById("stallHours");

const menuLink = document.getElementById("menuLink");
const callBtn = document.getElementById("callBtn");
const dirBtn = document.getElementById("dirBtn");

// ===== Fill UI =====
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

// ===== Opening hours + unit + extras =====
metaEl.textContent = `Open: ${stall.openTime} - ${stall.closeTime} > Unit ${stall.unit}`;
// hoursEl.textContent = `Open ${stall.openTime} - ${stall.closeTime}`;

const locationEl = document.getElementById("stallLocation");
if (locationEl) {
  locationEl.textContent = `📍 ${stall.location} • Unit ${stall.unit}`;
}

// ===== Links =====
if (menuLink) menuLink.href = `menu.html?id=${stall.id}`;

// (optional) if you don’t have real numbers/addresses yet:
if (callBtn) callBtn.href = "tel:+6590000000";
if (dirBtn)
  dirBtn.href =
    "https://www.google.com/maps?q=" +
    encodeURIComponent(stall.location || stall.name);
