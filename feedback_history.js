import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
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

function fmtDate(ts) {
  if (!ts) return "";
  // Firestore Timestamp -> Date
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

function cardHtml(item) {
  const badge =
    item.type === "review"
      ? `<span class="badge badgeReview">Review</span>`
      : `<span class="badge badgeComplaint">Complaint</span>`;

  const title =
    item.type === "review"
      ? `${escapeHtml(item.stallName || "Stall")} • ${"★".repeat(item.rating || 0)}`
      : `${escapeHtml(item.stall || "Stall")} • Complaint`;

  const tags =
    item.type === "review" && item.tags?.length
      ? `<div class="tagLine">${item.tags.map((t) => `<span class="miniTag">${escapeHtml(t)}</span>`).join("")}</div>`
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
        <div class="historyTitle">${badge} <span>${title}</span></div>
        <div class="historyDate">${escapeHtml(fmtDate(item.createdAt))}</div>
      </div>

      ${tags}

      <div class="historyBody">${body}</div>
      ${img}
    </div>
  `;
}

function render(items) {
  // Filter by tab
  const filtered =
    activeTab === "all"
      ? items
      : items.filter((x) => x.type === activeTab.slice(0, -1)); // reviews->review, complaints->complaint

  listEl.innerHTML = filtered.map(cardHtml).join("");

  const hasAny = filtered.length > 0;
  statusEl.style.display = "none";
  emptyEl.style.display = hasAny ? "none" : "block";
}

async function loadHistory(user) {
  statusEl.textContent = "Loading…";
  statusEl.style.display = "block";
  emptyEl.style.display = "none";
  listEl.innerHTML = "";

  // 1) Complaints: /complaints where uid == user.uid
  const complaintsQ = query(
    collection(db, "complaints"),
    where("uid", "==", user.uid),
    orderBy("createdAt", "desc"),
  );

  // 2) Reviews: collectionGroup("reviews") where userId == user.uid
  const reviewsQ = query(
    collectionGroup(db, "reviews"),
    where("userId", "==", user.uid),
    orderBy("createdAt", "desc"),
  );

  const [complaintsSnap, reviewsSnap] = await Promise.all([
    getDocs(complaintsQ),
    getDocs(reviewsQ),
  ]);

  const complaints = complaintsSnap.docs.map((d) => ({
    id: d.id,
    type: "complaint",
    ...d.data(),
  }));

  const reviews = reviewsSnap.docs.map((d) => ({
    id: d.id,
    type: "review",
    ...d.data(),
  }));

  // Merge + sort by createdAt desc
  const all = [...complaints, ...reviews].sort((a, b) => {
    const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return tb - ta;
  });

  render(all);

  // Tabs
  tabsWrap?.addEventListener("click", (e) => {
    const btn = e.target.closest(".tabBtn");
    if (!btn) return;

    document
      .querySelectorAll(".tabBtn")
      .forEach((b) => b.classList.remove("isOn"));
    btn.classList.add("isOn");
    activeTab = btn.dataset.tab;

    render(all);
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
