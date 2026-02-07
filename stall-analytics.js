import { auth } from "./firebase.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
  limit,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const db = getFirestore();
const $ = (id) => document.getElementById(id);

// =============================
// COLLECTIONS (match your project)
// =============================
const COL_STALLS = "stalls";
const COL_ORDERS = "orders";
const SUB_REVIEWS = "reviews";

// =============================
// HELPER
// =============================
function setGradeColor(el, grade) {
  if (!el) return;
  const g = String(grade || "")
    .toUpperCase()
    .trim();

  el.textContent = g || "—";
  el.classList.remove("gradeA", "gradeB", "gradeC", "gradeD", "gradeNA");

  if (g === "A") el.classList.add("gradeA");
  else if (g === "B") el.classList.add("gradeB");
  else if (g === "C") el.classList.add("gradeC");
  else if (g === "D") el.classList.add("gradeD");
  else el.classList.add("gradeNA");
}

function daysUntil(ts) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = ts.toDate();
  target.setHours(0, 0, 0, 0);
  const diffMs = target - today;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

// =============================
// DATE HELPERS
// =============================
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function startOfMonth(d) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function toTs(d) {
  return Timestamp.fromDate(d);
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

let nextInspectionMsg = null;

// =============================
// STALL LOOKUP (stall-holder -> stallId)
// =============================
async function getMyStall() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");

  const userSnap = await getDoc(doc(db, "users", user.uid));
  if (!userSnap.exists()) throw new Error("users/{uid} not found");

  const u = userSnap.data();
  if (!u.stallId) throw new Error("users/{uid} missing stallId");

  // Prefer stallPath if you have it, else build from centreId
  const stallRef = u.stallPath
    ? doc(db, u.stallPath)
    : doc(db, "centres", u.centreId, "stalls", u.stallId);

  const stallSnap = await getDoc(stallRef);
  if (!stallSnap.exists()) throw new Error("Stall doc not found");

  return {
    stallId: stallRef.id,
    ...stallSnap.data(),
  };
}

function listenOrders(stallId, rangeStart, rangeEnd, cb) {
  const ordersRef = collection(db, COL_ORDERS);

  const qOrders = query(
    ordersRef,
    where("stallId", "==", stallId),
    where("status", "in", [
      "pending_payment",
      "paid",
      "preparing",
      "ready",
      "completed",
    ]),

    where("createdAt", ">=", toTs(rangeStart)),
    where("createdAt", "<=", toTs(rangeEnd)),
    orderBy("createdAt", "asc"),
  );

  return onSnapshot(qOrders, (snap) => {
    const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    cb(orders);
  });
}

function calcTotals(orders) {
  let totalSales = 0;
  for (const o of orders) {
    totalSales += Number(o.pricing?.total ?? o.total ?? 0);
  }
  return { totalSales, totalOrders: orders.length };
}

