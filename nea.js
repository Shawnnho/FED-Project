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
  Timestamp,
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

// Cache for stalls
let stallDataCache = {};

// Local state for lists
let inspectionsRaw = [];
let complaintsRaw = [];
let inspectionFilter = "all"; // all | upcoming | past
let complaintFilter = "all"; // all | new | under_review | resolved

// ---------- Helpers ----------
function todayMidnight() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseDateSafe(d) {
  // supports "YYYY-MM-DD"
  if (!d) return null;
  const dt = new Date(`${d}T00:00:00`);
  return isNaN(dt.getTime()) ? null : dt;
}

function setBadge(id, count) {
  const el = document.getElementById(id);
  if (!el) return;
  if (count > 0) {
    el.style.display = "grid";
    el.textContent = String(count);
  } else {
    el.style.display = "none";
  }
}

function badgeForInspectionStatus(status) {
  const s = (status || "scheduled").toLowerCase();
  if (s === "completed") return `<span class="badge blue">Completed</span>`;
  if (s === "cancelled") return `<span class="badge red">Cancelled</span>`;
  return `<span class="badge green">Scheduled</span>`;
}

function badgeForComplaintStatus(status) {
  const s = (status || "new").toLowerCase();
  if (s === "resolved") return `<span class="badge blue">Resolved</span>`;
  if (s === "under_review")
    return `<span class="badge green">Under Review</span>`;
  return `<span class="badge red">New</span>`;
}

function markChipActive(prefixId, activeId) {
  document
    .querySelectorAll(`[id^="${prefixId}"]`)
    .forEach((b) => b.classList.remove("active"));
  const el = document.getElementById(activeId);
  if (el) el.classList.add("active");
}

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
  const li = document.querySelectorAll(".nea-menu li")[index];
  if (li) li.classList.add("active");

  if (tabName === "inspections") loadInspections();
  if (tabName === "complaints") loadComplaints();
  if (tabName === "grading") loadStallsForDropdowns();
};

// ---------- INSPECTIONS ----------
async function loadInspections() {
  const list = document.getElementById("inspectionList");
  if (list) list.innerHTML = "Loading...";

  try {
    // If you only have date (string), orderBy(date) works.
    // If you have dateTs (Timestamp), it still works to sort client-side anyway.
    const q = query(collection(db, "inspections"), orderBy("date", "desc"));
    const snap = await getDocs(q);

    inspectionsRaw = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    renderInspections();
    updateSidebarBadges();
  } catch (err) {
    console.error(err);
    if (list) list.innerHTML = "<p>No inspections found.</p>";
  }
}

window.setInspectionFilter = (mode) => {
  inspectionFilter = mode;
  markChipActive(
    "inspFilter",
    mode === "all"
      ? "inspFilterAll"
      : mode === "upcoming"
        ? "inspFilterUpcoming"
        : "inspFilterPast",
  );
  renderInspections();
};

window.renderInspections = () => {
  const list = document.getElementById("inspectionList");
  if (!list) return;

  const q = (document.getElementById("inspSearch")?.value || "")
    .trim()
    .toLowerCase();
  const sortMode = document.getElementById("inspSort")?.value || "newest";
  const today = todayMidnight();

  let items = inspectionsRaw.slice();

  // filter upcoming/past
  items = items.filter((x) => {
    const dt = parseDateSafe(x.date);
    if (!dt) return inspectionFilter === "all"; // if no date, show only in all
    if (inspectionFilter === "upcoming") return dt >= today;
    if (inspectionFilter === "past") return dt < today;
    return true;
  });

  // search
  if (q) {
    items = items.filter((x) => {
      const s1 = (x.stallName || "").toLowerCase();
      const s2 = (x.officer || "").toLowerCase();
      return s1.includes(q) || s2.includes(q);
    });
  }

  // sort
  items.sort((a, b) => {
    const da = parseDateSafe(a.date)?.getTime() ?? 0;
    const dbt = parseDateSafe(b.date)?.getTime() ?? 0;
    return sortMode === "oldest" ? da - dbt : dbt - da;
  });

  if (items.length === 0) {
    list.innerHTML = "<p>No inspections found for this filter.</p>";
    return;
  }

  list.innerHTML = items
    .map((x) => {
      const statusBadge = badgeForInspectionStatus(x.status);
      const dateText = x.date || "Unknown Date";

      const canAct = (x.status || "scheduled").toLowerCase() === "scheduled";

      const actions = canAct
        ? `
          <div class="actions-row">
            <button class="btn-mini primary" onclick="completeInspection('${x.id}')">Mark Completed</button>
            <button class="btn-mini red" onclick="cancelInspection('${x.id}')">Cancel</button>
          </div>
        `
        : "";

      return `
        <div class="nea-item">
          <div class="item-main">
            <h4>${x.stallName || "Unknown Stall"}</h4>
            ${statusBadge}
          </div>
          <p>Officer: ${x.officer || "-"}</p>
          <div class="item-meta">
            <span>Scheduled: ${dateText}</span>
          </div>
          ${actions}
        </div>
      `;
    })
    .join("");
};

