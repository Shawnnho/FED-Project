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
  getDocs,
  collection,
  query,
  where,
  orderBy,
  setDoc,
  Timestamp,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ✅ CONFIG */
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

/* =========================
   State
========================= */
let UID = null;
let USERDOC = null;

let CENTRES = []; // centres owned by operator
let SELECTED_CENTRE_ID = null;

let stallsRaw = [];
let rentalsRaw = [];
let ordersRaw = []; // for revenue
let billsByStall = {}; // { [stallId]: operatorBillForMonth }

let stallFilter = "all";

/* =========================
   Helpers
========================= */
function parseYMD(s) {
  // "2026-02-05" -> local date (not UTC)
  const [y, m, d] = String(s || "")
    .split("-")
    .map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function formatYMD(dateObj) {
  if (!dateObj) return "-";
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function computeEndInclusiveFromStart(startYMD) {
  const start = parseYMD(startYMD);
  if (!start) return "-";

  const end = new Date(start);
  end.setMonth(end.getMonth() + 1); // ✅ +1 month
  end.setDate(end.getDate() - 1); // inclusive end

  return formatYMD(end);
}

const safeLower = (x) => String(x || "").toLowerCase();

function setBadge(id, count) {
  const el = document.getElementById(id);
  if (!el) return;
  if (count > 0) {
    el.style.display = "grid";
    el.textContent = String(count);
  } else {
    el.style.display = "none";
  }
}

function markChipActive(prefixId, activeId) {
  document
    .querySelectorAll(`[id^="${prefixId}"]`)
    .forEach((b) => b.classList.remove("active"));
  const el = document.getElementById(activeId);
  if (el) el.classList.add("active");
}

function toMs(ts) {
  if (!ts) return 0;
  if (ts.toDate) return ts.toDate().getTime();
  return 0;
}

function money(n) {
  const num = Number(n || 0);
  return num.toLocaleString(undefined, { style: "currency", currency: "SGD" });
}

function badgeForStallActive(active) {
  return active
    ? `<span class="badge green">Active</span>`
    : `<span class="badge red">Inactive</span>`;
}

function centreNameById(id) {
  const c = CENTRES.find((x) => x.id === id);
  return c?.name || id;
}

/* =========================
   Auth + Role guard
========================= */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  UID = user.uid;

  const snap = await getDoc(doc(db, "users", UID));
  if (!snap.exists()) {
    alert("No users/{uid} profile found.");
    await signOut(auth);
    window.location.href = "index.html";
    return;
  }

  USERDOC = snap.data();
  if (safeLower(USERDOC.role) !== "operator") {
    alert("Access denied: operator only.");
    await signOut(auth);
    window.location.href = "index.html";
    return;
  }

  const opUserLine = document.getElementById("opUserLine");
  if (opUserLine)
    opUserLine.textContent = USERDOC.name || user.email || "Operator";

  await loadCentres();
  await preloadRevenueForCentres(); // loads orders once and computes revenue per centre
  renderCentres();
  updateOverview();
  switchTab("centres");
});

/* =========================
   Centres
   centres/{centreId}.operatorId == UID
========================= */
async function loadCentres() {
  const sel = document.getElementById("centreSelect");
  if (sel)
    sel.innerHTML = `<option value="" disabled selected>Loading centres...</option>`;

  const q1 = query(collection(db, "centres"), where("operatorId", "==", UID));
  const snap = await getDocs(q1);

  CENTRES = snap.docs.map((d) => ({ id: d.id, ...d.data(), revenue: 0 }));

  if (!sel) return;

  if (CENTRES.length === 0) {
    sel.innerHTML = `<option value="" disabled selected>No centres assigned</option>`;
    setBadge("badgeCentres", 0);
    return;
  }

  let options = `<option value="" disabled selected>Select Centre</option>`;
  for (const c of CENTRES) {
    const name = c.name || c.id;
    options += `<option value="${c.id}">${name}</option>`;
  }
  sel.innerHTML = options;

  setBadge("badgeCentres", CENTRES.length);
}

