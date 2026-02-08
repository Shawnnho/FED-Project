/*************************************************
 * payment_received.js
 * Supports:
 *  - ?checkoutId=XXXX  (QR/Card multi-stall one payment)
 *  - ?orderId=YYYY     (Cash / single order)
 *************************************************/

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";


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
  if (x === "qr") return "PayNow / NETS QR";
  if (x === "card") return "Card";
  return (m || "—").toString();
}

/* Delivery box (Address, Postal, Unit only) */
function setDeliveryBox(fulfillment) {
  const box = document.getElementById("prDeliveryBox");
  if (!box) return;

  // Only show for delivery
  if (fulfillment?.type !== "delivery") {
    box.hidden = true;
    return;
  }

  box.hidden = false;

  const addr = fulfillment?.address || {};

  const addressEl = document.getElementById("prDeliveryAddress");
  const postalEl = document.getElementById("prDeliveryPostal");
  const unitEl = document.getElementById("prDeliveryUnit");

  if (addressEl) addressEl.textContent = addr.line1 || addr.address || "—";
  if (postalEl) postalEl.textContent = addr.postal || "—";
  if (unitEl) unitEl.textContent = addr.unit || "—";
}

function makeDisplayId(prefix, id) {
  const short = String(id || "")
    .slice(-6)
    .toUpperCase();
  return `#${prefix}-${short}`;
}

function tsToDate(ts) {
  if (!ts) return null;

  // Firestore Timestamp
  if (typeof ts.toDate === "function") return ts.toDate();

  // Timestamp-like {seconds}
  if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000);

  // ISO string / number
  const d = new Date(ts);
  return Number.isFinite(d.getTime()) ? d : null;
}

