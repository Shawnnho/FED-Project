/*************************************************
 * account.js — Hawker Point
 * - Loads user profile from Firestore users/{uid}
 * - Edit Profile (name + phone)
 * - Change Password (send reset email)
 * - ✅ Preferences (load + save)
 *************************************************/

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ✅ Use SAME config as signup/login */
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

/* =========================
   DOM
========================= */
const accAvatar = document.getElementById("accAvatar");
const accName = document.getElementById("accName");
const accRole = document.getElementById("accRole");
const accEmail = document.getElementById("accEmail");
const accPhone = document.getElementById("accPhone");

const editProfileBtn = document.getElementById("editProfileBtn");
const changePwBtn = document.getElementById("changePwBtn");
const logoutBtn = document.getElementById("logoutBtn");
const deactivateBtn = document.getElementById("deactivateBtn");
const accStatus = document.getElementById("accStatus");

// optional badges
const notifCount = document.getElementById("notifCount");
const mNotifCount = document.getElementById("mNotifCount");

/* ✅ Preferences DOM (from account.html) */
const prefCuisineEls = Array.from(document.querySelectorAll(".prefCuisine"));
const prefNotifEls = Array.from(document.querySelectorAll(".prefNotif"));
const savePrefBtn = document.getElementById("savePrefBtn");

/* =========================
   Helpers
========================= */
let statusTimer = null;

function setStatus(msg, ok = true, duration = 3500) {
  if (!accStatus) return;

  accStatus.textContent = msg;
  accStatus.classList.remove("error", "show");

  if (!ok) accStatus.classList.add("error");

  // force reflow so animation always plays
  void accStatus.offsetWidth;

  accStatus.classList.add("show");

  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    accStatus.classList.remove("show");
  }, duration);
}

function isPhone(v) {
  return /^[89]\d{7}$/.test(String(v || "").trim());
}

function roleLabel(r) {
  if (!r) return "Customer";
  if (r === "storeholder") return "Store Holder";
  if (r === "stall_owner") return "Store Holder";
  return r.charAt(0).toUpperCase() + r.slice(1);
}

/* =========================
   ✅ Preferences helpers (SAFE)
   Fixes: "object is not iterable"
========================= */
function toArraySafe(v) {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  if (typeof v === "string") return [v];

  // Handle old object/map format: { chinese: true, western: false }
  if (typeof v === "object") {
    return Object.keys(v).filter((k) => v[k] === true);
  }

  return [];
}

function setCheckedByValues(checkboxEls, values) {
  const arr = toArraySafe(values);
  const set = new Set(arr);
  checkboxEls.forEach((el) => (el.checked = set.has(el.value)));
}

function getCheckedValues(checkboxEls) {
  return checkboxEls.filter((el) => el.checked).map((el) => el.value);
}

/* =========================
   Load profile
========================= */
async function loadProfile(uid, fallbackUser) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);

  // If doc missing (rare), create a basic one
  if (!snap.exists()) {
    await setDoc(ref, {
      name: fallbackUser?.displayName || "",
      email: fallbackUser?.email || "",
      phone: "",
      role: "customer",
      createdAt: serverTimestamp(),
      // preferences: { cuisines: [], notifications: [] } // optional default
    });
  }

  const finalSnap = await getDoc(ref);
  return finalSnap.data();
}

function applyBadge(count) {
  const n = Number(count || 0);
  if (notifCount) {
    notifCount.hidden = n <= 0;
    notifCount.textContent = n;
  }
  if (mNotifCount) {
    mNotifCount.hidden = n <= 0;
    mNotifCount.textContent = n;
  }
}

