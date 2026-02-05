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
   Data & State
========================= */
let allHistory = [];
let currentFilter = { q: "", year: "", grade: "" };

// Format date for display
function formatDate(timestamp) {
  if (!timestamp) return "—";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Generate reference number from date
function generateRef(dateStr) {
  const date = new Date(dateStr);
  const year = String(date.getFullYear()).slice(-2);
  return `CE-${year}-${1000 + Math.floor(Math.random() * 9000)}`;
}

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
      // Get latest inspection score for percentage
      const pct = await getLatestScore(id);
      cgValue.textContent = `${grade} (${pct}%)`;
    }
  } catch (e) {
    console.error(e);
    stallName.textContent = "Error loading stall";
  }

  // Load Real Inspection Data
  await loadInspectionData();
}

// Get latest inspection score for percentage display
async function getLatestScore(stallId) {
  try {
    const q = query(
      collection(db, "inspections"),
      where("stallId", "==", stallId),
      where("status", "==", "completed")
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const latest = snap.docs
        .map(d => d.data())
        .sort((a, b) => {
          const dateA = a.dateTs?.toDate ? a.dateTs.toDate() : new Date(a.dateTs || 0);
          const dateB = b.dateTs?.toDate ? b.dateTs.toDate() : new Date(b.dateTs || 0);
          return dateB - dateA;
        })[0];
      return latest?.score || 78;
    }
  } catch (e) {
    console.error("Error getting latest score:", e);
  }
  return 78; // default fallback
}

// Load inspection data from Firestore
async function loadInspectionData() {
  try {
    const q = query(
      collection(db, "inspections"),
      where("stallId", "==", id),
      where("status", "==", "completed")
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      allHistory = [];
      render();
      return;
    }

    // Transform inspection data
    allHistory = snap.docs.map(doc => {
      const d = doc.data();
      const dateObj = d.dateTs?.toDate ? d.dateTs.toDate() : new Date(d.dateTs || 0);
      const dateStr = formatDate(d.dateTs);
      const year = String(dateObj.getFullYear());

      return {
        dateObj,
        dateStr,
        score: d.score || 0,
        grade: d.grade || "B",
        remarks: d.remarks || "No remarks provided",
        ref: generateRef(dateStr),
        officer: d.officer || "NEA Officer",
        year
      };
    });

    // Sort by date descending (newest first)
    allHistory.sort((a, b) => b.dateObj - a.dateObj);

    render();
  } catch (e) {
    console.error("Error loading inspection data:", e);
    allHistory = [];
    render();
  }
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

  // Handle empty state
  if (allHistory.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:30px; color:#6b7280;">No inspection records found</td></tr>`;
    mobileList.innerHTML = `<div style="text-align:center; padding:40px; color:#6b7280;">No inspection records found</div>`;
    recordCount.textContent = "Showing 0 of 0 records";
    return;
  }

  // Desktop Table
  tableBody.innerHTML = filtered.slice(0, 8).map(h => {
    const badgeClass = h.grade === 'A' ? 'badgeGreen' : (h.grade === 'B' ? 'badgeBlue' : (h.grade === 'C' ? 'badgeOrange' : 'badgeRed'));
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
    const borderClass = h.grade === 'A' ? 'borderGreen' : (h.grade === 'B' ? 'borderBlue' : (h.grade === 'C' ? 'borderOrange' : 'borderRed'));
    const badgeClass = h.grade === 'A' ? 'badgeGreen' : (h.grade === 'B' ? 'badgeBlue' : (h.grade === 'C' ? 'badgeOrange' : 'badgeRed'));

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
    } else if (val === "A" || val === "B" || val === "C") {
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