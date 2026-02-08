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
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  writeBatch,
  addDoc,
  serverTimestamp,
  Timestamp,
  updateDoc,
  setDoc,
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

// Helpers

async function getOperatorBillBoth(uidStallId, publicStallId, month) {
  // 1️⃣ Try UID path (correct + future-proof)
  if (uidStallId) {
    const uidRef = doc(db, "stalls", uidStallId, "operatorBills", month);
    const uidSnap = await getDoc(uidRef);
    if (uidSnap.exists()) {
      return { path: "uid", ref: uidRef, data: uidSnap.data() };
    }
  }

  // 2️⃣ Fallback: legacy slug path (asia-wok)
  if (publicStallId) {
    const slugRef = doc(db, "stalls", publicStallId, "operatorBills", month);
    const slugSnap = await getDoc(slugRef);
    if (slugSnap.exists()) {
      console.warn("⚠ Using legacy slug bill:", publicStallId, month);
      return { path: "slug", ref: slugRef, data: slugSnap.data() };
    }
  }

  return null;
}

async function getAgreementByStallIdBoth(uidStallId, publicStallId) {
  const colRef = collection(db, "rentalAgreements");

  if (uidStallId) {
    const q1 = query(colRef, where("stallId", "==", uidStallId), limit(1));
    const s1 = await getDocs(q1);
    if (!s1.empty) return { id: s1.docs[0].id, ...s1.docs[0].data() };
  }

  if (publicStallId) {
    const q2 = query(colRef, where("stallId", "==", publicStallId), limit(1));
    const s2 = await getDocs(q2);
    if (!s2.empty) return { id: s2.docs[0].id, ...s2.docs[0].data() };
  }

  return null;
}

function setText(id, v) {
  const el = $(id);
  if (el) el.textContent = v ?? "—";
}

function money(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "$0.00";
  return `$${x.toFixed(2)}`;
}

function setStatus(msg, isError = false) {
  const el = $("statusMsg");
  if (!el) return;
  el.textContent = msg || "";
  el.style.color = isError ? "#b00020" : "rgba(0,0,0,.7)";
}

function monthKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthLabelFromKey(key) {
  const [y, m] = key.split("-");
  const dt = new Date(Number(y), Number(m) - 1, 1);
  return dt.toLocaleString(undefined, { month: "long", year: "numeric" });
}

function startEndOfMonthFromKey(key) {
  const [y, m] = key.split("-");
  const year = Number(y);
  const monthIndex = Number(m) - 1;
  const start = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const end = new Date(year, monthIndex + 1, 1, 0, 0, 0, 0);
  return { start, end };
}

function prevMonthKey(key) {
  const [y, m] = key.split("-");
  const dt = new Date(Number(y), Number(m) - 1, 1);
  dt.setMonth(dt.getMonth() - 1);
  return monthKey(dt);
}

function fmtDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function pill(el, text, tone) {
  if (!el) return;
  el.textContent = text;
  el.classList.remove("payPaid", "payUnpaid", "payOverdue", "payPartial");
  if (tone) el.classList.add(tone);
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fillMonthSelect() {
  const sel = $("monthSelect");
  if (!sel) return;
  sel.innerHTML = "";

  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = monthKey(d);

    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = monthLabelFromKey(key);
    sel.appendChild(opt);
  }
}

