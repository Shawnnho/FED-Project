/*************************************************
 * qr.js — Hawker Point
 * - Reads checkoutId from URL
 * - Loads checkouts/{checkoutId}
 * - Shows amount
 * - Confirm → marks checkout paid + updates orders
 *************************************************/

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ✅ SAME config as cart.js
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

function getCheckoutIdFromUrl() {
  const url = new URL(window.location.href);
  return url.searchParams.get("checkoutId") || "";
}

async function loadCheckout(checkoutId) {
  const ref = doc(db, "checkouts", checkoutId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

async function markCheckoutPaid(checkout) {
  const checkoutId = checkout.id;

  const ref = `QR-${Date.now()}`;

  const paymentData = {
    method: "PayNow / NETS QR",
    status: "Paid",
    paidAt: serverTimestamp(),
    ref,
  };

  await updateDoc(doc(db, "checkouts", checkoutId), {
    payment: paymentData,
    status: "paid",
  });

  // 2) Update each order with the SAME payment object
  const orderIds = Array.isArray(checkout.orderIds) ? checkout.orderIds : [];
  for (const oid of orderIds) {
    await setDoc(
      doc(db, "orders", oid),
      {
        status: "processing",
        payment: paymentData,
        checkoutId: checkoutId,
      },
      { merge: true }
    );
  }
}


async function main(user) {
  const amountText = document.getElementById("amountText");
  const statusText = document.getElementById("statusText");
  const confirmBtn = document.getElementById("confirmBtn");

  const checkoutId = getCheckoutIdFromUrl();
  if (!checkoutId) {
    alert("Missing checkoutId in URL.");
    window.location.href = "cart.html";
    return;
  }

  // Must be signed in (matches your cart rule)
  if (!user) {
    alert("Please sign in to continue.");
    window.location.href = "account.html";
    return;
  }

  confirmBtn.disabled = true;

  const checkout = await loadCheckout(checkoutId);
  if (!checkout) {
    alert("Checkout not found.");
    window.location.href = "cart.html";
    return;
  }

  // (Optional) Ensure only owner can see it
  if (checkout.userId && checkout.userId !== user.uid) {
    alert("You do not have access to this checkout.");
    window.location.href = "home.html";
    return;
  }

  const total = checkout?.pricing?.total ?? 0;
  amountText.textContent = money(total);

  confirmBtn.disabled = false;

  confirmBtn.addEventListener("click", async () => {
    try {
      confirmBtn.disabled = true;

      await markCheckoutPaid(checkout);

      setTimeout(() => {
        window.location.href = `payment_recieved.html?checkoutId=${checkout.id}`;
      }, 600);
    } catch (err) {
      console.error(err);
      alert("Payment confirmation failed. Check console + Firestore rules.");
      confirmBtn.disabled = false;
    }
  });
}

onAuthStateChanged(auth, (user) => {
  main(user);
});
