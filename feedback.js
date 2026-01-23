/*************************************************
 * feedback.js (MODULE)
 * - Keeps your existing buttons working
 * - Loads latest reviews into the carousel
 *************************************************/

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collectionGroup,
  query,
  orderBy,
  limit,
  onSnapshot,
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
const db = getFirestore(app);

/* =========================
   1) Your existing buttons
   (make them work even though this file is type="module")
========================= */
window.writeReview = function () {
  window.location.href = "review.html";
};

window.fileComplaint = function () {
  window.location.href = "complaint.html";
};

window.viewHistory = function () {
  window.location.href = "feedback_history.html";
};

/* =========================
   2) Carousel rendering
========================= */
const track = document.getElementById("fbTrack");
const empty = document.getElementById("fbEmpty");
const prevBtn = document.getElementById("fbPrev");
const nextBtn = document.getElementById("fbNext");

function esc(s = "") {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}

function renderStars(rating = 0) {
  const r = Math.max(0, Math.min(5, Number(rating)));
  const full = Math.floor(r);
  const half = r - full >= 0.5;
  let html = "";

  for (let i = 0; i < full; i++) {
    html += `<span class="star full">★</span>`;
  }

  if (half) {
    html += `<span class="star half">★</span>`;
  }

  const empty = 5 - full - (half ? 1 : 0);
  for (let i = 0; i < empty; i++) {
    html += `<span class="star empty">★</span>`;
  }

  return html;
}

function fmtDate(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function renderCards(items) {
  if (!track) return;

  track.innerHTML = "";

  if (!items.length) {
    if (empty) empty.hidden = false;
    return;
  }

  if (empty) empty.hidden = true;

  for (const it of items) {
    const stallName = it.stallName || it.stallId || "Unknown stall";
    const rating = Number(it.rating || 0);
    const text = it.text || it.review || it.message || "";
    const user = it.userName || it.displayName || "Anonymous";
    const when = fmtDate(it.createdAt);
    const imageUrl = it.imageUrl || null;

    const card = document.createElement("article");
    card.className = "fbCard";
    card.innerHTML = `
  <div class="fbCardTop">
    <div class="fbStallName">${esc(stallName)}</div>

    <div class="fbRating">
      <span class="fbStars" aria-label="${rating} out of 5">
        ${renderStars(rating)}
      </span>
      <span class="fbRatingNum">
        ${rating ? rating.toFixed(1) : "0.0"}
      </span>
    </div>
  </div>

  ${
    imageUrl
      ? `
    <img
      src="${imageUrl}"
      alt="Review image"
      class="fbReviewImg"
      loading="lazy"
    />
  `
      : ""
  }

  <p class="fbText">${esc(text)}</p>

  <div class="fbMeta">
    <span class="fbUser">${esc(user)}</span>
    <span class="fbDot">•</span>
    <span class="fbDate">${esc(when)}</span>
  </div>
`;

    card.style.cursor = "pointer";

    card.addEventListener("click", () => {
      if (it.stallId) {
        window.location.href = `stall.html?id=${it.stallId}`;
      }
    });

    track.appendChild(card);
  }
}

function scrollByOne(direction) {
  if (!track) return;
  const card = track.querySelector(".fbCard");
  const cardW = card ? card.getBoundingClientRect().width : 320;
  track.scrollBy({ left: direction * (cardW + 14), behavior: "smooth" });
}

if (prevBtn) prevBtn.addEventListener("click", () => scrollByOne(-1));
if (nextBtn) nextBtn.addEventListener("click", () => scrollByOne(1));

/* Auto-move every 4s (pause on hover) */
let timer = null;
function startAuto() {
  stopAuto();
  timer = setInterval(() => scrollByOne(1), 4000);
}
function stopAuto() {
  if (timer) clearInterval(timer);
  timer = null;
}
if (track) {
  track.addEventListener("mouseenter", stopAuto);
  track.addEventListener("mouseleave", startAuto);
}

/* =========================
   3) Firestore: read latest reviews (ALL stalls)
   IMPORTANT: this requires your reviews to be stored under:
   stalls/{stallId}/reviews/{reviewId}
========================= */
const q = query(
  collectionGroup(db, "reviews"),
  orderBy("createdAt", "desc"),
  limit(20),
);

onSnapshot(q, (snap) => {
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderCards(items);
  startAuto();
});
