import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* Firebase Config */
const firebaseConfig = {
  apiKey: "AIzaSyC-NTWADB-t1OGl7NbdyMVXjpVjnqjpTXg",
  authDomain: "fedproject-8d254.firebaseapp.com",
  projectId: "fedproject-8d254",
  storageBucket: "fedproject-8d254.firebasestorage.app",
  messagingSenderId: "477538553634",
  appId: "1:477538553634:web:a14b93bbd93d33b9281f7b",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* =========================
   Mock Data for Charts/History
   (In a real app, this would be a subcollection)
========================= */
const MOCK_DATA = {
  default: {
    history: [
      { date: "12 Jan 2026", score: 90, grade: "A", remarks: "Stall is well maintained. Food handlers properly attired." },
      { date: "05 Jun 2025", score: 85, grade: "A", remarks: "Minor water ponding observed. Rectified immediately." },
      { date: "12 Dec 2024", score: 78, grade: "B", remarks: "Grease trap requires cleaning." }
    ],
    trend: [
      { year: "2024", score: 78, grade: "B", date: "12 Dec 2024" },
      { year: "2025", score: 85, grade: "A", date: "05 Jun 2025" },
      { year: "2026", score: 90, grade: "A", date: "12 Jan 2026" }
    ],
    license: {
      days: 162,
      status: "Active",
      issued: "1 Jan 2026",
      expiry: "31 Dec 2026"
    }
  },
  // We can add specific overrides for other stalls if needed
  // otherwise they all use default with variations
};

/* =========================
   DOM Elements
========================= */
const stallSelect = document.getElementById("stallSelect");
const bigGrade = document.getElementById("bigGrade");
const gradeLabel = document.getElementById("gradeLabel");
const gradeCard = document.getElementById("gradeCard");

const licDays = document.getElementById("licenseDays");
const licStatus = document.getElementById("licenseStatus");
const licFill = document.getElementById("licenseFill");
const licIssue = document.getElementById("issueDate");
const licExpiry = document.getElementById("expiryDate");

const chartWrap = document.getElementById("chartWrap");
const chartFooter = document.getElementById("chartFooter");
const historyRows = document.getElementById("historyRows");

const viewHistoryBtn = document.getElementById("viewHistoryBtn");

/* =========================
   Logic
========================= */

let currentStallId = null;

async function loadStalls() {
  // Get ID from URL if present
  const params = new URLSearchParams(window.location.search);
  const preselectId = params.get("id");

  const q = query(collection(db, "stalls"), where("active", "==", true));
  const snap = await getDocs(q);

  const stalls = snap.docs.map(d => ({
    id: d.id,
    name: d.data().stallName || d.data().name || "Unknown Stall",
    grade: d.data().hygieneGrade || d.data().grade || "B"
  })).sort((a,b) => a.name.localeCompare(b.name));

  // Populate Select
  stallSelect.innerHTML = `<option value="" disabled ${!preselectId ? 'selected' : ''}>Select Stall</option>`;

  stalls.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    opt.dataset.grade = s.grade; // store grade in DOM
    if (s.id === preselectId) opt.selected = true;
    stallSelect.appendChild(opt);
  });

  if (preselectId) {
    renderStallData(preselectId, stalls.find(s => s.id === preselectId)?.grade || "B");
  }

  stallSelect.addEventListener("change", (e) => {
    const opt = stallSelect.options[stallSelect.selectedIndex];
    renderStallData(e.target.value, opt.dataset.grade);
  });
}

