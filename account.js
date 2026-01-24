/*************************************************
 * account.js — Hawker Point
 * - Loads user profile from Firestore users/{uid}
 * - Edit Profile (name + phone)
 * - Change Password (send reset email)
 * - ✅ Preferences (load + save)
 *************************************************/

import {
  getStorage,
  ref as sRef,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  updateEmail,
  verifyBeforeUpdateEmail,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  collection,
  getDocs,
  query,
  where,
  updateDoc,
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
const storage = getStorage(app);

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

const redeemedVoucherCount = document.getElementById("redeemedVoucherCount");
const viewVouchersBtn = document.getElementById("viewVouchersBtn");

// optional badges
const notifCount = document.getElementById("notifCount");
const mNotifCount = document.getElementById("mNotifCount");

/* ✅ Preferences DOM (from account.html) */
const prefCuisineEls = Array.from(document.querySelectorAll(".prefCuisine"));
const prefNotifEls = Array.from(document.querySelectorAll(".prefNotif"));
const savePrefBtn = document.getElementById("savePrefBtn");

const voucherModal = document.getElementById("voucherModal");
const voucherModalList = document.getElementById("voucherModalList");
const voucherModalSub = document.getElementById("voucherModalSub");
const closeVoucherModal = document.getElementById("closeVoucherModal");

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

async function updateRedeemedCount(uid) {
  if (!redeemedVoucherCount) return;

  const q = query(
    collection(db, "users", uid, "vouchers"),
    where("used", "==", true),
  );

  const snap = await getDocs(q);
  redeemedVoucherCount.textContent = snap.size;
}

function openVoucherModal() {
  if (!voucherModal) return;
  voucherModal.classList.add("isOpen");
  voucherModal.setAttribute("aria-hidden", "false");
}

function closeVoucherModalFn() {
  if (!voucherModal) return;
  voucherModal.classList.remove("isOpen");
  voucherModal.setAttribute("aria-hidden", "true");
}

function tsToMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts === "number") return ts;
  return 0;
}

function isExpiredVoucher(v) {
  const exp = tsToMillis(v.expiresAt);
  return exp > 0 && Date.now() > exp;
}

