/*************************************************
 * orders.js — Hawker Point
 * - Auth gate (must be signed in)
 * - Loads user's orders from Firestore
 * - Optional filter: ?checkoutId=XXXX
 * - Renders order cards into #ordersList
 *************************************************/

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ✅ SAME config as your other files */
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

function money(n) {
  return (Number(n) || 0).toFixed(2);
}

function prettyPayMethod(m) {
  const x = String(m || "").toLowerCase();
  if (x === "cash") return "Cash";
  if (x === "paynow_nets") return "PayNow / NETS QR";
  if (x === "card") return "Card";
  if (x === "qr") return "PayNow / NETS QR";
  return m || "—";
}

function getQueryParam(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

function makeDisplayId(prefix, id) {
  const short = String(id || "")
    .slice(-6)
    .toUpperCase();
  return `#${prefix}${short}`;
}

/**
 * Try loading orders by one of these owner fields:
 * userId OR uid OR buyerId
 * (because different projects use different names)
 */
async function loadOrdersForOwner(userUid, checkoutIdFilter) {
  const ordersRef = collection(db, "orders");

  async function tryField(fieldName) {
    let q;
    if (checkoutIdFilter) {
      q = query(
        ordersRef,
        where(fieldName, "==", userUid),
        where("checkoutId", "==", checkoutIdFilter),
      );
    } else {
      q = query(ordersRef, where(fieldName, "==", userUid));
    }

    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  // Try in order: userId → uid → buyerId
  let orders = await tryField("userId");
  if (!orders.length) orders = await tryField("uid");
  if (!orders.length) orders = await tryField("buyerId");
  if (!orders.length) orders = await tryField("customerUid");

  return orders;
}

function normPayKey(m) {
  const x = String(m || "").toLowerCase();
  if (x.includes("cash")) return "cash";
  if (x.includes("paynow") || x.includes("nets") || x === "qr") return "qr";
  if (x.includes("card")) return "card";
  return "other";
}

function isCompletedStatus(status) {
  const s = String(status || "").toLowerCase();
  return s === "completed" || s === "collected" || s === "done";
}

// Pending = anything NOT completed
function isPendingStatus(status) {
  return !isCompletedStatus(status);
}

function statusClass(status) {
  const s = String(status || "").toLowerCase();

  // completed
  if (s === "completed" || s === "collected" || s === "done") return "stDone";

  // pending payment
  if (s.includes("pending_payment") || s.includes("pending")) return "stPay";

  // paid/processing
  if (s.includes("paid") || s.includes("processing")) return "stPaid";

  // kitchen flow
  if (s.includes("preparing")) return "stPrep";
  if (s.includes("ready")) return "stReady";

  return "stDefault";
}

function wireTabs() {
  const tabBtns = document.querySelectorAll(".ordersTab[data-tab]");
  const wrapPending = document.getElementById("ordersPendingWrap");
  const wrapCompleted = document.getElementById("ordersCompletedWrap");

  if (!tabBtns.length || !wrapPending || !wrapCompleted) return;

  function setTab(name) {
    tabBtns.forEach((b) =>
      b.classList.toggle("isActive", b.dataset.tab === name),
    );
    wrapPending.hidden = name !== "pending";
    wrapCompleted.hidden = name !== "completed";
  }

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => setTab(btn.dataset.tab));
  });

  setTab("pending"); // default
}

