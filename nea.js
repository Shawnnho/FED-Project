import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ✅ CONFIG */
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

// ✅ NEW: Store stall data here so we can show the grade instantly
let stallDataCache = {}; 

// --- 1. TAB SWITCHING LOGIC ---
window.switchTab = (tabName) => {
  document.querySelectorAll(".nea-tab").forEach((el) => el.classList.remove("active"));
  document.querySelectorAll(".nea-menu li").forEach((el) => el.classList.remove("active"));

  document.getElementById(`tab-${tabName}`).classList.add("active");
  
  const index = ["inspections", "complaints", "grading"].indexOf(tabName);
  if (document.querySelectorAll(".nea-menu li")[index]) {
    document.querySelectorAll(".nea-menu li")[index].classList.add("active");
  }

  if (tabName === "inspections") loadInspections();
  if (tabName === "complaints") loadComplaints();
  if (tabName === "grading") loadStallsForDropdowns();
};

// --- 2. LOAD COMPLAINTS ---
async function loadComplaints() {
  const list = document.getElementById("complaintList");
  list.innerHTML = "Loading...";
  
  try {
    const q = query(collection(db, "complaints"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);

    if (snap.empty) {
      list.innerHTML = "<p>No complaints found.</p>";
      return;
    }

    list.innerHTML = snap.docs.map(doc => {
      const d = doc.data();
      const date = d.createdAt?.toDate ? d.createdAt.toDate().toLocaleDateString() : "Unknown Date";
      const imgHtml = d.imageUrl ? `<a href="${d.imageUrl}" target="_blank" class="evidence-link">View Evidence</a>` : "";

      return `
        <div class="nea-item">
          <div class="item-main">
            <h4>${d.stallName || d.stall || "Unknown Stall"}</h4>
            <span class="badge red">Complaint</span>
          </div>
          <p><strong>${d.userName || "Anonymous"}:</strong> ${d.message}</p>
          <div class="item-meta">
            <span>${date}</span>
            ${imgHtml}
          </div>
        </div>
      `;
    }).join("");
  } catch (err) {
    console.error(err);
    list.innerHTML = "Error loading complaints.";
  }
}

// --- 3. INSPECTIONS LOGIC ---
async function loadInspections() {
  const list = document.getElementById("inspectionList");
  const filter = document.getElementById("inspectionFilter")?.value || "all";
  list.innerHTML = "Loading...";

  try {
    let q = query(collection(db, "inspections"), orderBy("dateTs", "desc"));
    const snap = await getDocs(q);

    if (snap.empty) {
      list.innerHTML = "<p>No inspections found.</p>";
      return;
    }

    // Filter by status
    const filtered = snap.docs.filter(doc => {
      const status = doc.data().status || "scheduled";
      if (filter === "all") return true;
      return status === filter;
    });

    if (filtered.length === 0) {
      list.innerHTML = `<p>No ${filter} inspections found.</p>`;
      return;
    }

    list.innerHTML = filtered.map(doc => {
      const d = doc.data();
      const status = d.status || "scheduled";
      const isCompleted = status === "completed";

      let badgeClass = "green";
      let badgeText = "Scheduled";
      if (status === "completed") {
        badgeClass = "red";
        badgeText = "Completed";
      } else if (status === "cancelled") {
        badgeClass = "badge-orange";
        badgeText = "Cancelled";
      }

      let extraInfo = "";
      let actions = "";

      if (isCompleted) {
        // Show score and grade
        extraInfo = `
          <div class="score-display">
            <span>Score: ${d.score}/100</span>
            <span class="score-badge ${d.grade}">${d.grade}</span>
          </div>
          ${d.remarks ? `<p style="margin-top: 8px; font-size: 13px; color: #555;"><strong>Remarks:</strong> ${d.remarks}</p>` : ""}
          ${d.breakdown ? `
            <details style="margin-top: 8px;">
              <summary style="cursor: pointer; font-size: 13px; color: #e67e22;">View Score Breakdown</summary>
              <div class="breakdown-display">
                <div class="breakdown-item"><span>Food Hygiene</span><span>${d.breakdown.foodHygiene || 0}%</span></div>
                <div class="breakdown-item"><span>Personal Hygiene</span><span>${d.breakdown.personalHygiene || 0}%</span></div>
                <div class="breakdown-item"><span>Equipment</span><span>${d.breakdown.equipment || 0}%</span></div>
                <div class="breakdown-item"><span>Premises</span><span>${d.breakdown.premises || 0}%</span></div>
              </div>
            </details>
          ` : ""}
        `;
      } else if (status === "scheduled") {
        // Add complete button for scheduled inspections
        actions = `
          <div class="inspection-actions">
            <button class="action-btn complete" onclick="openCompleteModalForInspection('${doc.id}', '${d.stallId}', '${d.stallName}', '${d.date}', '${d.officer}')">Complete</button>
          </div>
        `;
      }

      return `
        <div class="nea-item">
          <div class="item-main">
            <h4>${d.stallName}</h4>
            <span class="badge ${badgeClass}">${badgeText}</span>
          </div>
          <p>Officer: ${d.officer}</p>
          ${extraInfo}
          <div class="item-meta">
            <span>Date: ${d.date}</span>
          </div>
          ${actions}
        </div>
      `;
    }).join("");
  } catch (err) {
    console.error(err);
    list.innerHTML = "<p>Error loading inspections.</p>";
  }
}

// --- 4. DYNAMIC STALL SELECTOR (With Grade Fetching) ---
async function loadStallsForDropdowns() {
  const schSelect = document.getElementById("schStall");
  const gradeSelect = document.getElementById("gradeStallSelect");
  
  const loadingOpt = '<option value="" disabled selected>Loading...</option>';
  if (schSelect) schSelect.innerHTML = loadingOpt;
  if (gradeSelect) gradeSelect.innerHTML = loadingOpt;

  try {
    const snap = await getDocs(collection(db, "stalls"));
    
    let options = '<option value="" disabled selected>Select Stall</option>';
    stallDataCache = {}; // Reset cache

    snap.forEach(doc => {
      const data = doc.data();
      const name = data.name || doc.id; 
      
      // ✅ Save the grade to our cache so we can use it later
      stallDataCache[doc.id] = {
        name: name,
        hygieneGrade: data.hygieneGrade || "Not Graded"
      };

      options += `<option value="${doc.id}">${name}</option>`;
    });

    if (schSelect) schSelect.innerHTML = options;
    if (gradeSelect) gradeSelect.innerHTML = options;

  } catch (err) {
    console.error("Error loading stalls:", err);
  }
}

// ✅ NEW: Show the grade when a stall is selected
window.updateCurrentGradeDisplay = () => {
  const select = document.getElementById("gradeStallSelect");
  const display = document.getElementById("currentGradeDisplay");
  const stallId = select.value;

  if (stallDataCache[stallId]) {
    const grade = stallDataCache[stallId].hygieneGrade;
    // Handle empty string case from your screenshot
    display.textContent = (grade === "" || !grade) ? "Not Graded" : grade;
  } else {
    display.textContent = "-";
  }
};

// --- 5. SCHEDULE & GRADING ---
window.openScheduleModal = () => {
  document.getElementById("scheduleModal").style.display = "flex";
  loadStallsForDropdowns();
};
window.closeScheduleModal = () => {
  document.getElementById("scheduleModal").style.display = "none";
};

window.submitSchedule = async () => {
  const stallSelect = document.getElementById("schStall");
  const date = document.getElementById("schDate").value;
  const officer = document.getElementById("schOfficer").value;

  if (!stallSelect.value || !date || !officer) {
    alert("Please fill all fields");
    return;
  }
  const stallName = stallSelect.options[stallSelect.selectedIndex].text;

  try {
    await addDoc(collection(db, "inspections"), {
      stallId: stallSelect.value,
      stallName: stallName,
      date: date,
      officer: officer,
      status: "scheduled",
      createdAt: serverTimestamp()
    });
    closeScheduleModal();
    loadInspections();
    alert("Inspection Scheduled!");
  } catch (err) {
    console.error(err);
    alert("Error scheduling.");
  }
};

window.selectGrade = (grade) => {
  document.getElementById("selectedGrade").value = grade;
  document.querySelectorAll(".grade-btn").forEach(b => b.classList.remove("selected"));
  event.target.classList.add("selected");
};

window.submitGradeUpdate = async () => {
  const stallId = document.getElementById("gradeStallSelect").value;
  const newGrade = document.getElementById("selectedGrade").value;
  const msg = document.getElementById("gradeMsg");

  if (!stallId || !newGrade) {
    alert("Select a stall and a grade.");
    return;
  }

  try {
    const stallRef = doc(db, "stalls", stallId);
    await updateDoc(stallRef, {
      hygieneGrade: newGrade,
      lastInspection: serverTimestamp()
    });

    // Update the display immediately without reloading
    document.getElementById("currentGradeDisplay").textContent = newGrade;
    stallDataCache[stallId].hygieneGrade = newGrade; // Update cache

    msg.textContent = `Success: Grade updated to ${newGrade}`;
    setTimeout(() => msg.textContent = "", 3000);

  } catch (err) {
    console.error("Error updating grade:", err);
    msg.style.color = "red";
    msg.textContent = "Error: Could not update grade.";
  }
};

// --- 6. COMPLETE INSPECTION LOGIC ---

// Grade calculation based on score
function calculateGradeFromScore(score) {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  return "D";
}

// Open complete modal (for new inspection)
window.openCompleteModal = () => {
  document.getElementById("completeModal").style.display = "flex";
  loadStallsForDropdowns();

  // Set default date to today
  document.getElementById("compDate").value = new Date().toISOString().split('T')[0];

  // Reset form
  document.getElementById("compStall").value = "";
  document.getElementById("compOfficer").value = "";
  document.getElementById("compScore").value = "";
  document.getElementById("compFoodHygiene").value = "";
  document.getElementById("compPersonalHygiene").value = "";
  document.getElementById("compEquipment").value = "";
  document.getElementById("compPremises").value = "";
  document.getElementById("compRemarks").value = "";
  document.getElementById("compCurrentGrade").textContent = "-";
  document.getElementById("compCalculatedGrade").textContent = "-";

  // Add score input listener for grade calculation
  document.getElementById("compScore").oninput = updateCalculatedGrade;
};

window.closeCompleteModal = () => {
  document.getElementById("completeModal").style.display = "none";
};

// Open complete modal for existing scheduled inspection
window.openCompleteModalForInspection = (inspectionId, stallId, stallName, date, officer) => {
  window.openCompleteModal();
  document.getElementById("compStall").value = stallId;
  document.getElementById("compDate").value = date;
  document.getElementById("compOfficer").value = officer;
  updateCurrentGradeForCompletion();

  // Store inspection ID to update it instead of creating new
  window.completingInspectionId = inspectionId;
};

// Update current grade display in completion modal
window.updateCurrentGradeForCompletion = () => {
  const select = document.getElementById("compStall");
  const display = document.getElementById("compCurrentGrade");
  const stallId = select.value;

  if (stallDataCache[stallId]) {
    const grade = stallDataCache[stallId].hygieneGrade;
    display.textContent = (grade === "" || !grade) ? "Not Graded" : grade;
  } else {
    display.textContent = "-";
  }
};

// Update calculated grade as score changes
function updateCalculatedGrade() {
  const score = parseInt(document.getElementById("compScore").value);
  const display = document.getElementById("compCalculatedGrade");

  if (isNaN(score)) {
    display.textContent = "-";
    return;
  }

  if (score < 0 || score > 100) {
    display.textContent = "Invalid (0-100)";
    display.style.color = "red";
    return;
  }

  const grade = calculateGradeFromScore(score);
  display.textContent = grade;
  display.style.color = "";

  // Color based on grade
  if (grade === "A") display.style.color = "#16a34a";
  else if (grade === "B") display.style.color = "#2f6bff";
  else if (grade === "C") display.style.color = "#ca8a04";
  else display.style.color = "#dc2626";
}

// Submit completed inspection
window.submitCompletion = async () => {
  const stallId = document.getElementById("compStall").value;
  const date = document.getElementById("compDate").value;
  const officer = document.getElementById("compOfficer").value;
  const score = parseInt(document.getElementById("compScore").value);
  const foodHygiene = parseInt(document.getElementById("compFoodHygiene").value) || 0;
  const personalHygiene = parseInt(document.getElementById("compPersonalHygiene").value) || 0;
  const equipment = parseInt(document.getElementById("compEquipment").value) || 0;
  const premises = parseInt(document.getElementById("compPremises").value) || 0;
  const remarks = document.getElementById("compRemarks").value;

  // Validation
  if (!stallId || !date || !officer) {
    alert("Please fill in Stall, Date, and Officer Name.");
    return;
  }

  if (isNaN(score) || score < 0 || score > 100) {
    alert("Please enter a valid score between 0 and 100.");
    return;
  }

  // Validate breakdown scores
  if (foodHygiene < 0 || foodHygiene > 100 ||
      personalHygiene < 0 || personalHygiene > 100 ||
      equipment < 0 || equipment > 100 ||
      premises < 0 || premises > 100) {
    alert("Breakdown scores must be between 0 and 100.");
    return;
  }

  const grade = calculateGradeFromScore(score);
  const stallName = stallDataCache[stallId]?.name || "Unknown";

  try {
    // If completing an existing scheduled inspection
    if (window.completingInspectionId) {
      // Update the existing inspection record
      const inspectionRef = doc(db, "inspections", window.completingInspectionId);
      await updateDoc(inspectionRef, {
        status: "completed",
        score,
        grade,
        remarks,
        breakdown: { foodHygiene, personalHygiene, equipment, premises },
        dateTs: new Date(date)
      });
      window.completingInspectionId = null;
    } else {
      // Create new completed inspection record
      const dateTs = new Date(date);
      await addDoc(collection(db, "inspections"), {
        stallId,
        stallName,
        date,
        dateTs,
        officer,
        status: "completed",
        score,
        grade,
        remarks,
        breakdown: { foodHygiene, personalHygiene, equipment, premises },
        createdAt: serverTimestamp()
      });
    }

    // Update stall's current grade
    const stallRef = doc(db, "stalls", stallId);
    await updateDoc(stallRef, {
      hygieneGrade: grade,
      lastInspection: serverTimestamp()
    });

    // Update cache
    if (stallDataCache[stallId]) {
      stallDataCache[stallId].hygieneGrade = grade;
    }

    closeCompleteModal();
    loadInspections();

    alert(`Inspection completed! Grade: ${grade} (${score}/100)`);

  } catch (err) {
    console.error("Error completing inspection:", err);
    alert("Error completing inspection. Please try again.");
  }
};

// Init
window.addEventListener("DOMContentLoaded", () => {
  switchTab('inspections');
});