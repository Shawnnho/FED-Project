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
    where("status", "in", ["paid", "preparing", "ready", "completed"]),
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
  const hh = Math.floor(mins / 60);
  const isPM = hh >= 12;
  const hr12 = ((hh + 11) % 12) + 1;
  return `${hr12}${isPM ? "PM" : "AM"}`;
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
    where("status", "in", ["paid", "preparing", "ready", "completed"]),
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
  // 1) If stalls/{id} exists, use it
  const direct = await getDoc(doc(db, "stalls", stallIdFromCentre));
  if (direct.exists()) return stallIdFromCentre;

  // 2) Otherwise, find it by centreId + stallName (matches your premade stalls)
  const centreId =
    stallData.centreId || stallData.centre || stallData.hawkerCentreId;
  const stallName = stallData.stallName || stallData.name;

  if (!centreId || !stallName) return stallIdFromCentre;

  const q = query(
    collection(db, "stalls"),
    where("centreId", "==", centreId),
    where("stallName", "==", stallName),
    limit(1),
  );

  const snap = await getDocs(q);
  if (!snap.empty) return snap.docs[0].id;

  return stallIdFromCentre;
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
      // ----------------------------
      // FILTERED ORDERS LISTENER
      // ----------------------------
      let rangeStart = todayStart;
      let rangeEnd = todayEnd;

      function getRangeFromPreset(preset) {
        const base = new Date(); // local time
        if (preset === "yesterday") {
          const d = new Date(base);
          d.setDate(d.getDate() - 1);
          return { start: startOfDay(d), end: endOfDay(d), label: "Yesterday" };
        }
        if (preset === "last7") {
          const end = endOfDay(base);
          const start = startOfDay(new Date(base));
          start.setDate(start.getDate() - 6); // last 7 days incl today
          return { start, end, label: "Last 7 days" };
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
              const prevEnd = new Date(rangeStart);
              prevEnd.setMilliseconds(prevEnd.getMilliseconds() - 1);
              const prevStart = new Date(prevEnd);
              prevStart.setDate(prevStart.getDate() - (days - 1));

              const prevSnap = await getDocs(
                query(
                  collection(db, COL_ORDERS),
                  where("stallId", "==", stallId),
                  where("status", "in", [
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

            const hNow = calcHourlySales(ordersInRange, rangeStart, stall, 60);
            const hPrev = compare
              ? calcHourlySales(ySeries, new Date(rangeStart), stall, 60)
              : { data: [] };

            drawChart({
              labels: hNow.labels,
              today: hNow.data,
              yesterday: hPrev.data,
              compare,
            });

            renderTopDishesRows(calcTopDishes(ordersInRange));
          },
        );
      }

      // =============================
      // DATE PRESET HANDLER
      // =============================
      const presetEl = $("datePreset");

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
      if (unsubReviews) unsubReviews();
      const reviewsStallId = await resolveTopLevelStallId(stallId, stall);

      if (unsubReviews) unsubReviews();
      unsubReviews = listenReviews(reviewsStallId, (reviews) => {
        renderRatingsUI(calcRatings(reviews));
      });
    } catch (err) {
      console.error(err);
      alert(`Analytics failed: ${err.message}`);
    }
  });
});
