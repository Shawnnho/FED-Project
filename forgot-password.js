import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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

const form = document.getElementById("resetForm");
const resetEmail = document.getElementById("resetEmail");
const resetError = document.getElementById("resetError");
const resetStatus = document.getElementById("resetStatus");

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  resetError.textContent = "";
  resetStatus.textContent = "";

  const email = resetEmail.value.trim();

  if (!email) {
    resetError.textContent = "Please enter your email.";
    return;
  }
  if (!isEmail(email)) {
    resetError.textContent = "Please enter a valid email address.";
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    resetStatus.textContent =
      "✅ Reset link sent! Please check your email inbox (and spam).";
  } catch (err) {
    console.error(err);

    // Friendly messages for common errors
    if (err.code === "auth/user-not-found") {
      resetError.textContent = "No account found with this email.";
    } else if (err.code === "auth/invalid-email") {
      resetError.textContent = "Invalid email address.";
    } else if (err.code === "auth/too-many-requests") {
      resetError.textContent = "Too many attempts. Please try again later.";
    } else {
      resetError.textContent = `Reset failed: ${err.code || "Unknown error"}`;
    }
  }
});
