// stall-review.js (FULL FIXED)
// - Loads reviews from: stalls/{stallId}/reviews (same as review.js)
// - Finds stallId via centres/{centreId}/stalls/{uid}.publicStallId OR by querying top-level stalls
// - Shows red dot ONLY when new review comes in since last seen

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
const auth = getAuth(app);
const db = getFirestore(app);

/* helpers */
const $ = (id) => document.getElementById(id);

function setBadge(count, hasNew) {
  const badge = $("reviewBadge");
  if (!badge) return;

  const n = Number(count) || 0;

  // hide badge when there is 0
  if (n <= 0) {
    badge.classList.remove("isNew");
    return;
  }

  // show badge when > 0
  badge.style.display = "grid";
  badge.textContent = String(n);

  // red dot if new
  badge.classList.toggle("isNew", !!hasNew);
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value ?? "—";
}

function setStatus(msg) {
  const el = $("statusText");
  if (el) el.textContent = msg || "";
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function stars(n) {
  const r = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
  return "★".repeat(r) + "☆".repeat(5 - r);
}

function calcSummary(list) {
  const count = list.length;
  if (!count) return { avg: 0, count: 0 };
  const total = list.reduce((sum, r) => sum + (Number(r.rating) || 0), 0);
  return { avg: total / count, count };
}

/* UI state */
let allReviews = [];
let unsub = null;

// "new dot" state
let lastSeenMs = 0;
let latestMs = 0;
let currentUserUid = null;

function storageKey(uid) {
  return `hp:lastSeenReviewMs:${uid}`;
}

function loadLastSeen(uid) {
  const raw = localStorage.getItem(storageKey(uid));
  const ms = Number(raw);
  return Number.isFinite(ms) ? ms : 0;
}

function saveLastSeen(uid, ms) {
  localStorage.setItem(storageKey(uid), String(ms || 0));
}

function render() {
  const listEl = $("reviewsList");
  const sumEl = $("summaryRow");
  if (!listEl || !sumEl) return;

  const sortMode = $("sortSelect")?.value || "newest";
  const photoOnly = !!$("photoOnly")?.checked;

  let list = [...allReviews];
  if (photoOnly) list = list.filter((r) => !!r.imageUrl);

  list.sort((a, b) => {
    const ta = a.createdAtMs || 0;
    const tb = b.createdAtMs || 0;
    const ra = Number(a.rating) || 0;
    const rb = Number(b.rating) || 0;

    if (sortMode === "newest") return tb - ta;
    if (sortMode === "oldest") return ta - tb;
    if (sortMode === "rating_desc") return rb - ra || tb - ta;
    if (sortMode === "rating_asc") return ra - rb || tb - ta;
    return tb - ta;
  });

  const { avg, count } = calcSummary(list);

  // nicer empty state: don't show "0.0" summary when no reviews
  if (count === 0) {
    setBadge(0, false);
    sumEl.innerHTML = `
    <div class="rvEmptyHero">
      <div class="rvEmptyTitle">No reviews yet</div>
      <div class="rvEmptySub">When customers leave feedback, it'll show up here.</div>
    </div>
  `;
    listEl.innerHTML = ``; // no duplicate "No reviews yet."
    return;
  }

  sumEl.innerHTML = `
    <div class="rvSummary">
      <div class="rvSummaryBig">${avg.toFixed(1)}</div>
      <div class="rvSummaryText">
        <div>${esc(stars(avg))} <span class="rvMuted">(${count})</span></div>
        <div class="rvMuted">${count} review${count === 1 ? "" : "s"}</div>
      </div>
    </div>
  `;

  // hasNew if there's a review newer than lastSeen
  const hasNew = latestMs > lastSeenMs;
  setBadge(count, hasNew);

  listEl.innerHTML = list
    .map((r) => {
      const date = r.createdAtMs
        ? new Date(r.createdAtMs).toLocaleString()
        : "—";

      return `
        <div class="rvCard">
          <div class="rvTop">
            <div>
              <div class="rvStars">
                ${esc(stars(r.rating))}
                <span class="rvMuted">${esc(r.rating)}/5</span>
              </div>
              <div class="rvMeta">${esc(r.userName || "Anonymous")} • ${esc(date)}</div>
            </div>
          </div>

          ${r.comment ? `<div class="rvComment">${esc(r.comment)}</div>` : ""}

          ${
            r.imageUrl
              ? `<img class="rvImg" src="${esc(r.imageUrl)}" alt="Review image" loading="lazy" />`
              : ""
          }
        </div>
      `;
    })
    .join("");
}

/* =========================
   Find stallId for this storeholder
   ========================= */
async function findPublicStallId(centreId, ownerUid) {
  // 1) Try centres/{centreId}/stalls/{uid} doc fields
  try {
    const stallRef = doc(db, "centres", centreId, "stalls", ownerUid);
    const stallSnap = await getDoc(stallRef);
    if (stallSnap.exists()) {
      const s = stallSnap.data() || {};
      const fromDoc = s.publicStallId || s.stallId || s.publicId;
      if (fromDoc) return String(fromDoc);
    }
  } catch (e) {
    console.warn("centre stall doc lookup failed:", e);
  }

  // 2) Try query top-level stalls by ownerUid
  const stallsCol = collection(db, "stalls");

  const tryQuery = async (field) => {
    const q = query(stallsCol, where(field, "==", ownerUid), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) return snap.docs[0].id;
    return null;
  };

  try {
    const a = await tryQuery("ownerUid");
    if (a) return a;
  } catch {}

  try {
    const b = await tryQuery("ownerId");
    if (b) return b;
  } catch {}

  // 3) Last fallback: assume stallId == ownerUid
  return ownerUid;
}

/* =========================
   Listen reviews (PUBLIC PATH)
   stalls/{stallId}/reviews
   ========================= */
function listenReviewsPublic(stallId) {
  const reviewsCol = collection(db, "stalls", stallId, "reviews");
  const qy = query(reviewsCol, orderBy("createdAt", "desc"), limit(200));

  if (typeof unsub === "function") unsub();
  setStatus("Loading reviews...");

  unsub = onSnapshot(
    qy,
    (snap) => {
      allReviews = snap.docs.map((d) => {
        const data = d.data() || {};
        const ms = data.createdAt?.toMillis ? data.createdAt.toMillis() : 0;

        return {
          id: d.id,
          rating: data.rating ?? 0,
          comment: data.comment ?? data.text ?? "",
          userName: data.userName ?? data.displayName ?? "",
          imageUrl: data.imageUrl ?? data.photoUrl ?? "",
          createdAtMs: ms,
        };
      });

      latestMs = allReviews[0]?.createdAtMs || 0;

      // When you are ON this page and it has loaded,
      // consider everything "seen" and clear the dot.
      if (currentUserUid && latestMs) {
        lastSeenMs = Math.max(lastSeenMs, latestMs);
        saveLastSeen(currentUserUid, lastSeenMs);
      }

      setStatus("");
      render();
    },
    (err) => {
      console.error("Reviews snapshot error:", err);
      setStatus("❌ Failed to load reviews. Check Firestore rules / path.");
      allReviews = [];
      latestMs = 0;
      render();
    },
  );
}

/* UI events */
$("sortSelect")?.addEventListener("change", render);
$("photoOnly")?.addEventListener("change", render);

/* Logout */
$("logoutBtn")?.addEventListener("click", async () => {
  await signOut(auth);
  location.href = "signin.html";
});

/* Auth + header */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    location.href = "signin.html";
    return;
  }

  currentUserUid = user.uid;

  try {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      await signOut(auth);
      location.href = "signin.html";
      return;
    }

    const u = userSnap.data() || {};

    // hide other tab badges on this page (until real counts are implemented)
    const a = document.getElementById("analyticsBadge");
    if (a) a.style.display = "none";

    const h = document.getElementById("hygieneBadge");
    if (h) h.style.display = "none";

    // protect: only storeholder
    if (u.role !== "storeholder") {
      location.href = "home.html";
      return;
    }

    setText("ownerName", u.name || "User");

    const centreId = u.centreId;
    if (!centreId) {
      setText("stallName", "No centre linked");
      setStatus("❌ No centreId in user profile.");
      return;
    }

    // show stall name (still from centres path)
    const stallRef = doc(db, "centres", centreId, "stalls", user.uid);
    const stallSnap = await getDoc(stallRef);
    if (stallSnap.exists()) {
      const s = stallSnap.data() || {};
      setText("stallName", s.stallName || "—");
    } else {
      setText("stallName", "Stall not found");
    }

    // load last seen timestamp (for red dot)
    lastSeenMs = loadLastSeen(user.uid);

    // find public stall id and listen
    const publicStallId = await findPublicStallId(centreId, user.uid);
    listenReviewsPublic(publicStallId);
  } catch (err) {
    console.error("stall-review.js error:", err);
    setStatus("❌ Something went wrong loading reviews.");
  }
});
