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
  getDocs,
  query,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

/* ✅ SAME config as your other pages */
const firebaseConfig = {
  apiKey: "AIzaSyC-NTWADB-t1OGl7NbdyMVXjpVjnqjpTXg", // <--- THIS
  authDomain: "fedproject-8d254.firebaseapp.com", // <--- THIS
  projectId: "fedproject-8d254", // <--- THIS
  storageBucket: "fedproject-8d254.firebasestorage.app",
  messagingSenderId: "477538553634",
  appId: "1:477538553634:web:a14b93bbd93d33b9281f7b",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

const submitBtn = document.getElementById("submit-btn");
if (submitBtn) submitBtn.disabled = true;

/* =========================
   Firebase Auth
========================= */
let currentUser = null;

onAuthStateChanged(auth, (u) => {
  currentUser = u;

  if (!u) {
    alert("Please log in to submit a review.");
    window.location.href = "signin.html";
    return;
  }
  // logged in
  if (submitBtn) submitBtn.disabled = false;
  loadStallsIntoSelect();
});

const stallSelect = document.getElementById("stall-select");
const stallTitle = document.getElementById("selected-stall-text");

async function loadStallsIntoSelect() {
  if (!stallSelect) return;

  stallSelect.innerHTML = `<option value="" disabled selected>Loading stalls...</option>`;

  try {
    const q = query(collection(db, "stalls"));
    const snap = await getDocs(q);

    const stalls = snap.docs.map((d) => {
      const data = d.data() || {};
      return {
        id: d.id,
        name: data.stallName || data.name || d.id,
      };
    });

    stalls.sort((a, b) => a.name.localeCompare(b.name));

    if (!stalls.length) {
      stallSelect.innerHTML = `<option value="" disabled selected>No stalls found</option>`;
      return;
    }

    stallSelect.innerHTML = `
      <option value="" disabled selected>Select a stall</option>
      ${stalls
        .map((s) => `<option value="${s.id}">${s.name}</option>`)
        .join("")}
    `;
  } catch (err) {
    console.error("Failed to load stalls:", err);
    stallSelect.innerHTML = `<option value="" disabled selected>Failed to load stalls</option>`;
  }
}

stallSelect?.addEventListener("change", () => {
  stallTitle.textContent = stallSelect.options[stallSelect.selectedIndex].text;
});

const tagWrap = document.getElementById("quickTags");
const selectedTags = new Set();

tagWrap?.addEventListener("click", (e) => {
  const btn = e.target.closest(".tagChip");
  if (!btn) return;

  const tag = btn.dataset.tag;

  if (selectedTags.has(tag)) {
    selectedTags.delete(tag);
    btn.classList.remove("isOn");
    return;
  }

  if (selectedTags.size >= 3) return;

  selectedTags.add(tag);
  btn.classList.add("isOn");
});

function getSelectedTags() {
  return Array.from(selectedTags);
}

const textEl = document.getElementById("review-text");
const charCountEl = document.getElementById("charCount");
const MAX_CHARS = 500;

function updateCounter() {
  if (!textEl || !charCountEl) return;

  if (textEl.value.length > MAX_CHARS) {
    textEl.value = textEl.value.slice(0, MAX_CHARS);
  }

  charCountEl.textContent = `${textEl.value.length} / ${MAX_CHARS}`;
}

textEl?.addEventListener("input", updateCounter);
updateCounter();

const anonToggle = document.getElementById("anonToggle");
function isAnonymous() {
  return !!anonToggle?.checked;
}

function setSubmitState(state) {
  const btn = document.getElementById("submit-btn");
  if (!btn) return;

  btn.classList.remove("isLoading", "isSuccess");

  if (state === "loading") {
    btn.disabled = true;
    btn.textContent = "Submitting";
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
  btn.textContent = "Submit Feedback";
}

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
      showDToast("Please choose an image file.");
      imgInput.value = "";
      return;
    }

    // preview
    const url = URL.createObjectURL(file);
    imgPreview.src = url;
    imgPreview.onload = () => URL.revokeObjectURL(url);
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
  if (!currentUser) {
    alert("You must be logged in to submit a review.");
    return;
  }

  const btn = document.getElementById("submit-btn");
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
  setSubmitState("loading");

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
      setSubmitState("idle");
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
        // ✅ Firebase Auth (Fixed)
        // Always save the ID so it shows in YOUR history, but keep name Anonymous
        userId: currentUser?.uid || null,
        userName: isAnonymous()
          ? "Anonymous"
          : currentUser?.displayName || currentUser?.email || "Anonymous",
        tags: getSelectedTags(),
        anonymous: isAnonymous(),

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

    setSubmitState("success");

    setTimeout(() => {
      window.location.href = "feedback.html";
    }, 1000);
  } catch (e) {
    console.error(e);
    error.innerText = "Failed to submit review. Try again.";
    error.style.display = "block";
    setSubmitState("idle");
  }
};