window.onCentreChange = async () => {
  const sel = document.getElementById("centreSelect");
  SELECTED_CENTRE_ID = sel?.value || null;

  const title = document.getElementById("centreTitle");
  if (title) {
    title.textContent = SELECTED_CENTRE_ID
      ? `Centre — ${centreNameById(SELECTED_CENTRE_ID)}`
      : "Operator Dashboard";
  }

  await loadStalls();
  await loadRentals();
};

/* =========================
   Tab switching
========================= */
window.switchTab = async (tabName) => {
  document
    .querySelectorAll(".op-tab")
    .forEach((el) => el.classList.remove("active"));
  document
    .querySelectorAll(".op-menu li")
    .forEach((el) => el.classList.remove("active"));

  const tab = document.getElementById(`tab-${tabName}`);
  if (tab) tab.classList.add("active");

  const index = ["centres", "stalls", "rentals"].indexOf(tabName);
  const li = document.querySelectorAll(".op-menu li")[index];
  if (li) li.classList.add("active");

  if (tabName === "centres") {
    renderCentres();
    updateOverview();
    return;
  }

  if (!SELECTED_CENTRE_ID) return;

  if (tabName === "stalls") await loadStalls();
  if (tabName === "rentals") await loadRentals();
};

/* =========================
   Revenue (orders)
   orders: { centreId, total, createdAt }
========================= */
async function preloadRevenueForCentres() {
  // Build map: stallId -> centreId for centres owned by this operator
  const stallToCentre = {};

  await Promise.all(
    CENTRES.map(async (c) => {
      const stallsSnap = await getDocs(
        collection(db, "centres", c.id, "stalls"),
      );
      stallsSnap.forEach((d) => {
        const s = d.data() || {};

        // use your canonical stall doc id (e.g. "asia-wok", "fat-buddies")
        const stallId = s.publicStallId;

        if (stallId) {
          stallToCentre[stallId] = c.id;
        }
      });
    }),
  );

  // Load orders once
  const ordersSnap = await getDocs(collection(db, "orders"));
  ordersRaw = ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Sum revenue per centre
  const byCentre = {};

  for (const o of ordersRaw) {
    // Only completed
    const status = String(o.status || "").toLowerCase();
    if (status !== "completed") continue;

    // Your order has stallId at root
    const stallId = o.stallId;
    const centreId = stallToCentre[stallId];
    if (!centreId) continue; // skip orders not belonging to this operator's centres

    // Your order total is pricing.total
    const total = Number(o.pricing?.total ?? 0);
    if (!Number.isFinite(total)) continue;

    byCentre[centreId] = (byCentre[centreId] || 0) + total;
  }

  // Attach back to centres
  CENTRES = CENTRES.map((c) => ({ ...c, revenue: byCentre[c.id] || 0 }));
}

/* =========================
   Centres UI
========================= */
window.renderCentres = async () => {
  const list = document.getElementById("centreList");
  if (!list) return;

  const q = safeLower(document.getElementById("centreSearch")?.value || "");
  const sortMode = document.getElementById("centreSort")?.value || "az";

  let items = CENTRES.slice();

  if (q) {
    items = items.filter((c) => safeLower(c.name || c.id).includes(q));
  }

  items.sort((a, b) => {
    const A = safeLower(a.name || a.id);
    const B = safeLower(b.name || b.id);

    if (sortMode === "za") return B.localeCompare(A);
    if (sortMode === "revenueDesc") return (b.revenue || 0) - (a.revenue || 0);
    if (sortMode === "revenueAsc") return (a.revenue || 0) - (b.revenue || 0);
    return A.localeCompare(B);
  });

  if (items.length === 0) {
    list.innerHTML = "<p>No centres found.</p>";
    return;
  }

  list.innerHTML = items
    .map((c) => {
      const name = c.name || c.id;
      const addr = c.address ? `<p class="muted">${c.address}</p>` : "";
      const rev = money(c.revenue || 0);

      return `
        <div class="op-item">
          <div class="item-main">
            <h4>${name}</h4>
            <span class="badge blue">Revenue: ${rev}</span>
          </div>
          ${addr}
          <div class="actions-row">
            <button class="btn-mini primary" onclick="selectCentreAndGo('${c.id}','stalls')">
              View Stalls
            </button>
            <button class="btn-mini gray" onclick="selectCentreAndGo('${c.id}','rentals')">
              View Agreements
            </button>
          </div>
        </div>
      `;
    })
    .join("");
};

