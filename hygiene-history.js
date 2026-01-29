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
   Mock Data Generation
========================= */
const REMARKS_POOL = [
  "Stall is well maintained. Food handlers properly attired.",
  "Minor water ponding observed. Rectified immediately.",
  "Grease trap requires cleaning.",
  "Food handlers not wearing caps properly. Warning issued.",
  "Routine check. No issues found.",
  "Floor trap cover missing. Replaced on spot.",
  "Excellent cleanliness standards observed.",
  "Fridge temperature slightly high. Adjustment made."
];

function generateHistory(count) {
  const data = [];
  const now = new Date();
  
  for (let i = 0; i < count; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - (i * 14)); // every 2 weeks roughly
    
    const score = 70 + Math.floor(Math.random() * 28); // 70-98
    const grade = score >= 85 ? 'A' : (score >= 70 ? 'B' : 'C');
    const remarks = REMARKS_POOL[Math.floor(Math.random() * REMARKS_POOL.length)];
    const year = d.getFullYear();
    const ref = `CE-${String(year).slice(2)}-${1000 + i}`;
    const officer = `NEA-${8000 + Math.floor(Math.random() * 999)}`;

    data.push({
      dateObj: d,
      dateStr: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      score,
      grade,
      remarks,
      ref,
      officer,
      year: String(year)
    });
  }
  return data;
}

let allHistory = [];
let currentFilter = { q: "", year: "", grade: "" };

/* =========================
   DOM & Init
========================= */
const stallImg = document.getElementById("stallImg");
const stallName = document.getElementById("stallName");
const cgValue = document.getElementById("cgValue");
const tableBody = document.getElementById("tableBody");
const mobileList = document.getElementById("mobileList");
const recordCount = document.getElementById("recordCount");

const searchInput = document.getElementById("searchInput");
const yearSelect = document.getElementById("yearFilter");
const gradeSelect = document.getElementById("gradeFilter");
const pills = document.querySelectorAll(".hhPill");

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
    }
  } catch (e) {
    console.error(e);
    stallName.textContent = "Error loading stall";
  }

  // Generate Data
  allHistory = generateHistory(124); // mock 124 records
  render();
}

/* =========================
   Render Logic
========================= */
function render() {
  const q = currentFilter.q.toLowerCase();
  
  const filtered = allHistory.filter(h => {
    const matchQ = !q || h.dateStr.toLowerCase().includes(q) || h.remarks.toLowerCase().includes(q) || h.ref.toLowerCase().includes(q);
    const matchYear = !currentFilter.year || h.year === currentFilter.year;
    const matchGrade = !currentFilter.grade || h.grade === currentFilter.grade;
    return matchQ && matchYear && matchGrade;
  });

  // Desktop Table
  tableBody.innerHTML = filtered.slice(0, 8).map(h => {
    const badgeClass = h.grade === 'A' ? 'badgeRed' : (h.grade === 'B' ? 'badgeGreen' : 'badgeOrange');
    return `
      <tr>
        <td><span style="font-weight:700">${h.dateStr}</span></td>
        <td><span style="font-weight:600">${h.score}/100</span></td>
        <td><span class="hhBadge ${badgeClass}">${h.grade}</span></td>
        <td>${h.remarks}</td>
      </tr>
    `;
  }).join("");

  // Mobile Cards
  mobileList.innerHTML = filtered.slice(0, 5).map(h => {
    const borderClass = h.grade === 'A' ? 'borderRed' : 'borderGreen';
    const badgeClass = h.grade === 'A' ? 'badgeRed' : 'badgeGreen';
    
    return `
      <div class="hhMobileCard ${borderClass}">
        <div class="mcHead">
          <div>
            <div class="mcDate">${h.dateStr}</div>
            <div class="mcRef">REF: ${h.ref}</div>
          </div>
          <div class="hhBadge ${badgeClass}">${h.grade}</div>
        </div>
        
        <div class="mcBody">${h.remarks}</div>
        
        <div class="mcDivider"></div>
        
        <div class="mcFoot">
          <div class="mcStat">
            <span class="mcLabel">Score</span>
            <span class="mcVal">${h.score}</span>
          </div>
          <div class="mcStat" style="text-align:right;">
            <span class="mcLabel">Officer</span>
            <span class="mcVal">${h.officer}</span>
          </div>
        </div>
      </div>
    `;
  }).join("");

  recordCount.textContent = `Showing ${Math.min(8, filtered.length)} of ${filtered.length} records`;
}

/* =========================
   Event Listeners
========================= */
searchInput.addEventListener("input", (e) => {
  currentFilter.q = e.target.value;
  render();
});

// Desktop Dropdowns
yearSelect.addEventListener("change", (e) => {
  currentFilter.year = e.target.value;
  render();
});
gradeSelect.addEventListener("change", (e) => {
  currentFilter.grade = e.target.value;
  render();
});

// Mobile Pills
pills.forEach(btn => {
  btn.addEventListener("click", () => {
    pills.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    
    const val = btn.dataset.filter;
    if (val === "all") {
      currentFilter.grade = "";
      currentFilter.year = "";
    } else if (val === "A" || val === "B") {
      currentFilter.grade = val;
      currentFilter.year = "";
    } else {
      currentFilter.year = val;
      currentFilter.grade = "";
    }
    render();
  });
});

// Mobile Back
document.getElementById("mobileBackBtn")?.addEventListener("click", () => {
  window.history.back();
});

// Run
init();