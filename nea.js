import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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

// Cache for stalls (keyed by stallPath = centres/{centreId}/stalls/{stallId})
let stallDataCache = {};

// Local state for lists
let inspectionsRaw = [];
let complaintsRaw = [];
let inspectionFilter = "all"; // all | upcoming | past
let complaintFilter = "all"; // all | new | under_review | resolved

// for completing an existing scheduled inspection
let completingInspectionId = null;

// ---------- Helpers ----------
function todayMidnight() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// supports "YYYY-MM-DD"
function parseDateSafe(d) {
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
  if (s === "under_review") return `<span class="badge green">Under Review</span>`;
  return `<span class="badge red">New</span>`;
}

function markChipActive(prefixId, activeId) {
  document.querySelectorAll(`[id^="${prefixId}"]`).forEach((b) => b.classList.remove("active"));
  const el = document.getElementById(activeId);
  if (el) el.classList.add("active");
}

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
    (x) => (x.status || "new").toLowerCase() === "new"
  ).length;

  setBadge("badgeInspections", upcomingCount);
  setBadge("badgeComplaints", newComplaints);
}

// --- TAB SWITCHING LOGIC ---
window.switchTab = (tabName) => {
  document.querySelectorAll(".nea-tab").forEach((el) => el.classList.remove("active"));
  document.querySelectorAll(".nea-menu li").forEach((el) => el.classList.remove("active"));

  const tab = document.getElementById(`tab-${tabName}`);
  if (tab) tab.classList.add("active");

  const index = ["inspections", "complaints", "grading"].indexOf(tabName);
  const li = document.querySelectorAll(".nea-menu li")[index];
  if (li) li.classList.add("active");

  if (tabName === "inspections") loadInspections();
  if (tabName === "complaints") loadComplaints();
  if (tabName === "grading") loadStallsForDropdowns();
};

// ---------- INSPECTIONS ----------
window.setInspectionFilter = (mode) => {
  inspectionFilter = mode;
  markChipActive(
    "inspFilter",
    mode === "all" ? "inspFilterAll" : mode === "upcoming" ? "inspFilterUpcoming" : "inspFilterPast"
  );
  renderInspections();
};

async function loadInspections() {
  const list = document.getElementById("inspectionList");
  if (list) list.innerHTML = "<p>Loading inspections...</p>";

  try {
    // prefer dateTs if exists; fallback to date string sorting client-side
    let snap;
    try {
      const qTs = query(collection(db, "inspections"), orderBy("dateTs", "desc"));
      snap = await getDocs(qTs);
    } catch {
      const qStr = query(collection(db, "inspections"), orderBy("date", "desc"));
      snap = await getDocs(qStr);
    }

    inspectionsRaw = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    renderInspections();
    updateSidebarBadges();
  } catch (err) {
    console.error(err);
    if (list) list.innerHTML = "<p>No inspections found.</p>";
  }
}

// dropdown filter: all | scheduled | completed
// (this is separate from chips upcoming/past)
function statusFilterValue() {
  return (document.getElementById("inspectionFilter")?.value || "all").toLowerCase();
}