window.selectCentreAndGo = async (centreId, tab) => {
  SELECTED_CENTRE_ID = centreId;

  const sel = document.getElementById("centreSelect");
  if (sel) sel.value = centreId;

  const title = document.getElementById("centreTitle");
  if (title) title.textContent = `Centre — ${centreNameById(centreId)}`;

  if (tab === "stalls") await loadStalls();
  if (tab === "rentals") await loadRentals();

  switchTab(tab);
};

async function updateOverview() {
  // total stalls and active stalls across all centres
  let totalStalls = 0;
  let activeStalls = 0;
  let totalRentals = 0;
  let totalRevenue = 0;

  // revenue
  for (const c of CENTRES) totalRevenue += Number(c.revenue || 0);

  // stalls + rentals (we’ll aggregate by reading per centre)
  // (fine for school project size; if huge, we can optimize later)
  for (const c of CENTRES) {
    const stallsSnap = await getDocs(collection(db, "centres", c.id, "stalls"));
    const stalls = stallsSnap.docs.map((d) => d.data());
    totalStalls += stalls.length;
    activeStalls += stalls.filter((s) => s.active !== false).length;

    const rentalsSnap = await getDocs(
      query(collection(db, "rentalAgreements"), where("centreId", "==", c.id)),
    );
    totalRentals += rentalsSnap.size;
  }

  const setText = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(v);
  };

  setText("ovCentres", CENTRES.length);
  setText("ovRevenue", money(totalRevenue));
  setText("ovStalls", totalStalls);
  setText("ovActiveStalls", activeStalls);
  setText("ovRentals", totalRentals);

  setBadge("badgeStalls", totalStalls);
  setBadge("badgeRentals", totalRentals);
}

/* =========================
   Stalls (per selected centre)
   centres/{centreId}/stalls
========================= */
async function loadStalls() {
  const list = document.getElementById("stallList");
  if (!SELECTED_CENTRE_ID) {
    if (list) list.innerHTML = "<p>Select a centre first.</p>";
    return;
  }
  if (list) list.innerHTML = "<p>Loading stalls...</p>";

  const snap = await getDocs(
    collection(db, "centres", SELECTED_CENTRE_ID, "stalls"),
  );
  stallsRaw = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  renderStalls();
}

window.setStallFilter = (mode) => {
  stallFilter = mode;
  markChipActive(
    "stallFilter",
    mode === "all"
      ? "stallFilterAll"
      : mode === "active"
        ? "stallFilterActive"
        : "stallFilterInactive",
  );
  renderStalls();
};

window.renderStalls = () => {
  const list = document.getElementById("stallList");
  if (!list) return;

  const q = safeLower(document.getElementById("stallSearch")?.value || "");
  const sortMode = document.getElementById("stallSort")?.value || "az";

  let items = stallsRaw.slice();

  items = items.filter((s) => {
    const active = s.active !== false;
    if (stallFilter === "active") return active;
    if (stallFilter === "inactive") return !active;
    return true;
  });

  if (q) {
    items = items.filter(
      (s) =>
        safeLower(s.stallName).includes(q) || safeLower(s.cuisine).includes(q),
    );
  }

  items.sort((a, b) => {
    const A = safeLower(a.stallName || a.id);
    const B = safeLower(b.stallName || b.id);
    return sortMode === "za" ? B.localeCompare(A) : A.localeCompare(B);
  });

  if (items.length === 0) {
    list.innerHTML = "<p>No stalls found.</p>";
    return;
  }

  list.innerHTML = items
    .map((s) => {
      const active = s.active !== false;
      return `
        <div class="op-item">
          <div class="item-main">
            <h4>${s.stallName || "Unnamed Stall"}</h4>
            ${badgeForStallActive(active)}
          </div>
          <p>Cuisine: ${s.cuisine || "-"}</p>
          <div class="item-meta">
            <span>Hygiene Grade: <b>${s.hygieneGrade || "—"}</b></span>
          </div>
        </div>
      `;
    })
    .join("");
};