function expiryText(v) {
  const exp = tsToMillis(v.expiresAt);
  if (!exp) return "No expiry";
  const days = Math.ceil((exp - Date.now()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "Expired";
  if (days === 1) return "Expires in 1 day";
  return `Expires in ${days} days`;
}

async function loadUserVouchers(uid) {
  const snap = await getDocs(collection(db, "users", uid, "vouchers"));
  return snap.docs.map((d) => ({ ...d.data(), docId: d.id }));
}

async function markVoucherUsed(uid, docId) {
  await updateDoc(doc(db, "users", uid, "vouchers", docId), {
    used: true,
    usedAt: serverTimestamp(),
  });
}

function renderVoucherModal(vouchers) {
  if (!voucherModalList) return;

  if (!vouchers.length) {
    voucherModalList.innerHTML = `
      <div class="emptyState">
        <h2 class="emptyTitle">No vouchers claimed</h2>
        <p style="margin:8px 0 0; font-weight:800; opacity:.75;">Go to Promotions to claim vouchers.</p>
      </div>
    `;
    return;
  }

  voucherModalList.innerHTML = vouchers
    .map((v) => {
      const disabled = v.used === true || isExpiredVoucher(v);
      const status =
        v.used === true
          ? "✅ Used"
          : isExpiredVoucher(v)
            ? "❌ Expired"
            : "✅ Active";

      return `
      <div class="hpVoucherRow">
        <div class="hpVoucherLeft">
          <div class="code">${v.code}</div>
          <div class="meta">${status} • ${expiryText(v)}</div>
        </div>

        <div class="hpVoucherRight">
          <button
            class="btn small primary"
            data-apply-voucher="${v.docId}"
            data-code="${v.code}"
            ${disabled ? "disabled" : ""}>
            ${disabled ? (v.used ? "Used" : "Expired") : "Apply"}
          </button>
        </div>
      </div>
    `;
    })
    .join("");
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
    // =========================
    // ✅ VOUCHERS (Popup + Firestore)
    // =========================
    await updateRedeemedCount(user.uid);

    // Open voucher popup
    viewVouchersBtn?.addEventListener("click", async () => {
      openVoucherModal();

      voucherModalSub.textContent = "Loading…";
      voucherModalList.innerHTML = "";

      try {
        const vouchers = await loadUserVouchers(user.uid);

        const active = vouchers.filter(
          (v) => v.used !== true && !isExpiredVoucher(v),
        ).length;
        const used = vouchers.filter((v) => v.used === true).length;

        voucherModalSub.textContent = `Active: ${active} • Used: ${used} • Total: ${vouchers.length}`;

        renderVoucherModal(vouchers);
      } catch (err) {
        console.error("loadUserVouchers failed:", err);
        voucherModalSub.textContent =
          "❌ Failed to load vouchers (check Firestore rules).";
        voucherModalList.innerHTML = `
      <div class="emptyState">
        <h2 class="emptyTitle">Unable to load vouchers</h2>
        <p style="margin:8px 0 0; font-weight:800; opacity:.75;">
          Open DevTools Console to see the error.
        </p>
      </div>
    `;
      }
    });

    // Close popup (button)
    closeVoucherModal?.addEventListener("click", closeVoucherModalFn);

    // Close popup (backdrop click)
    voucherModal?.addEventListener("click", (e) => {
      if (e.target.matches("[data-close]")) {
        closeVoucherModalFn();
      }
    });

    // Apply voucher inside popup
    voucherModalList?.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-apply-voucher]");
      if (!btn || btn.disabled) return;

      const docId = btn.dataset.applyVoucher;
      const code = btn.dataset.code;

      // Save for checkout
      localStorage.setItem("hawkerpoint_applied_promo", code);
      localStorage.setItem("hawkerpoint_applied_voucher_docid", docId);

      // Mark used in Firestore
      await markVoucherUsed(user.uid, docId);

      // Refresh UI
      const vouchers = await loadUserVouchers(user.uid);
      renderVoucherModal(vouchers);
      await updateRedeemedCount(user.uid);
    });

    // UI populate
    accName.textContent = data?.name || user.displayName || "—";
    accRole.textContent = roleLabel(data?.role);
    accEmail.textContent = user.email || data?.email || "—";

    accPhone.textContent =
      data?.phone && String(data.phone).trim()
        ? String(data.phone).trim()
        : "—";

    // =========================
    // ✅ FAVOURITES (Saved Stores)
    // =========================
    const savedStoresEl = document.getElementById("savedStores");
    const favs = Array.isArray(data?.favourites) ? data.favourites : [];
    if (savedStoresEl) savedStoresEl.textContent = favs.length;

    // avatar (account-based)
    if (accAvatar) {
      const avatarUrl =
        data?.avatarUrl || user.photoURL || "images/defaultprofile.png";
      accAvatar.src = avatarUrl;
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
      const currentPhone =
        phoneText === "—" || phoneText === "-" ? "" : phoneText;

      const { overlay } = openModal({
        title: "Edit Profile",
        primaryText: "Save",
        bodyHtml: `
      <div class="hpModalRow">
  <div class="hpModalLabel">Profile Picture</div>

  <div class="hpAvatarStack">
    <img
      id="mAvatarPreview"
      class="hpAvatarPreview"
      src="${accAvatar?.src || "images/defaultprofile.png"}"
      alt="Profile picture preview"
    />

    <div class="hpAvatarControls">
      <input id="mAvatar" type="file" accept="image/*" />
      <div class="hpModalHint">Saved to your account.</div>
    </div>
  </div>
</div>


      <div class="hpModalRow">
        <label class="hpModalLabel">Name</label>
        <input id="mName" class="hpModalInput" type="text"
          value="${currentName.replace(/"/g, "&quot;")}" />
      </div>

      <div class="hpModalRow">
        <label class="hpModalLabel">Email</label>
        <input id="mEmail" class="hpModalInput" type="email"
        value="${(user.email || "").replace(/"/g, "&quot;")}"/>
      </div>

      <div class="hpModalRow">
        <label class="hpModalLabel">Phone (SG)</label>
        <input id="mPhone" class="hpModalInput" type="text"
          value="${currentPhone.replace(/"/g, "&quot;")}" />
      </div>

      <div class="hpModalErr" style="color:#b00020;font-weight:700;"></div>
    `,

        onPrimary: async ({ overlay, close }) => {
          const nameEl = overlay.querySelector("#mName");
          const emailEl = overlay.querySelector("#mEmail");
          const phoneEl = overlay.querySelector("#mPhone");
          const err = overlay.querySelector(".hpModalErr");

          if (!nameEl || !emailEl || !phoneEl) {
            console.log("Missing modal inputs:", {
              nameElExists: !!nameEl,
              emailElExists: !!emailEl,
              phoneElExists: !!phoneEl,
            });
            if (err)
              err.textContent =
                "Modal inputs missing (check IDs in modal HTML).";
            return;
          }

          const newName = nameEl.value.trim();
          const newEmail = emailEl.value.trim();
          const newPhone = phoneEl.value.trim();
          const avatarFile = overlay.querySelector("#mAvatar")?.files?.[0];

          let avatarUrlToSave = null;

          if (avatarFile) {
            // optional size limit: 5MB
            if (avatarFile.size > 5 * 1024 * 1024) {
              err.textContent = "Image too large (max 5MB).";
              return;
            }

            const ext = (
              avatarFile.name.split(".").pop() || "jpg"
            ).toLowerCase();
            const avatarRef = sRef(
              storage,
              `avatars/${user.uid}/avatar.${ext}`,
            );

            await uploadBytes(avatarRef, avatarFile, {
              contentType: avatarFile.type || "image/jpeg",
            });

            avatarUrlToSave = await getDownloadURL(avatarRef);

            // update UI immediately
            if (accAvatar) accAvatar.src = avatarUrlToSave;
          }

          if (!newName) {
            err.textContent = "Name cannot be empty.";
            return;
          }
          if (newEmail && newEmail !== user.email) {
            const isPasswordUser = user.providerData.some(
              (p) => p.providerId === "password",
            );

            if (!isPasswordUser) {
              err.textContent =
                "Email can only be changed for Email/Password accounts.";
              return;
            }

            try {
              // ✅ Sends verification email to NEW address
              await verifyBeforeUpdateEmail(user, newEmail);

              err.style.color = "#1b5e20";
              err.textContent =
                "✅ Verification email sent to your new address. Please verify it to complete the change.";
              return; // important: stop, email changes only after verification
            } catch (e) {
              if (e.code === "auth/requires-recent-login") {
                err.textContent =
                  "⚠️ Please log out and log in again, then try changing email.";
                return;
              }
              err.textContent = `${e.code || ""} ${e.message || ""}`.trim();
              return;
            }
          }

          if (newPhone && !isPhone(newPhone)) {
            err.textContent = "Invalid SG phone number.";
            return;
          }

          await updateProfile(user, {
            displayName: newName,
            ...(avatarUrlToSave ? { photoURL: avatarUrlToSave } : {}),
          });

          await setDoc(
            doc(db, "users", user.uid),
            {
              name: newName,
              phone: newPhone,
              email: newEmail || user.email || "",
              updatedAt: serverTimestamp(),

              // ✅ ONLY save avatar if user uploaded one
              ...(avatarUrlToSave ? { avatarUrl: avatarUrlToSave } : {}),
            },
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

      if (fileInput && previewImg) {
        fileInput.addEventListener("change", () => {
          const file = fileInput.files?.[0];
          if (!file) return;

          const url = URL.createObjectURL(file);
          previewImg.src = url;
          previewImg.onload = () => URL.revokeObjectURL(url);
        });
      }
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
    deactivateBtn?.addEventListener("click", () => {
      // Only allow for email/password accounts
      const isPasswordUser = user.providerData.some(
        (p) => p.providerId === "password",
      );
      if (!isPasswordUser) {
        setStatus("❌ Deactivation requires an Email/Password account.", false);
        return;
      }

      const { overlay, close } = openModal({
        title: "Deactivate Account",
        primaryText: "Deactivate",
        bodyHtml: `
      <p style="margin:0 0 10px; font-weight:800;">
        This will disable your account and log you out.
      </p>
      <p style="margin:0 0 14px; opacity:.85;">
        For security, please enter your password to confirm.
      </p>

      <div class="hpModalRow">
        <label class="hpModalLabel">Password</label>
        <input id="mDeactPw" class="hpModalInput" type="password" placeholder="Enter password" />
      </div>

      <div class="hpModalErr" style="color:#b00020;font-weight:700;"></div>
    `,
        onPrimary: async ({ close }) => {
          const pwEl = overlay.querySelector("#mDeactPw");
          const errEl = overlay.querySelector(".hpModalErr");

          const password = (pwEl?.value || "").trim();
          if (!password) {
            errEl.textContent = "Password is required.";
            return;
          }

          try {
            // ✅ Re-authenticate
            const cred = EmailAuthProvider.credential(user.email, password);
            await reauthenticateWithCredential(user, cred);

            // ✅ Mark deactivated in Firestore
            await setDoc(
              doc(db, "users", user.uid),
              { deactivated: true, deactivatedAt: serverTimestamp() },
              { merge: true },
            );

            setStatus("✅ Account deactivated. Logging you out…");

            // ✅ Log out and redirect
            setTimeout(async () => {
              try {
                await signOut(auth);
              } finally {
                window.location.href = "index.html";
              }
            }, 900);

            close();
          } catch (e) {
            console.error(e);

            // Friendly errors
            if (
              e.code === "auth/wrong-password" ||
              e.code === "auth/invalid-credential"
            ) {
              errEl.textContent = "Incorrect password.";
              return;
            }
            if (e.code === "auth/too-many-requests") {
              errEl.textContent = "Too many attempts. Try again later.";
              return;
            }
            if (e.code === "auth/requires-recent-login") {
              errEl.textContent = "Please log out and log in again, then try.";
              return;
            }

            errEl.textContent =
              `${e.code || ""} ${e.message || ""}`.trim() ||
              "Failed to deactivate.";
          }
        },
      });

      // Enter key submits
      overlay.querySelector("#mDeactPw")?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          overlay.querySelector('[data-action="primary"]')?.click();
        }
      });
    });
  } catch (err) {
    console.error(err);
    setStatus(`❌ Failed to load account: ${err.code || err.message}`, false);
  }
});
