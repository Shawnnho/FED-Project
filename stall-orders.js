import { auth } from "./firebase.js";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const db = getFirestore();
const $ = (id) => document.getElementById(id);

function setText(id, val) {
  const el = $(id);
  if (el) el.textContent = val ?? "—";
}

function money(n) {
  const v = Number(n || 0);
  return `$${v.toFixed(2)}`;
}
function fmtTime(ts) {
  try {
    return ts?.toDate ? ts.toDate().toLocaleString() : "—";
  } catch {
    return "—";
  }
}
function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderItem(it) {
  const name = esc(it.name || "Item");
  const qty = Number(it.qty || 1);
  const unitPrice = it.unitPrice ?? 0;
  const lineTotal = it.lineTotal ?? qty * unitPrice;

  const req = Array.isArray(it.required)
    ? it.required
        .map((r) => `${esc(r.groupTitle || "")}: ${esc(r.optionLabel || "")}`)
        .filter(Boolean)
        .map(
          (t) =>
            `<div class="legal-muted" style="margin-top:2px;">• ${t}</div>`,
        )
        .join("")
    : "";

  const addons = Array.isArray(it.addons)
    ? it.addons
        .map((a) => {
          const label = esc(a.label || "");
          const price = Number(a.price || 0);
          return `<div class="legal-muted" style="margin-top:2px;">+ ${label}${price ? ` (${money(price)})` : ""}</div>`;
        })
        .join("")
    : "";

  const note = it.note
    ? `<div class="legal-muted" style="margin-top:2px;">Note: ${esc(it.note)}</div>`
    : "";

  return `
    <li style="margin: 8px 0;">
      <div style="display:flex; justify-content:space-between; gap:10px;">
        <div><b>${qty}×</b> ${name}</div>
        <div style="font-weight:800;">${money(lineTotal)}</div>
      </div>
      <div class="legal-muted">${money(unitPrice)} each</div>
      ${req}
      ${addons}
      ${note}
    </li>
  `;
}

function renderOrderCard(orderId, o, opts = {}) {
  const { showConfirmCashBtn = false } = opts;

  const createdAt = fmtTime(o.createdAt);
  const status = o.status || "—";
  const method = o.payment?.method || "—";
  const paidAt = o.payment?.paidAt ? fmtTime(o.payment.paidAt) : "Not paid yet";

  const type = o.fulfillment?.type || "—";
  const addr = o.fulfillment?.address || {};
  const addrLine =
    type === "delivery"
      ? `${esc(addr.address || "")}, #${esc(addr.unit || "")}, S(${esc(addr.postal || "")})`
      : "—";

  const items = Array.isArray(o.items) ? o.items : [];
  const itemsHtml = items.length
    ? items.map(renderItem).join("")
    : `<li class="legal-muted">No items found.</li>`;

  const pricing = o.pricing || {};
  const promo = o.promo || {};

  const confirmBtn = showConfirmCashBtn
    ? `<button class="pill" type="button" data-confirm-cash="${esc(orderId)}">Confirm Cash Received</button>`
    : "";

  return `
    <div class="legal-card" style="padding:14px; border-radius:16px; box-shadow:0 8px 22px rgba(0,0,0,.08); background:#fff; margin:12px 0;">
      <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap;">
        <div>
          <div style="font-weight:900; font-size:16px;">Order ${esc(orderId.slice(-6).toUpperCase())}</div>
          <div class="legal-muted">Created: ${esc(createdAt)}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:900;">${esc(status)}</div>
          <div class="legal-muted">Payment: ${esc(method)} • ${esc(paidAt)}</div>
        </div>
      </div>

      <hr style="border:none; border-top:1px solid rgba(0,0,0,.08); margin:12px 0;" />

      <div>
        <div><span class="legal-muted">Fulfillment:</span> <b>${esc(type)}</b></div>
        ${
          type === "delivery"
            ? `<div style="margin-top:6px;"><span class="legal-muted">Address:</span> ${addrLine}</div>`
            : ""
        }
      </div>

      <div style="margin-top:12px;">
        <div style="font-weight:900; margin-bottom:6px;">Items</div>
        <ul class="legal-list" style="margin:0; padding-left:18px;">
          ${itemsHtml}
        </ul>
      </div>

      <div style="margin-top:12px;">
        <div style="display:flex; justify-content:space-between;">
          <span class="legal-muted">Subtotal</span><b>${money(pricing.subtotal)}</b>
        </div>
        <div style="display:flex; justify-content:space-between;">
          <span class="legal-muted">Delivery Fee</span><b>${money(pricing.deliveryFee)}</b>
        </div>
        <div style="display:flex; justify-content:space-between;">
          <span class="legal-muted">Small Order Fee</span><b>${money(pricing.smallOrderFee)}</b>
        </div>
        <div style="display:flex; justify-content:space-between;">
          <span class="legal-muted">Promo (${esc(promo.code || "NONE")})</span><b>- ${money(promo.discount)}</b>
        </div>

        <hr style="border:none; border-top:1px dashed rgba(0,0,0,.15); margin:10px 0;" />

        <div style="display:flex; justify-content:space-between; font-size:16px;">
          <span style="font-weight:900;">Total</span><span style="font-weight:900;">${money(pricing.total)}</span>
        </div>
      </div>

      ${
        confirmBtn
          ? `<div style="margin-top:12px; display:flex; justify-content:flex-end;">${confirmBtn}</div>`
          : ""
      }
    </div>
  `;
}

