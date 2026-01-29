import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
   Mock Data
========================= */
const TREND_DATA = [
  { year: "2024", score: 78, grade: "B", date: "12 Dec 2024" },
  { year: "2025", score: 85, grade: "A", date: "05 Jun 2025" },
  { year: "2026", score: 90, grade: "A", date: "12 Jan 2026" }
];

const BREAKDOWN_DATA = [
  { label: "Food Hygiene Practices", score: 100 },
  { label: "Personal Hygiene", score: 95 },
  { label: "Upkeep of Premises", score: 82 },
  { label: "Pest Control", score: 100 }
];

/* =========================
   DOM & Init
========================= */
const stallImg = document.getElementById("stallImg");
const stallName = document.getElementById("stallName");
const cgValue = document.getElementById("cgValue");
const chartWrap = document.getElementById("chartWrap");
const breakdownList = document.getElementById("breakdownList");

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
      // Mock percentage based on grade
      const pct = grade === 'A' ? 94 : 78;
      cgValue.textContent = `${grade} (${pct}%)`;
      
      // Update chart/breakdown colors based on grade
      renderChart(TREND_DATA, grade);
      renderBreakdown(BREAKDOWN_DATA);
    }
  } catch (e) {
    console.error(e);
    stallName.textContent = "Error loading stall";
  }
}

/* =========================
   Render Logic
========================= */
function renderChart(trend, currentGrade) {
  // Clear old bars (keep grid)
  const grid = chartWrap.querySelector(".chartGrid");
  chartWrap.innerHTML = "";
  chartWrap.appendChild(grid);

  trend.forEach((t, idx) => {
    // If it's the last item, match current grade logic
    const grade = (idx === trend.length - 1) ? currentGrade : t.grade;
    const score = (idx === trend.length - 1 && currentGrade !== t.grade) 
                  ? (currentGrade === 'A' ? 92 : 75) 
                  : t.score;

    const col = document.createElement("div");
    col.className = "chartCol";

    let bg = "#16a34a"; // green
    if (grade === "A") bg = "#ff0000"; // red
    if (grade === "C") bg = "#ca8a04"; // orange

    col.innerHTML = `
      <div class="chartBar" style="height: ${score}%; background: ${bg}; width: 32px;">
        <div class="chartValue" style="bottom: 100%; margin-bottom: 6px; font-size:11px; color:#333;">${t.date}</div>
      </div>
      <div class="chartLabel" style="font-size:13px; margin-top:8px;">${t.year}</div>
    `;
    chartWrap.appendChild(col);
  });
}

function renderBreakdown(items) {
  breakdownList.innerHTML = items.map(item => {
    // Color logic: <85 yellow, else green
    const color = item.score < 90 ? "#ccfb2e" : "#00c853"; 
    // note: screenshot uses bright yellow-green for upkeep (82%)

    return `
      <div class="bdRow">
        <div class="bdTop">
          <span class="bdLabel">${item.label}</span>
          <span class="bdScore">${item.score}%</span>
        </div>
        <div class="bdTrack">
          <div class="bdFill" style="width: ${item.score}%; background: ${color};"></div>
        </div>
      </div>
    `;
  }).join("");
}

// Mobile Back
document.getElementById("mobileBackBtn")?.addEventListener("click", () => {
  window.history.back();
});

// Run
init();