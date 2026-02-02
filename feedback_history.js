import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  collectionGroup,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

/* SAME config as your other pages */
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
const auth = getAuth(app);

const listEl = document.getElementById("historyList");
const statusEl = document.getElementById("historyStatus");
const emptyEl = document.getElementById("historyEmpty");

const tabsWrap = document.querySelector(".historyTabs");
let activeTab = "all";

/* NEW: sort dropdown (Google reviews style) */
const sortEl = document.getElementById("historySort");
let activeSort = "relevant"; // relevant | newest | starsDesc | starsAsc

function fmtDate(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString();
}

function escapeHtml(s) {
  return (s || "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[c],
  );
}

/* avatar block: image if exists, else fallback initial */
function avatarHtml(userMeta) {
  const name = userMeta?.name || "You";
  const initial = escapeHtml((name.trim()[0] || "Y").toUpperCase());
  const photo = userMeta?.photoURL ? escapeHtml(userMeta.photoURL) : "";

  if (photo) {
    return `<img class="historyAvatarImg" src="${photo}" alt="Profile picture" />`;
  }
  return `<div class="historyAvatarFallback" aria-hidden="true">${initial}</div>`;
}

function cardHtml(item, userMeta) {
  const badge =
    item.type === "review"
      ? `<span class="badge badgeReview">Review</span>`
      : `<span class="badge badgeComplaint">Complaint</span>`;

  let title;

  if (item.type === "review") {
    const r = Math.max(0, Math.min(5, Number(item.rating || 0)));
    const full = Math.floor(r);
    const half = r - full >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;

    const starsHtml =
      `<span class="ratingWrap">` +
      `<span class="ratingFull">${"★".repeat(full)}</span>` +
      (half ? `<span class="ratingHalf">★</span>` : ``) +
      `<span class="ratingEmpty">${"★".repeat(empty)}</span>` +
      `</span>`;

    title = `${escapeHtml(item.stallName || "Stall")} • ${starsHtml}`;
  } else {
    title = `${escapeHtml(item.stallName || item.stall || "Stall")} • Complaint`;
  }

  const tags =
    item.type === "review" && item.tags?.length
      ? `<div class="tagLine">${item.tags
          .map((t) => `<span class="miniTag">${escapeHtml(t)}</span>`)
          .join("")}</div>`
      : "";

  const img = item.imageUrl
    ? `<img class="historyImg" src="${escapeHtml(item.imageUrl)}" alt="Attachment" />`
    : "";

  const body =
    item.type === "review"
      ? escapeHtml(item.text || "")
      : escapeHtml(item.message || "");

  return `
    <div class="historyCard" data-type="${item.type}">
      <div class="historyTop">
        <div class="historyLeft">
          <div class="historyAvatar">
            ${avatarHtml(userMeta)}
          </div>

          <div class="historyTitle">
            ${badge} <span>${title}</span>
          </div>
        </div>

        <div class="historyDate">${escapeHtml(fmtDate(item.createdAt))}</div>
      </div>

      ${tags}

      <div class="historyBody">${body}</div>
      ${img}
    </div>
  `;
}

/* NEW: Google-review style sort */
function sortItems(arr) {
  return [...arr].sort((a, b) => {
    const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;

    const ra = Number(a.rating ?? 0);
    const rb = Number(b.rating ?? 0);

    const hasImgA = a.imageUrl ? 1 : 0;
    const hasImgB = b.imageUrl ? 1 : 0;

    const textA = (a.type === "review" ? a.text || "" : a.message || "").trim();
    const textB = (b.type === "review" ? b.text || "" : b.message || "").trim();

    const lenA = textA.length;
    const lenB = textB.length;

    if (activeSort === "newest") return tb - ta;

    if (activeSort === "starsDesc") {
      if (rb !== ra) return rb - ra;
      return tb - ta;
    }

    if (activeSort === "starsAsc") {
      if (ra !== rb) return ra - rb;
      return tb - ta;
    }

    // Most relevant (approx Google)
    // 1) Reviews first (ratings exist), then complaints
    const isReviewA = a.type === "review" ? 1 : 0;
    const isReviewB = b.type === "review" ? 1 : 0;
    if (isReviewB !== isReviewA) return isReviewB - isReviewA;

    // 2) Higher stars
    if (rb !== ra) return rb - ra;

    // 3) Photos first
    if (hasImgB !== hasImgA) return hasImgB - hasImgA;

    // 4) Longer text slightly higher
    if (lenB !== lenA) return lenB - lenA;

    // 5) Newest tie-breaker
    return tb - ta;
  });
}