/* =========================
   Rentals (per selected centre)
   rentalAgreements: { centreId, stallName, ownerName, monthlyRent, startDate, endDate, createdAt }
========================= */

function looksLikeUid(id) {
  return typeof id === "string" && id.length >= 20 && !id.includes("-");
}

async function loadRentals() {
  const list = document.getElementById("rentalList");
  if (!SELECTED_CENTRE_ID) {
    if (list) list.innerHTML = "<p>Select a centre first.</p>";
    return;
  }
  if (list) list.innerHTML = "<p>Loading agreements...</p>";

  const q1 = query(
    collection(db, "rentalAgreements"),
    where("centreId", "==", SELECTED_CENTRE_ID),
  );
  const snap = await getDocs(q1);
  rentalsRaw = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  billsByStall = {}; // reset cache

  for (const r of rentalsRaw) {
    if (!r.stallId) continue;

    // 🚫 prevent creating stalls/{UID}
    if (looksLikeUid(r.stallId)) {
      console.warn(
        "❌ rentalAgreements has UID stallId. Fix this rental doc:",
        r.id,
        r.stallId,
      );
      continue;
    }

    // auto-create bill if missing
    await ensureMonthlyBill(r.stallId, r.monthlyRent);

    const billSnap = await getDoc(
      doc(db, "stalls", r.stallId, "operatorBills", monthKey),
    );

    billsByStall[r.stallId] = billSnap.exists() ? billSnap.data() : null;
  }

  renderRentals();
}

window.renderRentals = () => {
  const list = document.getElementById("rentalList");
  if (!list) return;

  const q = safeLower(document.getElementById("rentalSearch")?.value || "");
  const sortMode = document.getElementById("rentalSort")?.value || "newest";

  let items = rentalsRaw.slice();

  if (q) {
    items = items.filter((r) => {
      return (
        safeLower(r.stallName).includes(q) ||
        safeLower(r.ownerName).includes(q) ||
        safeLower(r.stallId).includes(q)
      );
    });
  }

  items.sort((a, b) => {
    if (sortMode === "rentDesc")
      return Number(b.monthlyRent || 0) - Number(a.monthlyRent || 0);
    if (sortMode === "rentAsc")
      return Number(a.monthlyRent || 0) - Number(b.monthlyRent || 0);

    const A = toMs(a.createdAt);
    const B = toMs(b.createdAt);
    return sortMode === "oldest" ? A - B : B - A;
  });

  if (items.length === 0) {
    list.innerHTML = "<p>No rental agreements found.</p>";
    return;
  }

  list.innerHTML = items
    .map((r) => {
      // 🚫 hide rentals with bad (UID) stallId so you can't save bills into stalls/{UID}
      if (looksLikeUid(r.stallId)) {
        console.warn("Hiding rental with UID stallId:", r.id, r.stallId);
        return `<div class="ra-card"><p style="color:red">
Bad rentalAgreement: stallId is UID (${r.stallId}). Fix rentalAgreements/${r.id}.
</p></div>`;
      }
      const bill = billsByStall[r.stallId] || {};
      const rent = money(r.monthlyRent || 0);
      const start = r.startDate || "-";
      const end = computeEndInclusiveFromStart(r.startDate);

      return `
  <div class="ra-card">
    <div class="ra-left">
      <h4>${r.stallName || "Unknown Stall"}</h4>
      <p>Owner: <b>${r.ownerName || "-"}</b></p>
      <p class="muted">Stall ID: <b>${r.stallId || "-"}</b></p>

      <div class="item-meta">
        <span>Start: ${start}</span>
        <span>End: ${end}</span>
      </div>
    </div>

    <div class="ra-right">
      <div class="bill-panel">
        <div class="bill-title">Monthly Bill</div>

        <div class="bill-grid">
          <label class="bill-field bill-span-2">
            <span>Rent</span>
            <div class="bill-input-row">
              <input id="rent-${r.id}" type="number"
  value="${Number(bill.rent ?? r.monthlyRent ?? 0)}" />

              <small>/month</small>
            </div>
          </label>

          <label class="bill-field">
            <span>Utilities</span>
            <input id="util-${r.id}" type="number" value="${Number(bill.utilities ?? 0)}" />
          </label>

          <label class="bill-field">
            <span>Cleaning</span>
           <input id="clean-${r.id}" type="number" value="${Number(bill.cleaningFee ?? 0)}" />
          </label>

          <label class="bill-field">
            <span>Penalty</span>
          <input id="pen-${r.id}" type="number" value="${Number(bill.penalty ?? 0)}" />
          </label>

          <label class="bill-field">
            <span>Other</span>
            <input id="other-${r.id}" type="number" value="${Number(bill.other ?? 0)}" />
          </label>
        </div>

        <button class="bill-save" onclick="saveMonthlyBill('${r.stallId}', '${r.id}')">
          Save Monthly Bill
        </button>
      </div>
    </div>
  </div>
`;
    })
    .join("");
};