/** Top-level stall doc (matches your screenshot) */
async function getStallDoc(uid) {
  const ref = doc(db, "stalls", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

/**
 * Operator bill doc:
 * stalls/{uid}/operatorBills/{yyyy-mm}
 */
async function getOperatorBill(stallId, month) {
  const ref = doc(db, "stalls", stallId, "operatorBills", month);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const ag = await getAgreementByStallIdBoth(
      stallId,
      window.__stallData?.publicStallId,
    );
    const rent = safeNum(ag?.monthlyRent);

    return {
      exists: false,
      rent,
      utilities: 0,
      cleaningFee: 0,
      penalty: 0,
      other: 0,
      total: rent,
      dueDate: null,
      status: "unpaid",
      paidAt: null,
    };
  }

  const b = snap.data() || {};
  const rent = safeNum(b.rent);
  const utilities = safeNum(b.utilities);
  const cleaningFee = safeNum(b.cleaningFee);
  const penalty = safeNum(b.penalty);
  const other = safeNum(b.other);
  const total =
    safeNum(b.total) || rent + utilities + cleaningFee + penalty + other;

  return {
    exists: true,
    rent,
    utilities,
    cleaningFee,
    penalty,
    other,
    total,
    dueDate: b.dueDate || null,
    status: b.status || "unpaid",
    paidAt: b.paidAt || null,
  };
}

/**
 * Staff timesheets:
 * stalls/{uid}/staffTimesheets/{autoId}
 * fields:
 * - staffName, hours, hourlyRate, workDate (Timestamp)
 * - paid (boolean) optional
 */
async function getStaffTimesheets(stallId, start, end) {
  const colRef = collection(db, "stalls", stallId, "staffTimesheets");
  const q = query(
    colRef,
    where("workDate", ">=", Timestamp.fromDate(start)),
    where("workDate", "<", Timestamp.fromDate(end)),
  );

  const snap = await getDocs(q);

  const docs = [];
  snap.forEach((d) => docs.push({ id: d.id, ...d.data() }));

  return docs;
}

/** Aggregate staff totals (and keep per-staff status) */
function aggregateStaff(timesheets) {
  // staffKey = name||rate
  const map = new Map();
  let totalPay = 0;
  let totalHours = 0;

  let anyUnpaid = false;
  let anyPaid = false;

  for (const t of timesheets) {
    const name = String(t.staffName || "Unknown");
    const hours = safeNum(t.hours);
    const rate = safeNum(t.hourlyRate);
    const paid = !!t.paid;

    if (paid) anyPaid = true;
    else anyUnpaid = true;

    const key = `${name}||${rate}`;
    const prev = map.get(key) || {
      staffName: name,
      hours: 0,
      rate,
      amount: 0,
      paidHours: 0,
      unpaidHours: 0,
    };
    prev.hours += hours;
    prev.amount += hours * rate;

    if (paid) prev.paidHours += hours;
    else prev.unpaidHours += hours;

    map.set(key, prev);

    totalHours += hours;
    totalPay += hours * rate;
  }

  const rows = Array.from(map.values()).map((r) => {
    const fullyPaid = r.unpaidHours <= 0 && r.paidHours > 0;
    const partiallyPaid = r.paidHours > 0 && r.unpaidHours > 0;

    return {
      staffName: r.staffName,
      hours: r.hours,
      rate: r.rate,
      amount: r.amount,
      status: fullyPaid ? "Paid" : partiallyPaid ? "Partial" : "Unpaid",
    };
  });

  rows.sort((a, b) => b.amount - a.amount);

  const overallStatus = anyUnpaid
    ? anyPaid
      ? "Partial"
      : "Unpaid"
    : anyPaid
      ? "Paid"
      : "Unpaid";

  return { totalPay, totalHours, rows, overallStatus };
}

/**
 * Payments history:
 * stalls/{uid}/payments/{autoId}
 * fields: month, payTo, amount, method, note, createdAt
 */
async function getPaymentsForMonth(stallId, month) {
  const colRef = collection(db, "stalls", stallId, "payments");
  const q = query(
    colRef,
    where("month", "==", month),
    orderBy("createdAt", "desc"),
    limit(50),
  );

  const snap = await getDocs(q);
  const rows = [];
  snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
  return rows;
}

async function getOperatorPaidLifetime(stallId) {
  // Easiest approach: fetch all payments and filter payTo == "operator"
  // (OK for small datasets; if you expect lots of rows, we can paginate)
  const colRef = collection(db, "stalls", stallId, "payments");

  const snap = await getDocs(colRef);

  let total = 0;
  snap.forEach((d) => {
    const p = d.data() || {};
    if (p.payTo === "operator") total += safeNum(p.amount);
  });

  return total;
}

function sumPayments(payments) {
  let total = 0;
  for (const p of payments) total += safeNum(p.amount);
  return total;
}

function renderStaffTable(rows) {
  const body = $("staffBody");
  if (!body) return;

  body.innerHTML = "";

  if (!rows || rows.length === 0) {
    body.innerHTML = `<tr>
      <td colspan="5" style="padding:12px; opacity:.8; font-weight:800;">
        No staff timesheets found for this month.
      </td>
    </tr>`;
    return;
  }

  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="padding:10px; border-bottom:1px solid rgba(0,0,0,.08); font-weight:900;">
        ${r.staffName}
      </td>
      <td style="padding:10px; border-bottom:1px solid rgba(0,0,0,.08); font-weight:800;">
        ${r.hours.toFixed(2)}
      </td>
      <td style="padding:10px; border-bottom:1px solid rgba(0,0,0,.08); font-weight:800;">
        ${money(r.rate)} / hr
      </td>
      <td style="padding:10px; border-bottom:1px solid rgba(0,0,0,.08); font-weight:900;">
        ${money(r.amount)}
      </td>
      <td style="padding:10px; border-bottom:1px solid rgba(0,0,0,.08); font-weight:900;">
        ${r.status}
      </td>
    `;
    body.appendChild(tr);
  }
}

function renderPaymentHistory(rows) {
  const body = $("payHistBody");
  if (!body) return;

  body.innerHTML = "";

  if (!rows || rows.length === 0) {
    body.innerHTML = `<tr>
      <td colspan="5" style="padding:12px; opacity:.8; font-weight:800;">No payments yet.</td>
    </tr>`;
    return;
  }

  for (const p of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="padding:10px; border-bottom:1px solid rgba(0,0,0,.08); font-weight:800;">
        ${p.createdAt ? fmtDate(p.createdAt) : "—"}
      </td>
      <td style="padding:10px; border-bottom:1px solid rgba(0,0,0,.08); font-weight:900;">
        ${p.payTo === "operator" ? "Operator" : "Staff"}
      </td>
      <td style="padding:10px; border-bottom:1px solid rgba(0,0,0,.08); font-weight:900;">
        ${money(p.amount)}
      </td>
      <td style="padding:10px; border-bottom:1px solid rgba(0,0,0,.08); font-weight:800;">
        ${String(p.method || "—")}
      </td>
      <td style="padding:10px; border-bottom:1px solid rgba(0,0,0,.08); font-weight:800;">
        ${String(p.note || "")}
      </td>
    `;
    body.appendChild(tr);
  }
}