window.renderInspections = () => {
  const list = document.getElementById("inspectionList");
  if (!list) return;

  const q = (document.getElementById("inspSearch")?.value || "").trim().toLowerCase();
  const sortMode = document.getElementById("inspSort")?.value || "newest";
  const today = todayMidnight();
  const statusMode = statusFilterValue(); // all | scheduled | completed

  let items = inspectionsRaw.slice();

  // status dropdown filter
  items = items.filter((x) => {
    const st = (x.status || "scheduled").toLowerCase();
    if (statusMode === "all") return true;
    return st === statusMode;
  });

  // chips filter upcoming/past (based on date)
  items = items.filter((x) => {
    const dt = parseDateSafe(x.date);
    if (!dt) return inspectionFilter === "all";
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
      const st = (x.status || "scheduled").toLowerCase();
      const statusBadge = badgeForInspectionStatus(st);
      const dateText = x.date || "Unknown Date";

      // Completed extra info
      let extra = "";
      if (st === "completed") {
        extra += `
          <div class="score-display" style="margin-top:8px;">
            <span>Score: ${x.score ?? "-"}/100</span>
            ${x.grade ? `<span class="badge blue">Grade ${x.grade}</span>` : ""}
          </div>
        `;
        if (x.remarks) {
          extra += `<p style="margin-top:8px; font-size:13px; color:#555;"><strong>Remarks:</strong> ${x.remarks}</p>`;
        }
        if (x.breakdown) {
          extra += `
            <details style="margin-top:8px;">
              <summary style="cursor:pointer; font-size:13px; color:#e67e22;">View Score Breakdown</summary>
              <div style="margin-top:8px; display:grid; gap:6px;">
                <div style="display:flex; justify-content:space-between;"><span>Food Hygiene</span><span>${x.breakdown.foodHygiene ?? 0}%</span></div>
                <div style="display:flex; justify-content:space-between;"><span>Personal Hygiene</span><span>${x.breakdown.personalHygiene ?? 0}%</span></div>
                <div style="display:flex; justify-content:space-between;"><span>Equipment</span><span>${x.breakdown.equipment ?? 0}%</span></div>
                <div style="display:flex; justify-content:space-between;"><span>Premises</span><span>${x.breakdown.premises ?? 0}%</span></div>
              </div>
            </details>
          `;
        }
      }

      // scheduled actions
      const canAct = st === "scheduled";
      const actions = canAct
        ? `
          <div class="actions-row">
            <button class="btn-mini primary" onclick="openCompleteModalForInspection('${x.id}')">Complete</button>
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
            <span>Date: ${dateText}</span>
          </div>
          ${extra}
          ${actions}
        </div>
      `;
    })
    .join("");
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
  if (list) list.innerHTML = "<p>Loading complaints...</p>";

  try {
    const q = query(collection(db, "complaints"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);

    complaintsRaw = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    renderComplaints();
    updateSidebarBadges();
  } catch (err) {
    console.error(err);
    if (list) list.innerHTML = "<p>Error loading complaints.</p>";
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

  const q = (document.getElementById("cmpSearch")?.value || "").trim().toLowerCase();
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
      const date = x.createdAt?.toDate ? x.createdAt.toDate().toLocaleDateString() : "Unknown Date";
      const imgHtml = x.imageUrl
        ? `<a href="${x.imageUrl}" target="_blank" class="evidence-link">View Evidence</a>`
        : "";

      const st = (x.status || "new").toLowerCase();
      const badge = badgeForComplaintStatus(st);

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

  openScheduleModal();

  // date = today
  const dateInput = document.getElementById("schDate");
  if (dateInput) {
    const t = todayMidnight();
    const yyyy = t.getFullYear();
    const mm = String(t.getMonth() + 1).padStart(2, "0");
    const dd = String(t.getDate()).padStart(2, "0");
    dateInput.value = `${yyyy}-${mm}-${dd}`;
  }

  const stallName = (c.stallName || c.stall || "").trim();
  const sel = document.getElementById("schStall");
  if (sel && stallName) {
    setTimeout(() => {
      const opts = Array.from(sel.options);
      const found = opts.find((o) => (o.textContent || "").trim() === stallName);
      if (found) sel.value = found.value;
    }, 200);
  }

  // auto move new -> under_review
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
  const compSelect = document.getElementById("compStall"); // completion modal

  const loadingOpt = '<option value="" disabled selected>Loading...</option>';
  if (schSelect) schSelect.innerHTML = loadingOpt;
  if (gradeSelect) gradeSelect.innerHTML = loadingOpt;
  if (compSelect) compSelect.innerHTML = loadingOpt;

  try {
    stallDataCache = {};
    let options = '<option value="" disabled selected>Select Stall</option>';

    const centresSnap = await getDocs(collection(db, "centres"));

    for (const centreDoc of centresSnap.docs) {
      const centreId = centreDoc.id;
      const stallsSnap = await getDocs(collection(db, "centres", centreId, "stalls"));

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
    if (compSelect) compSelect.innerHTML = options;

    updateHygieneOverview();
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

  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(v);
  };

  set("ovTotal", vals.length);
  set("ovA", counts.A);
  set("ovB", counts.B);
  set("ovC", counts.C);
  set("ovD", counts.D);
  set("ovNone", counts.NONE);
}

window.filterGradeDropdown = () => {
  const q = (document.getElementById("gradeSearch")?.value || "").trim().toLowerCase();
  const sel = document.getElementById("gradeStallSelect");
  if (!sel) return;

  Array.from(sel.options).forEach((opt, idx) => {
    if (idx === 0) {
      opt.hidden = false;
      return;
    }
    const t = (opt.textContent || "").toLowerCase();
    opt.hidden = q ? !t.includes(q) : false;
  });
};

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
      stallId,
      stallPath,
      stallName,
      date: dateStr,
      dateTs,
      officer,
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
  document.querySelectorAll(".grade-btn").forEach((b) => b.classList.remove("selected"));
  // inline onclick provides `event`
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

// ---------- COMPLETE INSPECTION ----------
function calculateGradeFromScore(score) {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  return "D";
}

function updateCalculatedGrade() {
  const score = parseInt(document.getElementById("compScore").value);
  const display = document.getElementById("compCalculatedGrade");

  if (isNaN(score)) {
    display.textContent = "-";
    display.style.color = "";
    return;
  }

  if (score < 0 || score > 100) {
    display.textContent = "Invalid (0-100)";
    display.style.color = "red";
    return;
  }

  const grade = calculateGradeFromScore(score);
  display.textContent = grade;

  if (grade === "A") display.style.color = "#16a34a";
  else if (grade === "B") display.style.color = "#2f6bff";
  else if (grade === "C") display.style.color = "#ca8a04";
  else display.style.color = "#dc2626";
}

window.openCompleteModal = () => {
  document.getElementById("completeModal").style.display = "flex";
  loadStallsForDropdowns();

  // default date today
  document.getElementById("compDate").value = new Date().toISOString().split("T")[0];

  // reset
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
  document.getElementById("compCalculatedGrade").style.color = "";

  document.getElementById("compScore").oninput = updateCalculatedGrade;

  completingInspectionId = null;
};

window.closeCompleteModal = () => {
  document.getElementById("completeModal").style.display = "none";
  completingInspectionId = null;
};

window.openCompleteModalForInspection = (inspectionId) => {
  // find inspection
  const ins = inspectionsRaw.find((x) => x.id === inspectionId);
  if (!ins) return;

  window.openCompleteModal();

  // IMPORTANT: compStall uses stallPath (same as dropdown)
  const stallPath = ins.stallPath;
  if (stallPath) document.getElementById("compStall").value = stallPath;

  document.getElementById("compDate").value = ins.date || new Date().toISOString().split("T")[0];
  document.getElementById("compOfficer").value = ins.officer || "";

  updateCurrentGradeForCompletion();
  completingInspectionId = inspectionId;
};

window.updateCurrentGradeForCompletion = () => {
  const select = document.getElementById("compStall");
  const display = document.getElementById("compCurrentGrade");
  const stallPath = select?.value;

  if (stallPath && stallDataCache[stallPath]) {
    const grade = stallDataCache[stallPath].hygieneGrade;
    display.textContent = grade === "" || !grade ? "Not Graded" : grade;
  } else {
    display.textContent = "-";
  }
};

window.submitCompletion = async () => {
  const stallPath = document.getElementById("compStall").value; // centres/.../stalls/...
  const date = document.getElementById("compDate").value;
  const officer = document.getElementById("compOfficer").value;

  const score = parseInt(document.getElementById("compScore").value);
  const foodHygiene = parseInt(document.getElementById("compFoodHygiene").value) || 0;
  const personalHygiene = parseInt(document.getElementById("compPersonalHygiene").value) || 0;
  const equipment = parseInt(document.getElementById("compEquipment").value) || 0;
  const premises = parseInt(document.getElementById("compPremises").value) || 0;
  const remarks = document.getElementById("compRemarks").value;

  if (!stallPath || !date || !officer) {
    alert("Please fill in Stall, Date, and Officer Name.");
    return;
  }

  if (isNaN(score) || score < 0 || score > 100) {
    alert("Please enter a valid score between 0 and 100.");
    return;
  }

  if (
    foodHygiene < 0 || foodHygiene > 100 ||
    personalHygiene < 0 || personalHygiene > 100 ||
    equipment < 0 || equipment > 100 ||
    premises < 0 || premises > 100
  ) {
    alert("Breakdown scores must be between 0 and 100.");
    return;
  }

  const grade = calculateGradeFromScore(score);
  const stallId = stallPath.split("/").pop();
  const stallName = stallDataCache[stallPath]?.name || "Unknown Stall";
  const dateTs = Timestamp.fromDate(new Date(date + "T00:00:00"));

  try {
    if (completingInspectionId) {
      // update existing inspection
      const inspectionRef = doc(db, "inspections", completingInspectionId);
      await updateDoc(inspectionRef, {
        status: "completed",
        score,
        grade,
        remarks,
        breakdown: { foodHygiene, personalHygiene, equipment, premises },
        date,        // keep consistent
        dateTs,
        completedAt: serverTimestamp(),
      });
      completingInspectionId = null;
    } else {
      // create new completed inspection
      await addDoc(collection(db, "inspections"), {
        stallId,
        stallPath,
        stallName,
        date,
        dateTs,
        officer,
        status: "completed",
        score,
        grade,
        remarks,
        breakdown: { foodHygiene, personalHygiene, equipment, premises },
        createdAt: serverTimestamp(),
        completedAt: serverTimestamp(),
      });
    }

    // Update stall grade at centres/.../stalls/...
    const stallRef = doc(db, ...stallPath.split("/"));
    await updateDoc(stallRef, {
      hygieneGrade: grade,
      lastInspection: serverTimestamp(),
    });

    // Update cache
    if (stallDataCache[stallPath]) {
      stallDataCache[stallPath].hygieneGrade = grade;
    }
    updateHygieneOverview();

    window.closeCompleteModal();
    await loadInspections();

    alert(`Inspection completed! Grade: ${grade} (${score}/100)`);
  } catch (err) {
    console.error("Error completing inspection:", err);
    alert("Error completing inspection. Please try again.");
  }
};

// Init
window.addEventListener("DOMContentLoaded", async () => {
  switchTab("inspections");
  await loadInspections();
  await loadComplaints();
});

// Logout
window.logoutNEA = async () => {
  try {
    await signOut(auth);
    window.location.href = "index.html";
  } catch (err) {
    console.error("Logout failed:", err);
    alert("Error logging out. Please try again.");
  }
};
