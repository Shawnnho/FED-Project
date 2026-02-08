// stall-dashboard.js (FULL FIXED)
// - Removes broken storeholder-context lines
// - Updates stats + table + bulk status update

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
  addDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  updateDoc,
  writeBatch,
  serverTimestamp,
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

// =========================
// REVIEW BADGE (NEW FEEDBACK) — FIXED FOR /stalls/{stallId}/reviews
// =========================
function listenReviewBadge(stallUid) {
  const badge = document.getElementById("reviewBadge");
  if (!badge) return;

  const reviewsCol = collection(db, "stalls", stallUid, "reviews");
  const q = query(reviewsCol, orderBy("createdAt", "desc"), limit(1));

  onSnapshot(q, (snap) => {
    if (snap.empty) {
      badge.style.display = "none";
      badge.classList.remove("isNew");
      return;
    }

    const data = snap.docs[0].data() || {};
    const latestMs = data.createdAt?.toMillis ? data.createdAt.toMillis() : 0;

    const lastSeenMs = loadLastSeen(stallUid);

    // show dot only if newest review is newer than what Review page saved
    const hasNew = latestMs > lastSeenMs;

    badge.style.display = hasNew ? "grid" : "none";
    badge.classList.toggle("isNew", hasNew);
    badge.textContent = "";
  });
}

/* helpers */
const $ = (id) => document.getElementById(id);

// =========================
// CUSTOMER NAME LOOKUP (CACHE)
// =========================
const customerCache = new Map();

async function getCustomerName(uid) {
  if (!uid) return "—";
  if (customerCache.has(uid)) return customerCache.get(uid);

  const snap = await getDoc(doc(db, "users", uid));
  const name = snap.exists()
    ? snap.data()?.name || snap.data()?.email || "—"
    : "—";

  customerCache.set(uid, name);
  return name;
}

/* ===== REVIEW LAST-SEEN HELPERS ===== */
function storageKey(uid) {
  return `hp:lastSeenReviewMs:${uid}`;
}

function loadLastSeen(uid) {
  const raw = localStorage.getItem(storageKey(uid));
  const ms = Number(raw);
  return Number.isFinite(ms) ? ms : 0;
}

function showToast(msg) {
  let t = document.querySelector(".toast");
  if (!t) {
    t = document.createElement("div");
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");

  setTimeout(() => t.classList.remove("show"), 2500);
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value ?? "—";
}

function setBadge(id, value) {
  const el = document.getElementById(id);
  if (!el) return;

  const n = Number(value) || 0;

  if (n > 0) {
    el.textContent = String(n);
    el.style.display = "grid"; // matches your .shBadge display: grid
  } else {
    el.textContent = "";
    el.style.display = "none";
    el.classList.remove("isNew"); // safety: removes red dot if any
  }
}

function money(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "$0.00";
  return `$${x.toFixed(2)}`;
}

function prettyStatus(s) {
  if (s === "pending") return "Pending";
  if (s === "in-progress") return "In Progress";
  if (s === "completed") return "Completed";
  if (s === "cancelled") return "Cancelled";
  return s || "—";
}

function normStatus(s) {
  const v = String(s || "").toLowerCase();

  // map real order statuses -> dashboard tabs
  if (v === "pending_payment") return "pending";
  if (v === "paid" || v === "preparing" || v === "ready") return "in-progress";
  if (v === "completed") return "completed";
  if (v === "cancelled") return "cancelled";

  // keep existing normalization
  if (v === "inprogress" || v === "in_progress") return "in-progress";
  return v;
}

/* UI state */
let activeStatus = ""; // default tab
let allOrders = []; // latest snapshot
let unsubOrders = null; // to clean up listener

//  Filters state (Apply Filter button)
let activeDate = ""; // today | yesterday | last7 | thisMonth | lastMonth | all
let activeYear = ""; // "2026", "2025", ...

function toDateKey(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  // YYYY-MM-DD (local)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function inDateRange(createdAt, mode) {
  if (!mode || mode === "all") return true;
  if (!createdAt) return false;

  const d = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
  const now = new Date();

  const today0 = startOfToday();
  const msDay = 24 * 60 * 60 * 1000;

  if (mode === "today") return d >= today0;

  if (mode === "yesterday") {
    const y0 = new Date(today0.getTime() - msDay);
    return d >= y0 && d < today0;
  }

  if (mode === "last7") {
    const from = new Date(now.getTime() - 7 * msDay);
    return d >= from;
  }

  if (mode === "thisMonth") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return d >= from;
  }

  if (mode === "lastMonth") {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 1);
    return d >= from && d < to;
  }

  return true;
}