/* =========================
   Modal UI
========================= */
function openModal({ title, bodyHtml, primaryText = "Save", onPrimary }) {
  const overlay = document.createElement("div");
  overlay.className = "hpModalOverlay";
  overlay.innerHTML = `
    <div class="hpModal" role="dialog" aria-modal="true" aria-label="${title}">
      <div class="hpModalHead">
        <div class="hpModalTitle">${title}</div>
        <button class="hpModalClose" type="button" aria-label="Close">✕</button>
      </div>

      <div class="hpModalBody">${bodyHtml}</div>

      <div class="hpModalFoot">
        <button class="hpModalBtn ghost" type="button" data-action="cancel">Cancel</button>
        <button class="hpModalBtn primary" type="button" data-action="primary">${primaryText}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector(".hpModalClose").addEventListener("click", close);
  overlay
    .querySelector('[data-action="cancel"]')
    .addEventListener("click", close);

  overlay
    .querySelector('[data-action="primary"]')
    .addEventListener("click", async () => {
      try {
        await onPrimary({ overlay, close });
      } catch (err) {
        console.error(err);
        const errEl = overlay.querySelector(".hpModalErr");
        if (errEl) errEl.textContent = err?.message || "Something went wrong";
      }
    });

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape") close();
    },
    { once: true },
  );

  return { overlay, close };
}

/* =========================
   Auth gate + wiring
========================= */
onAuthStateChanged(auth, async (user) => {
  // If not logged in, kick to sign in
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  try {
    const data = await loadProfile(user.uid, user);

    if (data?.deactivated) {
      setStatus("❌ This account has been deactivated.", false);

      setTimeout(async () => {
        try {
          await signOut(auth);
        } finally {
          window.location.href = "index.html";
        }
      }, 2000);

      return;
    }

    // UI populate
    accName.textContent = data?.name || user.displayName || "—";
    accRole.textContent = roleLabel(data?.role);
    accEmail.textContent = data?.email || user.email || "—";
    accPhone.textContent = data?.phone || "—";

    // avatar
    if (accAvatar) {
      const savedAvatar = localStorage.getItem("hp_avatar");
      accAvatar.src = savedAvatar || "images/defaultprofile.png";
    }

    if (data?.deactivated) {
      setStatus("❌ This account has been deactivated.", false);

      // optional delay so user sees message
      setTimeout(async () => {
        await signOut(auth);
        window.location.href = "index.html";
      }, 2000);

      return;
    }

    // badge
    applyBadge(0);

    /* =========================
       ✅ LOAD PREFERENCES into checkboxes
    ========================= */
    const prefs = data?.preferences || {};
    setCheckedByValues(prefCuisineEls, prefs.cuisines);
    setCheckedByValues(prefNotifEls, prefs.notifications);

    /* =========================
       ✅ SAVE PREFERENCES button
    ========================= */
    savePrefBtn?.addEventListener("click", async () => {
      try {
        const cuisines = getCheckedValues(prefCuisineEls);
        const notifications = getCheckedValues(prefNotifEls);

        await setDoc(
          doc(db, "users", user.uid),
          {
            preferences: { cuisines, notifications },
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );

        setStatus("✅ Preferences saved.");
      } catch (err) {
        console.error(err);
        setStatus(
          `❌ Failed to save preferences: ${err.code || err.message}`,
          false,
        );
      }
    });

    // Edit profile
    editProfileBtn?.addEventListener("click", () => {
      const currentName = (accName?.textContent || "").trim();
      const phoneText = (accPhone?.textContent || "").trim();
      const currentPhone = phoneText === "—" ? "" : phoneText;

      const { overlay } = openModal({
        title: "Edit Profile",
        primaryText: "Save",
        bodyHtml: `
      <div class="hpModalRow">
        <label class="hpModalLabel">Profile Picture</label>

        <div style="display:flex;gap:12px;align-items:center;">
          <img
            id="mAvatarPreview"
            src="${localStorage.getItem("hp_avatar") || accAvatar.src}"
            style="width:64px;height:64px;border-radius:50%;object-fit:cover;"
          />
          <input id="mAvatar" type="file" accept="image/*" />
        </div>

        <div class="hpModalHint">Saved only on this device.</div>
      </div>

      <div class="hpModalRow">
        <label class="hpModalLabel">Name</label>
        <input id="mName" class="hpModalInput" type="text"
          value="${currentName.replace(/"/g, "&quot;")}" />
      </div>

      <div class="hpModalRow">
        <label class="hpModalLabel">Phone (SG)</label>
        <input id="mPhone" class="hpModalInput" type="text"
          value="${currentPhone.replace(/"/g, "&quot;")}" />
      </div>

      <div class="hpModalErr" style="color:#b00020;font-weight:700;"></div>
    `,
        onPrimary: async ({ overlay, close }) => {
          const newName = overlay.querySelector("#mName").value.trim();
          const newPhone = overlay.querySelector("#mPhone").value.trim();
          const avatarFile = overlay.querySelector("#mAvatar").files?.[0];
          const err = overlay.querySelector(".hpModalErr");

          if (!newName) {
            err.textContent = "Name cannot be empty.";
            return;
          }
          if (newPhone && !isPhone(newPhone)) {
            err.textContent = "Invalid SG phone number.";
            return;
          }

          if (avatarFile) {
            const reader = new FileReader();
            reader.onload = () => {
              localStorage.setItem("hp_avatar", reader.result);
              accAvatar.src = reader.result;
            };
            reader.readAsDataURL(avatarFile);
          }

          await updateProfile(user, { displayName: newName });

          await setDoc(
            doc(db, "users", user.uid),
            { name: newName, phone: newPhone, updatedAt: serverTimestamp() },
            { merge: true },
          );

          accName.textContent = newName;
          accPhone.textContent = newPhone || "—";

          setStatus("✅ Profile updated.");
          close();
        },
      });

      const fileInput = overlay.querySelector("#mAvatar");
      const previewImg = overlay.querySelector("#mAvatarPreview");

      fileInput.addEventListener("change", () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        previewImg.src = URL.createObjectURL(file);
      });
    });

    // Change password (email reset)
    changePwBtn?.addEventListener("click", async () => {
      setStatus("Sending reset email...", true);
      accStatus?.scrollIntoView({ behavior: "smooth", block: "center" });

      try {
        if (!user.email) {
          setStatus("❌ No email found on this account.", false);
          return;
        }

        await sendPasswordResetEmail(auth, user.email);
        setStatus(
          "✅ Password reset email sent. Check your inbox / spam.",
          true,
        );
      } catch (err) {
        console.error(err);
        setStatus(
          `❌ Failed to send reset email: ${err.code || err.message}`,
          false,
        );
      }
    });

    // Logout
    logoutBtn?.addEventListener("click", async () => {
      await signOut(auth);
      window.location.href = "index.html";
    });

    // Deactivate
    deactivateBtn?.addEventListener("click", async () => {
      const sure = confirm(
        "Deactivate account? (This will mark your account as deactivated.)",
      );
      if (!sure) return;

      await setDoc(
        doc(db, "users", user.uid),
        { deactivated: true, deactivatedAt: serverTimestamp() },
        { merge: true },
      );

      setStatus("✅ Account marked as deactivated.");
    });
  } catch (err) {
    console.error(err);
    setStatus(`❌ Failed to load account: ${err.code || err.message}`, false);
  }
});
