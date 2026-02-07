/*************************************************
 * orders.js — Hawker Point
 * - Auth gate (must be signed in)
 * - Loads user's orders from Firestore
 * - Optional filter: ?checkoutId=XXXX
 * - Renders order cards into #ordersList
 *************************************************/

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
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
  const short = String(id || "").slice(-6).toUpperCase();
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
        where("checkoutId", "==", checkoutIdFilter)
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

  return orders;
}

function renderOrders(orders, checkoutIdFilter) {
  const listEl = document.getElementById("ordersList");
  const emptyEl = document.getElementById("ordersEmpty");
  const bannerEl = document.getElementById("ordersBanner");

  if (!listEl) return;

  // Banner when filtering by checkout
  if (bannerEl) {
    if (checkoutIdFilter) {
      bannerEl.hidden = false;
      bannerEl.textContent = `Showing orders from your latest payment (Checkout: ${checkoutIdFilter})`;
    } else {
      bannerEl.hidden = true;
    }
  }

  listEl.innerHTML = "";

  if (!orders.length) {
    if (emptyEl) emptyEl.hidden = false;
    return;
  }
  if (emptyEl) emptyEl.hidden = true;

  // (Optional) Sort: newest first if you have timestamps
  // orders.sort((a,b)=> (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));

  for (const o of orders) {
    const stallName = o.stallName || o.stall?.stallName || o.stall?.name || o.stall?.title || "Unknown Stall";
    
    const paymentType = prettyPayMethod(o.payment?.method);
    const total =
      o.pricing?.total ??
      o.total ??
      o.amount ??
      0;

    // Pickup label (fallback)
    const fulfill =
        o.fulfillment?.type
            ? (o.fulfillment.type === "delivery" ? "Delivery" : "Pickup")
            : "Pickup";

    // Display Order ID if you don't have a running counter
    const displayId = o.displayId || makeDisplayId("OD", o.id);

    // View order:
    // - If this order is linked to a checkout, show the receipt by checkoutId (multi-stall)
    // - else show receipt by orderId (single)
    const href = o.checkoutId
      ? `payment_recieved.html?checkoutId=${encodeURIComponent(o.checkoutId)}`
      : `payment_recieved.html?orderId=${encodeURIComponent(o.id)}`;

    const card = document.createElement("div");
    card.className = "orderCard";
    card.innerHTML = `
      <div>
        <div class="orderIdRow">Order ID: ${displayId}</div>
        <div class="orderMainTitle">${stallName}</div>
        <div class="orderMetaLine">${fulfill}</div>
        <div class="orderMetaLine">Payment Type: ${paymentType}</div>
        <div class="orderMetaLine">Amount Payable: $ ${money(total)}</div>
      </div>

      <a class="orderBtn" href="${href}">View Order</a>
    `;

    listEl.appendChild(card);
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "account.html";
    return;
  }

  try {
    const checkoutIdFilter = getQueryParam("checkoutId");
    const orders = await loadOrdersForOwner(user.uid, checkoutIdFilter);
    renderOrders(orders, checkoutIdFilter);
  } catch (err) {
    console.error(err);
    // If something fails, show empty state rather than breaking the page
    renderOrders([], getQueryParam("checkoutId"));
  }
});
