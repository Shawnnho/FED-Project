import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// 🔁 Replace with your Firebase config from Project settings
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
const provider = new GoogleAuthProvider();

const googleBtn = document.getElementById("googleBtn");
const statusMsg = document.getElementById("statusMsg");

googleBtn.addEventListener("click", async () => {
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    statusMsg.textContent = `✅ Logged in as ${user.displayName || user.email}`;
  } catch (err) {
    statusMsg.textContent = `❌ Google login failed: ${err.code}`;
    console.error(err);
  }
});

// Optional: keep UI in sync
onAuthStateChanged(auth, (user) => {
  if (user) {
    statusMsg.textContent = `✅ Logged in as ${user.displayName || user.email}`;
  }
});
