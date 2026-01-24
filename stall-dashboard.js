// stall-dashboard.js (UPDATED FULL FILE)
// ✅ Fix: store name was "—" because JS was updating #stallTitle but HTML uses #stallName

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

const $ = (id) => document.getElementById(id);

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value ?? "—";
}

let activeStatus = "pending";

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

    setText("ownerName", `${u.name || "User"} (Owner)`);

    // centres/{centreId}/stalls/{uid}
    const centreId = u.centreId;
    if (!centreId) {
      setText("stallName", "No centre linked");
      return;
    }

    const stallSnap = await getDoc(
      doc(db, "centres", centreId, "stalls", user.uid),
    );
    if (stallSnap.exists()) {
      const s = stallSnap.data();

      // ✅ FIX HERE: HTML uses id="stallName"
      setText("stallName", s.stallName || "—");
    } else {
      setText("stallName", "Stall not found");
    }

    // TODO: Replace with real counts when you have real data sources
    setText("orderBadge", 0);
    setText("reviewBadge", 0);
    setText("analyticsBadge", 0);
    setText("hygieneBadge", 0);

    renderMockOrders();
  } catch (err) {
    console.error("stall-dashboard.js error:", err);
  }
});

/* =========================
   MOCK DATA (so UI shows)
   Replace later with Firestore orders
========================= */
const MOCK = [
  {
    id: "#10514",
    customer: "Marcus Ng",
    status: "pending",
    item: "2x Chicken Rice (Steam)",
    amount: 11.0,
  },
  {
    id: "#10513",
    customer: "Ryan Ng",
    status: "in-progress",
    item: "1x Chicken Rice (Steam)",
    amount: 5.5,
  },
  {
    id: "#10512",
    customer: "Ben Goh",
    status: "completed",
    item: "2x Chicken Rice (Roasted)",
    amount: 11.0,
  },
  {
    id: "#10511",
    customer: "Damien Tan",
    status: "completed",
    item: "6x Chicken Rice (Roasted)",
    amount: 33.0,
  },
  {
    id: "#10510",
    customer: "Shawn",
    status: "cancelled",
    item: "1x Chicken Rice (Mixed)",
    amount: 7.0,
  },
];

function prettyStatus(s) {
  if (s === "pending") return "Pending";
  if (s === "in-progress") return "In Progress";
  if (s === "completed") return "Completed";
  if (s === "cancelled") return "Cancelled";
  return s;
}

function renderMockOrders() {
  const q = ($("searchInput")?.value || "").trim().toLowerCase();

  const list = MOCK.filter(
    (o) => !activeStatus || o.status === activeStatus,
  ).filter(
    (o) =>
      !q ||
      o.id.toLowerCase().includes(q) ||
      o.customer.toLowerCase().includes(q),
  );

  // stats
  const pending = MOCK.filter((o) => o.status === "pending").length;
  const prog = MOCK.filter((o) => o.status === "in-progress").length;
  const cancelled = MOCK.filter((o) => o.status === "cancelled").length;
  const sales = MOCK.filter((o) => o.status === "completed").reduce(
    (sum, o) => sum + o.amount,
    0,
  );

  setText("statPending", `${pending} Pending Orders`);
  setText("statProgress", `${prog} In Progress Orders`);
  setText("statCancelled", `${cancelled} Cancelled Orders`);
  setText("statSales", `$${sales.toFixed(2)} Total Sales`);

  const body = $("ordersBody");
  if (!body) return;

  body.innerHTML = "";
  if (list.length === 0) {
    body.innerHTML = `<tr><td colspan="7" style="padding:14px;">No matching orders</td></tr>`;
    return;
  }

  for (const o of list) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="padding:10px;"><input type="checkbox" class="orderCheck" /></td>
      <td style="padding:10px;">${o.id}</td>
      <td style="padding:10px;">${o.customer}</td>
      <td style="padding:10px;"><span class="prep">${prettyStatus(o.status)}</span></td>
      <td style="padding:10px;">${o.item}</td>
      <td style="padding:10px;">$${o.amount.toFixed(2)}</td>
      <td style="padding:10px;"><button class="btn small primary" type="button">View Order</button></td>
    `;
    body.appendChild(tr);
  }
}

/* =========================
   UI EVENTS
========================= */

// tabs (buttons must have class="tabBtn" and data-status="pending|in-progress|completed|cancelled")
document.querySelectorAll(".tabBtn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".tabBtn")
      .forEach((b) => b.classList.remove("primary"));
    btn.classList.add("primary");
    activeStatus = btn.dataset.status || "";
    renderMockOrders();
  });
});

// search
$("searchInput")?.addEventListener("input", renderMockOrders);

// logout
$("logoutBtn")?.addEventListener("click", async () => {
  await signOut(auth);
  location.href = "signin.html";
});
