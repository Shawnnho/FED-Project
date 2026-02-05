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
  getDocs,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* Firebase Config (same as your hygiene.js) */
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

/* =========================
   DOM
========================= */
const stallTitle = document.getElementById("stallTitle");
const ownerName = document.getElementById("ownerName");
const logoutBtn = document.getElementById("logoutBtn");

const bigGrade = document.getElementById("bigGrade");
const gradeLabel = document.getElementById("gradeLabel");
const gradeCard = document.getElementById("gradeCard");

const licDays = document.getElementById("licenseDays");
const licStatus = document.getElementById("licenseStatus");
const licFill = document.getElementById("licenseFill");
const licIssue = document.getElementById("issueDate");
const licExpiry = document.getElementById("expiryDate");

const upcomingCard = document.getElementById("upcomingCard");
const upcomingDate = document.getElementById("upcomingDate");
const upcomingOfficer = document.getElementById("upcomingOfficer");

const chartWrap = document.getElementById("chartWrap");
const chartFooter = document.getElementById("chartFooter");
const historyRows = document.getElementById("historyRows");

const viewHistoryBtn = document.getElementById("viewHistoryBtn");
const viewTrendBtn = document.getElementById("viewTrendBtn");
const stallMeta = document.getElementById("stallMeta");

/* =========================
   Helpers (same style as hygiene.js)
========================= */
function getGradeColor(grade) {
  if (grade === "A") return "#16a34a";
  if (grade === "B") return "#2f6bff";
  if (grade === "C") return "#ca8a04";
  if (grade === "D") return "#dc2626";
  return "#16a34a";
}

function getGradeText(grade) {
  if (grade === "A") return "Excellent Hygiene Standards";
  if (grade === "B") return "Good Hygiene Standards";
  if (grade === "C") return "Average Hygiene Standards";
  if (grade === "D") return "Poor Hygiene Standards";
  return "Unknown";
}

