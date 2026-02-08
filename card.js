/*************************************************
 * card.js — Hawker Point
 * - Reads checkoutId from URL
 * - Loads checkouts/{checkoutId}
 * - Shows amount
 * - Validates: 16-digit card, MM/YY, 3-digit CVV
 * - Enables/greens Pay button only when valid
 * - Submit → marks checkout paid + updates orders
 * - Redirects to payment_recieved.html
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

async function markCheckoutPaid(checkout, paymentData) {
  const checkoutId = checkout.id;

  // 1) Update checkout with payment object
  await updateDoc(doc(db, "checkouts", checkoutId), {
    payment: paymentData,
    status: "paid",
  });

  // 2) Update each order with payment object too
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
  const payBtn = document.getElementById("payBtn");
  const form = document.getElementById("cardForm");

  // inputs
  const cardNoEl = document.getElementById("cardNo");
  const expEl = document.getElementById("exp");
  const cvcEl = document.getElementById("cvc");

  const checkoutId = getCheckoutIdFromUrl();
  if (!checkoutId) {
    alert("Missing checkoutId in URL.");
    window.location.href = "cart.html";
    return;
  }

  if (!user) {
    alert("Please sign in to continue.");
    window.location.href = "account.html";
    return;
  }

  // Start locked until checkout loads + fields valid
  payBtn.disabled = true;
  payBtn.classList.remove("isReady");

  const checkout = await loadCheckout(checkoutId);
  if (!checkout) {
    alert("Checkout not found.");
    window.location.href = "cart.html";
    return;
  }

  if (checkout.userId && checkout.userId !== user.uid) {
    alert("You do not have access to this checkout.");
    window.location.href = "home.html";
    return;
  }

  const total = checkout?.pricing?.total ?? 0;
  amountText.textContent = money(total);
  payBtn.textContent = `Pay $${money(total)}`;

  // =========================================
  // SIMPLE VALIDATION (your exact rules)
  // =========================================
  let isCardValid = false;

  function validateFields() {
    const cardDigits = (cardNoEl.value || "").replace(/\D/g, "");
    const exp = (expEl.value || "").trim();
    const cvc = (cvcEl.value || "").trim();

    // Card: exactly 16 digits
    const cardValid = /^\d{16}$/.test(cardDigits);

    // Exp: exactly MM/YY with '/' at 3rd position
    const expValid =
      exp.length === 5 &&
      exp[2] === "/" &&
      /^(0[1-9]|1[0-2])\/\d{2}$/.test(exp);

    // CVV: exactly 3 digits
    const cvcValid = /^\d{3}$/.test(cvc);

    isCardValid = cardValid && expValid && cvcValid;

    // Update button state + color
    if (isCardValid) {
      payBtn.disabled = false;
      payBtn.classList.add("isReady"); 
    } else {
      payBtn.disabled = true;
      payBtn.classList.remove("isReady");

      // Show helpful message only when user started typing
      if (!cardDigits && !exp && !cvc) return;

    }
  }

  // Live validation while typing
  cardNoEl.addEventListener("input", validateFields);
  expEl.addEventListener("input", validateFields);
  cvcEl.addEventListener("input", validateFields);

  // Run once on load
  validateFields();

  // =========================================
  // SUBMIT
  // =========================================
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Safety guard (even if someone bypasses disabled)
    if (!isCardValid) {
      return;
    }

    try {
      payBtn.disabled = true;

      const cardDigits = (cardNoEl.value || "").replace(/\D/g, "");
      const last4 = cardDigits.slice(-4);

      const paymentData = {
        method: "Credit / Debit Card",
        status: "Paid",
        paidAt: serverTimestamp(),
        ref: `CARD-${Date.now()}`,
        last4,
      };

      await markCheckoutPaid(checkout, paymentData);

      setTimeout(() => {
        window.location.href = `payment_recieved.html?checkoutId=${encodeURIComponent(checkoutId)}`;
      }, 600);
    } catch (err) {
      console.error(err);
      alert("Card payment failed. Check console + Firestore rules.");
      payBtn.disabled = false;
      validateFields();
    }
  });
}

onAuthStateChanged(auth, (user) => {
  main(user);
});