function computeOverdue(dueDate, status) {
  if (!dueDate) return false;
  if (status === "paid") return false;
  const now = new Date();
  const due = dueDate.toDate ? dueDate.toDate() : new Date(dueDate);
  return now.getTime() > due.getTime();
}

async function ensureBillDocExists(stallId, month) {
  const res = await getOperatorBillBoth(
    stallId,
    window.__stallData?.publicStallId,
    month,
  );

  if (res) return; // already exists somewhere valid

  const ref = doc(db, "stalls", stallId, "operatorBills", month);

  const snap = await getDoc(ref);
  if (snap.exists()) return;

  const ag = await getAgreementByStallIdBoth(
    stallId,
    window.__stallData?.publicStallId,
  );

  const rent = safeNum(ag?.monthlyRent);
  const [y, m] = month.split("-");
  const due = new Date(Number(y), Number(m) - 1, 15, 0, 0, 0, 0); // default due date: 15th
  await setDoc(
    ref,
    {
      month,
      utilities: 0,
      cleaningFee: 0,
      penalty: 0,
      other: 0,
      rent,
      total: rent,
      dueDate: Timestamp.fromDate(due),
      status: "unpaid",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
async function loadPaymentSummary(stallId, stallData) {
  const month = $("monthSelect")?.value || monthKey(new Date());
  const { start, end } = startEndOfMonthFromKey(month);

  setStatus("Loading payment summary…");

  // Ensure a bill doc exists
  await ensureBillDocExists(stallId, month);

  const res = await getOperatorBillBoth(
    stallId,
    stallData?.publicStallId,
    month,
  );

  let bill;

  if (!res) {
    const ag = await getAgreementByStallIdBoth(
      stallId,
      stallData?.publicStallId,
    );

    const rent = safeNum(ag?.monthlyRent);
    bill = {
      exists: false,
      rent,
      utilities: 0,
      cleaningFee: 0,
      penalty: 0,
      other: 0,
      total: rent,
      dueDate: null,
      status: "unpaid",
      paidAt: null,
    };
  } else {
    const b = res.data;
    bill = {
      exists: true,
      rent: safeNum(b.rent),
      utilities: safeNum(b.utilities),
      cleaningFee: safeNum(b.cleaningFee),
      penalty: safeNum(b.penalty),
      other: safeNum(b.other),
      total:
        safeNum(b.total) ||
        safeNum(b.rent) +
          safeNum(b.utilities) +
          safeNum(b.cleaningFee) +
          safeNum(b.penalty) +
          safeNum(b.other),
      dueDate: b.dueDate || null,
      status: b.status || "unpaid",
      paidAt: b.paidAt || null,
    };

    // 👇 keep ref so updates go to SAME place
    bill.__ref = res.ref;
  }

  const timesheets = await getStaffTimesheets(stallId, start, end);
  const staffAgg = aggregateStaff(timesheets);
  const payHist = await getPaymentsForMonth(stallId, month);

  const operatorDue = bill.status === "paid" ? 0 : bill.total;
  const staffDue = staffAgg.overallStatus === "Paid" ? 0 : staffAgg.totalPay;
  const grandDue = operatorDue + staffDue;

  const paidThisMonth = sumPayments(payHist);

  // Fill summary cards
  setText("operatorDueNum", money(operatorDue));
  setText("staffDueNum", money(staffDue));
  setText("grandDueNum", money(grandDue));
  setText("paidThisMonthNum", money(paidThisMonth));
  const operatorPaidLifetime = await getOperatorPaidLifetime(stallId);
  setText("operatorPaidLifetimeNum", money(operatorPaidLifetime));

  // Operator breakdown
  setText("rentLine", money(bill.rent));
  setText("utilitiesLine", money(bill.utilities));
  setText("cleaningLine", money(bill.cleaningFee));
  setText("penaltyLine", money(bill.penalty));
  setText("otherLine", money(bill.other));
  setText("operatorLine", money(operatorDue));

  // Staff breakdown
  setText("hoursLine", staffAgg.totalHours.toFixed(2));
  setText("staffLine", money(staffDue));
  renderStaffTable(staffAgg.rows);

  // Payment history
  renderPaymentHistory(payHist);

  // Due date & late hint
  setText("dueDateLine", bill.dueDate ? fmtDate(bill.dueDate) : "—");

  const overdue = computeOverdue(bill.dueDate, bill.status);
  const lateHint = $("lateHint");
  if (lateHint) {
    if (!bill.dueDate) {
      lateHint.textContent =
        "Tip: add a dueDate in operatorBills for realistic billing.";
    } else if (overdue) {
      lateHint.textContent = "⚠ Overdue: late payment penalty may apply.";
    } else {
      lateHint.textContent = "Pay before due date to avoid penalties.";
    }
  }

  // Pills (month overall + operator + staff)
  const monthPill = $("monthStatusPill");
  const operatorPill = $("operatorStatusPill");
  const staffPill = $("staffStatusPill");

  // operator pill based on bill.status / overdue
  if (overdue && bill.status !== "paid") {
    pill(operatorPill, "OVERDUE", "payOverdue");
  } else if (bill.status === "paid") {
    pill(operatorPill, "PAID", "payPaid");
  } else {
    pill(operatorPill, "UNPAID", "payUnpaid");
  }

  // staff pill based on timesheets paid state
  if (staffAgg.overallStatus === "Paid") pill(staffPill, "PAID", "payPaid");
  else if (staffAgg.overallStatus === "Partial")
    pill(staffPill, "PARTIAL", "payPartial");
  else pill(staffPill, "UNPAID", "payUnpaid");

  // month pill: if both operator+staff paid => PAID
  const operatorDone = bill.status === "paid";
  const staffDone = staffAgg.overallStatus === "Paid" || staffDue === 0;
  if (operatorDone && staffDone) pill(monthPill, "ALL PAID", "payPaid");
  else if (overdue) pill(monthPill, "ACTION REQUIRED", "payOverdue");
  else pill(monthPill, "PENDING", "payUnpaid");

  // Month-to-month comparison
  const prev = prevMonthKey(month);
  const prevRes = await getOperatorBillBoth(
    stallId,
    window.__stallData?.publicStallId,
    prev,
  );

  const prevBill = prevRes
    ? {
        rent: safeNum(prevRes.data.rent),
        total: safeNum(prevRes.data.total),
      }
    : { rent: 0, total: 0 };

  const prevTimesheets = await getStaffTimesheets(
    stallId,
    ...Object.values(startEndOfMonthFromKey(prev)),
  );
  const prevStaffAgg = aggregateStaff(prevTimesheets);
  const prevTotal = prevBill.total + prevStaffAgg.totalPay;

  const delta = grandDue - prevTotal;
  const deltaEl = $("deltaLine");
  if (deltaEl) {
    const sign = delta > 0 ? "+" : "";
    deltaEl.textContent = `${sign}${money(delta)} vs ${monthLabelFromKey(prev)}`;
  }

  // enable/disable pay buttons
  $("markOperatorPaidBtn") &&
    ($("markOperatorPaidBtn").disabled =
      operatorDue <= 0 || bill.status === "paid");
  $("markStaffPaidBtn") &&
    ($("markStaffPaidBtn").disabled =
      staffDue <= 0 || staffAgg.overallStatus === "Paid");

  // keep current snapshot for export
  window.__payState = {
    month,
    bill,
    staffAgg,
    payHist,
    totals: { operatorDue, staffDue, grandDue, paidThisMonth },
  };

  setStatus(`Showing payments for ${monthLabelFromKey(month)}.`);
}

/** Write a payment record */
async function addPayment(stallId, payload) {
  const colRef = collection(db, "stalls", stallId, "payments");
  await addDoc(colRef, {
    ...payload,
    createdAt: serverTimestamp(),
    createdBy: auth.currentUser?.uid || null,
  });
}

/** Mark operator paid: update operatorBills/{month}.status and log payment */
async function markOperatorPaid(stallId) {
  const st = window.__payState;
  if (!st) return;

  const method = $("payMethod")?.value || "paynow";
  const note = ($("payNote")?.value || "").trim();

  const ref = st.bill.__ref;
  if (!ref) throw new Error("No operator bill ref found");

  await updateDoc(ref, {
    status: "paid",
    paidAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await addPayment(stallId, {
    month: st.month,
    payTo: "operator",
    amount: safeNum(st.bill.total),
    method,
    note,
  });
}

/** Mark staff paid: batch update all unpaid timesheets in month + log payment */
/** Mark staff paid: batch update all unpaid timesheets in month + log payment */
async function markStaffPaid(stallId) {
  const month = window.__payState?.month;
  if (!month) return;

  const { start, end } = startEndOfMonthFromKey(month);

  const method = $("payMethod")?.value || "paynow";
  const note = ($("payNote")?.value || "").trim();

  // Get all timesheets for month
  const sheets = await getStaffTimesheets(stallId, start, end);

  // Batch update only unpaid
  const batch = writeBatch(db);
  let total = 0;
  let count = 0;

  for (const t of sheets) {
    if (t.paid) continue;
    const hours = safeNum(t.hours);
    const rate = safeNum(t.hourlyRate);
    total += hours * rate;
    count++;

    const ref = doc(db, "stalls", stallId, "staffTimesheets", t.id);
    batch.update(ref, { paid: true, paidAt: serverTimestamp() });
  }

  if (count === 0) return;

  await batch.commit();

  await addPayment(stallId, {
    month,
    payTo: "staff",
    amount: total,
    method,
    note,
  });
}

/** Export CSV */
function exportCSV() {
  const st = window.__payState;
  if (!st) return;

  const lines = [];
  const m = st.month;

  lines.push(`Month,${m}`);
  lines.push("");
  lines.push("Operator Bill");
  lines.push("Rent,Utilities,Cleaning Fee,Penalty,Other,Total,Due Date,Status");
  lines.push(
    [
      st.bill.rent,
      st.bill.utilities,
      st.bill.cleaningFee,
      st.bill.penalty,
      st.bill.other,
      st.bill.total,
      st.bill.dueDate ? fmtDate(st.bill.dueDate) : "",
      st.bill.status || "",
    ].join(","),
  );

  lines.push("");
  lines.push("Staff Payroll (Grouped)");
  lines.push("Staff,Hours,Rate,Amount,Status");
  for (const r of st.staffAgg.rows) {
    lines.push(
      [
        r.staffName,
        r.hours.toFixed(2),
        r.rate.toFixed(2),
        r.amount.toFixed(2),
        r.status,
      ].join(","),
    );
  }

  lines.push("");
  lines.push("Payment History");
  lines.push("Date,Type,Amount,Method,Note");
  for (const p of st.payHist) {
    lines.push(
      [
        p.createdAt ? fmtDate(p.createdAt) : "",
        p.payTo === "operator" ? "Operator" : "Staff",
        safeNum(p.amount).toFixed(2),
        p.method || "",
        (p.note || "").replaceAll(",", " "), // avoid breaking CSV
      ].join(","),
    );
  }

  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `payments_${m}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

/** Print */
function printPage() {
  window.print();
}

// Buttons + events
$("logoutBtn")?.addEventListener("click", async () => {
  await signOut(auth);
  location.href = "signin.html";
});

$("refreshBtn")?.addEventListener("click", () => {
  if (window.__payStallId)
    loadPaymentSummary(window.__payStallId, window.__stallData).catch(
      console.error,
    );
});

$("monthSelect")?.addEventListener("change", () => {
  if (window.__payStallId)
    loadPaymentSummary(window.__payStallId, window.__stallData).catch(
      console.error,
    );
});

$("exportBtn")?.addEventListener("click", exportCSV);
$("printBtn")?.addEventListener("click", printPage);

$("markOperatorPaidBtn")?.addEventListener("click", async () => {
  try {
    if (!window.__payStallId) return;
    setStatus("Marking operator as paid…");
    await markOperatorPaid(window.__payStallId);
    await loadPaymentSummary(window.__payStallId, window.__stallData || {});
  } catch (err) {
    console.error(err);
    setStatus(`❌ Failed: ${err.code || err.message}`, true);
  }
});

$("markStaffPaidBtn")?.addEventListener("click", async () => {
  try {
    if (!window.__payStallId) return;
    setStatus("Marking staff as paid…");
    await markStaffPaid(window.__payStallId);
    await loadPaymentSummary(window.__payStallId, window.__stallData || {});
  } catch (err) {
    console.error(err);
    setStatus(`❌ Failed: ${err.code || err.message}`, true);
  }
});

// Auth (single listener only)
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    location.href = "signin.html";
    return;
  }

  try {
    fillMonthSelect();

    // 1) Get user doc
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      await signOut(auth);
      location.href = "signin.html";
      return;
    }

    const u = userSnap.data() || {};

    // keep your existing role check
    if (u.role !== "storeholder") {
      location.href = "home.html";
      return;
    }

    setText("ownerName", u.name || "User");

    // 2) Resolve stall doc id (users.stallId might be UID OR slug like "asia-wok")
    let uidStallId = u.stallId || null;

    const looksLikeUid = (id) =>
      typeof id === "string" && id.length >= 20 && !id.includes("-");

    if (uidStallId && !looksLikeUid(uidStallId)) {
      // it's a slug (e.g. "asia-wok") -> read stalls/{slug} to get ownerUid
      const slugSnap = await getDoc(doc(db, "stalls", uidStallId));
      if (slugSnap.exists()) {
        const slugData = slugSnap.data() || {};
        if (slugData.ownerUid && looksLikeUid(slugData.ownerUid)) {
          uidStallId = slugData.ownerUid; // now we use the real UID stall doc
        }
      }
    }

    if (!uidStallId) {
      setStatus("❌ No stallId found in users doc.", true);
      return;
    }

    // Read UID stall doc: stalls/{uidStallId}
    let uidStallData = {};
    const uidSnap = await getDoc(doc(db, "stalls", uidStallId));
    if (uidSnap.exists()) uidStallData = uidSnap.data() || {};

    let publicId = uidStallData.publicStallId || null;

    // 🔁 fallback: read from centre stall doc
    if (!publicId && u.centreId) {
      const centreSnap = await getDoc(
        doc(db, "centres", u.centreId, "stalls", uidStallId),
      );

      if (centreSnap.exists()) {
        const c = centreSnap.data() || {};
        publicId = c.publicStallId || c.slug || null;
      }
    }

    uidStallData.publicStallId = publicId;

    console.log("uidStallId =", uidStallId);
    console.log("publicId =", publicId);
    console.log("uidStallData =", uidStallData);
    console.log("uidStallData keys =", Object.keys(uidStallData || {}));

    //  Display stall name (use centre stall doc like stall-account)
    let displayName =
      uidStallData.stallName ||
      uidStallData.name ||
      uidStallData.displayName ||
      uidStallData.title;

    if (!displayName && u.centreId) {
      const centreId = u.centreId;

      const centreSnap = await getDoc(
        doc(db, "centres", centreId, "stalls", uidStallId),
      );

      if (centreSnap.exists()) {
        const c = centreSnap.data() || {};
        displayName = c.stallName || c.name || c.displayName || c.title;
      }
    }

    setText("stallName", displayName || uidStallId);

    // IMPORTANT: all billing subcollections remain under UID stall doc
    window.__payStallId = uidStallId;
    window.__stallData = uidStallData;

    await loadPaymentSummary(uidStallId, uidStallData);
  } catch (err) {
    console.error(err);
    setStatus(`❌ Failed to load payments: ${err.code || err.message}`, true);
  }
});
