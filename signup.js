/*************************************************
 * signup.js (FULL) - Firebase Auth + Firestore
 * - Roles: customer | storeholder | guest
 * - Guest: no login, redirect to home.html?mode=guest
 * - Customer: stores user profile in users/{uid}
 * - Storeholder: shows extra fields + auto-generates unique unitNo per centre
 *   - centre A and centre B can both have 01-001 (allowed)
 *   - within the SAME centre, unitNo never duplicates (transaction counter)
 * - Storeholder CANNOT sign up via Google (email/password only)
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
  runTransaction,
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyC-NTWADB-t1OGl7NbdyMVXjpVjnqjpTXg",
  authDomain: "fedproject-8d254.firebaseapp.com",
  projectId: "fedproject-8d254",
  storageBucket: "fedproject-8d254.firebasestorage.app",
  messagingSenderId: "477538553634",
  appId: "1:477538553634:web:a14b93bbd93d33b9281f7b",
};

async function loadHawkerCentres() {
  if (!stallCentreId) return;

  try {
    const snap = await getDocs(collection(db, "centres"));

    stallCentreId.innerHTML = `<option value="">Select Hawker Centre</option>`;

    snap.forEach((doc) => {
      const data = doc.data();

      const option = document.createElement("option");
      option.value = doc.id; // 🔑 centreId
      option.textContent = data.name || data.displayName || doc.id;

      stallCentreId.appendChild(option);
    });
  } catch (err) {
    console.error("Failed to load centres:", err);
  }
}

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
const confirmPassword = document.getElementById("confirmPassword");
const confirmPwError = document.getElementById("confirmPwError");
const nameError = document.getElementById("nameError");
const emailError = document.getElementById("emailError");
const phoneError = document.getElementById("phoneError");
const pwError = document.getElementById("pwError");

// Password toggle
const togglePasswordBtn = document.getElementById("togglePassword");
const eyeIcon = document.getElementById("eyeIcon");

// Role selection
const roleButtons = Array.from(document.querySelectorAll(".role"));
let selectedRole = "customer";

// Google button (for disabling in UI)
const googleBtn = document.getElementById("googleSignupBtn");

// Storeholder fields (must exist in signup.html for this to work)
const stallFields = document.getElementById("stallFields");
const stallCentreId = document.getElementById("stallCentreId");
const stallName = document.getElementById("stallName");
const stallCuisine = document.getElementById("stallCuisine");
const unitPreview = document.getElementById("unitPreview");

const stallCentreError = document.getElementById("stallCentreError");
const stallNameError = document.getElementById("stallNameError");
const stallCuisineError = document.getElementById("stallCuisineError");

/* =========================
   Role buttons
========================= */
roleButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    roleButtons.forEach((b) => b.setAttribute("aria-pressed", "false"));
    btn.setAttribute("aria-pressed", "true");
    selectedRole = btn.dataset.role; // customer | storeholder | guest

    // Guest = no login
    if (selectedRole === "guest") {
      window.location.href = "home.html?mode=guest";
      return;
    }

    // Toggle storeholder extra fields
    if (stallFields) {
      stallFields.hidden = selectedRole !== "storeholder";
    }
    if (selectedRole === "storeholder") {
      loadHawkerCentres();
    }

    // Reset unit preview text
    if (unitPreview) {
      unitPreview.value =
        selectedRole === "storeholder"
          ? "Unit No will be auto-generated after sign up"
          : "";
    }

    // Disable Google signup for storeholder
    if (googleBtn) {
      const lockGoogle = selectedRole === "storeholder";
      googleBtn.disabled = lockGoogle;
      googleBtn.style.opacity = lockGoogle ? "0.5" : "1";
      googleBtn.style.cursor = lockGoogle ? "not-allowed" : "pointer";
      if (lockGoogle) {
        googleBtn.title = "Stall Holder must use Email & Password sign up.";
      } else {
        googleBtn.title = "";
      }
    }
  });
});

/* =========================
   Password show/hide
========================= */
togglePasswordBtn?.addEventListener("click", () => {
  const isHidden = password.type === "password";
  password.type = isHidden ? "text" : "password";
  eyeIcon.src = isHidden ? "images/show.png" : "images/hide.png";
  eyeIcon.alt = isHidden ? "Show password" : "Hide password";
  togglePasswordBtn.setAttribute(
    "aria-label",
    isHidden ? "Show password" : "Hide password",
  );
});

/* =========================
   Validation helpers
========================= */
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

  if (stallCentreError) stallCentreError.textContent = "";
  if (stallNameError) stallNameError.textContent = "";
  if (stallCuisineError) stallCuisineError.textContent = "";
  if (confirmPwError) confirmPwError.textContent = "";
}

function validateBase() {
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

  // Confirm password
  if (!confirmPassword?.value) {
    confirmPwError.textContent = "Please confirm your password.";
    ok = false;
  } else if (password.value !== confirmPassword.value) {
    confirmPwError.textContent = "Passwords do not match.";
    ok = false;
  }

  return ok;
}

function validateStoreholderExtra() {
  let ok = true;

  if (!stallCentreId?.value) {
    if (stallCentreError)
      stallCentreError.textContent = "Please select a hawker centre.";
    ok = false;
  }
  if (!stallName?.value?.trim()) {
    if (stallNameError)
      stallNameError.textContent = "Please enter your stall name.";
    ok = false;
  }
  if (!stallCuisine?.value.trim()) {
    if (stallCuisineError)
      stallCuisineError.textContent = "Please enter a cuisine.";
    ok = false;
  }

  return ok;
}

function validate() {
  const okBase = validateBase();
  if (!okBase) return false;

  if (selectedRole === "storeholder") {
    return validateStoreholderExtra();
  }

  return true;
}

