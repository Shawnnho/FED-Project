/*************************************************
 * script.js — Hawker Point (Login)
 * - Guest -> home.html?mode=guest
 * - Customer/Storeholder -> Firebase email/password
 * - 🚫 Deactivated users cannot log in
 * - 📩 Reactivation request + email
 * - 😊 Friendly error messages (no Firebase codes)
 *************************************************/

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ===============================
   Firebase config (same as signup)
================================ */
const firebaseConfig = {
  apiKey: "AIzaSyC-NTWADB-t1OGl7NbdyMVXjpVjnqjpTXg",
  authDomain: "fedproject-8d254.firebaseapp.com",
  projectId: "fedproject-8d254",
  storageBucket: "fedproject-8d254.firebasestorage.app",
  messagingSenderId: "477538553634",
  appId: "1:477538553634:web:a14b93bbd93d33b9281f7b",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const params = new URLSearchParams(window.location.search);
const fromGuest = params.get("from") === "guest";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const emailOrPhone = document.getElementById("emailOrPhone");
  const password = document.getElementById("password");
  const rememberMe = document.getElementById("rememberMe");
  const emailError = document.getElementById("emailError");
  const pwError = document.getElementById("pwError");
  const statusMsg = document.getElementById("statusMsg");

  const togglePasswordBtn = document.getElementById("togglePassword");
  const eyeIcon = document.getElementById("eyeIcon");
  const roleButtons = Array.from(document.querySelectorAll(".role"));
  const googleBtn = document.getElementById("googleSignupBtn");

  const guestBtn = roleButtons.find((b) => b.dataset.role === "guest");

  function updateGuestLock() {
    if (!guestBtn) return;

    const hasText =
      emailOrPhone.value.trim().length > 0 || password.value.trim().length > 0;

    guestBtn.disabled = hasText;
    guestBtn.style.opacity = hasText ? "0.5" : "1";
    guestBtn.style.cursor = hasText ? "not-allowed" : "pointer";
    guestBtn.title = hasText ? "Clear email/password to use Guest mode" : "";

    // If guest selected then user starts typing, switch to customer
    if (hasText && guestBtn.getAttribute("aria-pressed") === "true") {
      const customerBtn = roleButtons.find(
        (b) => b.dataset.role === "customer",
      );
      if (customerBtn) customerBtn.click();
    }
  }

  updateGuestLock(); // handles Remember Me autofill
  emailOrPhone.addEventListener("input", updateGuestLock);
  password.addEventListener("input", updateGuestLock);

  let selectedRole =
    roleButtons.find((b) => b.getAttribute("aria-pressed") === "true")?.dataset
      .role || "guest";

  let isLoggingIn = false;

  /* ===============================
     Auth state (block deactivated)
  ============================== */
  onAuthStateChanged(auth, async (user) => {
    if (fromGuest) return; // ✅ allow signin page to stay
    if (!user || isLoggingIn) return;

    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists() && snap.data()?.deactivated) {
        statusMsg.textContent =
          "❌ This account has been deactivated. Please request reactivation.";
        await signOut(auth);
        return;
      }

      redirectByRole(snap.data()?.role);
    } catch (err) {
      console.error(err);
      await signOut(auth);
    }
  });

  /* ===============================
     Remember me
  ============================== */
  const saved = localStorage.getItem("hawker_remember_user");
  if (saved) {
    emailOrPhone.value = saved;
    rememberMe.checked = true;
  }

  /* ===============================
     Role selection
  ============================== */
  function applyRoleUI() {
    if (!googleBtn) return;
    const lockGoogle =
      selectedRole === "storeholder" || selectedRole === "nea_officer";
    googleBtn.disabled = lockGoogle;
    googleBtn.style.opacity = lockGoogle ? "0.5" : "1";
    googleBtn.style.cursor = lockGoogle ? "not-allowed" : "pointer";
  }
  /* ===============================
   Google Sign In
============================== */
  const provider = new GoogleAuthProvider();

  googleBtn?.addEventListener("click", async () => {
    // Extra safety (UI already disables it)
    if (selectedRole === "storeholder") {
      statusMsg.textContent =
        "❌ Store Holder cannot sign in with Google. Please use Email & Password.";
      return;
    }

    try {
      statusMsg.textContent = "Signing in with Google…";

      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      //  Check user record
      const snap = await getDoc(doc(db, "users", user.uid));

      if (!snap.exists()) {
        statusMsg.textContent =
          "❌ This Google account is not registered. Please sign up first.";
        await signOut(auth);
        return;
      }

      if (snap.data()?.deactivated) {
        statusMsg.textContent =
          "❌ This account has been deactivated. Please request reactivation.";
        await signOut(auth);
        return;
      }

      redirectByRole(snap.data().role);
    } catch (err) {
      console.error(err);
      statusMsg.textContent = "❌ Google sign-in failed.";
    }
  });

  roleButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      roleButtons.forEach((b) => b.setAttribute("aria-pressed", "false"));
      btn.setAttribute("aria-pressed", "true");
      selectedRole = btn.dataset.role;
      sessionStorage.setItem("signin_role", selectedRole);
      applyRoleUI();
    });
  });

  applyRoleUI();

  /* ===============================
     Toggle password
  ============================== */
  togglePasswordBtn?.addEventListener("click", () => {
    const show = password.type === "password";
    password.type = show ? "text" : "password";
    eyeIcon.src = show ? "images/show.png" : "images/hide.png";
  });

  /* ===============================
     Validation
  ============================== */
  function isEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  function isPhone(v) {
    return /^[89]\d{7}$/.test(v);
  }

  function validate() {
    emailError.textContent = "";
    pwError.textContent = "";
    statusMsg.textContent = "";

    if (!emailOrPhone.value.trim()) {
      emailError.textContent = "Please enter your email.";
      return false;
    }

    if (!isEmail(emailOrPhone.value.trim())) {
      emailError.textContent = "Please enter a valid email address.";
      return false;
    }

    if (!password.value || password.value.length < 6) {
      pwError.textContent = "Password must be at least 6 characters.";
      return false;
    }

    return true;
  }

  async function findUserByEmail(email) {
    const q = query(collection(db, "users"), where("email", "==", email));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    // return first match (should be unique)
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
  }

  function showDeactivatedMessage() {
    statusMsg.innerHTML = `
    ❌ <strong>Your account has been deactivated.</strong><br>
    To regain access, please request reactivation via email.
  `;
    statusMsg.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function openReactivationEmail(email, uid = "unknown") {
    const to = "hawkerpoint.support@gmail.com"; // change to your email
    const subject = encodeURIComponent(
      "Hawker Point - Account Reactivation Request",
    );
    const body = encodeURIComponent(
      `Hi Hawker Point Team,\n\nPlease reactivate my account.\n\nEmail: ${email}\nUID: ${uid}\n\nThank you.`,
    );
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
  }

  /* ===============================
     Helper
  ============================== */
  function redirectByRole(role) {
    if (role === "storeholder") {
      window.location.href = "stall-dashboard.html";
      return;
    }

    if (role === "nea_officer") {
      window.location.href = "nea.html";
      return;
    }
    if (role === "operator") {
      window.location.href = "operator.html";
      return;
    }

    if (role === "customer") {
      window.location.href = "home.html";
      return;
    }

    // fallback
    window.location.href = "home.html";
  }

  /* ===============================
     Submit (LOGIN)
  ============================== */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const role = sessionStorage.getItem("signin_role") || selectedRole;
    if (role === "guest") {
      // ✅ make guest a true "logged out" state
      await signOut(auth).catch(() => {});
      window.location.href = "index.html?mode=guest";
      return;
    }

    if (!validate()) return;

    const email = emailOrPhone.value.trim();
    const pw = password.value;

    if (rememberMe.checked) localStorage.setItem("hawker_remember_user", email);
    else localStorage.removeItem("hawker_remember_user");

    try {
      isLoggingIn = true;
      statusMsg.textContent = "Signing in...";

      const cred = await signInWithEmailAndPassword(auth, email, pw);

      const snap = await getDoc(doc(db, "users", cred.user.uid));
      if (snap.exists() && snap.data()?.deactivated) {
        // 🔒 Save reactivation request
        await setDoc(
          doc(db, "reactivationRequests", cred.user.uid),
          {
            uid: cred.user.uid,
            email: cred.user.email,
            status: "pending",
            requestedAt: serverTimestamp(),
          },
          { merge: true },
        );

        // 📧 Open email client
        const to = "hawkerpoint.support@gmail.com"; // change if needed
        const subject = encodeURIComponent(
          "Hawker Point - Account Reactivation Request",
        );
        const body = encodeURIComponent(
          `Hi Hawker Point Team,\n\nPlease reactivate my account.\n\nEmail: ${cred.user.email}\nUID: ${cred.user.uid}\n\nThank you.`,
        );
        window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;

        statusMsg.textContent =
          "❌ Account deactivated. Reactivation email prepared.";
        await signOut(auth);
        return;
      }

      redirectByRole(snap.data().role);
    } catch (err) {
      console.error(err);

      const code = err?.code || "";
      const email = emailOrPhone.value.trim();

      // If auth fails, still check if this email belongs to a deactivated account
      if (
        code === "auth/invalid-credential" ||
        code === "auth/user-not-found"
      ) {
        try {
          const userDoc = await findUserByEmail(email);

          if (userDoc?.deactivated) {
            showDeactivatedMessage();

            // log reactivation request (optional)
            try {
              await setDoc(
                doc(db, "reactivationRequests", userDoc.id || email),
                {
                  email,
                  uid: userDoc.id || null,
                  status: "pending",
                  requestedAt: serverTimestamp(),
                },
                { merge: true },
              );
            } catch (_) {}

            openReactivationEmail(email, userDoc.id || "unknown");
            return;
          }
        } catch (e) {
          console.error("Firestore lookup failed:", e);
        }

        // If not deactivated → normal wrong creds message
        statusMsg.textContent = "❌ Wrong email or password.";
        return;
      }

      if (code === "auth/too-many-requests") {
        statusMsg.textContent = "⚠️ Too many attempts. Try again later.";
        return;
      }

      statusMsg.textContent = "❌ Sign in failed. Please try again.";
    }
  });
});
