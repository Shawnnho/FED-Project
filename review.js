/*************************************************
 * review.js
 * - Submit review to Firestore
 * - Save review document
 * - Update ratingTotal & ratingCount
 *************************************************/

import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  doc,
  collection,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

/* ✅ SAME config as your other pages */
const firebaseConfig = {
  apiKey: "AIzaSyC-NTWADB-t1OGl7NbdyMVXjpVjnqjpTXg",
  authDomain: "fedproject-8d254.firebaseapp.com",
  projectId: "fedproject-8d254",
  storageBucket: "fedproject-8d254.firebasestorage.app",
  messagingSenderId: "477538553634",
  appId: "1:477538553634:web:a14b93bbd93d33b9281f7b",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

/* =========================
   Firebase Auth
========================= */
let currentUser = null;

onAuthStateChanged(auth, (u) => {
  currentUser = u;
});

const imgInput = document.getElementById("review-image");
const imgPreviewWrap = document.getElementById("imgPreviewWrap");
const imgPreview = document.getElementById("imgPreview");
const removeImgBtn = document.getElementById("removeImgBtn");

if (imgInput && imgPreviewWrap && imgPreview) {
  imgInput.addEventListener("change", () => {
    const file = imgInput.files && imgInput.files[0];
    if (!file) {
      imgPreviewWrap.style.display = "none";
      imgPreview.src = "";
      return;
    }

    // only images
    if (!file.type.startsWith("image/")) {
      imgPreviewWrap.style.display = "none";
      imgPreview.src = "";
      alert("Please choose an image file.");
      imgInput.value = "";
      return;
    }

    // preview
    const url = URL.createObjectURL(file);
    imgPreview.src = url;
    imgPreviewWrap.style.display = "flex";
  });

  if (removeImgBtn) {
    removeImgBtn.addEventListener("click", () => {
      imgInput.value = "";
      imgPreview.src = "";
      imgPreviewWrap.style.display = "none";
    });
  }
}

/* =========================
   Star selection (1–5)
========================= */
let selectedRating = 0;

const starContainer = document.getElementById("star-container");
if (starContainer) {
  const stars = starContainer.querySelectorAll(".star");

  stars.forEach((star) => {
    star.addEventListener("click", () => {
      selectedRating = Number(star.dataset.value);

      stars.forEach((s) => s.classList.remove("active"));
      stars.forEach((s) => {
        if (Number(s.dataset.value) <= selectedRating) {
          s.classList.add("active");
        }
      });
    });
  });
}

/* =========================
   Submit Review
========================= */
window.submitReview = async function submitReview() {
  const btn = document.getElementById("submit-btn");
  const msg = document.getElementById("success-msg");
  const input = document.getElementById("review-text");
  const stall = document.getElementById("stall-select");
  const error = document.getElementById("error-msg");

  // ---------- Validation ----------
  if (!stall.value) {
    error.innerText = "Please select a stall";
    error.style.display = "block";
    return;
  }

  if (!selectedRating) {
    error.innerText = "Please tap a star rating";
    error.style.display = "block";
    return;
  }

  if (input.value.trim() === "") {
    error.innerText = "Please enter your review";
    error.style.display = "block";
    return;
  }

  error.style.display = "none";
  btn.disabled = true;

  const stallId = stall.value;
  const stallName = stall.options[stall.selectedIndex].text;

  const stallRef = doc(db, "stalls", stallId);
  const reviewRef = doc(collection(db, "stalls", stallId, "reviews"));

  const imageInput = document.getElementById("review-image");
  let imageUrl = null;

  if (imageInput && imageInput.files.length > 0) {
    const file = imageInput.files[0];

    // basic size check (5MB)
    if (file.size > 5 * 1024 * 1024) {
      error.innerText = "Image too large (max 5MB)";
      error.style.display = "block";
      btn.disabled = false;
      return;
    }

    const imageRef = ref(
      storage,
      `reviews/${stallId}/${Date.now()}-${file.name}`,
    );

    await uploadBytes(imageRef, file);
    imageUrl = await getDownloadURL(imageRef);
  }

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(stallRef);
      const data = snap.exists() ? snap.data() : {};

      const ratingTotal = Number(data.ratingTotal || 0);
      const ratingCount = Number(data.ratingCount || 0);

      // ✅ Save review document
      tx.set(reviewRef, {
        rating: selectedRating,
        text: input.value.trim(),
        stallId: stallId,
        stallName: stallName,

        // ✅ Firebase Auth (safe)
        userId: currentUser ? currentUser.uid : null,
        userName: currentUser?.displayName || currentUser?.email || "Anonymous",

        imageUrl: imageUrl || null,
        createdAt: serverTimestamp(),
      });

      // ✅ Update aggregate rating
      tx.set(
        stallRef,
        {
          ratingTotal: ratingTotal + selectedRating,
          ratingCount: ratingCount + 1,
        },
        { merge: true },
      );
    });

    btn.style.display = "none";
    msg.style.display = "flex";

    setTimeout(() => {
      window.location.href = "feedback.html";
    }, 1000);
  } catch (e) {
    console.error(e);
    error.innerText = "Failed to submit review. Try again.";
    error.style.display = "block";
    btn.disabled = false;
  }
};
