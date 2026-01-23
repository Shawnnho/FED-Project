/* =========================================
   FIREBASE SETUP & AUTO-FILL
========================================= */
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

/* =========================================
   COMPLAINT FORM LOGIC
========================================= */

// We attach this to 'window' so the HTML onclick="submitComplaint()" can find it
window.submitComplaint = function () {
  // 1. Get Elements
  const stall = document.getElementById("comp-stall");
  const first = document.getElementById("comp-first");
  const last = document.getElementById("comp-last");
  const email = document.getElementById("comp-email");
  const msg = document.getElementById("comp-msg");

  const error = document.getElementById("error-msg");
  const btn = document.getElementById("submit-btn");
  const success = document.getElementById("success-msg");

  // 2. Simple Validation (Check if empty)
  if (
    !stall.value ||
    !first.value ||
    !last.value ||
    !email.value ||
    !msg.value
  ) {
    error.style.display = "block";
    return;
  }

  // 3. Success
  error.style.display = "none";
  btn.style.display = "none";
  success.style.display = "flex";

  // 4. REDIRECT: Wait 3 seconds, then go to FEEDBACK HOME
  setTimeout(function () {
    window.location.href = "feedback.html";
  }, 3000);
};
