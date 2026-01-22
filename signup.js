/*************************************************
 * signup.js (FULL) - Firebase Auth + Firestore Role Storage
 * - Email/Password signup
 * - Google signup
 * - Stores role + profile in Firestore so it works across devices
 *************************************************/

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ✅ Use SAME config as your login
const firebaseConfig = {
  apiKey: "AIzaSyC-NTWADB-t1OGl7NbdyMVXjpVjnqjpTXg",
  authDomain: "fedproject-8d254.firebaseapp.com",
  projectId: "fedproject-8d254",
  storageBucket: "fedproject-8d254.firebasestorage.app",
  messagingSenderId: "477538553634",
  appId: "1:477538553634:web:a14b93bbd93d33b9281f7b",
};

// Firebase init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);

// DOM
const form = document.getElementById("signupForm");
const statusMsg = document.getElementById("statusMsg");

const fullName = document.getElementById("fullName");
const email = document.getElementById("email");
const phone = document.getElementById("phone");
const password = document.getElementById("password");

const nameError = document.getElementById("nameError");
const emailError = document.getElementById("emailError");
const phoneError = document.getElementById("phoneError");
const pwError = document.getElementById("pwError");

// Password icon toggle (images/show.png & images/hide.png)
const togglePasswordBtn = document.getElementById("togglePassword");
const eyeIcon = document.getElementById("eyeIcon");

// Role selection
const roleButtons = Array.from(document.querySelectorAll(".role"));
let selectedRole = "customer";

roleButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    roleButtons.forEach((b) => b.setAttribute("aria-pressed", "false"));
    btn.setAttribute("aria-pressed", "true");
    selectedRole = btn.dataset.role;

    // If Guest selected, skip signup (guest = no account)
    if (selectedRole === "guest") {
      window.location.href = "home.html?mode=guest";
    }
  });
});

// Show/hide password (icon = action)
togglePasswordBtn.addEventListener("click", () => {
  const isHidden = password.type === "password";
  password.type = isHidden ? "text" : "password";
  eyeIcon.src = isHidden ? "images/show.png" : "images/hide.png";
  eyeIcon.alt = isHidden ? "Show password" : "Hide password";
  togglePasswordBtn.setAttribute(
    "aria-label",
    isHidden ? "Show password" : "Hide password",
  );
});

// Validation helpers
function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}
function isPhone(v) {
  return /^[89]\d{7}$/.test(v.trim());
}

function clearErrors() {
  nameError.textContent = "";
  emailError.textContent = "";
  phoneError.textContent = "";
  pwError.textContent = "";
  statusMsg.textContent = "";
}

function validate() {
  clearErrors();
  let ok = true;

  if (!fullName.value.trim()) {
    nameError.textContent = "Please enter your full name.";
    ok = false;
  }

  if (!email.value.trim()) {
    emailError.textContent = "Please enter your email.";
    ok = false;
  } else if (!isEmail(email.value)) {
    emailError.textContent = "Please enter a valid email.";
    ok = false;
  }

  if (!phone.value.trim()) {
    phoneError.textContent = "Please enter your phone number.";
    ok = false;
  } else if (!isPhone(phone.value)) {
    phoneError.textContent = "Enter a valid SG phone (8 digits).";
    ok = false;
  }

  if (!password.value) {
    pwError.textContent = "Please enter a password.";
    ok = false;
  } else if (password.value.length < 6) {
    pwError.textContent = "Password must be at least 6 characters.";
    ok = false;
  }

  return ok;
}

/* ================================
   Firestore Profile + Role Helpers
================================ */

/**
 * Create user profile if it doesn't exist.
 * Returns stored role (from DB) so it always works cross-device.
 */
async function ensureUserProfile(user, role, phoneValue = "") {
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);

  // Create only if first time
  if (!snap.exists()) {
    await setDoc(userRef, {
      name: user.displayName || fullName?.value?.trim() || "",
      email: user.email || "",
      phone: phoneValue || "",
      role: role, // "customer" | "stall_owner" (match your data-role values)
      createdAt: serverTimestamp(),
    });
  }

  // Always read role from DB (source of truth)
  const finalSnap = await getDoc(userRef);
  return finalSnap.data().role;
}

/**
 * Redirect by role
 * IMPORTANT: Change these page names to match your project files.
 */
function redirectByRole(role) {
  if (role === "stall_owner") {
    window.location.href = "stall-dashboard.html";
  } else {
    // default customer
    window.location.href = "index.html";
  }
}

/* ================================
   Email/Password signup
================================ */

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validate()) return;

  try {
    statusMsg.textContent = "Creating account...";

    const cred = await createUserWithEmailAndPassword(
      auth,
      email.value.trim(),
      password.value,
    );

    // Set display name in Firebase Auth
    await updateProfile(cred.user, {
      displayName: fullName.value.trim(),
    });

    // ✅ Save role + phone in Firestore (cross-device)
    const role = await ensureUserProfile(
      cred.user,
      selectedRole,
      phone.value.trim(),
    );

    statusMsg.textContent = `✅ Account created as ${role}. Redirecting...`;
    setTimeout(() => redirectByRole(role), 900);
  } catch (err) {
    console.error(err);

    if (err.code === "auth/email-already-in-use") {
      emailError.textContent =
        "This email is already registered. Try logging in.";
    } else if (err.code === "auth/weak-password") {
      pwError.textContent = "Password too weak. Use at least 6 characters.";
    } else {
      statusMsg.textContent = `❌ Sign up failed: ${err.code || err.message}`;
    }
  }
});

/* ================================
   Google signup button
================================ */

document
  .getElementById("googleSignupBtn")
  .addEventListener("click", async () => {
    try {
      statusMsg.textContent = "Opening Google sign-up...";

      const result = await signInWithPopup(auth, provider);

      // ✅ Save role in Firestore (cross-device)
      // Phone is optional for Google sign up unless you collect it
      const role = await ensureUserProfile(result.user, selectedRole, "");

      statusMsg.textContent = `✅ Signed in as ${result.user.displayName || result.user.email}`;
      setTimeout(() => redirectByRole(role), 900);
    } catch (err) {
      console.error(err);
      statusMsg.textContent = `❌ Google sign-up failed: ${err.code || err.message}`;
    }
  });
