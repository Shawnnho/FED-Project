// stall-dashboard.js (FULL FIXED)
// - Removes broken storeholder-context lines
// - Loads real orders from Firestore:
//   centres/{centreId}/stalls/{uid}/orders
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

/* helpers */
const $ = (id) => document.getElementById(id);

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
  if (v === "inprogress" || v === "in_progress") return "in-progress";
  return v;
}

/* UI state */
let activeStatus = "pending"; // default tab
let allOrders = []; // latest snapshot
let unsubOrders = null; // to clean up listener

/* =========================
   RENDER
========================= */
function renderOrdersTable() {
  const qtxt = ($("searchInput")?.value || "").trim().toLowerCase();

  const filtered = allOrders
    .filter((o) => !activeStatus || o.status === activeStatus)
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
      <td style="padding:10px;">${o.customer}</td>
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
}

/* Convert Firestore order doc -> UI row */
function mapOrderDoc(d) {
  const data = d.data() || {};
  const status = normStatus(data.status);

  // Order ID shown in UI: prefer data.orderId / data.orderNo / fallback to doc id
  const displayId =
    data.orderId ||
    data.orderNo ||
    (d.id.length > 10 ? `#${d.id.slice(0, 6)}` : `#${d.id}`);

  // Customer: prefer customerName / name / email
  const customer = data.customerName || data.name || data.customerEmail || "—";

  // Items: support array items [{name, qty}] or string
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

  // Amount: prefer total / amount / subtotal
  const amount =
    Number(data.totalAmount) ||
    Number(data.total) ||
    Number(data.amount) ||
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
  };
}

/* =========================
   FIRESTORE: listen to orders
========================= */
function listenOrders(centreId, ownerUid) {
  // orders path: centres/{centreId}/stalls/{ownerUid}/orders
  const ordersCol = collection(
    db,
    "centres",
    centreId,
    "stalls",
    ownerUid,
    "orders",
  );
  const q = query(ordersCol, orderBy("createdAt", "desc"), limit(50));

  // clean previous
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

      renderOrdersTable();

      newOnes.forEach((o) => {
        const row = document
          .querySelector(`[data-oid="${o.docId}"]`)
          ?.closest("tr");
        row?.classList.add("orderNew");
      });
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
async function bulkUpdateStatus(centreId, ownerUid, newStatus) {
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

    const ref = doc(
      db,
      "centres",
      centreId,
      "stalls",
      ownerUid,
      "orders",
      docId,
    );
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

// Search
$("searchInput")?.addEventListener("input", renderOrdersTable);

// Bulk check all
$("bulkCheckAll")?.addEventListener("change", (e) => {
  const on = !!e.target.checked;
  document.querySelectorAll(".orderCheck").forEach((cb) => {
    cb.checked = on;
  });
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

    // centres/{centreId}/stalls/{uid}
    const stallRef = doc(db, "centres", centreId, "stalls", user.uid);
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
        await bulkUpdateStatus(centreId, user.uid, sel);
      } catch (err) {
        console.error(err);
        alert("Bulk update failed. Check Firestore rules.");
      }
    });

    // Start listening to real orders
    listenOrders(centreId, user.uid);
  } catch (err) {
    console.error("stall-dashboard.js error:", err);
    const body = $("ordersBody");
    if (body) {
      body.innerHTML = `<tr><td colspan="7" style="padding:14px;">Something went wrong loading dashboard.</td></tr>`;
    }
  }
});