window.completeInspection = async (inspectionId) => {
  try {
    await updateDoc(doc(db, "inspections", inspectionId), {
      status: "completed",
      completedAt: serverTimestamp(),
    });
    await loadInspections();
  } catch (e) {
    console.error(e);
    alert("Could not mark completed.");
  }
};

window.cancelInspection = async (inspectionId) => {
  try {
    await updateDoc(doc(db, "inspections", inspectionId), {
      status: "cancelled",
      cancelledAt: serverTimestamp(),
    });
    await loadInspections();
  } catch (e) {
    console.error(e);
    alert("Could not cancel inspection.");
  }
};

// ---------- COMPLAINTS ----------
async function loadComplaints() {
  const list = document.getElementById("complaintList");
  if (list) list.innerHTML = "Loading...";

  try {
    const q = query(collection(db, "complaints"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);

    complaintsRaw = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    // Default any missing status to "new" (display only; does not write)
    renderComplaints();
    updateSidebarBadges();
  } catch (err) {
    console.error(err);
    if (list) list.innerHTML = "Error loading complaints.";
  }
}

window.setComplaintFilter = (mode) => {
  complaintFilter = mode;
  const map = {
    all: "cmpFilterAll",
    new: "cmpFilterNew",
    under_review: "cmpFilterUnder",
    resolved: "cmpFilterResolved",
  };
  markChipActive("cmpFilter", map[mode] || "cmpFilterAll");
  renderComplaints();
};

window.renderComplaints = () => {
  const list = document.getElementById("complaintList");
  if (!list) return;

  const q = (document.getElementById("cmpSearch")?.value || "")
    .trim()
    .toLowerCase();
  const sortMode = document.getElementById("cmpSort")?.value || "newest";

  let items = complaintsRaw.slice();

  // status filter
  items = items.filter((x) => {
    const st = (x.status || "new").toLowerCase();
    if (complaintFilter === "all") return true;
    return st === complaintFilter;
  });

  // search
  if (q) {
    items = items.filter((x) => {
      const s1 = (x.stallName || x.stall || "").toLowerCase();
      const s2 = (x.userName || "").toLowerCase();
      const s3 = (x.message || "").toLowerCase();
      return s1.includes(q) || s2.includes(q) || s3.includes(q);
    });
  }

  // sort
  items.sort((a, b) => {
    const da = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
    const dbt = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
    return sortMode === "oldest" ? da - dbt : dbt - da;
  });

  if (items.length === 0) {
    list.innerHTML = "<p>No complaints found for this filter.</p>";
    return;
  }

  list.innerHTML = items
    .map((x) => {
      const date = x.createdAt?.toDate
        ? x.createdAt.toDate().toLocaleDateString()
        : "Unknown Date";
      const imgHtml = x.imageUrl
        ? `<a href="${x.imageUrl}" target="_blank" class="evidence-link">View Evidence</a>`
        : "";

      const st = (x.status || "new").toLowerCase();
      const badge = badgeForComplaintStatus(st);

      // Actions based on status
      let actions = "";
      if (st === "new") {
        actions = `
          <div class="actions-row">
            <button class="btn-mini gray" onclick="setComplaintStatus('${x.id}','under_review')">Mark Under Review</button>
            <button class="btn-mini primary" onclick="scheduleFromComplaint('${x.id}')">Schedule Inspection</button>
            <button class="btn-mini red" onclick="setComplaintStatus('${x.id}','resolved')">Resolve</button>
          </div>
        `;
      } else if (st === "under_review") {
        actions = `
          <div class="actions-row">
            <button class="btn-mini primary" onclick="scheduleFromComplaint('${x.id}')">Schedule Inspection</button>
            <button class="btn-mini red" onclick="setComplaintStatus('${x.id}','resolved')">Resolve</button>
          </div>
        `;
      } else {
        actions = `
          <div class="actions-row">
            <button class="btn-mini gray" onclick="setComplaintStatus('${x.id}','under_review')">Re-open</button>
          </div>
        `;
      }

      return `
        <div class="nea-item">
          <div class="item-main">
            <h4>${x.stallName || x.stall || "Unknown Stall"}</h4>
            ${badge}
          </div>
          <p><strong>${x.userName || "Anonymous"}:</strong> ${x.message || ""}</p>
          <div class="item-meta">
            <span>${date}</span>
            ${imgHtml}
          </div>
          ${actions}
        </div>
      `;
    })
    .join("");
};

window.setComplaintStatus = async (complaintId, newStatus) => {
  try {
    await updateDoc(doc(db, "complaints", complaintId), {
      status: newStatus,
      updatedAt: serverTimestamp(),
    });
    await loadComplaints();
  } catch (e) {
    console.error(e);
    alert("Could not update complaint status.");
  }
};

window.scheduleFromComplaint = async (complaintId) => {
  const c = complaintsRaw.find((x) => x.id === complaintId);
  if (!c) return;

  // Open modal and try to preselect stall
  openScheduleModal();

  // Set date = today by default
  const dateInput = document.getElementById("schDate");
  if (dateInput) {
    const t = todayMidnight();
    const yyyy = t.getFullYear();
    const mm = String(t.getMonth() + 1).padStart(2, "0");
    const dd = String(t.getDate()).padStart(2, "0");
    dateInput.value = `${yyyy}-${mm}-${dd}`;
  }

  // Preselect by matching stallName text (best effort)
  const stallName = (c.stallName || c.stall || "").trim();
  const sel = document.getElementById("schStall");
  if (sel && stallName) {
    // wait a tick for dropdown to populate
    setTimeout(() => {
      const opts = Array.from(sel.options);
      const found = opts.find(
        (o) => (o.textContent || "").trim() === stallName,
      );
      if (found) sel.value = found.value;
    }, 200);
  }

  // Optionally move complaint to under_review immediately
  const st = (c.status || "new").toLowerCase();
  if (st === "new") {
    try {
      await updateDoc(doc(db, "complaints", complaintId), {
        status: "under_review",
        updatedAt: serverTimestamp(),
      });
      await loadComplaints();
    } catch {}
  }
};

// ---------- STALL SELECTOR + GRADING ----------
async function loadStallsForDropdowns() {
  const schSelect = document.getElementById("schStall");
  const gradeSelect = document.getElementById("gradeStallSelect");

  const loadingOpt = '<option value="" disabled selected>Loading...</option>';
  if (schSelect) schSelect.innerHTML = loadingOpt;
  if (gradeSelect) gradeSelect.innerHTML = loadingOpt;

  try {
    stallDataCache = {};
    let options = '<option value="" disabled selected>Select Stall</option>';

    // centres/{centreId}/stalls/{stallId}
    const centresSnap = await getDocs(collection(db, "centres"));

    for (const centreDoc of centresSnap.docs) {
      const centreId = centreDoc.id;
      const stallsSnap = await getDocs(
        collection(db, "centres", centreId, "stalls"),
      );

      stallsSnap.forEach((stallDoc) => {
        const data = stallDoc.data();

        const stallName = data.stallName ?? "[Unnamed Stall]";
        const stallPath = `centres/${centreId}/stalls/${stallDoc.id}`;

        stallDataCache[stallPath] = {
          name: stallName,
          hygieneGrade: data.hygieneGrade || "",
          centreId,
          stallId: stallDoc.id,
          stallPath,
        };

        options += `<option value="${stallPath}">${stallName}</option>`;
      });
    }

    if (schSelect) schSelect.innerHTML = options;
    if (gradeSelect) gradeSelect.innerHTML = options;

    updateHygieneOverview();
    // keep dropdown searchable after reload
    filterGradeDropdown();
  } catch (err) {
    console.error("Error loading stalls:", err);
  }
}

function updateHygieneOverview() {
  const vals = Object.values(stallDataCache);

  const counts = { A: 0, B: 0, C: 0, D: 0, NONE: 0 };
  vals.forEach((s) => {
    const g = (s.hygieneGrade || "").toUpperCase();
    if (g === "A") counts.A++;
    else if (g === "B") counts.B++;
    else if (g === "C") counts.C++;
    else if (g === "D") counts.D++;
    else counts.NONE++;
  });

  const total = vals.length;

  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(v);
  };

  set("ovTotal", total);
  set("ovA", counts.A);
  set("ovB", counts.B);
  set("ovC", counts.C);
  set("ovD", counts.D);
  set("ovNone", counts.NONE);
}