function rebuildFilterOptions() {
  // Year options from loaded orders
  const years = new Set();
  const cuisines = new Set();

  for (const o of allOrders) {
    const d = o.createdAt?.toDate
      ? o.createdAt.toDate()
      : o.createdAt
        ? new Date(o.createdAt)
        : null;
    if (d && Number.isFinite(d.getTime())) years.add(String(d.getFullYear()));
    if (o.cuisine) cuisines.add(o.cuisine);
  }

  //  Date dropdown static options
  const dateSel = $("dateFilter");
  if (dateSel) {
    dateSel.innerHTML = `
      <option value="">Date</option>
      <option value="today">Today</option>
      <option value="yesterday">Yesterday</option>
      <option value="last7">Last 7 days</option>
      <option value="thisMonth">This month</option>
      <option value="lastMonth">Last month</option>
      <option value="all">All time</option>
    `;
    if (activeDate) dateSel.value = activeDate;
  }

  //  Year dropdown from orders
  const yearSel = $("yearFilter");
  if (yearSel) {
    const sorted = Array.from(years).sort((a, b) => Number(b) - Number(a));
    yearSel.innerHTML =
      `<option value="">Year</option>` +
      sorted.map((y) => `<option value="${y}">${y}</option>`).join("");
    if (activeYear) yearSel.value = activeYear;
  }

  //  Cuisine dropdown from orders (if none, keep just placeholder)
  const cuisineSel = $("cuisineFilter");
  if (cuisineSel) {
    const sorted = Array.from(cuisines).sort((a, b) => a.localeCompare(b));
    cuisineSel.innerHTML =
      `<option value="">Cuisine</option>` +
      sorted.map((c) => `<option value="${c}">${c}</option>`).join("");
    if (activeCuisine) cuisineSel.value = activeCuisine;
  }
}

