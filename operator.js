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
  limit,
  setDoc,
  addDoc,
  Timestamp,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* CONFIG */
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
// State
let UID = null;
let USERDOC = null;

let CENTRES = [];
let SELECTED_CENTRE_ID = null;

let stallsRaw = [];
let rentalsRaw = [];
let ordersRaw = [];

let billsByStall = {};
let stallFilter = "all";

let modalStalls = [];

// Helpers

const safeLower = (x) => String(x || "").toLowerCase();

function getMonthKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`; // YYYY-MM
}

function parseYMD(s) {
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
  end.setMonth(end.getMonth() + 1);
  end.setDate(end.getDate() - 1);
  return formatYMD(end);
}

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

// stallId safety check
function looksLikeUid(id) {
  return typeof id === "string" && id.length >= 20 && !id.includes("-");
}

// Always resolve to UID for INTERNAL billing (operatorBills / rental)
// - If already UID => use it
// - If slug doc exists => use its ownerUid
function resolveStallUid(stallDocId, stallData) {
  if (!stallDocId) return null;
  if (looksLikeUid(stallDocId)) return stallDocId;

  // slug doc: stalls/{slug}.ownerUid should exist
  const ownerUid = stallData?.ownerUid;
  if (ownerUid && looksLikeUid(ownerUid)) return ownerUid;

  // fallback: if stallData.publicStallId is UID-ish (rare)
  const p = stallData?.publicStallId;
  if (p && looksLikeUid(p)) return p;

  return null;
}

// For Authentication one
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
  await preloadRevenueForCentres();
  renderCentres();
  updateOverview();
  switchTab("centres");
});

//   Centres

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

// Tab switching

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

// Revenue (orders)

async function preloadRevenueForCentres() {
  const stallToCentre = {};

  await Promise.all(
    CENTRES.map(async (c) => {
      const stallsSnap = await getDocs(
        collection(db, "centres", c.id, "stalls"),
      );
      stallsSnap.forEach((d) => {
        const s = d.data() || {};
        // Map UID stall doc id (most common stored in orders)
        stallToCentre[d.id] = c.id;

        if (s.publicStallId) stallToCentre[s.publicStallId] = c.id;
      });
    }),
  );

  const ordersSnap = await getDocs(collection(db, "orders"));
  ordersRaw = ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const byCentre = {};
  for (const o of ordersRaw) {
    const status = String(o.status || "").toLowerCase();
    if (status !== "completed") continue;

    const stallId = o.stallId;
    const centreId = stallToCentre[stallId];
    if (!centreId) continue;

    const total = Number(o.pricing?.total ?? o.total ?? o.totalAmount ?? 0);
    if (!Number.isFinite(total)) continue;

    byCentre[centreId] = (byCentre[centreId] || 0) + total;
  }

  CENTRES = CENTRES.map((c) => ({ ...c, revenue: byCentre[c.id] || 0 }));
}

// Centre UI
window.renderCentres = async () => {
  const list = document.getElementById("centreList");
  if (!list) return;

  const q = safeLower(document.getElementById("centreSearch")?.value || "");
  const sortMode = document.getElementById("centreSort")?.value || "az";

  let items = CENTRES.slice();

  if (q) items = items.filter((c) => safeLower(c.name || c.id).includes(q));

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
  let totalStalls = 0;
  let activeStalls = 0;
  let totalRentals = 0;
  let totalRevenue = 0;

  for (const c of CENTRES) totalRevenue += Number(c.revenue || 0);

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
   + Monthly bills for CURRENT monthKey
========================= */
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

  const monthKey = getMonthKey(new Date());
  billsByStall = {};

  for (const ra of rentalsRaw) {
    if (!ra.stallId) continue;

    // load stall from centres/{centreId}/stalls/{stallId} (works for Maxwell too)
    const stallSnap = await getDoc(
      doc(
        db,
        "centres",
        SELECTED_CENTRE_ID,
        "stalls",
        ra.stallCentreDocId || ra.stallId,
      ),
    );
    const stallDocData = stallSnap.exists() ? stallSnap.data() : null;

    // ALWAYS BILL UNDER UID (safe for both slug stalls + UID stalls)
    let billingStallId = ra.billingUid || ra.stallId;

    // 1) if rental agreement stores a slug like "asia-wok", read stalls/{slug} and use its ownerUid
    if (!looksLikeUid(billingStallId)) {
      const slugSnap = await getDoc(doc(db, "stalls", billingStallId));
      if (slugSnap.exists()) {
        const slugData = slugSnap.data() || {};
        const resolved = resolveStallUid(billingStallId, slugData);
        if (resolved) billingStallId = resolved;
      }
    }

    // 2) if still not UID, try lookup by publicStallId
    if (!looksLikeUid(billingStallId)) {
      const q = query(
        collection(db, "stalls"),
        where("publicStallId", "==", billingStallId),
        limit(1),
      );
      const s = await getDocs(q);
      if (!s.empty) billingStallId = s.docs[0].id;
    }

    await ensureMonthlyBill(billingStallId, ra.monthlyRent, monthKey);

    const billSnap = await getDoc(
      doc(db, "stalls", billingStallId, "operatorBills", monthKey),
    );

    billsByStall[billingStallId] = billSnap.exists() ? billSnap.data() : null;
    ra._billingStallId = billingStallId; // store for UI + save button
  }

  renderRentals(monthKey);
}

window.renderRentals = (monthKeyOverride) => {
  const list = document.getElementById("rentalList");
  if (!list) return;

  const monthKey = monthKeyOverride || getMonthKey(new Date());

  const q = safeLower(document.getElementById("rentalSearch")?.value || "");
  const sortMode = document.getElementById("rentalSort")?.value || "newest";

  let items = rentalsRaw.slice();

  if (q) {
    items = items.filter((ra) => {
      return (
        safeLower(ra.stallName).includes(q) ||
        safeLower(ra.ownerName).includes(q) ||
        safeLower(ra.stallId).includes(q)
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

  setBadge("badgeRentals", items.length);

  if (items.length === 0) {
    list.innerHTML = "<p>No rental agreements found.</p>";
    return;
  }

  list.innerHTML = items
    .map((ra) => {
      const start = ra.startDate || "-";
      const end = computeEndInclusiveFromStart(ra.startDate);

      const stallKey = ra._billingStallId;
      const bill = billsByStall[stallKey] || {};

      return `
        <div class="ra-card">
          <div class="ra-left">
            <h4>${ra.stallName || "Unknown Stall"}</h4>
            <p>Unit No: <b>${ra.unitNo || "-"}</b></p>
           <p class="muted">Stall ID: <b>${stallKey || "-"}</b></p>
            <p class="muted">Owner UID: <b>${ra.ownerUid || "-"}</b></p>

            <div class="item-meta">
              <span>Start: ${start}</span>
              <span>End: ${end}</span>
            </div>
          </div>

          <div class="ra-right">
            <div class="bill-panel">
              <div class="bill-title">Monthly Bill (${monthKey})</div>

              <div class="bill-grid">
                <label class="bill-field bill-span-2">
                  <span>Rent</span>
                  <div class="bill-input-row">
                    <input id="rent-${ra.id}" type="number"
                      value="${Number(bill.rent ?? ra.monthlyRent ?? 0)}" />
                    <small>/month</small>
                  </div>
                </label>

                <label class="bill-field">
                  <span>Utilities</span>
                  <input id="util-${ra.id}" type="number" value="${Number(bill.utilities ?? 0)}" />
                </label>

                <label class="bill-field">
                  <span>Cleaning</span>
                  <input id="clean-${ra.id}" type="number" value="${Number(bill.cleaningFee ?? 0)}" />
                </label>

                <label class="bill-field">
                  <span>Penalty</span>
                  <input id="pen-${ra.id}" type="number" value="${Number(bill.penalty ?? 0)}" />
                </label>

                <label class="bill-field">
                  <span>Other</span>
                  <input id="other-${ra.id}" type="number" value="${Number(bill.other ?? 0)}" />
                </label>
              </div>

