import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
   Helper Functions
========================= */

// Grade color helper
function getGradeColor(grade) {
  if (grade === "A") return "#16a34a"; // Green
  if (grade === "B") return "#2f6bff"; // Blue
  if (grade === "C") return "#ca8a04"; // Orange
  if (grade === "D") return "#dc2626"; // Red
  return "#16a34a"; // Default green
}

// Format date for display
function formatDate(timestamp) {
  if (!timestamp) return "—";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Calculate grade from score
function calculateGrade(score) {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  return "D";
}

/* =========================
   DOM & Init
========================= */
const stallImg = document.getElementById("stallImg");
const stallName = document.getElementById("stallName");
const cgValue = document.getElementById("cgValue");
const chartWrap = document.getElementById("chartWrap");
const breakdownList = document.getElementById("breakdownList");
const chartFooter = document.querySelector(".chartFooter");

// Market comparison elements
const mStatRanking = document.querySelector(".mStat");
const mStatPercentile = document.querySelector(".mDivider + .mStat");
const compBar = document.querySelector(".compBar");
const compMarker = document.querySelector(".compMarker");
const compVal = document.querySelector(".compVal");
const avgCentreScoreLabel = document.getElementById("avgCentreScoreLabel");

const params = new URLSearchParams(window.location.search);
const id = params.get("id");

async function init() {
  if (!id) {
    window.location.href = "hygiene.html";
    return;
  }

  // Load Stall Info
  try {
    const snap = await getDoc(doc(db, "stalls", id));
    if (snap.exists()) {
      const s = snap.data();
      stallName.textContent = s.stallName || s.name;
      stallImg.src = s.imageUrl || s.img || "images/stalls/placeholder.jpg";

      const grade = s.hygieneGrade || s.grade || "B";

      // Get latest inspection data
      const latestInspection = await getLatestInspection(id);
      const score = latestInspection?.score || 78;
      const breakdown = latestInspection?.breakdown;

      cgValue.textContent = `${grade} (${score}%)`;

      // Update chart/breakdown colors based on grade
      await renderChart(id, grade);
      renderBreakdown(breakdown);

      // Update market comparison
      await renderMarketComparison(id, s.centreId, score);
    }
  } catch (e) {
    console.error(e);
    stallName.textContent = "Error loading stall";
  }
}

// Get latest completed inspection for a stall
async function getLatestInspection(stallId) {
  try {
    const q = query(
      collection(db, "inspections"),
      where("stallId", "==", stallId),
      where("status", "==", "completed")
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const inspections = snap.docs.map(d => d.data());
      // Sort by date descending and return first
      return inspections.sort((a, b) => {
        const dateA = a.dateTs?.toDate ? a.dateTs.toDate() : new Date(a.dateTs || 0);
        const dateB = b.dateTs?.toDate ? b.dateTs.toDate() : new Date(b.dateTs || 0);
        return dateB - dateA;
      })[0];
    }
  } catch (e) {
    console.error("Error getting latest inspection:", e);
  }
  return null;
}

// Render chart with trend data
async function renderChart(stallId, currentGrade) {
  // Clear old bars (keep grid)
  const grid = chartWrap.querySelector(".chartGrid");
  chartWrap.innerHTML = "";
  chartWrap.appendChild(grid);

  try {
    // Fetch all completed inspections for this stall
    const q = query(
      collection(db, "inspections"),
      where("stallId", "==", stallId),
      where("status", "==", "completed")
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      chartWrap.innerHTML = '<p class="chartEmpty">No inspection records yet</p>';
      if (chartFooter) chartFooter.innerHTML = "";
      return;
    }

    // Get last 5 inspections, sorted by date ascending
    const inspections = snap.docs
      .map(d => d.data())
      .sort((a, b) => {
        const dateA = a.dateTs?.toDate ? a.dateTs.toDate() : new Date(a.dateTs || 0);
        const dateB = b.dateTs?.toDate ? b.dateTs.toDate() : new Date(b.dateTs || 0);
        return dateA - dateB;
      })
      .slice(-5);

    inspections.forEach((insp) => {
      const date = insp.dateTs?.toDate ? insp.dateTs.toDate() : new Date(insp.dateTs || 0);
      const year = String(date.getFullYear());
      const score = insp.score;
      const grade = insp.grade || calculateGrade(score);
      const bg = getGradeColor(grade);

      const col = document.createElement("div");
      col.className = "chartCol";

      col.innerHTML = `
        <div class="chartBar" style="height: ${score}%; background: ${bg}; width: 32px;">
          <div class="chartValue" style="bottom: 100%; margin-bottom: 6px; font-size:11px; color:#333;">${formatDate(insp.dateTs)}</div>
        </div>
        <div class="chartLabel" style="font-size:13px; margin-top:8px;">${year}</div>
      `;
      chartWrap.appendChild(col);
    });

    // Calculate score change
    if (inspections.length >= 2) {
      const latest = inspections[inspections.length - 1].score;
      const previous = inspections[inspections.length - 2].score;
      const change = latest - previous;
      const changePct = Math.round((change / previous) * 100);

      if (chartFooter) {
        if (change > 0) {
          chartFooter.innerHTML = `<span style="color:#16a34a; font-weight:900;">▲ Score improved by ${Math.abs(changePct)}%</span> compared to last inspection.`;
        } else if (change < 0) {
          chartFooter.innerHTML = `<span style="color:#dc2626; font-weight:900;">▼ Score declined by ${Math.abs(changePct)}%</span> compared to last inspection.`;
        } else {
          chartFooter.innerHTML = `<span style="color:#6b7280; font-weight:900;">= Score unchanged</span> compared to last inspection.`;
        }
      }
    } else {
      if (chartFooter) chartFooter.innerHTML = "";
    }

  } catch (e) {
    console.error("Error rendering chart:", e);
    chartWrap.innerHTML = '<p class="chartEmpty">Error loading chart data</p>';
  }
}

// Render breakdown scores
function renderBreakdown(breakdown) {
  if (!breakdown) {
    breakdownList.innerHTML = '<p style="padding:20px; font-size:14px; color:#6b7280;">No detailed breakdown available</p>';
    return;
  }

  const categories = [
    { key: "foodHygiene", label: "Food Hygiene" },
    { key: "personalHygiene", label: "Personal Hygiene" },
    { key: "equipment", label: "Equipment" },
    { key: "premises", label: "Premises" }
  ];

  breakdownList.innerHTML = categories.map(cat => {
    const score = breakdown[cat.key] || 0;
    // Color logic: <85 yellow-green, else green
    const color = score < 90 ? "#ccfb2e" : "#00c853";

    return `
      <div class="bdRow">
        <div class="bdTop">
          <span class="bdLabel">${cat.label}</span>
          <span class="bdScore">${score}%</span>
        </div>
        <div class="bdTrack">
          <div class="bdFill" style="width: ${score}%; background: ${color};"></div>
        </div>
      </div>
    `;
  }).join("");
}

// Render market comparison
async function renderMarketComparison(stallId, centreId, stallScore) {
  if (!centreId) {
    updateMarketComparisonUI(null, null, null, null);
    return;
  }

  try {
    // Get all stalls in the same centre
    const stallsSnap = await getDocs(query(collection(db, "stalls"), where("centreId", "==", centreId), where("active", "==", true)));

    // Get latest inspection score for each stall in the centre
    const centreScores = [];
    for (const stallDoc of stallsSnap.docs) {
      const sid = stallDoc.id;
      if (sid === stallId) continue; // Skip current stall

      const inspection = await getLatestInspection(sid);
      if (inspection && inspection.score) {
        centreScores.push({
          stallId: sid,
          score: inspection.score
        });
      }
    }

    // Add current stall's score
    centreScores.push({ stallId, score: stallScore });

    // Sort by score descending
    centreScores.sort((a, b) => b.score - a.score);

    // Calculate ranking and percentile
    const ranking = centreScores.findIndex(s => s.stallId === stallId) + 1;
    const total = centreScores.length;
    const percentile = total > 1 ? Math.round(((total - ranking) / (total - 1)) * 100) : 0;

    // Calculate average centre score
    const avgScore = Math.round(centreScores.reduce((sum, s) => sum + s.score, 0) / total);

    updateMarketComparisonUI(ranking, percentile, avgScore, stallScore, total);

  } catch (e) {
    console.error("Error calculating market comparison:", e);
    updateMarketComparisonUI(null, null, null, null);
  }
}

// Update market comparison UI elements
function updateMarketComparisonUI(ranking, percentile, avgScore, stallScore, totalStalls) {
  const mStatRanking = document.querySelector(".mStat");
  const mStatPercentile = document.querySelector(".mDivider + .mStat");
  const compBar = document.querySelector(".compBar");
  const compMarker = document.querySelector(".compMarker");
  const compVal = document.querySelector(".compVal");

  if (ranking === null || totalStalls < 2) {
    // Insufficient data
    if (mStatRanking) mStatRanking.innerHTML = '<div class="mVal">—</div><div class="mLabel">Ranked</div>';
    if (mStatPercentile) mStatPercentile.innerHTML = '<div class="mVal">Insufficient data</div><div class="mLabel">Percentile</div>';
    return;
  }

  // Update ranking
  if (mStatRanking) {
    const rankClass = ranking <= 3 ? "bigGreen" : "";
    mStatRanking.innerHTML = `<div class="mVal ${rankClass}">#${ranking}</div><div class="mLabel">Ranked</div>`;
  }

  // Update percentile
  if (mStatPercentile) {
    const percentileClass = percentile >= 90 ? "bigGreen" : "";
    const percentileText = percentile >= 90 ? "Top 10%" : (percentile >= 50 ? "Top 50%" : `Top ${100 - percentile}%`);
    mStatPercentile.innerHTML = `<div class="mVal ${percentileClass}">${percentileText}</div><div class="mLabel">Percentile</div>`;
  }

  // Update comparison bar
  if (compBar && compMarker && compVal) {
    compBar.style.width = `${avgScore}%`;
    compMarker.style.left = `${stallScore}%`;
    compVal.textContent = `${stallScore}%`;
    if (avgCentreScoreLabel) {
      avgCentreScoreLabel.textContent = `Average Centre Score: ${avgScore}%`;
    }
  }
}

// Mobile Back
document.getElementById("mobileBackBtn")?.addEventListener("click", () => {
  window.history.back();
});

// Run
init();