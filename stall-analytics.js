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

// =============================
// STALL LOOKUP (stall-holder -> stallId)
// =============================
async function getMyStall() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");

  // CHANGE "ownerUid" only if your stall uses different field
  const qStall = query(
    collection(db, COL_STALLS),
    where("ownerUid", "==", user.uid),
  );
  const snap = await getDocs(qStall);
  if (snap.empty) throw new Error("No stall found for this user");

  const stallDoc = snap.docs[0];
  return { stallId: stallDoc.id, ...stallDoc.data() };
}

// =============================
// ORDERS (top-level orders/{orderId})
// =============================
function listenOrders(stallId, rangeStart, rangeEnd, cb) {
  const ordersRef = collection(db, COL_ORDERS);

  // CHANGE field names if your schema differs:
  // stallId, status, createdAt, total, items
  const qOrders = query(
    ordersRef,
    where("stallId", "==", stallId),
    where("status", "==", "completed"),
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
  for (const o of orders) totalSales += Number(o.total || 0);
  return { totalSales, totalOrders: orders.length };
}

function parseHHMM(str) {
  // "07:30" -> minutes from midnight
  const m = String(str || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function fmtLabel(mins) {
  // mins from midnight -> "7AM", "12PM", "1PM"
  const hh = Math.floor(mins / 60);
  const isPM = hh >= 12;
  const hr12 = ((hh + 11) % 12) + 1;
  return `${hr12}${isPM ? "PM" : "AM"}`;
}

function getHoursForDate(stall, dateObj) {
  // Supports:
  // - stall.openTime / stall.closeTime
  // - stall.operatingHours.{mon..sun}.{open,close}

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

  // If close <= open (overnight), we’ll treat as same-day end; simplest fix:
  // you can expand this later if you really support overnight stalls.
  const safeEndM = endM > startM ? endM : startM + 60;

  // Build labels + buckets
  const labels = [];
  const buckets = [];

  // We want ticks like: open hour, open+step, ... up to last slot starting before close
  for (let t = startM; t <= safeEndM; t += stepMins) {
    labels.push(fmtLabel(t));
    buckets.push(0);
  }

  // Bucket orders by time
  for (const o of orders) {
    const ts = o.createdAt?.toDate?.();
    if (!ts) continue;
    if (!sameDay(ts, whichDay)) continue;

    const mins = ts.getHours() * 60 + ts.getMinutes();
    if (mins < startM || mins > safeEndM) continue;

    const idx = Math.min(
      buckets.length - 1,
      Math.floor((mins - startM) / stepMins),
    );

    buckets[idx] += Number(o.total || 0);
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
      const price = Number(it.price ?? 0);
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
  const reviewsRef = collection(db, COL_STALLS, stallId, SUB_REVIEWS);
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

// =============================
// CANVAS CHART
// =============================
function drawChart({ labels, today, yesterday, compare }) {
  const canvas = $("salesChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  // set size
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(260 * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const w = rect.width;
  const h = 260;

  ctx.clearRect(0, 0, w, h);

  const padL = 50,
    padR = 20,
    padT = 20,
    padB = 40;
  const cw = w - padL - padR;
  const ch = h - padT - padB;

  const series = compare ? today.concat(yesterday) : today;
  const maxY = Math.max(100, ...series);
  const minY = 0;

  // grid
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = 1;

  for (let i = 0; i <= 4; i++) {
    const y = padT + (ch * i) / 4;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + cw, y);
    ctx.stroke();

    const val = Math.round(maxY - (maxY * i) / 4);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.font = "12px sans-serif";
    ctx.fillText(String(val), 10, y + 4);
  }

  // x labels
  const stepX = cw / (labels.length - 1);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.font = "12px sans-serif";
  labels.forEach((lab, i) => {
    if (i % 2 !== 0) return;
    const x = padL + i * stepX;
    ctx.fillText(lab, x - 14, padT + ch + 26);
  });

  function plot(values, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = padL + i * stepX;
      const y = padT + ch - ((v - minY) / (maxY - minY)) * ch;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  plot(today, "#e88e40");
  if (compare) plot(yesterday, "#2b66d9");
}

// ========================
// Load inspection function
// ========================

async function loadNextInspection(stallId) {
  const nowTs = Timestamp.fromDate(new Date());

  const qNext = query(
    collection(db, "inspections"),
    where("stallId", "==", stallId),
    where("dateTs", ">=", nowTs),
    orderBy("dateTs", "asc"),
    limit(1),
  );

  const snap = await getDocs(qNext);

  if (snap.empty) {
    setText("kpiGradeHint", "No upcoming inspection");
    setText("hygHint", "No upcoming inspection scheduled");
    return;
  }

  const insp = snap.docs[0].data();
  const days = daysUntil(insp.dateTs);

  let msg;
  if (days === 0) msg = "Inspection today";
  else if (days === 1) msg = "Inspection tomorrow";
  else msg = `Next hygiene check in ${days} days`;

  setText("kpiGradeHint", msg);
  setText("hygHint", msg);
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
      setText("ownerName", stall.ownerName || user.email || "Owner");
      setText("role", stall.role || "Stall Holder");

      // hygiene grade pulled from stalls/{stallId}
      const grade = String(stall.hygieneGrade || "—").toUpperCase();

      // map grade -> word
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

      // optional hint (if you don’t store next check date yet)
      const gradeHint = "—";

      // KPI card (top right) + right-side hygiene overview
      setText("kpiGrade", grade);
      setText("kpiGradeWord", gradeWord);
      setText("kpiGradeHint", gradeHint);

      setText("hygWhen", "Today");
      setText("hygGrade", grade);
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
      if (unsubOrders) unsubOrders();
      unsubOrders = listenOrders(
        stallId,
        todayStart,
        todayEnd,
        async (ordersToday) => {
          const { totalSales: salesToday, totalOrders: ordersTodayCount } =
            calcTotals(ordersToday);

          // month revenue (one-time fetch)
          const ordersMonthSnap = await getDocs(
            query(
              collection(db, COL_ORDERS),
              where("stallId", "==", stallId),
              where("status", "==", "completed"),
              where("createdAt", ">=", toTs(monthStart)),
              where("createdAt", "<=", toTs(monthEnd)),
              orderBy("createdAt", "asc"),
            ),
          );
          const ordersMonth = ordersMonthSnap.docs.map((d) => d.data());
          const { totalSales: revenueMonth } = calcTotals(ordersMonth);

          renderKpis({
            salesToday,
            ordersToday: ordersTodayCount,
            revenueMonth,
            grade,
            gradeWord,
            gradeHint,
          });

          // yesterday fetch for compare line
          const ordersYesterdaySnap = await getDocs(
            query(
              collection(db, COL_ORDERS),
              where("stallId", "==", stallId),
              where("status", "==", "completed"),
              where("createdAt", ">=", toTs(yStart)),
              where("createdAt", "<=", toTs(yEnd)),
              orderBy("createdAt", "asc"),
            ),
          );
          const ordersYesterday = ordersYesterdaySnap.docs.map((d) => d.data());

          const hToday = calcHourlySales(ordersToday, now, stall, 60);
          const hYest = calcHourlySales(ordersYesterday, y, stall, 60);

          drawChart({
            labels: hToday.labels,
            today: hToday.data,
            yesterday: hYest.data,
            compare,
          });

          // top dishes (today)
          renderTopDishesRows(calcTopDishes(ordersToday));
        },
      );

      // reviews listener
      if (unsubReviews) unsubReviews();
      unsubReviews = listenReviews(stallId, (reviews) => {
        renderRatingsUI(calcRatings(reviews));
      });
    } catch (err) {
      console.error(err);
      alert(`Analytics failed: ${err.message}`);
    }
  });
});