/* =========================
   RENDER
========================= */
function renderOrdersTable() {
  const qtxt = ($("searchInput")?.value || "").trim().toLowerCase();

  const filtered = allOrders
    .filter((o) => !activeStatus || o.status === activeStatus)

    // Year filter
    .filter((o) => {
      if (!activeYear) return true;
      const d = o.createdAt?.toDate
        ? o.createdAt.toDate()
        : o.createdAt
          ? new Date(o.createdAt)
          : null;
      return d && String(d.getFullYear()) === String(activeYear);
    })

    //  Date filter
    .filter((o) => inDateRange(o.createdAt, activeDate))

    //  Search filter
    .filter((o) => {
      if (!qtxt) return true;
      return (
        String(o.id || "")
          .toLowerCase()
          .includes(qtxt) ||
        String(o.customer || "")
          .toLowerCase()
          .includes(qtxt)
      );
    });

  // Stats from ALL orders (not filtered)
  const pendingCount = allOrders.filter((o) => o.status === "pending").length;
  const progCount = allOrders.filter((o) => o.status === "in-progress").length;
  const cancelledCount = allOrders.filter(
    (o) => o.status === "cancelled",
  ).length;

  // Total sales (completed only)
  const sales = allOrders
    .filter((o) => o.status === "completed")
    .reduce((sum, o) => sum + (Number(o.amount) || 0), 0);

  // Your HTML uses these ids (statPendingNum etc.)
  setText("statPendingNum", pendingCount);
  setText("statProgressNum", progCount);
  setText("statCancelledNum", cancelledCount);
  setText("statSalesNum", money(sales));

  // Sidebar badge (you can change this to something else)
  setBadge("orderBadge", pendingCount);

  // Table
  const body = $("ordersBody");
  if (!body) return;

  body.innerHTML = "";

  if (filtered.length === 0) {
    body.innerHTML = `<tr><td colspan="7" style="padding:14px;">🍜 No orders yet. Waiting for customers…
</td></tr>`;
    return;
  }

  for (const o of filtered) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="padding:10px;">
        <input type="checkbox" class="orderCheck" data-oid="${o.docId}" />
      </td>
      <td style="padding:10px;">${o.id}</td>
      <td style="padding:10px;">
  <span data-customer-uid="${o.customer}">${o.customer}</span>
</td>
      <td style="padding:10px;"><span class="prep ${prettyStatus(o.status)}">${prettyStatus(o.status)}</span>
</td>
      <td style="padding:10px;">${o.item}</td>
      <td style="padding:10px;">${money(o.amount)}</td>
      <td style="padding:10px;">
        <button class="btn small primary" type="button" data-view="${o.docId}">
          View Order
        </button>
      </td>
    `;
    body.appendChild(tr);
  }

  // Replace customer UID with real name (must run AFTER rows are rendered)
  document
    .querySelectorAll("#ordersBody [data-customer-uid]")
    .forEach(async (el) => {
      const uid = el.getAttribute("data-customer-uid");
      if (!uid || uid === "—") return;

      // UID is long; real names are short
      if (uid.length < 20) return;

      const name = await getCustomerName(uid);
      el.textContent = name;
    });
}

/* Convert Firestore order doc -> UI row */
function mapOrderDoc(d) {
  const data = d.data() || {};
  const status = normStatus(data.status);

  // Display order id
  const displayId =
    data.orderNo ||
    data.orderId ||
    (d.id.length > 10
      ? `#${d.id.slice(-6).toUpperCase()}`
      : `#${d.id.toUpperCase()}`);

  const customer =
    data.customerName ||
    data.customer?.name ||
    data.customer?.displayName ||
    data.customerEmail ||
    data.customer?.email ||
    data.email ||
    data.name ||
    data.uid ||
    data.userId ||
    data.customerUid ||
    data.customerId ||
    "—";

  //  Item summary (support your stall-orders items shape)
  let itemSummary = "—";
  if (Array.isArray(data.items) && data.items.length) {
    const first = data.items[0];
    const firstName = first?.name || first?.title || "Item";
    const firstQty = Number(first?.qty ?? first?.quantity ?? 1) || 1;

    if (data.items.length === 1) {
      itemSummary = `${firstQty}x ${firstName}`;
    } else {
      itemSummary = `${firstQty}x ${firstName} + ${data.items.length - 1} more`;
    }
  } else if (typeof data.item === "string") {
    itemSummary = data.item;
  }

  //  Amount (your stall-orders uses pricing.total)
  const pricing = data.pricing || {};
  const amount =
    Number(pricing.total) ||
    Number(data.totalAmount) ||
    Number(data.total) ||
    Number(data.amount) ||
    Number(pricing.subtotal) ||
    Number(data.subtotal) ||
    0;

  return {
    docId: d.id,
    id: displayId,
    customer,
    status: status || "pending",
    item: itemSummary,
    amount,
    createdAt: data.createdAt || null,

    cuisine: data.cuisine || data.stallCuisine || data.cuisineType || "",
  };
}

/* =========================
   FIRESTORE: listen to orders
========================= */
function listenOrdersTopLevel(stallId) {
  const ordersCol = collection(db, "orders");
  const q = query(
    ordersCol,
    where("stallId", "==", stallId),
    orderBy("createdAt", "desc"),
    limit(50),
  );

  if (typeof unsubOrders === "function") unsubOrders();

  unsubOrders = onSnapshot(
    q,
    (snap) => {
      const prevIds = new Set(allOrders.map((o) => o.docId));
      allOrders = snap.docs.map(mapOrderDoc);

      const newOnes = allOrders.filter((o) => !prevIds.has(o.docId));
      if (newOnes.length) {
        showToast(
          `🆕 ${newOnes.length} new order${newOnes.length > 1 ? "s" : ""}`,
        );
      }
      rebuildFilterOptions();
      renderOrdersTable();
    },
    (err) => {
      console.error("Orders snapshot error:", err);
      const body = $("ordersBody");
      if (body) {
        body.innerHTML = `<tr><td colspan="7" style="padding:14px;">Failed to load orders. Check Firestore rules.</td></tr>`;
      }
    },
  );
}

