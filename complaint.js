import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
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

/* ✅ Firebase Config */
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

// ✅ Global user variable to ensure we capture the login state correctly
let currentUser = null;

// Listen for login state
onAuthStateChanged(auth, (user) => {
  currentUser = user; // Store user globally

  if (user) {
    console.log("✅ Complaint Page: User detected:", user.email);
    // Auto-fill email
    const emailField = document.getElementById("comp-email");
    if (emailField && user.email) {
      emailField.value = user.email;
    }
  } else {
    console.log("⚠️ Complaint Page: No user logged in");
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
   COMPLAINT FORM LOGIC
========================================= */

window.submitComplaint = async function () {
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