function renderStallData(stallId, currentGrade) {
  currentStallId = stallId; // Store it

  // 1. Grade Card
  bigGrade.textContent = currentGrade;

  let color = "#16a34a"; // Green (B)
  let text = "Good Hygiene Standards";

  if (currentGrade === "A") {
    color = "#ff0000"; // Red
    text = "Excellent Hygiene Standards";
  } else if (currentGrade === "C" || currentGrade === "D") {
    color = "#ca8a04"; // Yellow/Orange
    text = "Average Hygiene Standards";
  }

  gradeCard.style.backgroundColor = color;
  gradeLabel.textContent = text;

  // 2. Mock Data (License, Chart, History)
  // Use pseudo-random logic to vary data based on ID length so it feels dynamic
  const seed = stallId.length;
  const data = MOCK_DATA.default;

  // License
  const days = 100 + (seed * 10);
  const totalDays = 365;
  const pct = Math.min(100, (days / totalDays) * 100);

  licDays.textContent = `${days} Days`;
  licStatus.textContent = "Active";
  licFill.style.width = `${pct}%`;
  // use existing dates from mock
  licIssue.textContent = `Issued: ${data.license.issued}`;
  licExpiry.textContent = `Expired: ${data.license.expiry}`;

  // Chart
  renderChart(data.trend, currentGrade);

  // History
  renderHistory(data.history, currentGrade);
}

function renderChart(trend, currentGrade) {
  // Clear old bars (keep grid)
  const grid = chartWrap.querySelector(".chartGrid");
  chartWrap.innerHTML = "";
  chartWrap.appendChild(grid);

  trend.forEach((t, idx) => {
    // If it's the last item, force it to match current grade for consistency
    const grade = (idx === trend.length - 1) ? currentGrade : t.grade;
    const score = (idx === trend.length - 1 && currentGrade !== t.grade) 
                  ? (currentGrade === 'A' ? 92 : 75) 
                  : t.score;

    const col = document.createElement("div");
    col.className = "chartCol";

    // color based on grade
    let bg = "#16a34a";
    if (grade === "A") bg = "#ff0000";
    if (grade === "C") bg = "#ca8a04";

    const heightPct = score; // 0 to 100

    col.innerHTML = `
      <div class="chartBar" style="height: ${heightPct}%; background: ${bg};">
        <div class="chartValue" style="bottom: 100%; margin-bottom: 4px; color:${bg}">${t.date}</div>
      </div>
      <div class="chartLabel">${t.year}</div>
    `;
    chartWrap.appendChild(col);
  });

  chartFooter.innerHTML = `<span style="color:#16a34a; font-weight:900;">▲ Score improved by 5%</span> compared to last inspection.`;
}

function renderHistory(history, currentGrade) {
  historyRows.innerHTML = "";

  history.forEach((h, idx) => {
    // Force match current grade on latest entry
    const grade = (idx === 0) ? currentGrade : h.grade;
    const score = (idx === 0 && currentGrade !== h.grade) ? (currentGrade==='A'?90:78) : h.score;

    let bg = "#16a34a";
    if (grade === "A") bg = "#ff0000";
    if (grade === "C") bg = "#ca8a04";

    const row = document.createElement("div");
    row.className = "histRow histDataRow";
    row.innerHTML = `
      <div>${h.date}</div>
      <div style="font-weight:700;">${score}/100</div>
      <div><div class="histGrade" style="background:${bg}">${grade}</div></div>
      <div style="font-size:13px; line-height:1.3; color:#444;">${h.remarks}</div>
    `;
    historyRows.appendChild(row);
  });
}

// Init
loadStalls();

// Add listener for view history button
if (viewHistoryBtn) {
  viewHistoryBtn.addEventListener("click", () => {
    if (currentStallId) {
      window.location.href = `hygiene-history.html?id=${currentStallId}`;
    } else {
      alert("Please select a stall first.");
    }
  });
}

// Hygiene Trend Button
const viewTrendBtn = document.getElementById("viewTrendBtn");

if (viewTrendBtn) {
  viewTrendBtn.addEventListener("click", () => {
    if (currentStallId) {
      window.location.href = `hygiene-trend.html?id=${currentStallId}`;
    } else {
      alert("Please select a stall first.");
    }
  });
}