<button class="bill-save" onclick="saveMonthlyBill('${stallKey}', '${ra.id}', '${monthKey}')">
  Save Monthly Bill
</button>

            </div>
          </div>
        </div>
      `;
    })
    .join("");
};

async function ensureMonthlyBill(stallId, rent, monthKey) {
  const ref = doc(db, "stalls", stallId, "operatorBills", monthKey);

  let snap;
  try {
    snap = await getDoc(ref);
  } catch (e) {
    console.error("DENIED reading bill doc:", ref.path, e);
    throw e;
  }

  if (snap.exists()) {
    const data = snap.data() || {};
    if (data.centreId !== SELECTED_CENTRE_ID) {
      try {
        await setDoc(ref, { centreId: SELECTED_CENTRE_ID }, { merge: true });
      } catch (e) {
        console.error("DENIED fixing bill doc:", ref.path, e);
        throw e;
      }
    }
    return;
  }

  try {
    await setDoc(ref, {
      stallId,
      centreId: SELECTED_CENTRE_ID,
      month: monthKey,
      rent: Number(rent || 0),
      paid: false,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.error("DENIED creating bill doc:", ref.path, e);
    throw e;
  }
}

window.saveMonthlyBill = async (stallId, rentalDocId, monthKey) => {
  // monthKey is passed from button so UI & write are always same month
  try {
    const utilities = Number(
      document.getElementById(`util-${rentalDocId}`)?.value || 0,
    );
    const cleaningFee = Number(
      document.getElementById(`clean-${rentalDocId}`)?.value || 0,
    );
    const penalty = Number(
      document.getElementById(`pen-${rentalDocId}`)?.value || 0,
    );
    const other = Number(
      document.getElementById(`other-${rentalDocId}`)?.value || 0,
    );
    const rent = Number(
      document.getElementById(`rent-${rentalDocId}`)?.value || 0,
    );

    const total = rent + utilities + cleaningFee + penalty + other;

    const [yy, mm] = monthKey.split("-");
    const dueDate = new Date(Number(yy), Number(mm) - 1, 15, 0, 0, 0, 0);

    await setDoc(
      doc(db, "stalls", stallId, "operatorBills", monthKey),
      {
        centreId: SELECTED_CENTRE_ID,
        month: monthKey,
        rent,
        utilities,
        cleaningFee,
        penalty,
        other,
        total,
        dueDate: Timestamp.fromDate(dueDate),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    alert(`Saved operator bill for ${monthKey} (Stall ${stallId})`);
  } catch (err) {
    console.error("SAVE BILL FAILED:", err);
    alert(`Save failed: ${err.message}`);
    return;
  }

  // refresh list after save
  try {
    await loadRentals();
  } catch (err) {
    console.warn("Saved bill but refresh failed:", err?.message || err);
  }
};

// Add Rental Agreement (Modal)

window.openAddRentalModal = async () => {
  if (!SELECTED_CENTRE_ID) {
    alert("Select a centre first.");
    return;
  }

  // show modal
  const modal = document.getElementById("addRentalModal");
  if (modal) modal.style.display = "grid";

  // default start date to today
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const startInput = document.getElementById("addRentalStartDate");
  if (startInput) startInput.value = `${y}-${m}-${day}`;

  await loadStallsForModal();
};

window.closeAddRentalModal = () => {
  const modal = document.getElementById("addRentalModal");
  if (modal) modal.style.display = "none";
};

async function loadStallsForModal() {
  const sel = document.getElementById("addRentalStallSelect");
  if (!sel) return;

  sel.innerHTML = `<option value="" disabled selected>Loading stalls...</option>`;

  const snap = await getDocs(
    collection(db, "centres", SELECTED_CENTRE_ID, "stalls"),
  );

  modalStalls = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (modalStalls.length === 0) {
    sel.innerHTML = `<option value="" disabled selected>No stalls found for this centre</option>`;
    return;
  }

  // build options
  sel.innerHTML = `<option value="" disabled selected>Select stall...</option>`;
  for (const s of modalStalls) {
    const name = s.stallName || s.id;
    const unit = s.unitNo ? ` (${s.unitNo})` : "";
    sel.innerHTML += `<option value="${s.id}">${name}${unit}</option>`;
  }

  // if the stall has a owner name inputted
  sel.onchange = () => {
    const pickedId = sel.value;
    const stall = modalStalls.find((x) => x.id === pickedId);
    const ownerName = document.getElementById("addRentalOwnerName");
    if (ownerName && stall?.ownerName) ownerName.value = stall.ownerName;
  };
}

window.createRentalAgreementFromModal = async () => {
  if (!SELECTED_CENTRE_ID) return;

  const sel = document.getElementById("addRentalStallSelect");
  const stallDocId = sel?.value;
  if (!stallDocId) {
    alert("Pick a stall first.");
    return;
  }

  const stall = modalStalls.find((x) => x.id === stallDocId) || {};

  const ownerName =
    document.getElementById("addRentalOwnerName")?.value?.trim() || "";
  const monthlyRent = Number(
    document.getElementById("addRentalMonthlyRent")?.value || 0,
  );
  const startDate = document.getElementById("addRentalStartDate")?.value || "";

  if (!ownerName) {
    alert("Owner name is required.");
    return;
  }
  if (!startDate) {
    alert("Start date is required.");
    return;
  }
  if (!Number.isFinite(monthlyRent) || monthlyRent < 0) {
    alert("Monthly rent must be 0 or more.");
    return;
  }

  // ownerUid is nice to have, but NOT required to create an agreement
  if (!stall.ownerUid) {
    console.warn("Creating agreement: stall is missing ownerUid", stallDocId);
  }

  try {
    // Allow creating agreements even if one already exists:

    // Top-level stall id for billing (slug)
    const topLevelStallId = stall.publicStallId || stall.stallId || stallDocId;

    await addDoc(collection(db, "rentalAgreements"), {
      centreId: SELECTED_CENTRE_ID,

      // use TOP-LEVEL stall id for bills
      stallId: topLevelStallId, // keep slug for display/search
      billingUid: stall.ownerUid || "", // add this for guaranteed billing

      // keep nested centre-stall doc id for reading stall details
      stallCentreDocId: stallDocId,

      stallName: stall.stallName || topLevelStallId,
      unitNo: stall.unitNo || "-",
      ownerUid: stall.ownerUid || stall.ownerId || "",
      ownerName,
      monthlyRent,
      startDate,

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    alert("Rental agreement created.");
    closeAddRentalModal();

    // refresh rentals list
    await loadRentals();
  } catch (err) {
    console.error("CREATE RENTAL FAILED:", err);
    alert(`Create rental failed: ${err.message}`);
  }
};

// LogOut
window.logoutOperator = async () => {
  try {
    await signOut(auth);
    window.location.href = "index.html";
  } catch (err) {
    console.error(err);
    alert("Logout failed. Please try again.");
  }
};