function formatDate(timestamp) {
  if (!timestamp) return "—";
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getLicenseDaysRemaining(expiryTs) {
  if (!expiryTs) return null;
  const now = new Date();
  const expiry = expiryTs.toDate ? expiryTs.toDate() : new Date(expiryTs);
  const diff = expiry - now;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getLicenseStatus(daysRemaining) {
  if (daysRemaining === null) return { text: "Unknown", class: "" };
  if (daysRemaining < 0) return { text: "Expired", class: "expired" };
  if (daysRemaining <= 30) return { text: "Expiring Soon", class: "warning" };
  return { text: "Active", class: "active" };
}

function formatLicenseDate(timestamp) {
  if (!timestamp) return "—";
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function renderLicenseValidity(issuedTs, expiryTs) {
  if (!issuedTs || !expiryTs) {
    licDays.textContent = "— Days";
    licStatus.textContent = "Unknown";
    licFill.style.width = "0%";
    licIssue.textContent = "Issued: —";
    licExpiry.textContent = "Expired: —";
    licStatus.className = "licenseTag";
    return;
  }

  const daysRemaining = getLicenseDaysRemaining(expiryTs);
  const status = getLicenseStatus(daysRemaining);

  licDays.textContent =
    daysRemaining >= 0
      ? `${daysRemaining} Days`
      : `${Math.abs(daysRemaining)} Days Overdue`;

  licStatus.textContent = status.text;
  licStatus.className = `licenseTag ${status.class}`;

  // progress %
  const now = new Date();
  const issued = issuedTs.toDate ? issuedTs.toDate() : new Date(issuedTs);
  const expiry = expiryTs.toDate ? expiryTs.toDate() : new Date(expiryTs);
  const total = expiry - issued;
  const elapsed = now - issued;
  const pct = Math.max(0, Math.min(100, (elapsed / total) * 100));

  licFill.style.width = `${pct}%`;
  licIssue.textContent = `Issued: ${formatLicenseDate(issuedTs)}`;
  licExpiry.textContent = `Expired: ${formatLicenseDate(expiryTs)}`;
}

/* =========================
   Chart + History (same layout as hygiene.js, but fixed label)
========================= */
function renderChart(trend) {
  // keep grid
  const grid = chartWrap.querySelector(".chartGrid");
  chartWrap.innerHTML = "";
  if (grid) chartWrap.appendChild(grid);

  if (!trend.length) {
    chartWrap.innerHTML = '<p class="chartEmpty">No inspection records yet</p>';
    return;
  }

  trend.forEach((t) => {
    const col = document.createElement("div");
    col.className = "chartCol";

    const bg = getGradeColor(t.grade);
    const heightPct = Math.max(0, Math.min(100, Number(t.score || 0)));

    col.innerHTML = `
      <div class="chartBar" style="height:${heightPct}%; background:${bg};">
        <div class="chartValue" style="bottom:100%; margin-bottom:4px; color:${bg}">
          ${t.label}
        </div>
      </div>
      <div class="chartLabel">${t.year}</div>
    `;
    chartWrap.appendChild(col);
  });
}

function renderHistory(history) {
  historyRows.innerHTML = "";

  if (!history.length) {
    historyRows.innerHTML =
      '<div class="emptyState" style="padding:18px; font-size:14px;">No inspection history available</div>';
    return;
  }

  history.forEach((h) => {
    const bg = getGradeColor(h.grade);

    const row = document.createElement("div");
    row.className = "histRow histDataRow";
    row.innerHTML = `
      <div>${h.date}</div>
      <div style="font-weight:700;">${h.score}/100</div>
      <div><div class="histGrade" style="background:${bg}">${h.grade}</div></div>
      <div style="font-size:13px; line-height:1.3; color:#444;">${h.remarks}</div>
    `;
    historyRows.appendChild(row);
  });
}

/* =========================
   Data loading (LOCKED)
========================= */
let currentStallId = null;

async function loadLockedStallForUser(uid) {
  const userSnap = await getDoc(doc(db, "users", uid));
  if (!userSnap.exists()) throw new Error("User profile not found.");

  const u = userSnap.data();

  const role = u.role || "customer";
  const lockedStallId = u.stallId || null;
  const centreId = u.centreId || null;

  if (role !== "storeholder") {
    window.location.href = "signin.html";
    return null;
  }

  if (!lockedStallId) throw new Error("No stallId linked to this account.");
  if (!centreId) throw new Error("No centreId linked to this account.");

  ownerName.textContent = u.name || u.username || u.email || "Owner";
  return { stallId: lockedStallId, centreId };
}

async function loadStallDoc(centreId, stallId) {
  const snap = await getDoc(doc(db, "centres", centreId, "stalls", stallId));
  return snap.exists() ? snap.data() : null;
}

async function loadInspectionData(stallId) {
  // UPCOMING (scheduled)
  try {
    const qUpcoming = query(
      collection(db, "inspections"),
      where("stallId", "==", stallId),
      where("status", "==", "scheduled"),
    );
    const upSnap = await getDocs(qUpcoming);

    if (!upSnap.empty) {
      const upcoming = upSnap.docs
        .map((d) => d.data())
        .sort((a, b) => {
          const da = a.dateTs?.toDate
            ? a.dateTs.toDate()
            : new Date(a.dateTs || a.date || 0);
          const dbb = b.dateTs?.toDate
            ? b.dateTs.toDate()
            : new Date(b.dateTs || b.date || 0);
          return da - dbb; // earliest first
        })[0];

      upcomingDate.textContent = formatDate(upcoming.dateTs || upcoming.date);
      upcomingOfficer.textContent = `Officer: ${upcoming.officer || upcoming.officerName || "—"}`;
      upcomingCard.style.display = "block";
    } else {
      upcomingCard.style.display = "none";
    }
  } catch (e) {
    upcomingCard.style.display = "none";
  }

  // COMPLETED
  const inspectionsQuery = query(
    collection(db, "inspections"),
    where("stallId", "==", stallId),
    where("status", "==", "completed"),
  );
  const snap = await getDocs(inspectionsQuery);

  if (snap.empty) {
    renderChart([]);
    renderHistory([]);
    chartFooter.innerHTML = "";
    return { latestCompleted: null, allCompleted: [] };
  }

  const completed = snap.docs
    .map((d) => d.data())
    .sort((a, b) => {
      const da = a.dateTs?.toDate ? a.dateTs.toDate() : new Date(a.dateTs || 0);
      const dbb = b.dateTs?.toDate
        ? b.dateTs.toDate()
        : new Date(b.dateTs || 0);
      return dbb - da; // newest first
    });

  const latestCompleted = completed[0];

  // trend (last 5) oldest -> newest
  const trend = completed
    .slice(0, 5)
    .reverse()
    .map((insp) => {
      const d = insp.dateTs?.toDate
        ? insp.dateTs.toDate()
        : new Date(insp.dateTs || 0);
      return {
        year: String(d.getFullYear()),
        score: insp.score,
        grade: insp.grade,
        label: formatDate(insp.dateTs),
      };
    });

  const history = completed.slice(0, 8).map((insp) => ({
    date: formatDate(insp.dateTs),
    score: insp.score,
    grade: insp.grade,
    remarks: insp.remarks || "No remarks provided",
  }));

  renderChart(trend);
  renderHistory(history);

  // footer change %
  if (completed.length >= 2) {
    const latest = Number(completed[0].score || 0);
    const prev = Number(completed[1].score || 0);
    if (prev > 0) {
      const change = latest - prev;
      const pct = Math.round((change / prev) * 100);
      if (change > 0) {
        chartFooter.innerHTML = `<span style="color:#16a34a; font-weight:900;">▲ Score improved by ${Math.abs(
          pct,
        )}%</span> compared to last inspection.`;
      } else if (change < 0) {
        chartFooter.innerHTML = `<span style="color:#dc2626; font-weight:900;">▼ Score declined by ${Math.abs(
          pct,
        )}%</span> compared to last inspection.`;
      } else {
        chartFooter.innerHTML = `<span style="color:#6b7280; font-weight:900;">= Score unchanged</span> compared to last inspection.`;
      }
    } else {
      chartFooter.innerHTML = "";
    }
  } else {
    chartFooter.innerHTML = "";
  }

  return { latestCompleted, allCompleted: completed };
}

function setGradeUI(grade) {
  bigGrade.textContent = grade || "—";
  const color = getGradeColor(grade);
  gradeCard.style.backgroundColor = color;
  gradeLabel.textContent = grade ? getGradeText(grade) : "No inspections yet";
}

/* =========================
   Events
========================= */
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "signin.html";
  });
}