function render(items, userMeta) {
  const filtered =
    activeTab === "all"
      ? items
      : items.filter((x) => x.type === activeTab.slice(0, -1));

  const sorted = sortItems(filtered);

  listEl.innerHTML = sorted.map((it) => cardHtml(it, userMeta)).join("");

  const hasAny = sorted.length > 0;
  statusEl.style.display = "none";
  emptyEl.style.display = hasAny ? "none" : "block";
}

async function loadHistory(user) {
  statusEl.textContent = "Loading…";
  statusEl.style.display = "block";
  emptyEl.style.display = "none";
  listEl.innerHTML = "";

  const userMeta = {
    name: user.displayName || user.email || "You",
    photoURL: user.photoURL || "",
  };

  const complaintsQ = query(
    collection(db, "complaints"),
    where("uid", "==", user.uid),
    orderBy("createdAt", "desc"),
  );

  const reviewsSubQ = query(
    collectionGroup(db, "reviews"),
    where("userId", "==", user.uid),
    orderBy("createdAt", "desc"),
  );

  // old location support: /reviews (top-level)
  const reviewsTopQ = query(
    collection(db, "reviews"),
    where("userId", "==", user.uid),
    orderBy("createdAt", "desc"),
  );

  const [complaintsSnap, reviewsSubSnap, reviewsTopSnap] = await Promise.all([
    getDocs(complaintsQ),
    getDocs(reviewsSubQ),
    getDocs(reviewsTopQ),
  ]);

  const complaints = complaintsSnap.docs.map((d) => ({
    id: d.id,
    type: "complaint",
    ...d.data(),
  }));

  const reviews = [
    ...reviewsSubSnap.docs.map((d) => ({
      id: d.id,
      type: "review",
      ...d.data(),
    })),
    ...reviewsTopSnap.docs.map((d) => ({
      id: d.id,
      type: "review",
      ...d.data(),
    })),
  ];

  const all = [...complaints, ...reviews].sort((a, b) => {
    const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return tb - ta;
  });

  render(all, userMeta);

  // NEW: Sort dropdown listener
  sortEl?.addEventListener("change", () => {
    activeSort = sortEl.value;
    render(all, userMeta);
  });

  // Tabs
  tabsWrap?.addEventListener("click", (e) => {
    const btn = e.target.closest(".tabBtn");
    if (!btn) return;

    document
      .querySelectorAll(".tabBtn")
      .forEach((b) => b.classList.remove("isOn"));
    btn.classList.add("isOn");
    activeTab = btn.dataset.tab;

    render(all, userMeta);
  });
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    statusEl.textContent = "Please log in to view your feedback history.";
    return;
  }

  try {
    await loadHistory(user);
  } catch (err) {
    console.error(err);
    statusEl.textContent =
      err?.message ||
      "Failed to load history. (You may need Firestore indexes — check console for index link.)";
  }
});

/* ================= Image Click → Full Preview ================= */

const imgModal = document.getElementById("imgModal");
const imgModalBackdrop = document.getElementById("imgModalBackdrop");
const imgModalContent = document.getElementById("imgModalContent");

// Open modal when clicking feedback image
document.addEventListener("click", (e) => {
  const img = e.target.closest(".historyImg");
  if (!img) return;

  imgModalContent.src = img.src;
  imgModal.hidden = false;
});

// Close when clicking backdrop or image
imgModalBackdrop.addEventListener("click", closeImgModal);
imgModalContent.addEventListener("click", closeImgModal);

// Close with ESC key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeImgModal();
});

function closeImgModal() {
  imgModal.hidden = true;
  imgModalContent.src = "";
}