window.filterGradeDropdown = () => {
  const q = (document.getElementById("gradeSearch")?.value || "")
    .trim()
    .toLowerCase();
  const sel = document.getElementById("gradeStallSelect");
  if (!sel) return;

  Array.from(sel.options).forEach((opt, idx) => {
    // keep first placeholder always visible
    if (idx === 0) {
      opt.hidden = false;
      return;
    }
    const t = (opt.textContent || "").toLowerCase();
    opt.hidden = q ? !t.includes(q) : false;
  });
};

// Show current grade
window.updateCurrentGradeDisplay = () => {
  const select = document.getElementById("gradeStallSelect");
  const display = document.getElementById("currentGradeDisplay");
  const stallPath = select?.value;

  if (stallPath && stallDataCache[stallPath]) {
    const grade = stallDataCache[stallPath].hygieneGrade;
    display.textContent = grade === "" || !grade ? "Not Graded" : grade;
  } else {
    display.textContent = "-";
  }
};

// ---------- Scheduling ----------
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

  const stallPath = stallSelect.value;
  const stallId = stallPath.split("/").pop();
  const stallName = stallSelect.options[stallSelect.selectedIndex].text;

  try {
    const dateStr = date;
    const dateTs = Timestamp.fromDate(new Date(dateStr + "T00:00:00"));

    await addDoc(collection(db, "inspections"), {
      stallId: stallId, // plain id (for other pages)
      stallPath: stallPath, // full path (for NEA usage)
      stallName: stallName,
      date: dateStr,
      dateTs: dateTs,
      officer: officer,
      status: "scheduled",
      createdAt: serverTimestamp(),
    });

    closeScheduleModal();
    await loadInspections();
    alert("Inspection Scheduled!");
  } catch (err) {
    console.error(err);
    alert("Error scheduling.");
  }
};