function formatDateTime(d) {
  if (!d) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function addMinutes(date, mins) {
  return new Date(date.getTime() + mins * 60000);
}

function formatTimeOnly(d) {
  if (!d) return "—";
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function setPaidAtAndPickup(paidAtTsOrDate) {
  const paidDate =
    paidAtTsOrDate instanceof Date ? paidAtTsOrDate : tsToDate(paidAtTsOrDate);

  // Paid At
  const paidAtEl = document.getElementById("prPaidAt");
  if (paidAtEl) paidAtEl.textContent = formatDateTime(paidDate);

  // Pickup Time (15–20 mins after paidAt)
  const pickupEl = document.getElementById("prPickupTime");
  if (pickupEl) {
    if (paidDate) {
      const from = addMinutes(paidDate, 15);
      const to = addMinutes(paidDate, 20);
      pickupEl.textContent = `${formatTimeOnly(from)} – ${formatTimeOnly(to)}`;
    } else {
      pickupEl.textContent = "—";
    }
  }
}

function getOrderDisplayNo(o) {
  return o?.orderNo || o?.displayOrderNo || `Order ${o?.id?.slice(-6)}`;
}

function getOrderLocation(o) {
  return (
    o?.centreName ||
    o?.hawkerCentreName ||
    o?.locationName ||
    o?.centreId ||
    ""
  );
}

function renderItems(orders) {
  const container = document.getElementById("prItems");
  if (!container) return;
  container.innerHTML = "";

  orders.forEach((o) => {
    const orderNo = getOrderDisplayNo(o);
    const location = getOrderLocation(o);

    (o.items || []).forEach((it) => {
      const card = document.createElement("div");
      card.className = "pr-itemCard";

      const meta = [
        `Order No: ${orderNo}`,
        location ? `Location: ${location}` : "",
        `${it.qty} x (${o.stallName})`,
        it.variantLabel ? `Selected: ${it.variantLabel}` : "",
        it.addons?.length
          ? `Add-ons: ${it.addons.map(a => a.label || a.name).join(", ")}`
          : "",
        it.note ? `Note: ${it.note}` : ""
      ].filter(Boolean);

      card.innerHTML = `
        <div>
          <div class="pr-itemName">${it.name}</div>
          <div class="pr-itemMeta">${meta.join("<br>")}</div>
        </div>
        <img class="pr-itemImg" src="${it.img || "images/defaultFood.png"}" />
      `;

      container.appendChild(card);
    });
  });
}


function showError(msg) {
  const loading = document.getElementById("prLoading");
  const card = document.getElementById("prCard");
  const errBox = document.getElementById("prError");
  const errMsg = document.getElementById("prErrorMsg");

  if (loading) loading.hidden = true;
  if (card) card.hidden = true;
  if (errBox) errBox.hidden = false;
  if (errMsg) errMsg.textContent = msg || "Please try again.";
}

function getQueryParam(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

async function loadByCheckoutId(checkoutId) {
  const cSnap = await getDoc(doc(db, "checkouts", checkoutId));
  if (!cSnap.exists()) throw new Error("Checkout not found.");

  const checkout = { id: cSnap.id, ...cSnap.data() };

  const orderIds = Array.isArray(checkout.orderIds) ? checkout.orderIds : [];
  if (!orderIds.length) throw new Error("No orders linked to this checkout.");

  // Load linked orders
  const orders = [];
  for (const oid of orderIds) {
    const oSnap = await getDoc(doc(db, "orders", oid));
    if (oSnap.exists()) orders.push({ id: oSnap.id, ...oSnap.data() });
  }
  if (!orders.length) throw new Error("Orders not found.");

  // UI fill
  const orderIdEl = document.getElementById("prOrderId");
  if (orderIdEl) {
    const ids = orders.map((o) => o.orderNo || makeDisplayId("OD", o.id));
    orderIdEl.textContent = ids.length === 1 ? ids[0] : ids.join(", ");
  }

  // Delivery details
  setDeliveryBox(checkout?.fulfillment);

  // PaidAt from CHECKOUT (QR/Card)
  setPaidAtAndPickup(checkout?.payment?.paidAt);

  const stallNames = Array.from(
    new Set(orders.map((o) => o.stallName).filter(Boolean)),
  );
  const stallsEl = document.getElementById("prStalls");
  if (stallsEl)
    stallsEl.textContent = stallNames.length
      ? stallNames.join(", ")
      : "Multiple stalls";

  const payMethodEl = document.getElementById("prPayMethod");
  if (payMethodEl)
    payMethodEl.textContent = prettyPayMethod(
      checkout?.payment?.method || orders[0]?.payment?.method,
    );

  const totalEl = document.getElementById("prTotalPaid");
  if (totalEl) totalEl.textContent = `$${money(checkout?.pricing?.total)}`;

  // View status button -> orders filtered by checkoutId
  const btnStatus = document.getElementById("btnStatus");
  if (btnStatus)
    btnStatus.href = `orders.html?checkoutId=${encodeURIComponent(checkoutId)}`;

  renderItems(orders);

  const loading = document.getElementById("prLoading");
  const errBox = document.getElementById("prError");
  const card = document.getElementById("prCard");

  if (loading) loading.hidden = true;
  if (errBox) errBox.hidden = true;
  if (card) card.hidden = false;
}

async function loadByOrderId(orderId) {
  const oSnap = await getDoc(doc(db, "orders", orderId));
  if (!oSnap.exists()) throw new Error("Order not found.");

  const order = { id: oSnap.id, ...oSnap.data() };

  const orderIdEl = document.getElementById("prOrderId");
  if (orderIdEl)
    orderIdEl.textContent = order.orderNo || makeDisplayId("OD", orderId);

  // Delivery details
  setDeliveryBox(order?.fulfillment);

  const stallsEl = document.getElementById("prStalls");
  if (stallsEl) stallsEl.textContent = order.stallName || "—";

  const payMethodEl = document.getElementById("prPayMethod");
  if (payMethodEl)
    payMethodEl.textContent = prettyPayMethod(order?.payment?.method);

  const totalEl = document.getElementById("prTotalPaid");
  if (totalEl) totalEl.textContent = `$${money(order?.pricing?.total)}`;

  // PaidAt from ORDER (Cash, or single order)
  setPaidAtAndPickup(order?.payment?.paidAt);

  const btnStatus = document.getElementById("btnStatus");
  if (btnStatus)
    btnStatus.href = `orders.html?orderId=${encodeURIComponent(orderId)}`;

  renderItems([order]);

  const loading = document.getElementById("prLoading");
  const errBox = document.getElementById("prError");
  const card = document.getElementById("prCard");

  if (loading) loading.hidden = true;
  if (errBox) errBox.hidden = true;
  if (card) card.hidden = false;
}

/* Auth gate + load */
onAuthStateChanged(auth, async (user) => {
  try {
    if (!user) {
      showError("Please sign in to view your payment receipt.");
      return;
    }

    const checkoutId = getQueryParam("checkoutId");
    const orderId = getQueryParam("orderId");

    if (checkoutId) {
      await loadByCheckoutId(checkoutId);
      return;
    }

    if (orderId) {
      await loadByOrderId(orderId);
      return;
    }

    showError("Missing checkoutId or orderId in the URL.");
  } catch (err) {
    console.error(err);
    showError(err?.message || "Could not load payment details.");
  }
});