/* =========================
   BULK UPDATE STATUS
========================= */
async function bulkUpdateStatus(newStatus) {
  const checks = Array.from(document.querySelectorAll(".orderCheck:checked"));
  if (checks.length === 0) {
    alert("Select at least 1 order first.");
    return;
  }
  if (!newStatus) {
    alert("Choose a status in Bulk Action.");
    return;
  }

  const batch = writeBatch(db);

  for (const cb of checks) {
    const docId = cb.dataset.oid;
    if (!docId) continue;

    const ref = doc(db, "orders", docId);

    batch.update(ref, {
      status: newStatus,
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();

  // uncheck all
  $("bulkCheckAll") && ($("bulkCheckAll").checked = false);
  checks.forEach((c) => (c.checked = false));
}

/* =========================
   EVENTS
========================= */

// Tabs
document.querySelectorAll(".tabBtn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".tabBtn")
      .forEach((b) => b.classList.remove("primary"));
    btn.classList.add("primary");
    activeStatus = btn.dataset.status || "";
    renderOrdersTable();
  });
});

// Apply Filter
$("applyFilterBtn")?.addEventListener("click", () => {
  activeCuisine = $("cuisineFilter")?.value || "";
  activeDate = $("dateFilter")?.value || "";
  activeYear = $("yearFilter")?.value || "";
  renderOrdersTable();
});

// Search
$("searchInput")?.addEventListener("input", renderOrdersTable);

// Bulk check all
$("bulkCheckAll")?.addEventListener("change", (e) => {
  const on = !!e.target.checked;
  document.querySelectorAll(".orderCheck").forEach((cb) => {
    cb.checked = on;
  });
});

// View Order button (table) — EVENT DELEGATION
$("ordersBody")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-view]");
  if (!btn) return;

  const orderId = btn.getAttribute("data-view");
  if (!orderId) return;

  // Go to your working order details page
  window.location.href = `stall-orders.html?orderId=${encodeURIComponent(orderId)}`;
});

// Logout
$("logoutBtn")?.addEventListener("click", async () => {
  await signOut(auth);
  location.href = "signin.html";
});

/* =========================
   AUTH + LOAD HEADER DATA
========================= */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    location.href = "signin.html";
    return;
  }

  try {
    // users/{uid}
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      await signOut(auth);
      location.href = "signin.html";
      return;
    }

    const u = userSnap.data();

    // protect: only storeholder
    if (u.role !== "storeholder") {
      location.href = "home.html";
      return;
    }

    // top bar labels
    setText("ownerName", u.name || "User");

    const centreId = u.centreId;
    if (!centreId) {
      setText("stallName", "No centre linked");
      return;
    }
    listenReviewBadge(user.uid);

    // centres/{centreId}/stalls/{uid}
    const stallRef = doc(db, "centres", centreId, "stalls", u.stallId);
    const stallSnap = await getDoc(stallRef);

    if (stallSnap.exists()) {
      const s = stallSnap.data();
      setText("stallName", s.stallName || "—");
    } else {
      setText("stallName", "Stall not found");
    }

    // Hook up bulk apply now that we know centreId + uid
    $("bulkApplyBtn")?.addEventListener("click", async () => {
      const sel = $("bulkActionSelect")?.value || "";
      try {
        await bulkUpdateStatus(sel);
      } catch (err) {
        console.error(err);
        alert("Bulk update failed. Check Firestore rules.");
      }
    });

    // Start listening to real orders
    const stallId = u.stallId;
    if (!stallId) {
      setText("stallName", "No stall linked");
      return;
    }
    listenOrdersTopLevel(stallId);
  } catch (err) {
    console.error("stall-dashboard.js error:", err);
    const body = $("ordersBody");
    if (body) {
      body.innerHTML = `<tr><td colspan="7" style="padding:14px;">Something went wrong loading dashboard.</td></tr>`;
    }
  }
});
