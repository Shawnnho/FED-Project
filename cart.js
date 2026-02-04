/*************************************************
 * cart.js — Hawker Point (Account-based Cart)
 * - Logged in: Firestore carts/{uid}.items
 * - Guest: localStorage hp_cart
 * - Renders cart page + updates badges
 * - Payment method selector + Proceed button states
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
  setDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  limit,
  runTransaction,
  addDoc,
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

const CART_KEY = "hp_cart";
let currentUser = null;

let lastPricing = {
  subtotal: 0,
  promoDiscount: 0,
  smallOrderFee: 0,
  deliveryFee: 0,
  total: 0,
};

const userDocRef = (uid) => doc(db, "users", uid);

const cartDocRef = (uid) => doc(db, "carts", uid);

/* ------------------------------ Promo (Firestore) --------------------------------*/
let appliedPromo = null;

const promoColRef = () => collection(db, "promotions");
const promoDocRef = (promoId) => doc(db, "promotions", promoId);

// users/{uid}/promoClaims/{promoId}
const promoClaimRef = (uid, promoId) =>
  doc(db, "users", uid, "promoClaims", promoId);

async function getPromoByCode(codeRaw) {
  const code = String(codeRaw || "")
    .trim()
    .toUpperCase();
  if (!code) return null;

  const q = query(promoColRef(), where("code", "==", code), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;

  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

function toMs(ts) {
  if (!ts) return null;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  const t = new Date(ts).getTime();
  return Number.isFinite(t) ? t : null;
}

// If you didn't store cashOff/minSpend fields, we try to parse "$5" / "$20" from title/desc
function inferCashValue(promo) {
  const explicit = Number(promo.cashOff ?? promo.value ?? promo.amount);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const text = `${promo.title || ""} ${promo.desc || ""}`;
  const m = text.match(/\$(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
}

function inferMinSpend(promo) {
  const explicit = Number(promo.minSpend ?? promo.minSubtotal);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;

  const text = `${promo.desc || ""}`;
  const m = text.match(/\$([0-9]+(?:\.[0-9]+)?)/);
  return m ? Number(m[1]) : 0;
}

async function clearAppliedPromo(message = "") {
  appliedPromo = null;

  const label = document.getElementById("promoCodeLabel");
  if (label) label.textContent = "None";

  const msg = document.getElementById("redeemMsg");
  if (msg && message) msg.textContent = message;

  // ✅ also clear on user doc if signed in
  if (currentUser) {
    try {
      await saveAppliedPromoToUser(currentUser.uid, null);
    } catch (e) {
      console.warn("Failed to clear promo on user doc:", e);
    }
  }
}

/* ------------------------------ Promo persistence (user doc) --------------------------------*/
async function saveAppliedPromoToUser(uid, promo) {
  const payload = promo
    ? {
        appliedPromo: {
          promoId: promo.id,
          code: promo.code || "",
          appliedAt: serverTimestamp(),
        },
      }
    : { appliedPromo: null };

  await setDoc(userDocRef(uid), payload, { merge: true });
}

async function loadAppliedPromoFromUser(uid) {
  const snap = await getDoc(userDocRef(uid));
  if (!snap.exists()) return null;

  const ap = snap.data().appliedPromo;
  if (!ap || !ap.promoId) return null;

  const promoSnap = await getDoc(promoDocRef(ap.promoId));
  if (!promoSnap.exists()) return null;

  return { id: promoSnap.id, ...promoSnap.data() };
}

async function loadSavedAddress(uid) {
  const snap = await getDoc(userDocRef(uid));
  if (!snap.exists()) return null;
  return snap.data().savedAddress || null;
}

async function saveAddressToUser(uid, addressObj) {
  await setDoc(
    userDocRef(uid),
    { savedAddress: { ...addressObj, updatedAt: serverTimestamp() } },
    { merge: true },
  );
}

/* ------------------------------ LocalStorage helpers (guest) --------------------------------*/
function readLocalCart() {
  try {
    const cart = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    return Array.isArray(cart) ? cart : [];
  } catch {
    return [];
  }
}

function writeLocalCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart || []));
}

function clearLocalCart() {
  localStorage.removeItem(CART_KEY);
}

/* ------------------------------ Firestore helpers (account) --------------------------------*/
async function readCloudCart(uid) {
  const snap = await getDoc(cartDocRef(uid));
  return snap.exists() ? snap.data().items || [] : [];
}

async function writeCloudCart(uid, cart) {
  await setDoc(
    cartDocRef(uid),
    { items: cart, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/* ------------------------------ Unified cart IO --------------------------------*/
async function readCart() {
  if (!currentUser) return readLocalCart();
  return await readCloudCart(currentUser.uid);
}

async function saveCart(cart) {
  if (!currentUser) {
    writeLocalCart(cart);
    return;
  }
  await writeCloudCart(currentUser.uid, cart);
}

/* ------------------------------ UI helpers --------------------------------*/
function showReq(id, show) {
  const el = document.getElementById(id);
  if (el) el.hidden = !show;
}

function setAddrHint(msg = "", show = true) {
  const el = document.getElementById("saveAddrHint");
  if (!el) return;
  el.textContent = msg;
  el.hidden = !show;
}

function validateDeliveryFields() {
  const addressEl = document.getElementById("delAddress");
  const postalEl = document.getElementById("delPostal");
  const unitEl = document.getElementById("delUnit");

  const address = addressEl.value.trim();
  const postal = postalEl.value.trim();
  const unit = unitEl.value.trim();

  // reset visuals
  [addressEl, postalEl, unitEl].forEach((el) =>
    el.classList.remove("isInvalid"),
  );
  showReq("reqAddress", false);
  showReq("reqPostal", false);
  showReq("reqUnit", false);

  let ok = true;

  if (!address) {
    showReq("reqAddress", true);
    addressEl.classList.add("isInvalid");
    ok = false;
  }

  if (!/^\d{6}$/.test(postal)) {
    showReq("reqPostal", true);
    postalEl.classList.add("isInvalid");
    ok = false;
  }

  if (!unit) {
    showReq("reqUnit", true);
    unitEl.classList.add("isInvalid");
    ok = false;
  }

  return { ok, addressObj: { address, postal, unit } };
}

function money(n) {
  return (Number(n) || 0).toFixed(2);
}

function calcCount(cart) {
  let c = 0;
  for (const it of cart) c += Number(it.qty ?? it.quantity ?? 1) || 1;
  return c;
}

function updateBadges(count) {
  const el = document.getElementById("cartCount");
  if (el) {
    el.textContent = String(count);
    el.classList.toggle("isZero", count <= 0);
  }

  const elM = document.getElementById("cartCountMobile");
  if (elM) {
    elM.textContent = String(count);
    elM.classList.toggle("isZero", count <= 0);
  }
}

/* ------------------------------ Merge helper: guest -> account --------------------------------*/
function mergeCarts(existing = [], incoming = []) {
  // Merge by: stallId + itemId + addons + required + note (so different options stay separate)
  const key = (x) =>
    `${x.stallId || ""}|${x.itemId || x.id || x.name || ""}|` +
    `${JSON.stringify(x.addons || [])}|${JSON.stringify(x.required || [])}|${(x.note || "").trim()}`;

  const map = new Map();

  for (const x of existing) map.set(key(x), { ...x });

  for (const x of incoming) {
    const k = key(x);
    if (!map.has(k)) {
      map.set(k, { ...x });
    } else {
      const cur = map.get(k);
      const addQty = Number(x.qty ?? 1) || 1;
      cur.qty = (Number(cur.qty ?? 1) || 1) + addQty;

      const unit =
        Number(cur.unitPrice ?? cur.basePrice ?? cur.price ?? 0) || 0;
      cur.totalPrice = unit * (Number(cur.qty ?? 1) || 1);

      map.set(k, cur);
    }
  }

  return Array.from(map.values());
}

function round2(n) {
  return Number(Number(n || 0).toFixed(2));
}

function calcSubtotal(stallItems) {
  return round2(
    stallItems.reduce((sum, it) => sum + Number(it.lineTotal || 0), 0),
  );
}

/* ------------------------------ Payment method + Proceed button --------------------------------*/
function getSelectedPayMethod() {
  const checked = document.querySelector('input[name="payMethod"]:checked');
  return checked ? checked.value : "";
}

function syncProceedBtn() {
  const btn = document.getElementById("checkoutBtn");
  if (!btn) return;

  const selectedPay = Boolean(getSelectedPayMethod());

  const fulfillment =
    document.querySelector('input[name="fulfillment"]:checked')?.value ||
    "pickup";

  let deliveryOk = true;
  if (fulfillment === "delivery") {
    deliveryOk = validateDeliveryFields().ok;
  }

  const ready = selectedPay && deliveryOk;

  btn.classList.toggle("isReady", ready);
  btn.classList.toggle("isLocked", !ready);
  btn.disabled = !ready;
}

function clearPaySelection() {
  document
    .querySelectorAll('input[name="payMethod"]')
    .forEach((r) => (r.checked = false));
  syncProceedBtn();
}

// When user changes payment method, update button color/state
document.addEventListener("change", (e) => {
  if (!e.target.matches('input[name="payMethod"]')) return;
  syncProceedBtn();
});

document.addEventListener("change", (e) => {
  if (!e.target.matches('input[name="fulfillment"]')) return;
  render();
  syncProceedBtn();
});

document.addEventListener("input", (e) => {
  if (e.target.matches("#delAddress, #delPostal, #delUnit")) syncProceedBtn();
});

function calcDeliveryFee(subtotal) {
  let fee = 2.5;

  // Free delivery for larger orders
  if (subtotal >= 30) fee = 0;

  // Optional: small peak surcharge (keep it simple)
  const now = new Date();
  const hour = now.getHours();
  const isPeak = (hour >= 11 && hour < 14) || (hour >= 18 && hour < 21);

  if (fee > 0 && isPeak) fee += 1.0;

  return Number(fee.toFixed(2));
}

/* ------------------------------ Render cart page --------------------------------*/
async function render() {
  const list = document.getElementById("cartList");
  const empty = document.getElementById("cartEmpty");
  const summary = document.getElementById("cartSummary");
  const subText = document.getElementById("cartSub");

  const cart = await readCart();
  const promoBox = document.getElementById("promoBox");

  const count = calcCount(cart);

  updateBadges(count);
  if (subText) subText.textContent = `${count} item${count === 1 ? "" : "s"}`;

  if (!list) return; // not on cart page

  list.innerHTML = "";

  const payBox = document.getElementById("payBox");
  const proceedBtn = document.getElementById("checkoutBtn");
  const fulfillBox = document.getElementById("fulfillBox");

  if (cart.length === 0) {
    empty && (empty.hidden = false);
    promoBox && (promoBox.style.display = "none");
    summary && (summary.style.display = "none");
    payBox && (payBox.style.display = "none");
    proceedBtn && (proceedBtn.style.display = "none");
    fulfillBox && (fulfillBox.style.display = "none");

    await clearAppliedPromo();

    return;
  }

  empty && (empty.hidden = true);
  promoBox && (promoBox.style.display = currentUser ? "" : "none");
  summary && (summary.style.display = "");
  payBox && (payBox.style.display = "");
  proceedBtn && (proceedBtn.style.display = "");
  fulfillBox && (fulfillBox.style.display = "");

  // ✅ Requirement: by default (every time you open cart), no payment method selected
  clearPaySelection();

  let subtotal = 0;

  cart.forEach((it, idx) => {
    const qty = Number(it.qty ?? it.quantity ?? 1) || 1;
    const name = it.name ?? it.itemName ?? "Item";
    const img = it.img ?? it.image ?? "images/defaultFood.png";
    const note = it.note ?? it.sideNote ?? "";
    const addons = Array.isArray(it.addons) ? it.addons : [];
    const required = Array.isArray(it.required) ? it.required : [];

    const unitPrice =
      Number(it.unitPrice ?? it.basePrice ?? it.price ?? 0) || 0;
    const line = Number(it.totalPrice) || unitPrice * qty;

    subtotal += line;

    const card = document.createElement("article");
    card.className = "menuCard cartCard";

    card.innerHTML = `
      <div class="menuImgWrap">
        <img src="${img}" alt="${name}" />
      </div>

      <div class="menuInfo">
        <div class="menuName">${name}</div>
        <div class="menuPrice">$${money(line)}</div>

        <div class="cartMeta">
          ${
            addons.length
              ? `<div class="cartMetaLine"><strong>Add-ons:</strong> ${addons
                  .map((a) => {
                    const label = a.label ?? a.name ?? "";
                    const price = Number(a.price);
                    return Number.isFinite(price) && price > 0
                      ? `${label} (+$${price.toFixed(2)})`
                      : label;
                  })
                  .join(", ")}</div>`
              : ""
          }

          ${
            required.length
              ? `<div class="cartMetaLine"><strong>Options:</strong> ${required
                  .map((r) => `${r.groupTitle}: ${r.optionLabel}`)
                  .join(", ")}</div>`
              : ""
          }

          ${note ? `<div class="cartMetaLine"><strong>Note:</strong> ${note}</div>` : ""}
        </div>
      </div>

      <div class="cartQtyWrap">
        <button class="cartQtyBtn" data-act="plus" data-i="${idx}" type="button">+</button>
        <div class="cartQtyNum">${qty}</div>
        <button class="cartQtyBtn" data-act="minus" data-i="${idx}" type="button">−</button>
      </div>
    `;

    list.appendChild(card);
  });

  // ===============================
  // Small Order Fee Logic (min $15, capped at $4)
  // ===============================
  const MIN_SUBTOTAL = 15;
  const MAX_SMALL_FEE = 4;

  // Get fulfillment choice
  const fulfillment =
    document.querySelector('input[name="fulfillment"]:checked')?.value ||
    "pickup";

  // Show / hide delivery address fields
  const deliveryFields = document.getElementById("deliveryFields");
  if (deliveryFields) {
    deliveryFields.hidden = fulfillment !== "delivery";
  }

  // Only apply fee for delivery when subtotal is below minimum
  let smallOrderFee = 0;
  if (fulfillment === "delivery" && subtotal < MIN_SUBTOTAL) {
    const diff = MIN_SUBTOTAL - subtotal;
    smallOrderFee = Math.min(diff, MAX_SMALL_FEE);
    smallOrderFee = Number(smallOrderFee.toFixed(2));
  }

  const showSmall = fulfillment === "delivery" && subtotal < MIN_SUBTOTAL;

  // message
  const smallOrderMsg = document.getElementById("smallOrderMsg");
  if (smallOrderMsg) {
    smallOrderMsg.hidden = !showSmall;
    if (showSmall) {
      smallOrderMsg.textContent = `Orders below $${money(MIN_SUBTOTAL)} incur a small order fee (capped at $${money(MAX_SMALL_FEE)}).`;
    }
  }

  // divider
  const smallOrderDivider = document.getElementById("smallOrderDivider");
  if (smallOrderDivider) smallOrderDivider.hidden = !showSmall;

  // remove row border ONLY when message is shown (prevents double lines)
  const smallOrderRow = document.getElementById("smallOrderRow");
  if (smallOrderRow) smallOrderRow.classList.toggle("noBorder", showSmall);

  // Promo (placeholder – real logic comes next)
  // ===============================
  // Promo (Firestore)
  // ===============================
  let promoDiscount = 0;

  const promoLabelEl = document.getElementById("promoCodeLabel");
  if (promoLabelEl) promoLabelEl.textContent = appliedPromo?.code || "None";

  if (appliedPromo) {
    const expMs = toMs(appliedPromo.expiresAt);
    if (expMs && Date.now() > expMs) {
      clearAppliedPromo("Promo expired and was removed.");
    } else {
      const type = String(appliedPromo.type || "cash").toLowerCase();

      if (type === "cash") {
        promoDiscount = inferCashValue(appliedPromo);
      }

      if (type === "percent") {
        const pct =
          Number(
            appliedPromo.percent ?? appliedPromo.discount ?? appliedPromo.value,
          ) || 0;

        promoDiscount = subtotal * (pct / 100);
      }

      // Safety cap: discount cannot exceed subtotal
      promoDiscount = Math.min(promoDiscount, subtotal);
    }
  }

  // ===============================
  // Delivery fee (realistic simulation)
  // ===============================
  let deliveryFee = 0;

  if (fulfillment === "delivery") {
    deliveryFee = calcDeliveryFee(subtotal);
  }

  // ===============================
  // Update Summary UI
  // ===============================
  document.getElementById("sumSubtotal").textContent = money(subtotal);
  document.getElementById("sumPromo").textContent = money(promoDiscount);
  document.getElementById("sumSmallFee").textContent = money(smallOrderFee);
  document.getElementById("sumDelivery").textContent = money(deliveryFee);

  const total = Math.max(
    0,
    subtotal - promoDiscount + smallOrderFee + deliveryFee,
  );
  document.getElementById("sumTotal").textContent = money(total);

  lastPricing = {
    subtotal,
    promoDiscount,
    smallOrderFee,
    deliveryFee,
    total,
  };

  // Keep button in correct state after render
  syncProceedBtn();
}

/* ------------------------------ Qty buttons (cart page) --------------------------------*/
document.addEventListener("click", async (e) => {
  const proceed = e.target.closest("#checkoutBtn");
  if (proceed) {
    const method = getSelectedPayMethod();
    if (!method) {
      alert("Please select a payment method first.");
      return;
    }

    const fulfillment =
      document.querySelector('input[name="fulfillment"]:checked')?.value ||
      "pickup";

    // ✅ Validate delivery ONCE and store addressObj
    let addressObj = null;

    if (fulfillment === "delivery") {
      const v = validateDeliveryFields();
      if (!v.ok) {
        document
          .getElementById("fulfillBox")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }

      addressObj = v.addressObj;

      // ✅ Save address ONLY if checkbox is checked (delivery only)
      const saveChecked = Boolean(
        document.getElementById("saveAddrChk")?.checked,
      );

      if (saveChecked) {
        if (!currentUser) {
          setAddrHint("Sign in to save your address.", true);
        } else {
          try {
            setAddrHint("Saving...", true);
            await saveAddressToUser(currentUser.uid, addressObj);
            setAddrHint("Saved!", true);
            setTimeout(() => setAddrHint("", false), 1500);
          } catch (err) {
            console.error(err);
            setAddrHint("Save failed. Try again.", true);
          }
        }
      } else {
        setAddrHint("", false);
      }
    }

    // ✅ Require signed-in user for checkout
    if (!currentUser) {
      alert("Please sign in to checkout.");
      return;
    }

    const cart = await readCart();
    if (!cart.length) {
      alert("Your cart is empty.");
      return;
    }

    const items = cart.map((it) => {
      const qty = Number(it.qty ?? 1) || 1;
      const unitPrice = Number(it.unitPrice ?? 0) || 0;

      return {
        stallId: it.stallId || null,
        itemId: it.itemId || null,
        name: it.name || "Item",
        img: it.img || "",
        qty,
        unitPrice: Number(unitPrice.toFixed(2)),
        lineTotal: Number((qty * unitPrice).toFixed(2)),
        note: it.note || "",
        addons: Array.isArray(it.addons) ? it.addons : [],
        required: Array.isArray(it.required) ? it.required : [],
      };
    });
    // ✅ Split cart into multiple orders (one order per stall)
    const itemsByStall = new Map();
    for (const it of items) {
      const sid = it.stallId;
      if (!sid) continue;
      if (!itemsByStall.has(sid)) itemsByStall.set(sid, []);
      itemsByStall.get(sid).push(it);
    }

    const stallIds = Array.from(itemsByStall.keys());
    if (stallIds.length === 0) {
      alert("Your cart is empty.");
      return;
    }

    const isCash = method === "cash";
    const createdOrderIds = [];

    try {
      for (const sid of stallIds) {
        const stallItems = itemsByStall.get(sid);

        // ---- pricing per stall ----
        const subtotal = stallItems.reduce(
          (sum, it) => sum + Number(it.lineTotal || 0),
          0,
        );

        const smallOrderFee =
          fulfillment === "delivery" && subtotal < 15
            ? Math.min(15 - subtotal, 4)
            : 0;

        const deliveryFee =
          fulfillment === "delivery" ? calcDeliveryFee(subtotal) : 0;

        const promoDiscount = Number((appliedPromo?.discount || 0).toFixed(2));

        const total = Math.max(
          0,
          subtotal - promoDiscount + smallOrderFee + deliveryFee,
        );

        const orderPayload = {
          stallId: sid, // ✅ THIS is the key fix
          userId: currentUser.uid,
          createdAt: serverTimestamp(),
          status: isCash ? "pending_payment" : "paid",

          items: stallItems,

          fulfillment: {
            type: fulfillment,
            address: fulfillment === "delivery" ? addressObj : null,
          },

          payment: {
            method,
            paidAt: isCash ? null : serverTimestamp(),
            ref: "",
          },

          promo: {
            promoId: appliedPromo?.id || null,
            code: appliedPromo?.code || "NONE",
            discount: Number(promoDiscount.toFixed(2)),
          },

          pricing: {
            subtotal: Number(subtotal.toFixed(2)),
            smallOrderFee: Number(smallOrderFee.toFixed(2)),
            deliveryFee: Number(deliveryFee.toFixed(2)),
            total: Number(total.toFixed(2)),
          },
        };

        const ref = await addDoc(collection(db, "orders"), orderPayload);
        createdOrderIds.push(ref.id);
      }

      // clear cart after ALL orders created
      await saveCart([]);
      await clearAppliedPromo();

      // redirect logic
      if (createdOrderIds.length === 1) {
        const orderId = createdOrderIds[0];
        if (method === "cash")
          window.location.href = `cash.html?orderId=${orderId}`;
        else if (method === "paynow_nets")
          window.location.href = `qr.html?orderId=${orderId}`;
        else window.location.href = `card.html?orderId=${orderId}`;
      } else {
        alert(`Created ${createdOrderIds.length} orders (one per stall).`);
        window.location.href = `orders.html`; // customer order history
      }
    } catch (err) {
      console.error(err);
      alert("Could not create order(s). Try again.");
    }

    return;
  }

  // +/- qty buttons
  const btn = e.target.closest("[data-act]");
  if (!btn) return;

  const act = btn.getAttribute("data-act");
  const i = Number(btn.getAttribute("data-i"));

  const cart = await readCart();
  if (!cart[i]) return;

  const qty = Number(cart[i].qty ?? cart[i].quantity ?? 1) || 1;

  if (act === "plus") cart[i].qty = qty + 1;

  if (act === "minus") {
    if (qty <= 1) cart.splice(i, 1);
    else cart[i].qty = qty - 1;
  }

  // Recompute totalPrice if unitPrice exists
  const unit =
    Number(cart[i]?.unitPrice ?? cart[i]?.basePrice ?? cart[i]?.price ?? 0) ||
    0;
  if (cart[i]) cart[i].totalPrice = unit * (Number(cart[i].qty ?? 1) || 1);

  await saveCart(cart);
  render();
});

/* ------------------------------ Redeem promo --------------------------------*/
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("#redeemBtn");
  if (!btn) return;

  const input = document.getElementById("redeemInput");
  const msg = document.getElementById("redeemMsg");

  // ✅ Guests cannot redeem promo codes
  if (!currentUser) {
    if (msg) msg.textContent = "Please sign in to use promo codes.";
    return;
  }

  const code = (input?.value || "").trim().toUpperCase();
  if (!code) {
    if (msg) msg.textContent = "Please enter a promo code.";
    return;
  }

  try {
    if (msg) msg.textContent = "Checking promo...";

    const promo = await getPromoByCode(code);
    if (!promo) {
      if (msg) msg.textContent = "Invalid promo code.";
      return;
    }

    // expiry check
    const expMs = toMs(promo.expiresAt);
    if (expMs && Date.now() > expMs) {
      if (msg) msg.textContent = "This promo has expired.";
      return;
    }

    // redemption check
    const left = Number(promo.redemptionsLeft);
    if (Number.isFinite(left) && left <= 0) {
      if (msg) msg.textContent = "This promo is fully redeemed.";
      return;
    }

    // compute subtotal (for min spend)
    const cart = await readCart();

    // ------------------ Stall + Item restricted promo ------------------

    // 1️⃣ Enforce stall restriction
    if (promo.stallId) {
      const cartStallIds = Array.from(
        new Set(cart.map((it) => it.stallId).filter(Boolean)),
      );

      if (!cartStallIds.includes(promo.stallId)) {
        if (msg)
          msg.textContent =
            "This promo is only valid for Tiong Bahru Chicken Rice.";
        return;
      }
    }

    // 2️⃣ Enforce required item keyword (e.g. Chicken Rice)
    if (promo.requiredKeyword) {
      const keyword = promo.requiredKeyword.toLowerCase();

      const hasRequiredItem = cart.some((it) => {
        const name = String(it.name ?? it.itemName ?? "").toLowerCase();
        return name.includes(keyword);
      });

      if (!hasRequiredItem) {
        if (msg)
          msg.textContent = "Add Chicken Rice to your cart to use this promo.";
        return;
      }
    }

    let subtotal = 0;
    cart.forEach((it) => {
      const qty = Number(it.qty ?? it.quantity ?? 1) || 1;
      const unit = Number(it.unitPrice ?? it.basePrice ?? it.price ?? 0) || 0;
      subtotal += qty * unit;
    });

    const minSpend = inferMinSpend(promo);
    if (minSpend > 0 && subtotal < minSpend) {
      if (msg)
        msg.textContent = `Minimum spend $${minSpend.toFixed(2)} required.`;
      return;
    }

    // ✅ transaction: decrement redemptionsLeft + claimOnce enforcement (if signed in)
    await runTransaction(db, async (tx) => {
      const pRef = promoDocRef(promo.id);
      const pSnap = await tx.get(pRef);
      if (!pSnap.exists()) throw new Error("Promo no longer exists.");

      const latest = pSnap.data();
      const latestLeft = Number(latest.redemptionsLeft);

      if (Number.isFinite(latestLeft) && latestLeft <= 0) {
        throw new Error("This promo is fully redeemed.");
      }

      const claimOnce = Boolean(latest.claimOnce);
      if (claimOnce && currentUser) {
        const cRef = promoClaimRef(currentUser.uid, promo.id);
        const cSnap = await tx.get(cRef);
        if (cSnap.exists())
          throw new Error("You have already claimed this promo.");
        tx.set(cRef, { claimedAt: serverTimestamp(), code: latest.code });
      }

      if (Number.isFinite(latestLeft)) {
        tx.update(pRef, { redemptionsLeft: latestLeft - 1 });
      }
    });

    // store promoId for render()
    appliedPromo = promo;

    // ✅ persist promo per user
    if (currentUser) {
      await saveAppliedPromoToUser(currentUser.uid, promo);
    }

    if (msg) msg.textContent = `Promo "${promo.code}" applied!`;
    render();
  } catch (err) {
    console.error(err);
    if (msg)
      msg.textContent = err?.message || "Could not apply promo. Try again.";
  }
});

async function consumeVoucherHandoffFromAccount() {
  if (!currentUser) return;

  const code = (localStorage.getItem("hawkerpoint_applied_promo") || "")
    .trim()
    .toUpperCase();

  if (!code) return;

  try {
    const promo = await getPromoByCode(code);
    if (!promo) {
      // If voucher code doesn't exist in promotions, just clear the handoff
      localStorage.removeItem("hawkerpoint_applied_promo");
      localStorage.removeItem("hawkerpoint_applied_voucher_docid");
      return;
    }

    // Optional: expiry check
    const expMs = toMs(promo.expiresAt);
    if (expMs && Date.now() > expMs) {
      await clearAppliedPromo("Promo expired and was removed.");
      localStorage.removeItem("hawkerpoint_applied_promo");
      localStorage.removeItem("hawkerpoint_applied_voucher_docid");
      return;
    }

    // ✅ ADD THIS WHOLE BLOCK HERE (before appliedPromo = promo)
    await runTransaction(db, async (tx) => {
      const pRef = promoDocRef(promo.id);
      const pSnap = await tx.get(pRef);
      if (!pSnap.exists()) throw new Error("Promo no longer exists.");

      const latest = pSnap.data();
      const latestLeft = Number(latest.redemptionsLeft);

      if (Number.isFinite(latestLeft) && latestLeft <= 0) {
        throw new Error("This promo is fully redeemed.");
      }

      const claimOnce = Boolean(latest.claimOnce);
      if (claimOnce && currentUser) {
        const cRef = promoClaimRef(currentUser.uid, promo.id);
        const cSnap = await tx.get(cRef);
        if (cSnap.exists())
          throw new Error("You have already claimed this promo.");
        tx.set(cRef, { claimedAt: serverTimestamp(), code: latest.code });
      }

      if (Number.isFinite(latestLeft)) {
        tx.update(pRef, { redemptionsLeft: latestLeft - 1 });
      }
    });

    // ✅ Apply promo in cart
    appliedPromo = promo;

    // ✅ Persist on user doc so it survives refresh
    await saveAppliedPromoToUser(currentUser.uid, promo);

    // ✅ Clear the handoff so it applies only once
    localStorage.removeItem("hawkerpoint_applied_promo");
    localStorage.removeItem("hawkerpoint_applied_voucher_docid");

    // (Optional) UI message if you're on cart page
    const msg = document.getElementById("redeemMsg");
    if (msg) msg.textContent = `Promo "${promo.code}" applied from vouchers.`;
  } catch (e) {
    console.warn("Voucher handoff apply failed:", e);

    localStorage.removeItem("hawkerpoint_applied_promo");
    localStorage.removeItem("hawkerpoint_applied_voucher_docid");
  }
}

/* ------------------------------ Auth state: migrate + rerender --------------------------------*/
onAuthStateChanged(auth, async (u) => {
  currentUser = u;
  // ✅ Load applied promo for this user (account only)
  if (u) {
    await consumeVoucherHandoffFromAccount();
    try {
      appliedPromo = await loadAppliedPromoFromUser(u.uid);
    } catch (e) {
      console.warn("Failed to load applied promo:", e);
      appliedPromo = null;
    }
  } else {
    appliedPromo = null;
  }

  // ✅ auto-fill saved address if exists
  if (u) {
    try {
      const saved = await loadSavedAddress(u.uid);
      if (saved) {
        const a = document.getElementById("delAddress");
        const p = document.getElementById("delPostal");
        const un = document.getElementById("delUnit");

        if (a) a.value = saved.address || "";
        if (p) p.value = saved.postal || "";
        if (un) un.value = saved.unit || "";
      }
    } catch (err) {
      console.error("Failed to load saved address:", err);
    }
  }

  // ✅ migrate guest localStorage cart into account cart once
  if (u) {
    const local = readLocalCart();
    if (local.length) {
      const cloud = await readCloudCart(u.uid);
      const merged = mergeCarts(cloud, local);
      await writeCloudCart(u.uid, merged);
      clearLocalCart();
    }
  }

  render();
});

/* ------------------------------ Lifecycle hooks --------------------------------*/
document.addEventListener("DOMContentLoaded", render);
window.addEventListener("pageshow", render);
window.addEventListener("storage", (e) => e.key === CART_KEY && render());

/* ------------------------------ For other pages (badge/menu) --------------------------------*/
export async function getCartForUI() {
  return await readCart();
}