function renderOrders(orders, checkoutIdFilter) {
  const bannerEl = document.getElementById("ordersBanner");

  const pendingList = document.getElementById("ordersPendingList");
  const completedList = document.getElementById("ordersCompletedList");
  const pendingEmpty = document.getElementById("ordersPendingEmpty");
  const completedEmpty = document.getElementById("ordersCompletedEmpty");

  const searchEl = document.getElementById("ordersSearch");
  const statusEl = document.getElementById("ordersStatusFilter");
  const payEl = document.getElementById("ordersPayFilter");

  if (!pendingList || !completedList) return;

  // Banner when filtering by checkout
  if (bannerEl) {
    if (checkoutIdFilter) {
      bannerEl.hidden = false;
      bannerEl.textContent = `Showing orders from your latest payment (Checkout: ${checkoutIdFilter})`;
    } else {
      bannerEl.hidden = true;
    }
  }

  // ----------------------------
  // Apply filters
  // ----------------------------
  const q = (searchEl?.value || "").trim().toLowerCase();
  const statusFilter = statusEl?.value || "all";
  const payFilter = payEl?.value || "all";

  let filtered = orders.slice();

  if (q) {
    filtered = filtered.filter((o) => {
      const id = String(o.displayId || o.id || "").toLowerCase();
      const stallName = String(
        o.stallName ||
          o.stall?.stallName ||
          o.stall?.name ||
          o.stall?.title ||
          "Unknown Stall",
      ).toLowerCase();
      return id.includes(q) || stallName.includes(q);
    });
  }

  if (payFilter !== "all") {
    filtered = filtered.filter(
      (o) => normPayKey(o.payment?.method) === payFilter,
    );
  }

  // Split into pending/completed
  let pending = filtered.filter((o) => isPendingStatus(o.status));
  let completed = filtered.filter((o) => isCompletedStatus(o.status));

  // If user chooses "pending/completed only" dropdown
  if (statusFilter === "pending") completed = [];
  if (statusFilter === "completed") pending = [];

  // Optional sort newest first if timestamps exist
  const ts = (x) => x?.createdAt?.seconds || 0;
  pending.sort((a, b) => ts(b) - ts(a));
  completed.sort((a, b) => ts(b) - ts(a));

  // ✅ ADD HERE (tab counts)
  const pendingCountEl = document.getElementById("pendingCount");
  const completedCountEl = document.getElementById("completedCount");
  if (pendingCountEl) pendingCountEl.textContent = String(pending.length);
  if (completedCountEl) completedCountEl.textContent = String(completed.length);

  // ----------------------------
  // Render helper
  // ----------------------------
  function cardHtml(o) {
    const stallName =
      o.stallName ||
      o.stall?.stallName ||
      o.stall?.name ||
      o.stall?.title ||
      "Unknown Stall";

    const paymentType = prettyPayMethod(o.payment?.method);
    const total = o.pricing?.total ?? o.total ?? o.amount ?? 0;

    const fulfill = o.fulfillment?.type
      ? o.fulfillment.type === "delivery"
        ? "Delivery"
        : "Pickup"
      : "Pickup";

    const displayId = o.displayId || makeDisplayId("OD", o.id);

    const href = o.checkoutId
      ? `payment_recieved.html?checkoutId=${encodeURIComponent(o.checkoutId)}`
      : `payment_recieved.html?orderId=${encodeURIComponent(o.id)}`;

    const statusText = String(o.status || "").replaceAll("_", " ");

    // little status pill
    return `
      <div class="orderCard">
        <div class="orderLeft">
          <div class="orderTopRow">
            <div class="orderIdRow">Order: ${displayId}</div>
            <span class="orderStatusPill ${statusClass(o.status)}">${statusText || "pending"}</span>
          </div>

          <div class="orderMainTitle">${stallName}</div>

          <div class="orderMetaRow">
            <span class="chip">${fulfill}</span>
            <span class="chip">${paymentType}</span>
            <span class="chip strong">$${money(total)}</span>
          </div>
        </div>

        <a class="orderBtn" href="${href}">View</a>
      </div>
    `;
  }

  // ----------------------------
  // Draw
  // ----------------------------
  pendingList.innerHTML = pending.map(cardHtml).join("");
  completedList.innerHTML = completed.map(cardHtml).join("");

  pendingEmpty.hidden = pending.length !== 0;
  completedEmpty.hidden = completed.length !== 0;
}

function wireFilters(latestOrdersRef) {
  const ids = ["ordersSearch", "ordersStatusFilter", "ordersPayFilter"];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () =>
      renderOrders(latestOrdersRef.orders, latestOrdersRef.checkoutId),
    );
    el.addEventListener("change", () =>
      renderOrders(latestOrdersRef.orders, latestOrdersRef.checkoutId),
    );
  });
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "account.html";
    return;
  }

  try {
    const checkoutIdFilter = getQueryParam("checkoutId");
    const orders = await loadOrdersForOwner(user.uid, checkoutIdFilter);
    const state = { orders, checkoutId: checkoutIdFilter };
    wireFilters(state);
    wireTabs();
    renderOrders(state.orders, state.checkoutId);
  } catch (err) {
    console.error(err);
    // If something fails, show empty state rather than breaking the page
    const state = { orders: [], checkoutId: getQueryParam("checkoutId") };
    wireFilters(state);
    wireTabs();
    renderOrders(state.orders, state.checkoutId);
  }
});