/* =========================
   Firestore helpers
========================= */

async function ensureUserProfile(user, role, phoneValue = "") {
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    await setDoc(userRef, {
      name: user.displayName || fullName?.value?.trim() || "",
      email: user.email || "",
      phone: phoneValue || "",
      role, // customer | storeholder
      createdAt: serverTimestamp(),
    });
  } else {
    // keep profile updated (optional)
    await setDoc(
      userRef,
      {
        name: user.displayName || fullName?.value?.trim() || "",
        phone: phoneValue || "",
        role,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  const finalSnap = await getDoc(userRef);
  return finalSnap.data().role;
}

// Unit formatting: 01-001, 01-023, 01-120
function formatUnitNo(n) {
  const padded = String(n).padStart(3, "0");
  return `01-${padded}`;
}

// Generate unique unitNo PER centre using transaction counter
async function generateUniqueUnitNoForCentre(centreId) {
  const counterRef = doc(db, "centres", centreId, "counters", "stallUnit");

  const unitNo = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);

    let next = 1;
    if (snap.exists() && typeof snap.data().next === "number") {
      next = snap.data().next;
    }

    const reserved = next;
    tx.set(counterRef, { next: next + 1 }, { merge: true });

    return formatUnitNo(reserved);
  });

  return unitNo;
}

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function generateOrderPrefix(name) {
  return name
    .replace(/[^a-zA-Z]/g, "")
    .toUpperCase()
    .slice(0, 2); // e.g. Kopi-Fellas → KF
}

// Create storeholder stall doc (payment methods + operating hours later)
async function createStoreholderStall(user) {
  const centreId = stallCentreId.value;
  const unitNo = await generateUniqueUnitNoForCentre(centreId);
  const baseSlug = slugify(stallName.value.trim());
  let slug = baseSlug;
  let i = 1;
  const orderPrefix = generateOrderPrefix(stallName.value.trim());

  while ((await getDoc(doc(db, "stalls", slug))).exists()) {
    i += 1;
    slug = `${baseSlug}-${i}`;
  }

  if (unitPreview) unitPreview.value = unitNo;

  // users/{uid}
  await setDoc(
    doc(db, "users", user.uid),
    {
      role: "storeholder",
      name: user.displayName || fullName.value.trim(),
      email: user.email || email.value.trim(),
      phone: phone.value.trim(),
      centreId,
      orderPrefix,
      stallId: slug,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );

  // centres/{centreId}/stalls/{uid}
  await setDoc(doc(db, "centres", centreId, "stalls", slug), {
    ownerUid: user.uid,
    centreId,
    publicStallId: slug,
    stallName: stallName.value.trim(),
    cuisine: stallCuisine.value,
    unitNo,
    phone: phone.value.trim(),
    orderPrefix,
    active: true,
    hasMenu: false,
    hasSetup: false,
    menuCount: 0,
    ratingTotal: 0,
    ratingCount: 0,

    supportsSizePricing: false,
    supportsAddons: false,

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    // Optional fields to add later (leave empty now):
    // paymentMethods: [],
    // operatingHours: {}
  });

  // ALSO create global stall doc so home.js can show it
  await setDoc(
    doc(db, "stalls", slug),
    {
      ownerUid: user.uid,
      centreId,
      publicStallId: slug,
      stallName: stallName.value.trim(),
      cuisine: stallCuisine.value,
      unitNo,
      phone: phone.value.trim(),
      orderPrefix,
      active: true, // 🔑 required because home.js filters active == true
      popular: false, // optional (home.js reads it)
      hygieneGrade: "", // optional
      imageUrl: "", // optional
      location: centreId, // your UI uses location filter
      desc: "",

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return unitNo;
}

function redirectByRole(role) {
  // Update page names if yours differ
  if (role === "storeholder") {
    window.location.href = "stall-dashboard.html";
  } else {
    window.location.href = "home.html";
  }
}

/* =========================
   Email/password signup
========================= */
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

    await updateProfile(cred.user, {
      displayName: fullName.value.trim(),
    });

    if (selectedRole === "storeholder") {
      statusMsg.textContent = "Creating stall & generating unit no...";

      try {
        await createStoreholderStall(cred.user);

        statusMsg.textContent =
          "✅ Storeholder account created. Redirecting...";
        setTimeout(() => redirectByRole("storeholder"), 900);
        return; // IMPORTANT: stop so we don't run customer code below
      } catch (e) {
        console.error("Stall creation failed:", e);
        statusMsg.textContent = `❌ Stall setup failed: ${e.code || e.message}`;
        return; // don't redirect
      }
    }

    // customer path only
    const role = await ensureUserProfile(
      cred.user,
      "customer",
      phone.value.trim(),
    );
    statusMsg.textContent = `Account created as ${role}. Redirecting...`;
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

/* =========================
   Google signup (CUSTOMER ONLY)
========================= */
googleBtn?.addEventListener("click", async () => {
  // ❌ Block Google for storeholder
  if (selectedRole === "storeholder") {
    clearErrors();
    statusMsg.textContent =
      "❌ Stall Holder accounts must use Email & Password. Google sign-up is for customers only.";
    return;
  }

  try {
    statusMsg.textContent = "Opening Google sign-up...";
    const result = await signInWithPopup(auth, provider);

    const role = await ensureUserProfile(result.user, "customer", "");
    statusMsg.textContent = `✅ Signed in as ${result.user.displayName || result.user.email}`;
    setTimeout(() => redirectByRole(role), 900);
  } catch (err) {
    console.error(err);
    statusMsg.textContent = `Google sign-up failed: ${err.code || err.message}`;
  }
});