if (viewHistoryBtn) {
  viewHistoryBtn.addEventListener("click", () => {
    if (!currentStallId) return;
    window.location.href = `hygiene-history.html?id=${currentStallId}`;
  });
}

if (viewTrendBtn) {
  viewTrendBtn.addEventListener("click", () => {
    if (!currentStallId) return;
    window.location.href = `hygiene-trend.html?id=${currentStallId}`;
  });
}

/* =========================
   Boot
========================= */
onAuthStateChanged(auth, async (user) => {
  try {
    if (!user) {
      window.location.href = "signin.html";
      return;
    }

    const ctx = await loadLockedStallForUser(user.uid);
    if (!ctx) return;

    const { stallId, centreId } = ctx;
    currentStallId = stallId;
    if (stallMeta) stallMeta.textContent = `Stall ID: ${stallId}`;

    const stall = await loadStallDoc(centreId, stallId);

    const displayName =
      stall?.stallName || stall?.StallName || stall?.name || stallId;

    if (stallTitle) stallTitle.textContent = displayName;

    const fallbackGrade = stall?.hygieneGrade || stall?.grade || "B";

    renderLicenseValidity(stall?.licenseIssued, stall?.licenseExpiry);

    // inspections (grade should follow latest completed if exists)
    const { latestCompleted } = await loadInspectionData(stallId);

    const finalGrade =
      latestCompleted?.grade ||
      (typeof latestCompleted?.score === "number"
        ? latestCompleted.grade
        : fallbackGrade);

    setGradeUI(finalGrade);
  } catch (err) {
    console.error(err);
    setGradeUI(null);
    if (chartWrap)
      chartWrap.innerHTML = '<p class="chartEmpty">Error loading data</p>';
    if (historyRows)
      historyRows.innerHTML =
        '<div class="emptyState" style="padding:18px; font-size:14px;">Error loading history</div>';
    alert(err.message);
  }
});
