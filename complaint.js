import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  query,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getStorage,
  ref as sRef,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

/* Firebase Config */
const firebaseConfig = {
  apiKey: "AIzaSyC-NTWADB-t1OGl7NbdyMVXjpVjnqjpTXg",
  authDomain: "fedproject-8d254.firebaseapp.com",
  projectId: "fedproject-8d254",
  storageBucket: "fedproject-8d254.firebasestorage.app",
  messagingSenderId: "477538553634",
  appId: "1:477538553634:web:a14b93bbd93d33b9281f7b",
};

// Initialize
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Global user variable to ensure we capture the login state correctly
let currentUser = null;

// Listen for login state
onAuthStateChanged(auth, (user) => {
  currentUser = user;

  if (user) {
    console.log("Complaint Page: User detected:", user.email);

    const emailField = document.getElementById("comp-email");
    if (emailField && user.email) emailField.value = user.email;

    loadStalls();
  } else {
    alert("Please log in to submit a complaint.");
    window.location.href = "signin.html";
  }
});

function setSubmitState(state) {
  const btn = document.getElementById("submit-btn");
  if (!btn) return;

  btn.classList.remove("isLoading", "isSuccess");

  if (state === "loading") {
    btn.disabled = true;
    btn.textContent = "Submitting…";
    btn.classList.add("isLoading");
    return;
  }

  if (state === "success") {
    btn.disabled = true;
    btn.textContent = "✅ Submitted";
    btn.classList.add("isSuccess");
    return;
  }

  // idle
  btn.disabled = false;
  btn.textContent = "Submit a Complaint";
}

// Image Preview Logic
const imgInput = document.getElementById("comp-img");
const imgPreview = document.getElementById("comp-img-preview");

if (imgInput && imgPreview) {
  imgInput.addEventListener("change", () => {
    const file = imgInput.files?.[0];
    if (!file) {
      imgPreview.style.display = "none";
      imgPreview.src = "";
      return;
    }
    const url = URL.createObjectURL(file);
    imgPreview.src = url;
    imgPreview.style.display = "block";
    imgPreview.onload = () => URL.revokeObjectURL(url);
  });
}

/* =========================================
  SELECT Store LOGIC

========================================= */
async function loadStalls() {
  const select = document.getElementById("comp-stall");
  if (!select) return;

  select.innerHTML = `<option value="" disabled selected>Loading stalls...</option>`;

  try {
    const q = query(collection(db, "stalls"));
    const snap = await getDocs(q);

    // build stalls list first
    const stalls = snap.docs.map((d) => {
      const data = d.data() || {};
      return {
        id: d.id,
        name: data.stallName || data.name || d.id,
      };
    });

    // dedupe by stall name (case-insensitive)
    const seen = new Set();
    const dedupedStalls = [];

    for (const s of stalls) {
      const key = (s.name || "").trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      dedupedStalls.push(s);
    }

    dedupedStalls.sort((a, b) => a.name.localeCompare(b.name));

    if (!dedupedStalls.length) {
      select.innerHTML = `<option value="" disabled selected>No stalls found</option>`;
      return;
    }

    select.innerHTML = `
      <option value="" disabled selected>Select a stall</option>
      ${dedupedStalls.map((s) => `<option value="${s.id}">${s.name}</option>`).join("")}
    `;
  } catch (err) {
    console.error("Failed to load stalls:", err);
    select.innerHTML = `<option value="" disabled selected>Failed to load stalls</option>`;
  }
}

/* =========================================
   COMPLAINT FORM LOGIC
========================================= */

window.submitComplaint = async function () {
  if (!currentUser) {
    alert("You must be logged in to submit a complaint.");
    return;
  }

  const stallSelect = document.getElementById("comp-stall");
  const first = document.getElementById("comp-first");
  const last = document.getElementById("comp-last");
  const email = document.getElementById("comp-email");
  const msg = document.getElementById("comp-msg");
  const imgInput = document.getElementById("comp-img");
  const error = document.getElementById("error-msg");

  // 1. Validation
  if (
    !stallSelect?.value ||
    !first?.value ||
    !last?.value ||
    !email?.value ||
    !msg?.value
  ) {
    error.style.display = "block";
    error.textContent = "Please fill in all fields";
    return;
  }

  error.style.display = "none";
  setSubmitState("loading");

  try {
    // 2. Get Data
    const stallNameText = stallSelect.options[stallSelect.selectedIndex].text;
    const fullUserName = `${first.value.trim()} ${last.value.trim()}`;
    const uidToSave = currentUser ? currentUser.uid : null;

    console.log("Submitting Complaint for UID:", uidToSave); // Debugging

    if (!uidToSave) {
      // Optional: Warn them if they aren't logged in
      console.warn("Warning: Submitting as guest. This won't show in history.");
    }

    // 3. Handle Image Upload
    let imageUrl = "";
    let imagePath = "";
    const file = imgInput?.files?.[0];

    if (file) {
      if (file.size > 5 * 1024 * 1024)
        throw new Error("Image too large (max 5MB).");

      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      // If guest, use 'anonymous' folder
      const storageUid = uidToSave || "anonymous";
      const filename = `complaint_${Date.now()}.${ext}`;
      imagePath = `complaints/${storageUid}/${filename}`;

      const imgRef = sRef(storage, imagePath);
      await uploadBytes(imgRef, file);
      imageUrl = await getDownloadURL(imgRef);
    }

    // 4. Save to Firestore
    await addDoc(collection(db, "complaints"), {
      stall: stallSelect.value,
      stallName: stallNameText, // Used for title in history

      firstName: first.value.trim(),
      lastName: last.value.trim(),
      userName: fullUserName, // Used for name in history

      email: email.value.trim(),
      message: msg.value.trim(),

      imageUrl: imageUrl || "",
      imagePath: imagePath || "",

      uid: uidToSave, // CRITICAL for History filtering
      createdAt: serverTimestamp(),
      type: "complaint", // Good practice to verify type
    });

    // 5. Success
    setSubmitState("success");

    setTimeout(function () {
      window.location.href = "feedback.html"; // Go back to feedback menu
    }, 2000);
  } catch (err) {
    console.error("Submission Error:", err);
    error.textContent = err?.message || "Failed to submit. Please try again.";
    error.style.display = "block";
    setSubmitState("idle");
  }
};