function parseHHMM(str) {
  const m = String(str || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function fmtLabel(mins) {
  let hh = Math.floor(mins / 60) % 24;
  const mm = mins % 60;

  const isPM = hh >= 12;
  const hr12 = ((hh + 11) % 12) + 1;

  const mmStr = String(mm).padStart(2, "0");
  return mm === 0
    ? `${hr12}${isPM ? "PM" : "AM"}`
    : `${hr12}:${mmStr}${isPM ? "PM" : "AM"}`;
}

function getHoursForDate(stall, dateObj) {
  // Option B per-day
  const oh = stall.operatingHours;
  if (oh && typeof oh === "object") {
    const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const key = dayKeys[dateObj.getDay()];
    const row = oh[key];
    if (row?.open && row?.close) return { open: row.open, close: row.close };
  }

  // Option A fallback
  if (stall.openTime && stall.closeTime) {
    return { open: stall.openTime, close: stall.closeTime };
  }

  // Final fallback if nothing stored
  return { open: "07:00", close: "21:00" };
}

/**
 * Dynamic hourly buckets based on operating time.
 * @param {Array} orders - your order docs
 * @param {Date} whichDay - date to bucket (today/yesterday)
 * @param {Object} stall - stall data object containing hours
 * @param {number} stepMins - 60 for hourly, 30 for half-hour etc
 */
function calcHourlySales(orders, whichDay, stall, stepMins = 60) {
  const { open, close } = getHoursForDate(stall, whichDay);

  const openM = parseHHMM(open);
  const closeM = parseHHMM(close);

  // if invalid hours, fallback to 7-21
  const startM = openM ?? 7 * 60;
  const endM = closeM ?? 21 * 60;

  // you can expand this later if you really support overnight stalls.
  const safeEndM = endM > startM ? endM : endM + 24 * 60; // overnight stall

  // Build labels + buckets
  const labels = [];
  const buckets = [];

  // We want ticks like: open hour, open+step, ... up to last slot starting before close
  for (let t = startM; t <= safeEndM; t += stepMins) {
    labels.push(fmtLabel(t));
    buckets.push(0);
  }
  // ensure at least 2 points so drawChart won't replace labels with ["",""]
  if (labels.length < 2) {
    labels.push(fmtLabel(startM + stepMins));
    buckets.push(0);
  }

  // Bucket orders by time
  for (const o of orders) {
    const ts = o.createdAt?.toDate?.();
    if (!ts) continue;
    // allow overnight window: orders can be on whichDay OR early next day
    const dayStart = startOfDay(whichDay);
    const dayEnd = endOfDay(whichDay);

    const nextDay = new Date(dayStart);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayEnd = endOfDay(nextDay);

    // if stall closes next day (close <= open), allow early next-day orders
    const isOvernight = safeEndM > 24 * 60;

    if (!isOvernight) {
      if (ts < dayStart || ts > dayEnd) continue;
    } else {
      if (ts < dayStart || ts > nextDayEnd) continue;
    }

    let mins = ts.getHours() * 60 + ts.getMinutes();
    // map early-next-day mins into "after midnight" timeline
    if (isOvernight && ts >= nextDay) mins += 24 * 60;

    if (mins < startM || mins > safeEndM) continue;

    const idx = Math.min(
      buckets.length - 1,
      Math.floor((mins - startM) / stepMins),
    );

    buckets[idx] += Number(o.pricing?.total ?? o.total ?? 0);
  }

  return { labels, data: buckets };
}

function calcTopDishes(orders) {
  const map = new Map();
  for (const o of orders) {
    const items = Array.isArray(o.items) ? o.items : [];
    for (const it of items) {
      // CHANGE if your item shape differs
      const name = String(it.name || "Unknown");
      const qty = Number(it.qty ?? 1);
      const price = Number(it.unitPrice ?? it.price ?? 0);
      const sales = qty * price;

      if (!map.has(name)) map.set(name, { name, orders: 0, sales: 0 });
      const row = map.get(name);
      row.orders += qty;
      row.sales += sales;
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 3)
    .map((x, i) => ({ rank: i + 1, ...x }));
}

// =============================
// REVIEWS (stalls/{stallId}/reviews)
// =============================
function listenReviews(stallId, cb) {
  const reviewsRef = collection(db, "stalls", stallId, "reviews");
  const qRev = query(reviewsRef, orderBy("createdAt", "desc"));
  return onSnapshot(qRev, (snap) => {
    const reviews = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    cb(reviews);
  });
}

function calcRatings(reviews) {
  const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let sum = 0;

  for (const r of reviews) {
    const rating = Math.max(1, Math.min(5, Number(r.rating || 0)));
    if (!rating) continue;
    counts[rating] += 1;
    sum += rating;
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const avg = total ? sum / total : 0;
  return { avg, counts, total };
}

function starsText(avg) {
  const n = Math.max(0, Math.min(5, Math.round(avg)));
  return "★".repeat(n) + "☆".repeat(5 - n);
}

// =============================
// UI RENDER (matches your HTML ids)
// =============================
function setText(id, v) {
  const el = $(id);
  if (el) el.textContent = v;
}

function renderKpis({
  salesToday,
  ordersToday,
  revenueMonth,
  grade,
  gradeWord,
  gradeHint,
}) {
  setText("kpiSales", `$${salesToday.toLocaleString()}`);
  setText("kpiSalesSub", "Today");

  setText("kpiOrders", String(ordersToday));
  setText("kpiOrdersSub", "Today");

  setText("kpiRevenue", `$${revenueMonth.toLocaleString()}`);
  setText("kpiRevenueHint", "This Month");
  setText("kpiRevenueSub", "—");

  // chart header
  setText("totalSales", `$${salesToday.toLocaleString()}`);
  setText("totalSalesSub", "Today");

  // right mini order overview
  setText("orderCountMini", String(ordersToday));
  setText("orderWhenMini", "Today");
  // completion rate is up to your statuses; placeholder until you compute it properly
  setText("completionRate", "—");

  // hygiene
  setText("kpiGrade", grade || "—");
  setText("kpiGradeWord", gradeWord || "—");
  setText("kpiGradeHint", gradeHint || "—");

  setText("hygWhen", "Today");
  setText("hygGrade", grade || "—");
  setText("hygWord", gradeWord || "—");
  setText("hygHint", gradeHint || "—");
}

function renderTopDishesRows(rows) {
  const tbody = $("topDishesBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.rank}</td>
      <td>${r.name}</td>
      <td>${r.orders}</td>
      <td>${r.sales.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderRatingsUI({ avg, counts }) {
  setText("ratingAvg", avg ? avg.toFixed(1) : "0.0");
  setText("ratingStars", starsText(avg));

  const bars = $("ratingBars");
  if (!bars) return;

  bars.innerHTML = "";
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  for (let star = 5; star >= 1; star--) {
    const c = counts[star] || 0;
    const pct = total ? Math.round((c / total) * 100) : 0;

    const row = document.createElement("div");
    row.className = "anBarRow";
    row.innerHTML = `
      <span>${star} Star</span>
      <div class="anBar"><i style="width:${pct}%"></i></div>
      <b>${c}</b>
    `;
    bars.appendChild(row);
  }
}

function dayKey(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10); // YYYY-MM-DD
}

function fmtMD(d) {
  const x = new Date(d);
  return `${x.getDate()}/${x.getMonth() + 1}`;
}

// buckets sales by day from rangeStart..rangeEnd (inclusive)
function calcDailySalesRange(orders, rangeStart, rangeEnd) {
  const start = startOfDay(rangeStart);
  const end = endOfDay(rangeEnd);

  // build label days
  const labels = [];
  const keys = [];
  const cur = new Date(start);
  while (cur <= end) {
    keys.push(dayKey(cur));
    labels.push(fmtMD(cur));
    cur.setDate(cur.getDate() + 1);
  }

  const buckets = new Array(keys.length).fill(0);
  const index = new Map(keys.map((k, i) => [k, i]));

  for (const o of orders) {
    const ts = o.createdAt?.toDate?.();
    if (!ts) continue;
    if (ts < start || ts > end) continue;

    const i = index.get(dayKey(ts));
    if (i == null) continue;

    buckets[i] += Number(o.pricing?.total ?? o.total ?? 0);
  }

  return { labels, data: buckets };
}

// =============================
// CANVAS CHART
// =============================
function drawChart({ labels, today, yesterday, compare }) {
  const canvas = $("salesChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  // ✅ measure the chart box (real layout), not the canvas itself
  const box = canvas.parentElement; // .anChartBox
  const rect = (box || canvas).getBoundingClientRect();

  const dpr = window.devicePixelRatio || 1;

  // CSS size
  const w = Math.max(10, rect.width);
  const h = Math.max(10, rect.height || 260);

  // backing store size
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);

  // draw in CSS pixels
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // ===== SAFETY GUARDS =====
  if (!Array.isArray(labels)) labels = [];
  if (!Array.isArray(today)) today = [];
  if (!Array.isArray(yesterday)) yesterday = [];

  // ✅ if only 1 label (e.g. Today in DAILY mode), duplicate it so we can draw
  if (labels.length === 1) labels = [labels[0], labels[0]];
  if (today.length === 1) today = [today[0], today[0]];
  if (compare && yesterday.length === 1)
    yesterday = [yesterday[0], yesterday[0]];

  // ✅ if still empty, fallback
  if (labels.length < 2) labels = ["", ""];
  if (today.length < 2) today = [today[0] ?? 0, 0];
  if (compare && yesterday.length < 2) yesterday = [yesterday[0] ?? 0, 0];

  const allNowZero = (today || []).every((v) => Number(v) === 0);
  const allPrevZero =
    !compare || (yesterday || []).every((v) => Number(v) === 0);

  if (allNowZero && allPrevZero) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No sales in this period", w / 2, h / 2);
    ctx.textAlign = "left";
    return;
  }

  const padL = 50,
    padR = 60,
    padT = 20,
    padB = 95;
  const cw = w - padL - padR;
  const ch = h - padT - padB;

  const series = compare ? today.concat(yesterday) : today;
  const rawMax = Math.max(0, ...series);

  // nice axis: pad 10% and round to nearest 5
  const padded = rawMax * 1.1;
  const maxY = Math.max(10, Math.ceil(padded / 5) * 5);
  const minY = 0;

  // grid
  // grid (dotted) + LEFT y-axis labels
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);

  for (let i = 0; i <= 4; i++) {
    const y = padT + (ch * i) / 4;

    // grid line
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + cw, y);
    ctx.stroke();

    // y-axis value
    const val = Math.round(maxY - (maxY * i) / 4);

    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "right"; // 👈 align right
    ctx.fillText(String(val), padL - 10, y + 5);
    ctx.setLineDash([2, 4]);
  }

  ctx.setLineDash([]);
  ctx.textAlign = "left";

  // x-axis + time labels (like 7AM 8AM 9AM...)
  const stepX = cw / Math.max(1, labels.length - 1);

  // detect hourly labels (your fmtLabel makes "AM/PM")
  const isHourly = labels.some((s) => /AM|PM/i.test(String(s)));

  // draw x-axis baseline
  const axisY = padT + ch + 10;
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(padL, axisY);
  ctx.lineTo(padL + cw, axisY);
  ctx.stroke();

  // labels + ticks
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  // for hourly, show more labels (like your screenshot)
  const skip = isHourly ? 1 : Math.max(1, Math.ceil(labels.length / 6));

  console.log("labels:", labels);
  labels.forEach((lab, i) => {
    if (i % skip !== 0 && i !== labels.length - 1) return;

    const x = padL + i * stepX;

    // tick mark
    ctx.beginPath();
    ctx.moveTo(x, axisY);
    ctx.lineTo(x, axisY + 6);
    ctx.stroke();

    // text under tick
    ctx.fillText(String(lab), x, axisY + 30);
  });

  ctx.textAlign = "left";

  //This is used for testing
  // ctx.fillStyle = "red";
  // ctx.font = "16px sans-serif";
  // ctx.fillText("TEST", 10, h - 10);

  function plot(values, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = padL + i * stepX;
      const y = padT + ch - ((v - minY) / (maxY - minY)) * (ch * 0.9);

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  plot(today, "#e88e40");
  if (compare) plot(yesterday, "#2b66d9");
}

// =============================
// SAFE CHART REDRAW (MUST BE ABOVE USAGE)
// =============================
let lastChartArgs = null;

function drawChartSafe(args) {
  lastChartArgs = args;
  requestAnimationFrame(() => drawChart(args));
}

window.addEventListener("resize", () => {
  if (lastChartArgs) drawChartSafe(lastChartArgs);
});

// ========================
// Load inspection function
// ========================

async function loadNextInspection(stallId) {
  const today0 = new Date();
  today0.setHours(0, 0, 0, 0);
  const nowTs = Timestamp.fromDate(today0);

  // 1) UPCOMING SCHEDULED (ignore cancelled/completed)
  const qNext = query(
    collection(db, "inspections"),
    where("stallId", "==", stallId),
    where("status", "==", "scheduled"),
    where("dateTs", ">=", nowTs),
    orderBy("dateTs", "asc"),
    limit(1),
  );

  const nextSnap = await getDocs(qNext);

  if (!nextSnap.empty) {
    const insp = nextSnap.docs[0].data();
    const days = daysUntil(insp.dateTs);

    if (days === 0) nextInspectionMsg = "Inspection today";
    else if (days === 1) nextInspectionMsg = "Inspection tomorrow";
    else nextInspectionMsg = `Next hygiene check in ${days} days`;

    setText("kpiGradeHint", nextInspectionMsg);
    setText("hygHint", nextInspectionMsg);
    return;
  }

  // 2) No upcoming scheduled -> show LAST COMPLETED instead
  const qDone = query(
    collection(db, "inspections"),
    where("stallId", "==", stallId),
    where("status", "in", [
      "pending_payment",
      "paid",
      "preparing",
      "ready",
      "completed",
    ]),

    orderBy("dateTs", "desc"),
    limit(1),
  );

  const doneSnap = await getDocs(qDone);

  if (!doneSnap.empty) {
    const done = doneSnap.docs[0].data();

    // days since completed (use dateTs if exists)
    const doneDate = done.dateTs?.toDate ? done.dateTs.toDate() : null;

    if (doneDate) {
      const d0 = new Date(doneDate);
      d0.setHours(0, 0, 0, 0);

      const diffMs = today0 - d0;
      const daysAgo = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

      if (daysAgo === 0) nextInspectionMsg = "Inspection completed today";
      else if (daysAgo === 1)
        nextInspectionMsg = "Inspection completed yesterday";
      else nextInspectionMsg = `Last inspection completed ${daysAgo} days ago`;
    } else {
      nextInspectionMsg = "Last inspection completed";
    }

    setText("kpiGradeHint", nextInspectionMsg);
    setText("hygHint", nextInspectionMsg);
    return;
  }

  // 3) Nothing found
  nextInspectionMsg = "No upcoming inspection scheduled";
  setText("kpiGradeHint", nextInspectionMsg);
  setText("hygHint", nextInspectionMsg);
}

async function resolveTopLevelStallId(stallIdFromCentre, stallData) {
  // ✅ 0) Explicit mapping if present
  if (stallData?.publicStallId) return stallData.publicStallId;

  // 1) If stalls/{id} exists, use it
  const direct = await getDoc(doc(db, "stalls", stallIdFromCentre));
  if (direct.exists()) return stallIdFromCentre;

  // 2) Match by centreId + stallName
  const centreId =
    stallData.centreId || stallData.centre || stallData.hawkerCentreId;
  const stallName = stallData.stallName || stallData.name;

  if (centreId && stallName) {
    const q = query(
      collection(db, "stalls"),
      where("centreId", "==", centreId),
      where("stallName", "==", stallName),
      limit(1),
    );

    const snap = await getDocs(q);
    if (!snap.empty) return snap.docs[0].id;
  }

  // ❌ NEVER fall back to centre stall id
  return null;
}

// =============================
// MAIN BOOT
// =============================
let unsubOrders = null;
let unsubReviews = null;

document.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = "./index.html";
      return;
    }

    try {
      const stall = await getMyStall();
      const stallId = stall.stallId;
      await loadNextInspection(stallId);

      // header ids in your HTML: stallName, ownerName, role
      setText("stallName", stall.stallName || "My Stall");
      const userSnap = await getDoc(doc(db, "users", user.uid));
      const u = userSnap.exists() ? userSnap.data() : {};

      setText("ownerName", u.name || "Owner");
      setText("role", "Owner");
      setText("role", stall.role || "Stall Holder");

      // hygiene grade pulled from stalls/{stallId}
      const grade = String(stall.hygieneGrade || "—").toUpperCase();

      const gradeWord =
        grade === "A"
          ? "Excellent"
          : grade === "B"
            ? "Good"
            : grade === "C"
              ? "Fair"
              : grade === "D"
                ? "Poor"
                : "—";

      const gradeHint = "—";

      /* KPI hygiene card (top row) */
      setGradeColor($("kpiGrade"), grade);
      setText("kpiGradeWord", gradeWord);
      setText("kpiGradeHint", gradeHint);

      /* Right-side hygiene overview card */
      setText("hygWhen", "Today");
      setGradeColor($("hygGrade"), grade);
      setText("hygWord", gradeWord);
      setText("hygHint", gradeHint);

      const now = new Date();
      const todayStart = startOfDay(now);
      const todayEnd = endOfDay(now);

      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yStart = startOfDay(y);
      const yEnd = endOfDay(y);

      const monthStart = startOfMonth(now);
      const monthEnd = endOfDay(now);

      // compare toggle
      const compareEl = $("compareToggle");
      const presetEl = $("datePreset"); // ← MOVE UP HERE
      let chartMode = "auto"; // ← MOVE UP HERE
      const chartBtn = $("chartModeBtn"); // ← MOVE UP HERE

      let compare = compareEl ? compareEl.checked : true;

      function applyLegend(compareOn) {
        const dot = $("legendCompareDot");
        const txt = $("legendCompareText");
        if (dot) dot.style.display = compareOn ? "" : "none";
        if (txt) txt.style.display = compareOn ? "" : "none";
      }
      applyLegend(compare);

      compareEl?.addEventListener("change", () => {
        compare = compareEl.checked;
        applyLegend(compare);
        resubscribeOrders(); // re-fetch previous period + redraw
      });

      // buttons
      $("viewDetailsBtn")?.addEventListener("click", () => {
        window.location.href = "./stall-orders.html";
      });
      $("viewFeedbackBtn")?.addEventListener("click", () => {
        window.location.href = "./stall-review.html";
      });

      $("logoutBtn")?.addEventListener("click", async () => {
        await auth.signOut();
        window.location.href = "./index.html";
      });

      // orders today listener
      // ----------------------------
      // FILTERED ORDERS LISTENER
      // ----------------------------
      let rangeStart = monthStart;
      let rangeEnd = monthEnd;

      function getRangeFromPreset(preset) {
        const base = new Date(); // local time
        const p = String(preset || "today").toLowerCase();

        if (p === "yesterday") {
          const d = new Date(base);
          d.setDate(d.getDate() - 1);
          return { start: startOfDay(d), end: endOfDay(d), label: "Yesterday" };
        }

        if (p === "last7") {
          const end = endOfDay(base);
          const start = startOfDay(new Date(base));
          start.setDate(start.getDate() - 6);
          return { start, end, label: "Last 7 days" };
        }

        if (p === "month") {
          return {
            start: startOfMonth(base),
            end: endOfDay(base),
            label: "This Month",
          };
        }

        // default: today
        return { start: startOfDay(base), end: endOfDay(base), label: "Today" };
      }

      async function resubscribeOrders() {
        if (unsubOrders) unsubOrders();

        unsubOrders = listenOrders(
          stallId,
          rangeStart,
          rangeEnd,
          async (ordersInRange) => {
            const { totalSales, totalOrders } = calcTotals(ordersInRange);

            // ✅ Make KPIs follow the filter too
            renderKpis({
              salesToday: totalSales,
              ordersToday: totalOrders,
              revenueMonth: totalSales, // (optional) change if you want “month” to stay month
              grade,
              gradeWord,
              gradeHint,
            });

            if (nextInspectionMsg) {
              setText("kpiGradeHint", nextInspectionMsg);
              setText("hygHint", nextInspectionMsg);
            }

            let prevStart = null;
            let prevEnd = null;

            // comparison line = previous period (only if compare is on)
            let ySeries = [];
            if (compare) {
              const days = Math.max(
                1,
                Math.round(
                  (endOfDay(rangeEnd) - startOfDay(rangeStart)) /
                    (1000 * 60 * 60 * 24),
                ) + 1,
              );
              prevEnd = new Date(rangeStart);
              prevEnd.setMilliseconds(prevEnd.getMilliseconds() - 1);
              prevStart = new Date(prevEnd);
              prevStart.setDate(prevStart.getDate() - (days - 1));

              const prevSnap = await getDocs(
                query(
                  collection(db, COL_ORDERS),
                  where("stallId", "==", stallId),
                  where("status", "in", [
                    "pending_payment",
                    "paid",
                    "preparing",
                    "ready",
                    "completed",
                  ]),

                  where("createdAt", ">=", toTs(startOfDay(prevStart))),
                  where("createdAt", "<=", toTs(endOfDay(prevEnd))),
                  orderBy("createdAt", "asc"),
                ),
              );
              ySeries = prevSnap.docs.map((d) => d.data());
            }
            const preset = presetEl?.value || "today";

            // choose mode
            const daysInRange =
              Math.round(
                (endOfDay(rangeEnd) - startOfDay(rangeStart)) /
                  (1000 * 60 * 60 * 24),
              ) + 1;

            const effectiveMode =
              daysInRange <= 1
                ? "hourly" // ✅ always time for 1-day ranges
                : chartMode !== "auto"
                  ? chartMode
                  : preset === "today" || preset === "yesterday"
                    ? "hourly"
                    : "daily";

            let nowSeries, prevSeries;

            function cumulative(arr) {
              let s = 0;
              return arr.map((v) => (s += Number(v || 0)));
            }

            if (effectiveMode === "hourly") {
              // ✅ bucket by the actual selected day
              const whichDay = startOfDay(rangeStart);
              nowSeries = calcHourlySales(ordersInRange, whichDay, stall, 60);

              // ✅ previous day for hourly comparison
              const prevDay = new Date(whichDay);
              prevDay.setDate(prevDay.getDate() - 1);

              prevSeries = compare
                ? calcHourlySales(ySeries, prevDay, stall, 60)
                : { labels: nowSeries.labels, data: [] };
            } else {
              // daily buckets across whole range
              nowSeries = calcDailySalesRange(
                ordersInRange,
                rangeStart,
                rangeEnd,
              );
              prevSeries = compare
                ? calcDailySalesRange(
                    ySeries,
                    startOfDay(new Date(prevStart)),
                    endOfDay(new Date(prevEnd)),
                  )
                : { labels: nowSeries.labels, data: [] };
            }

            if (effectiveMode === "daily") {
              nowSeries = { ...nowSeries, data: cumulative(nowSeries.data) };
              prevSeries = { ...prevSeries, data: cumulative(prevSeries.data) };
            }

            drawChartSafe({
              labels: nowSeries.labels,
              today: nowSeries.data,
              yesterday: prevSeries.data,
              compare,
            });
            renderTopDishesRows(calcTopDishes(ordersInRange));
          },
        );
      }

      const saveBtn = $("saveBtn");

      function savePrefs() {
        const prefs = {
          preset: presetEl?.value || "today",
          compare: !!$("compareToggle")?.checked,
          chartMode,
        };
        localStorage.setItem("stallAnalyticsPrefs", JSON.stringify(prefs));
        // quick feedback
        if (saveBtn) {
          const old = saveBtn.textContent;
          saveBtn.textContent = "Saved ✓";
          setTimeout(() => (saveBtn.textContent = old), 900);
        }
      }

      function loadPrefs() {
        try {
          const raw = localStorage.getItem("stallAnalyticsPrefs");
          if (!raw) return;
          const prefs = JSON.parse(raw);

          if (prefs.preset && presetEl) presetEl.value = prefs.preset;
          if (typeof prefs.compare === "boolean" && $("compareToggle"))
            $("compareToggle").checked = prefs.compare;
          if (prefs.chartMode) chartMode = prefs.chartMode;
        } catch {}
      }

      saveBtn?.addEventListener("click", savePrefs);
      loadPrefs(); // restore

      function syncChartBtnUI() {
        if (!chartBtn) return;

        let iconSrc = "";
        let title = "";

        if (chartMode === "auto") {
          iconSrc = "images/bar-graph.png";
          title = "Chart: Auto";
        } else if (chartMode === "hourly") {
          iconSrc = "images/bar-graph.png";
          title = "Chart: Hourly";
        } else {
          iconSrc = "images/pie-chart.png";
          title = "Chart: Daily";
        }

        chartBtn.innerHTML = `
    <img src="${iconSrc}" alt="${title}" />
  `;
        chartBtn.title = title;
      }

      syncChartBtnUI(); // ✅ call once on load (after loadPrefs)

      compare = compareEl ? compareEl.checked : true;
      applyLegend(compare);

      // =============================
      // DATE PRESET HANDLER
      // =============================
      function nextChartMode() {
        if (chartMode === "auto") chartMode = "hourly";
        else if (chartMode === "hourly") chartMode = "daily";
        else chartMode = "auto";

        // small visible feedback
        if (chartBtn) {
          let iconSrc = "";
          let title = "";

          if (chartMode === "auto") {
            iconSrc = "images/bar-graph.png";
            title = "Chart: Auto";
          } else if (chartMode === "hourly") {
            iconSrc = "images/bar-graph.png";
            title = "Chart: Hourly";
          } else {
            iconSrc = "images/pie-chart.png";
            title = "Chart: Daily";
          }

          chartBtn.innerHTML = `
    <img src="${iconSrc}" alt="${title}" />
  `;
          chartBtn.title = title;
        }

        resubscribeOrders();
      }

      chartBtn?.addEventListener("click", nextChartMode);

      function applyPreset() {
        if (!presetEl) return;

        const { start, end } = getRangeFromPreset(presetEl.value);
        rangeStart = start;
        rangeEnd = end;

        resubscribeOrders();
      }

      presetEl?.addEventListener("change", applyPreset);
      applyPreset(); // ✅ initial load

      // reviews listener
      // reviews listener
      if (unsubReviews) unsubReviews();
      const reviewsStallId = await resolveTopLevelStallId(stallId, stall);

      if (reviewsStallId) {
        unsubReviews = listenReviews(reviewsStallId, (reviews) => {
          renderRatingsUI(calcRatings(reviews));
        });
      } else {
        // no valid public stall id -> show empty state safely
        renderRatingsUI({
          avg: 0,
          counts: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
          total: 0,
        });
      }
    } catch (err) {
      console.error(err);
      alert(`Analytics failed: ${err.message}`);
    }
  });
});
