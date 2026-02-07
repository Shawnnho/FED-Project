import { auth } from "./firebase.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const provider = new GoogleAuthProvider();

const googleBtn = document.getElementById("googleBtn");
const statusMsg = document.getElementById("statusMsg");

const role = sessionStorage.getItem("signin_role") || "customer";

/* Guest redirect */
if (role === "guest") {
  // ✅ make guest a true "logged out" state
  await signOut(auth).catch(() => {});
  window.location.href = "index.html?mode=guest";
  return;
}

/* Storeholder block */
if (role === "storeholder") {
  if (statusMsg) {
    statusMsg.textContent =
      "❌ Store Holder cannot sign in with Google. Please use Email & Password.";
  }
  if (googleBtn) {
    googleBtn.disabled = true;
    googleBtn.style.opacity = "0.6";
    googleBtn.style.cursor = "not-allowed";
  }
}

googleBtn?.addEventListener("click", async () => {
  // extra safety: block storeholder
  if (role === "storeholder") return;

  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    if (statusMsg) {
      statusMsg.textContent = `✅ Logged in as ${user.displayName || user.email}`;
    }
  } catch (err) {
    if (statusMsg)
      statusMsg.textContent = `❌ Google login failed: ${err.code}`;
    console.error(err);
  }
});

onAuthStateChanged(auth, (user) => {
  if (user && statusMsg) {
    statusMsg.textContent = `✅ Logged in as ${user.displayName || user.email}`;
  }
});
