import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
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
const auth = getAuth(app);
const db = getFirestore(app);

/* =========================
   User Role State
========================= */
let currentUser = null; // { uid, role, stallId }
let userRole = "customer"; // default
let userStallId = null;

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

// Upcoming Inspection (Storeholder)
const upcomingCard = document.getElementById("upcomingCard");
const upcomingDate = document.getElementById("upcomingDate");
const upcomingOfficer = document.getElementById("upcomingOfficer");

const chartWrap = document.getElementById("chartWrap");
const chartFooter = document.getElementById("chartFooter");
const historyRows = document.getElementById("historyRows");

const viewHistoryBtn = document.getElementById("viewHistoryBtn");
const viewTrendBtn = document.getElementById("viewTrendBtn");

// NEA Officer Portal button (hidden by default)
const neaPortalBtn = document.getElementById("neaPortalBtn");

/* =========================
   Logic
========================= */

let currentStallId = null;
let stallsCache = [];

// Grade color helper
function getGradeColor(grade) {
  if (grade === "A") return "#16a34a"; // Green
  if (grade === "B") return "#2f6bff"; // Blue
  if (grade === "C") return "#ca8a04"; // Orange
  if (grade === "D") return "#dc2626"; // Red
  return "#16a34a"; // Default green
}

function getGradeText(grade) {
  if (grade === "A") return "Excellent Hygiene Standards";
  if (grade === "B") return "Good Hygiene Standards";
  if (grade === "C") return "Average Hygiene Standards";
  if (grade === "D") return "Poor Hygiene Standards";
  return "Unknown";
}

// Calculate grade from score
function calculateGrade(score) {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  return "D";
}

// Format date for display
function formatDate(timestamp) {
  if (!timestamp) return "—";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Calculate days remaining for license
function getLicenseDaysRemaining(expiryTs) {
  if (!expiryTs) return null;
  const now = new Date();
  const expiry = expiryTs.toDate ? expiryTs.toDate() : new Date(expiryTs);
  const diff = expiry - now;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// Get license status
function getLicenseStatus(daysRemaining) {
  if (daysRemaining === null) return { text: "Unknown", class: "" };
  if (daysRemaining < 0) return { text: "Expired", class: "expired" };
  if (daysRemaining <= 30) return { text: "Expiring Soon", class: "warning" };
  return { text: "Active", class: "active" };
}

// Format license date
function formatLicenseDate(timestamp) {
  if (!timestamp) return "—";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Listen for auth changes
onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      const userSnap = await getDoc(doc(db, "users", user.uid));
      if (userSnap.exists()) {
        const userData = userSnap.data();
        currentUser = {
          uid: user.uid,
          role: userData.role || "customer",
          stallId: userData.stallId || null
        };
        userRole = currentUser.role;
        userStallId = currentUser.stallId;

        // Role-specific UI adjustments
        applyRoleSpecificUI();
      }
    } catch (err) {
      console.error("Error fetching user data:", err);
    }
  }

  // Load stalls after auth state is determined
  await loadStalls();
});

// Apply role-specific UI changes
function applyRoleSpecificUI() {
  // Hide stall selector for storeholder (they only see their own stall)
  if (userRole === "storeholder") {
    if (stallSelect) {
      stallSelect.closest('.selectCard')?.style.setProperty('display', 'none');
    }
  }

  // Show NEA Portal button for nea_officer
  if (userRole === "nea_officer" && neaPortalBtn) {
    neaPortalBtn.style.display = "inline-flex";
  }
}