// ---------- Grading ----------
window.selectGrade = (grade) => {
  document.getElementById("selectedGrade").value = grade;
  document
    .querySelectorAll(".grade-btn")
    .forEach((b) => b.classList.remove("selected"));
  // event is available because called from inline onclick
  event.target.classList.add("selected");
};

window.submitGradeUpdate = async () => {
  const stallPath = document.getElementById("gradeStallSelect").value;
  const newGrade = document.getElementById("selectedGrade").value;
  const msg = document.getElementById("gradeMsg");

  if (!stallPath || !newGrade) {
    alert("Select a stall and a grade.");
    return;
  }

  try {
    const pathParts = stallPath.split("/");
    const stallRef = doc(db, ...pathParts);

    await updateDoc(stallRef, {
      hygieneGrade: newGrade,
      lastInspection: serverTimestamp(),
    });

    document.getElementById("currentGradeDisplay").textContent = newGrade;

    if (stallDataCache[stallPath]) {
      stallDataCache[stallPath].hygieneGrade = newGrade;
    }

    updateHygieneOverview();

    msg.style.color = "";
    msg.textContent = `Success: Grade updated to ${newGrade}`;
    setTimeout(() => (msg.textContent = ""), 2500);
  } catch (err) {
    console.error("Error updating grade:", err);
    msg.style.color = "red";
    msg.textContent = "Error: Could not update grade.";
  }
};

// ---------- Sidebar badges ----------
function updateSidebarBadges() {
  // Upcoming inspections within next 7 days, scheduled only
  const t0 = todayMidnight().getTime();
  const t7 = t0 + 7 * 24 * 60 * 60 * 1000;

  const upcomingCount = inspectionsRaw.filter((x) => {
    const st = (x.status || "scheduled").toLowerCase();
    if (st !== "scheduled") return false;
    const dt = parseDateSafe(x.date);
    if (!dt) return false;
    const tt = dt.getTime();
    return tt >= t0 && tt <= t7;
  }).length;

  // New complaints = status missing or status === "new"
  const newComplaints = complaintsRaw.filter(
    (x) => (x.status || "new").toLowerCase() === "new",
  ).length;

  setBadge("badgeInspections", upcomingCount);
  setBadge("badgeComplaints", newComplaints);
}

// Init
window.addEventListener("DOMContentLoaded", async () => {
  switchTab("inspections");
  // preload for badges
  await loadInspections();
  await loadComplaints();
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
