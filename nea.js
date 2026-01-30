import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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
const auth = getAuth(app);

// ✅ NEW: Store stall data here so we can show the grade instantly
let stallDataCache = {};

// --- 1. TAB SWITCHING LOGIC ---
window.switchTab = (tabName) => {
  document
    .querySelectorAll(".nea-tab")
    .forEach((el) => el.classList.remove("active"));
  document
    .querySelectorAll(".nea-menu li")
    .forEach((el) => el.classList.remove("active"));

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

    list.innerHTML = snap.docs
      .map((doc) => {
        const d = doc.data();
        const date = d.createdAt?.toDate
          ? d.createdAt.toDate().toLocaleDateString()
          : "Unknown Date";
        const imgHtml = d.imageUrl
          ? `<a href="${d.imageUrl}" target="_blank" class="evidence-link">View Evidence</a>`
          : "";

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
      })
      .join("");
  } catch (err) {
    console.error(err);
    list.innerHTML = "Error loading complaints.";
  }
}

// --- 3. INSPECTIONS LOGIC ---
async function loadInspections() {
  const list = document.getElementById("inspectionList");
  list.innerHTML = "Loading...";

  try {
    const q = query(collection(db, "inspections"), orderBy("date", "desc"));
    const snap = await getDocs(q);

    if (snap.empty) {
      list.innerHTML = "<p>No inspections scheduled.</p>";
      return;
    }

    list.innerHTML = snap.docs
      .map((doc) => {
        const d = doc.data();
        return `
        <div class="nea-item">
          <div class="item-main">
            <h4>${d.stallName}</h4>
            <span class="badge green">Scheduled</span>
          </div>
          <p>Officer: ${d.officer}</p>
          <div class="item-meta">
            <span>Scheduled: ${d.date}</span>
          </div>
        </div>
      `;
      })
      .join("");
  } catch (err) {
    console.error(err);
    list.innerHTML = "<p>No inspections found.</p>";
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

    snap.forEach((doc) => {
      const data = doc.data();
      const name = data.name || doc.id;

      // ✅ Save the grade to our cache so we can use it later
      stallDataCache[doc.id] = {
        name: name,
        hygieneGrade: data.hygieneGrade || "Not Graded",
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
    display.textContent = grade === "" || !grade ? "Not Graded" : grade;
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
      createdAt: serverTimestamp(),
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
  document
    .querySelectorAll(".grade-btn")
    .forEach((b) => b.classList.remove("selected"));
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
      lastInspection: serverTimestamp(),
    });

    // Update the display immediately without reloading
    document.getElementById("currentGradeDisplay").textContent = newGrade;
    stallDataCache[stallId].hygieneGrade = newGrade; // Update cache

    msg.textContent = `Success: Grade updated to ${newGrade}`;
    setTimeout(() => (msg.textContent = ""), 3000);
  } catch (err) {
    console.error("Error updating grade:", err);
    msg.style.color = "red";
    msg.textContent = "Error: Could not update grade.";
  }
};

// Init
window.addEventListener("DOMContentLoaded", () => {
  switchTab("inspections");
});

window.logoutNEA = async () => {
  try {
    await signOut(auth);
    window.location.href = "index.html";
  } catch (err) {
    console.error("Logout failed:", err);
    alert("Error logging out. Please try again.");
  }
};