async function loadStalls() {
  // Show loading state
  if (stallSelect) {
    stallSelect.innerHTML = '<option value="" disabled selected>Loading stalls...</option>';
  }

  // Get ID from URL if present
  const params = new URLSearchParams(window.location.search);
  let preselectId = params.get("id");

  // Storeholder always sees their own stall
  if (userRole === "storeholder" && userStallId) {
    preselectId = userStallId;
  }

  // Load stalls from centres/*/stalls/* subcollections (NEA format)
  try {
    const centresSnap = await getDocs(collection(db, "centres"));
    const stallsList = [];

    for (const centreDoc of centresSnap.docs) {
      const centreId = centreDoc.id;
      const stallsSnap = await getDocs(
        collection(db, "centres", centreId, "stalls"),
      );

      stallsSnap.forEach((stallDoc) => {
        const data = stallDoc.data();
        // Only include active stalls
        if (data.active !== false) {
          const stallPath = `centres/${centreId}/stalls/${stallDoc.id}`;
          stallsList.push({
            id: stallDoc.id,
            stallPath: stallPath,
            centreId: centreId,
            name: data.stallName || data.name || "Unknown Stall",
            grade: data.hygieneGrade || data.grade || "B",
            licenseIssued: data.licenseIssued,
            licenseExpiry: data.licenseExpiry
          });
        }
      });
    }

    stallsCache = stallsList.sort((a,b) => a.name.localeCompare(b.name));

  } catch (err) {
    console.error("Error loading stalls:", err);
    stallsCache = [];
  }

  // For storeholder, filter to only their stall
  let displayStalls = stallsCache;
  if (userRole === "storeholder" && userStallId) {
    displayStalls = stallsCache.filter(s => s.id === userStallId);
  }

  // Populate Select (skip for storeholder since it's hidden)
  if (stallSelect && userRole !== "storeholder") {
    stallSelect.innerHTML = `<option value="" disabled ${!preselectId ? 'selected' : ''}>Select Stall</option>`;

    displayStalls.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.name;
      opt.dataset.grade = s.grade;
      if (s.id === preselectId) opt.selected = true;
      stallSelect.appendChild(opt);
    });

    stallSelect.addEventListener("change", (e) => {
      const opt = stallSelect.options[stallSelect.selectedIndex];
      renderStallData(e.target.value, opt.dataset.grade);
    });
  }

  // Auto-select for storeholder
  if (userRole === "storeholder" && displayStalls.length > 0) {
    const stall = displayStalls[0];
    renderStallData(stall.id, stall.grade);
  } else if (preselectId) {
    const stall = displayStalls.find(s => s.id === preselectId);
    if (stall) {
      renderStallData(preselectId, stall.grade);
    }
  }
}

async function renderStallData(stallId, currentGrade) {
  currentStallId = stallId;

  // Get full stall data for license info
  const stallData = stallsCache.find(s => s.id === stallId);
  const licenseIssued = stallData?.licenseIssued;
  const licenseExpiry = stallData?.licenseExpiry;

  // 1. Grade Card
  bigGrade.textContent = currentGrade;
  const color = getGradeColor(currentGrade);
  gradeCard.style.backgroundColor = color;
  gradeLabel.textContent = getGradeText(currentGrade);

  // 2. License Validity
  renderLicenseValidity(licenseIssued, licenseExpiry);

  // 3. Fetch real inspection data
  await loadInspectionData(stallId, currentGrade);
}