/* ===== Read user -> stall info (same idea as dashboard) ===== */
async function getMyStallInfo(uid) {
  const userSnap = await getDoc(doc(db, "users", uid));
  if (!userSnap.exists()) throw new Error("users/{uid} not found.");

  const u = userSnap.data() || {};
  const stallId = u.stallId;
  if (!stallId) throw new Error("users/{uid} missing stallId.");

  const centreId = u.centreId;
  if (!centreId) throw new Error("users/{uid} missing centreId.");

  // This is your HTML header fields
  setText("ownerName", u.name || "—");

  // Fetch stall name
  const stallSnap = await getDoc(
    doc(db, "centres", centreId, "stalls", stallId),
  );
  const stallName = stallSnap.exists()
    ? stallSnap.data()?.stallName || "—"
    : "Stall not found";

  return { stallId, stallName };
}

async function loadUnpaidCash(stallId) {
  const q = query(
    collection(db, "orders"),
    where("stallId", "==", stallId),
    where("status", "==", "pending_payment"),
    where("payment.method", "==", "cash"),
    orderBy("createdAt", "desc"),
    limit(50),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function loadPaid(stallId) {
  const q = query(
    collection(db, "orders"),
    where("stallId", "==", stallId),
    where("status", "in", ["paid", "preparing", "ready"]),
    orderBy("createdAt", "desc"),
    limit(50),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function loadCompleted(stallId) {
  const q = query(
    collection(db, "orders"),
    where("stallId", "==", stallId),
    where("status", "==", "completed"),
    orderBy("createdAt", "desc"),
    limit(50),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function confirmCashPaid(orderId) {
  await updateDoc(doc(db, "orders", orderId), {
    status: "paid",
    "payment.paidAt": serverTimestamp(),
  });
}

async function main() {
  const unpaidList = $("unpaidList");
  const paidList = $("paidList");
  const unpaidMeta = $("unpaidMeta");
  const paidMeta = $("paidMeta");
  const unpaidEmpty = $("unpaidEmpty");
  const paidEmpty = $("paidEmpty");
  const completedList = $("completedList");
  const completedMeta = $("completedMeta");
  const completedEmpty = $("completedEmpty");

  async function refresh(stallId) {
    const [unpaid, paid, completed] = await Promise.all([
      loadUnpaidCash(stallId),
      loadPaid(stallId),
      loadCompleted(stallId),
    ]);

    unpaidMeta.textContent = `${unpaid.length}`;
    paidMeta.textContent = `${paid.length}`;
    completedMeta.textContent = `${completed.length}`;

    unpaidEmpty.style.display = unpaid.length ? "none" : "block";
    paidEmpty.style.display = paid.length ? "none" : "block";
    completedEmpty.style.display = completed.length ? "none" : "block";

    unpaidList.innerHTML = unpaid
      .map((o) => renderOrderCard(o.id, o, { showConfirmCashBtn: true }))
      .join("");

    paidList.innerHTML = paid.map((o) => renderOrderCard(o.id, o)).join("");

    completedList.innerHTML = completed
      .map((o) => renderOrderCard(o.id, o))
      .join("");
  }

  unpaidList?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-confirm-cash]");
    if (!btn) return;

    const orderId = btn.getAttribute("data-confirm-cash");
    btn.disabled = true;
    btn.textContent = "Confirming...";

    try {
      await confirmCashPaid(orderId);

      const user = auth.currentUser;
      if (!user) return;

      const { stallId } = await getMyStallInfo(user.uid);
      await refresh(stallId);
    } catch (err) {
      console.error(err);
      alert("Failed to confirm cash payment.");
    }
  });

  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = "index.html";
      return;
    }

    try {
      const { stallId, stallName } = await getMyStallInfo(user.uid);

      // ✅ IMPORTANT: your HTML uses id="stallName"
      setText("stallName", stallName);

      await refresh(stallId);
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to load orders.");
    }
  });
}

main();