async function ensureMonthlyBill(stallId, rent) {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const ref = doc(db, "stalls", stallId, "operatorBills", monthKey);
  const snap = await getDoc(ref);

  if (snap.exists()) return; // already created

  const dueDate = new Date(now.getFullYear(), now.getMonth(), 15);

  await setDoc(ref, {
    month: monthKey,
    rent: Number(rent || 0),
    utilities: 0,
    cleaningFee: 0,
    penalty: 0,
    other: 0,
    total: Number(rent || 0),
    dueDate: Timestamp.fromDate(dueDate),
    status: "unpaid",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

window.saveMonthlyBill = async (stallId, rentalDocId) => {
  // month key like 2026-01
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  try {
    const utilities = Number(document.getElementById(`util-${rentalDocId}`)?.value || 0);
    const cleaningFee = Number(document.getElementById(`clean-${rentalDocId}`)?.value || 0);
    const penalty = Number(document.getElementById(`pen-${rentalDocId}`)?.value || 0);
    const other = Number(document.getElementById(`other-${rentalDocId}`)?.value || 0);
    const rent = Number(document.getElementById(`rent-${rentalDocId}`)?.value || 0);

    const total = rent + utilities + cleaningFee + penalty + other;
    const dueDate = new Date(now.getFullYear(), now.getMonth(), 15);

    // ✅ ONLY the save is inside this try
    await setDoc(
      doc(db, "stalls", stallId, "operatorBills", monthKey),
      {
        month: monthKey,
        rent,
        utilities,
        cleaningFee,
        penalty,
        other,
        total,
        dueDate: Timestamp.fromDate(dueDate),
        status: "unpaid",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    alert(`Saved operator bill for ${monthKey} (Stall ${stallId})`);

  } catch (err) {
    console.error("SAVE BILL FAILED:", err);
    alert(`Save failed: ${err.message}`);
    return; // stop here if save failed
  }
  
  try {
    await loadRentals();
  } catch (err) {
    console.warn("Saved bill but refresh failed:", err?.message || err);
  }
};


/* =========================
   Logout
========================= */
window.logoutOperator = async () => {
  try {
    await signOut(auth);
    window.location.href = "index.html";
  } catch (err) {
    console.error(err);
    alert("Logout failed. Please try again.");
  }
};
