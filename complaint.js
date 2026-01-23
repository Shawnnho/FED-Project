/* =========================================
   FIREBASE SETUP & AUTO-FILL
========================================= */

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

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Your Firebase Config (Same as signup.js)
const firebaseConfig = {
  apiKey: "AIzaSyC-NTWADB-t1OGl7NbdyMVXjpVjnqjpTXg",
  authDomain: "fedproject-8d254.firebaseapp.com",
  projectId: "fedproject-8d254",
  storageBucket: "fedproject-8d254.firebasestorage.app",
  messagingSenderId: "477538553634",
  appId: "1:477538553634:web:a14b93bbd93d33b9281f7b",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// ✅ LISTEN FOR LOGIN STATUS
onAuthStateChanged(auth, (user) => {
  if (user) {
    // User is logged in
    console.log("User detected:", user.email);

    // Find the email input field
    const emailField = document.getElementById("comp-email");

    // If field exists and user has an email, auto-fill it
    if (emailField && user.email) {
      emailField.value = user.email;
      // Optional: Make it read-only if you don't want them to change it
      // emailField.readOnly = true;
    }
  } else {
    console.log("No user logged in");
  }
});

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

// We attach this to 'window' so the HTML onclick="submitComplaint()" can find it
window.submitComplaint = async function () {
  // 1. Get Elements
  const stall = document.getElementById("comp-stall");
  const first = document.getElementById("comp-first");
  const last = document.getElementById("comp-last");
  const email = document.getElementById("comp-email");
  const msg = document.getElementById("comp-msg");
  const imgInput = document.getElementById("comp-img");

  const error = document.getElementById("error-msg");
  const btn = document.getElementById("submit-btn");
  const success = document.getElementById("success-msg");

  // 2. Simple Validation (Check if empty)
  if (
    !stall?.value ||
    !first?.value ||
    !last?.value ||
    !email?.value ||
    !msg?.value
  ) {
    error.style.display = "block";
    return;
  }

  error.style.display = "none";

  // 3) Disable button while uploading/saving
  btn.disabled = true;
  const oldText = btn.textContent;
  btn.textContent = "Submitting…";

  try {
    const user = auth.currentUser;
    const file = imgInput?.files?.[0] || null;

    let imageUrl = "";
    let imagePath = "";

    // 4) Optional image upload
    if (file) {
      // Basic checks
      const isOkType =
        file.type === "image/jpeg" ||
        file.type === "image/png" ||
        file.type === "image/jpg";

      if (!isOkType) {
        throw new Error("Only JPG/PNG images are allowed.");
      }

      if (file.size > 5 * 1024 * 1024) {
        throw new Error("Image too large (max 5MB).");
      }

      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const uid = user?.uid || "guest";
      const filename = `complaint_${Date.now()}.${ext}`;

      imagePath = `complaints/${uid}/${filename}`;
      const imgRef = sRef(storage, imagePath);

      await uploadBytes(imgRef, file, {
        contentType: file.type || "image/jpeg",
      });

      imageUrl = await getDownloadURL(imgRef);
    }

    // 5) Save complaint into Firestore
    await addDoc(collection(db, "complaints"), {
      stall: stall.value,
      firstName: first.value.trim(),
      lastName: last.value.trim(),
      email: email.value.trim(),
      message: msg.value.trim(),

      imageUrl: imageUrl || "",
      imagePath: imagePath || "",

      uid: user?.uid || null,
      createdAt: serverTimestamp(),
    });

    // 6) Success UI
    btn.style.display = "none";
    success.style.display = "flex";

    setTimeout(function () {
      window.location.href = "feedback.html";
    }, 3000);
  } catch (err) {
    console.error(err);
    error.textContent = err?.message || "Failed to submit. Please try again.";
    error.style.display = "block";

    // Re-enable button
    btn.disabled = false;
    btn.textContent = oldText;
  }
};