function renderLicenseValidity(issuedTs, expiryTs) {
  if (!issuedTs || !expiryTs) {
    // Missing license data
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

  licDays.textContent = daysRemaining >= 0 ? `${daysRemaining} Days` : `${Math.abs(daysRemaining)} Days Overdue`;
  licStatus.textContent = status.text;
  licStatus.className = `licenseTag ${status.class}`;

  // Calculate progress (time elapsed since issued)
  const now = new Date();
  const issued = issuedTs.toDate ? issuedTs.toDate() : new Date(issuedTs);
  const expiry = expiryTs.toDate ? expiryTs.toDate() : new Date(expiryTs);
  const totalDuration = expiry - issued;
  const elapsed = now - issued;
  const progressPct = Math.max(0, Math.min(100, (elapsed / totalDuration) * 100));

  licFill.style.width = `${progressPct}%`;
  licIssue.textContent = `Issued: ${formatLicenseDate(issuedTs)}`;
  licExpiry.textContent = `Expired: ${formatLicenseDate(expiryTs)}`;
}

async function loadInspectionData(stallId, currentGrade) {
  try {
    // 1. Check for upcoming inspection if storeholder
    if (userRole === "storeholder" && upcomingCard) {
      const qUpcoming = query(
        collection(db, "inspections"),
        where("stallId", "==", stallId),
        where("status", "==", "scheduled")
      );
      const snapUpcoming = await getDocs(qUpcoming);
      
      if (!snapUpcoming.empty) {
        // Show newest scheduled
        const upcoming = snapUpcoming.docs
          .map(d => d.data())
          .sort((a, b) => new Date(a.date) - new Date(b.date))[0]; // Earliest scheduled
        
        upcomingDate.textContent = formatDate(upcoming.dateTs || upcoming.date);
        upcomingOfficer.textContent = `Officer: ${upcoming.officer}`;
        upcomingCard.style.display = "block";
      } else {
        upcomingCard.style.display = "none";
      }
    } else if (upcomingCard) {
      upcomingCard.style.display = "none";
    }

    // 2. Fetch completed inspections for this stall
    const inspectionsQuery = query(
      collection(db, "inspections"),
      where("stallId", "==", stallId),
      where("status", "==", "completed")
    );
    const snap = await getDocs(inspectionsQuery);

    if (snap.empty) {
      // No inspections - show empty state
      chartWrap.innerHTML = '<p class="chartEmpty">No inspection records yet</p>';
      chartFooter.innerHTML = "";
      historyRows.innerHTML = '<div class="emptyState" style="padding:20px; font-size:14px;">No inspection history available</div>';
      return;
    }

    // Sort by date descending
    const inspections = snap.docs
      .map(d => d.data())
      .sort((a, b) => {
        const dateA = a.dateTs?.toDate ? a.dateTs.toDate() : new Date(a.dateTs || 0);
        const dateB = b.dateTs?.toDate ? b.dateTs.toDate() : new Date(b.dateTs || 0);
        return dateB - dateA;
      });

    // Get trend data (last 5 inspections, reversed for oldest to newest)
    const trendData = inspections.slice(0, 5).reverse().map(insp => {
      const date = insp.dateTs?.toDate ? insp.dateTs.toDate() : new Date(insp.dateTs || 0);
      return {
        year: String(date.getFullYear()),
        score: insp.score,
        grade: insp.grade,
      };
    });

    // Get history data (all inspections, already sorted newest first)
    const historyData = inspections.map(insp => ({
      date: formatDate(insp.dateTs),
      score: insp.score,
      grade: insp.grade,
      remarks: insp.remarks || "No remarks provided"
    }));

    // Render chart
    renderChart(trendData, currentGrade);

    // Render history
    renderHistory(historyData, currentGrade);

    // Calculate score change
    if (inspections.length >= 2) {
      const latest = inspections[0].score;
      const previous = inspections[1].score;
      const change = latest - previous;
      const changePct = Math.round((change / previous) * 100);

      if (change > 0) {
        chartFooter.innerHTML = `<span style="color:#16a34a; font-weight:900;">▲ Score improved by ${Math.abs(changePct)}%</span> compared to last inspection.`;
      } else if (change < 0) {
        chartFooter.innerHTML = `<span style="color:#dc2626; font-weight:900;">▼ Score declined by ${Math.abs(changePct)}%</span> compared to last inspection.`;
      } else {
        chartFooter.innerHTML = `<span style="color:#6b7280; font-weight:900;">= Score unchanged</span> compared to last inspection.`;
      }
    } else {
      chartFooter.innerHTML = "";
    }

  } catch (err) {
    console.error("Error loading inspection data:", err);
    chartWrap.innerHTML = '<p class="chartEmpty">Error loading inspection data</p>';
    chartFooter.innerHTML = "";
    historyRows.innerHTML = '<div class="emptyState" style="padding:20px; font-size:14px;">Error loading history</div>';
  }
}

function renderChart(trend, currentGrade) {
  // Clear old bars (keep grid)
  const grid = chartWrap.querySelector(".chartGrid");
  chartWrap.innerHTML = "";
  chartWrap.appendChild(grid);

  trend.forEach((t) => {
    const col = document.createElement("div");
    col.className = "chartCol";

    const bg = getGradeColor(t.grade);
    const heightPct = t.score; // 0 to 100

    col.innerHTML = `
      <div class="chartBar" style="height: ${heightPct}%; background: ${bg};">
        <div class="chartValue" style="bottom: 100%; margin-bottom: 4px; color:${bg}">${t.date}</div>
      </div>
      <div class="chartLabel">${t.year}</div>
    `;
    chartWrap.appendChild(col);
  });
}

function renderHistory(history, currentGrade) {
  historyRows.innerHTML = "";

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

// Add listener for view history button
if (viewHistoryBtn) {
  viewHistoryBtn.addEventListener("click", () => {
    if (currentStallId) {
      // Get centreId from cache for navigation
      const stallData = stallsCache.find(s => s.id === currentStallId);
      const centreId = stallData?.centreId || "";
      window.location.href = `hygiene-history.html?id=${currentStallId}&centreId=${centreId}`;
    } else {
      alert("Please select a stall first.");
    }
  });
}

// Hygiene Trend Button
if (viewTrendBtn) {
  viewTrendBtn.addEventListener("click", () => {
    if (currentStallId) {
      // Get centreId from cache for navigation
      const stallData = stallsCache.find(s => s.id === currentStallId);
      const centreId = stallData?.centreId || "";
      window.location.href = `hygiene-trend.html?id=${currentStallId}&centreId=${centreId}`;
    } else {
      alert("Please select a stall first.");
    }
  });
}

// NEA Portal Button
if (neaPortalBtn) {
  neaPortalBtn.addEventListener("click", () => {
    window.location.href = "nea.html";
  });
}