import { getStoreholderCtx } from "./storeholder-context.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  verifyBeforeUpdateEmail,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* SAME config as your other pages */
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

/* ---- shared state ---- */
let stallRef = null; // centres/{centreId}/stalls/{uid}
let stallCache = null; // latest stall data snapshot
let ctxCache = null; // storeholder context (centreId, stallId, stallPath)

/* =========================
   Helpers
========================= */

function format12h(time24) {
  // "07:00" -> "07:00AM", "21:00" -> "9:00PM"
  const [hhStr, mm] = time24.split(":");
  let hh = Number(hhStr);
  const ampm = hh >= 12 ? "PM" : "AM";
  hh = hh % 12;
  if (hh === 0) hh = 12;

  // match your style: open has leading zero if <10, close usually no zero
  const hourStr = hh < 10 ? `0${hh}` : String(hh);
  return `${hourStr}:${mm}${ampm}`;
}

function format12hClose(time24) {
  // close side in your UI often shows "9:00PM" not "09:00PM"
  const [hhStr, mm] = time24.split(":");
  let hh = Number(hhStr);
  const ampm = hh >= 12 ? "PM" : "AM";
  hh = hh % 12;
  if (hh === 0) hh = 12;
  return `${hh}:${mm}${ampm}`;
}

function parseHoursToTimes(hoursText) {
  // supports: "7:00AM - 9:00PM" or "07:00AM - 9:00PM"
  const t = String(hoursText || "").replace(/\s+/g, "");
  const m = t.match(/^(\d{1,2}):(\d{2})(AM|PM)-(\d{1,2}):(\d{2})(AM|PM)$/i);
  if (!m) return null;

  const to24 = (h, mm, ap) => {
    let hh = Number(h);
    const ampm = ap.toUpperCase();
    if (ampm === "AM") {
      if (hh === 12) hh = 0;
    } else {
      if (hh !== 12) hh += 12;
    }
    return `${String(hh).padStart(2, "0")}:${mm}`;
  };

  return {
    open: to24(m[1], m[2], m[3]),
    close: to24(m[4], m[5], m[6]),
  };
}

const $ = (id) => document.getElementById(id);

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value ?? "—";
}

function setImg(id, src) {
  const el = $(id);
  if (el) el.src = src;
}

function setGrade(id, grade) {
  const el = $(id);
  if (!el) return;
  el.textContent = grade ?? "—";
}

function isPhone(v) {
  return /^[89]\d{7}$/.test(String(v || "").trim());
}

function normalizeUnit(v) {
  const raw = String(v || "").trim();
  if (!raw) return "";

  // accept 01-11 or #01-11
  const m = raw.match(/^#?(\d{2})-(\d{2})$/);
  if (!m) return null;

  return `#${m[1]}-${m[2]}`;
}

/* =========================
   Modal (same as account.js)
========================= */
function openModal({ title, bodyHtml, primaryText = "Save", onPrimary }) {
  const overlay = document.createElement("div");
  overlay.className = "hpModalOverlay";
  overlay.innerHTML = `
    <div class="hpModal" role="dialog" aria-modal="true" aria-label="${title}">
      <div class="hpModalHead">
        <div class="hpModalTitle">${title}</div>
        <button class="hpModalClose" type="button">✕</button>
      </div>

      <div class="hpModalBody">${bodyHtml}</div>

      <div class="hpModalFoot">
        <button class="hpModalBtn ghost" type="button" data-cancel>Cancel</button>
        <button class="hpModalBtn primary" type="button" data-primary>${primaryText}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector(".hpModalClose").onclick = overlay.querySelector(
    "[data-cancel]",
  ).onclick = close;

  overlay.querySelector("[data-primary]").onclick = async () => {
    await onPrimary({ overlay, close });
  };

  document.addEventListener("keydown", (e) => e.key === "Escape" && close(), {
    once: true,
  });
  return { overlay, close };
}
function wireEditStallDetails(user) {
  $("editStallBtn")?.addEventListener("click", () => {
    const s = stallCache || {};

    const currentStallName = (
      $("stallName2")?.textContent ||
      s.stallName ||
      ""
    ).trim();
    const currentUnitNo = ($("unitNo")?.textContent || s.unitNo || "").trim();
    const currentCuisine = (
      $("cuisine")?.textContent ||
      s.cuisine ||
      ""
    ).trim();
    const currentHours = (
      $("operatingHours")?.textContent ||
      s.operatingHours ||
      ""
    ).trim();
    const currentGrade = (
      $("hygieneGrade")?.textContent ||
      s.hygieneGrade ||
      ""
    ).trim();

    // ✅ Create modal and CAPTURE overlay here
    const { overlay } = openModal({
      title: "Edit Stall Details",
      primaryText: "Save",
      bodyHtml: `
        <div class="hpModalRow">
          <label class="hpModalLabel">Stall Name</label>
          <input id="mStallName" class="hpModalInput" type="text"
            value="${currentStallName.replace(/"/g, "&quot;")}" />
        </div>

        <div class="hpModalRow">
          <label class="hpModalLabel">Unit Number</label>
          <input id="mUnitNo" class="hpModalInput" type="text"
            placeholder="01-10 or #01-10"
            value="${currentUnitNo.replace(/"/g, "&quot;")}" />
        </div>

        <div class="hpModalRow">
          <label class="hpModalLabel">Cuisine Type</label>
          <input id="mCuisine" class="hpModalInput" type="text"
            value="${currentCuisine.replace(/"/g, "&quot;")}" />
        </div>

        <div class="hpModalRow">
          <label class="hpModalLabel">Operating Hours</label>

          <div class="hpTimeRow">
            <div class="hpTimeCol">
              <div class="hpTimeLabel">Open</div>
              <input id="mOpenTime" class="hpModalInput" type="time" />
            </div>

            <div class="hpTimeCol">
              <div class="hpTimeLabel">Close</div>
              <input id="mCloseTime" class="hpModalInput" type="time" />
            </div>
          </div>

          <div class="hpTimePreview">
            Preview: <span id="mHoursPreview">—</span>
          </div>

          <div class="hpModalHint">
            Leave both empty to use default: <b>07:00AM - 9:00PM</b>
          </div>
        </div>

        <div class="hpModalRow">
          <label class="hpModalLabel">Hygiene Grade</label>
          <input id="mGrade" class="hpModalInput" type="text"
            value="${currentGrade.replace(/"/g, "&quot;")}"
            disabled />
          <div class="hpModalHint">Hygiene grade is set by inspection (read-only).</div>
        </div>

        <div class="hpModalErr" style="color:#b00020;font-weight:800;"></div>
      `,
      onPrimary: async ({ overlay, close }) => {
        const err = overlay.querySelector(".hpModalErr");

        const newStallName =
          overlay.querySelector("#mStallName")?.value?.trim() || "";
        const newUnitInput =
          overlay.querySelector("#mUnitNo")?.value?.trim() || "";
        const newCuisine =
          overlay.querySelector("#mCuisine")?.value?.trim() || "";

        const openTime = overlay.querySelector("#mOpenTime")?.value || "";
        const closeTime = overlay.querySelector("#mCloseTime")?.value || "";

        // default if both empty
        let newHours = "07:00AM - 9:00PM";

        if (openTime || closeTime) {
          if (!openTime || !closeTime) {
            err.textContent =
              "Please select BOTH open and close time (or leave both empty for default).";
            return;
          }
          if (closeTime <= openTime) {
            err.textContent = "Close time must be after open time.";
            return;
          }
          newHours = `${format12h(openTime)} - ${format12hClose(closeTime)}`;
        }

        if (!newStallName) {
          err.textContent = "Stall name cannot be empty.";
          return;
        }

        const unitNo = normalizeUnit(newUnitInput);
        if (unitNo === null) {
          err.textContent = "Unit number should look like 01-10 (or #01-10).";
          return;
        }

        if (!stallRef) {
          err.textContent = "Stall not ready yet. Refresh the page.";
          return;
        }

        const updates = {
          stallName: newStallName,
          unitNo: unitNo,
          cuisine: newCuisine,
          operatingHours: newHours,
        };

        await setDoc(stallRef, updates, { merge: true });

        // ✅ Publish to top-level stalls/{stallId} so home.js can load it
        if (ctxCache?.stallId) {
          await setDoc(
            doc(db, "stalls", ctxCache.stallId),
            {
              stallName: updates.stallName,
              unitNo: updates.unitNo || "",
              cuisine: updates.cuisine || "",
              hygieneGrade: stallCache?.hygieneGrade ?? "—",
              operatingHours: updates.operatingHours,

              ownerUid: user.uid,
              centreId: ctxCache.centreId,

              active: true, // IMPORTANT: home.js filters on active == true :contentReference[oaicite:2]{index=2}
              hasSetup: true,
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
        }

        // update UI
        setText("stallName", updates.stallName);
        setText("stallName2", updates.stallName);
        setText("unitNo", updates.unitNo || "—");
        setText("cuisine", updates.cuisine || "—");
        setText("operatingHours", updates.operatingHours || "—");

        // update cache
        stallCache = { ...(stallCache || {}), ...updates };

        close();
      },
    });

    // ✅ NOW overlay exists here — time prefill + preview wiring
    const openEl = overlay.querySelector("#mOpenTime");
    const closeEl = overlay.querySelector("#mCloseTime");
    const previewEl = overlay.querySelector("#mHoursPreview");

    const parsed = parseHoursToTimes(currentHours);
    if (parsed) {
      openEl.value = parsed.open;
      closeEl.value = parsed.close;
    } else {
      // default picker values
      openEl.value = "07:00";
      closeEl.value = "21:00";
    }

    const refreshPreview = () => {
      const o = openEl.value;
      const c = closeEl.value;

      if (!o && !c) {
        previewEl.textContent = "07:00AM - 9:00PM";
        return;
      }
      if (o && c) {
        previewEl.textContent = `${format12h(o)} - ${format12hClose(c)}`;
        return;
      }
      previewEl.textContent = "—";
    };

    openEl.addEventListener("input", refreshPreview);
    closeEl.addEventListener("input", refreshPreview);
    refreshPreview();
  });
}

/* =========================
   Edit Stall Details (popup)
========================= */

/* =========================
   Main
========================= */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    location.href = "signin.html";
    return;
  }

  try {
    // users/{uid}
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;

    const u = userSnap.data();

    // ✅ If already deactivated, block and kick out (same as account.js)
    if (u?.deactivated) {
      alert("This account has been deactivated.");
      await signOut(auth);
      window.location.href = "index.html";
      return;
    }

    // ✅ Deactivate popup (same flow as account.js)
    $("deactivateBtn")?.addEventListener("click", () => {
      // Only allow for email/password accounts
      const isPasswordUser = user.providerData.some(
        (p) => p.providerId === "password",
      );
      if (!isPasswordUser) {
        alert("Deactivation requires an Email/Password account.");
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
        onPrimary: async ({ overlay, close }) => {
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

            // ✅ Log out + redirect
            setTimeout(async () => {
              try {
                await signOut(auth);
              } finally {
                window.location.href = "index.html";
              }
            }, 600);

            close();
          } catch (e) {
            console.error(e);

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
          overlay.querySelector("[data-primary]")?.click();
        }
      });
    });

    // protect page
    if (u.role !== "storeholder") {
      location.href = "home.html";
      return;
    }

    // profile UI
    setText("ownerName", u.name);
    setText("profileName", u.name);
    setText("email", u.email || user.email);
    setText("phone", u.phone || "—");
    setText("role", "Owner");
    setText("role2", "Store Owner");
    setImg("avatar", u.avatarUrl || "images/defaultprofile.png");

    // ✅ stall doc (DB-based via storeholder-context)
    const ctx = await getStoreholderCtx(user.uid);
    if (!ctx || !ctx.centreId) {
      console.warn("No centre linked to this storeholder");
      return;
    }
    ctxCache = ctx;

    stallRef = doc(db, ctx.stallPath);

    // 1) if stall doc doesn't exist → create a blank one
    let stallSnap = await getDoc(stallRef);

    if (!stallSnap.exists()) {
      const blank = {
        stallName: "—",
        unitNo: "",
        cuisine: "",
        hygieneGrade: "—",
        operatingHours: "07:00AM - 9:00PM",
        ownerUid: user.uid,
        centreId: ctx.centreId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        hasSetup: false,
      };

      await setDoc(stallRef, blank, { merge: true });

      // also ensure user has stallPath stored (helps other pages)
      await setDoc(
        doc(db, "users", user.uid),
        {
          stallPath: ctx.stallPath,
          stallId: ctx.stallId,
          centreId: ctx.centreId,
        },
        { merge: true },
      );

      stallSnap = await getDoc(stallRef);
    }

    stallCache = stallSnap.data();
    const s = stallCache;

    // render as usual
    setText("stallName", s.stallName);
    setText("stallName2", s.stallName);
    setText("unitNo", s.unitNo || "—");
    setText("cuisine", s.cuisine || "—");
    setGrade("hygieneGrade", s.hygieneGrade);
    setText("operatingHours", s.operatingHours || "—");

    /* =========================
       Edit Profile popup
    ========================= */
    $("editProfileBtn")?.addEventListener("click", () => {
      const currentName = (
        $("profileName")?.textContent ||
        u.name ||
        ""
      ).trim();
      const currentPhoneRaw = ($("phone")?.textContent || u.phone || "").trim();
      const currentPhone = currentPhoneRaw === "—" ? "" : currentPhoneRaw;
      const currentEmail = (
        $("email")?.textContent ||
        user.email ||
        u.email ||
        ""
      ).trim();

      openModal({
        title: "Edit Profile",
        primaryText: "Save",
        bodyHtml: `
  <div class="hpModalRow">
    <label class="hpModalLabel">Name</label>
    <input id="mName" class="hpModalInput" type="text"
      value="${currentName.replace(/"/g, "&quot;")}" />
  </div>

  <div class="hpModalRow">
    <label class="hpModalLabel">Email</label>
    <input id="mEmail" class="hpModalInput" type="email"
      value="${currentEmail.replace(/"/g, "&quot;")}" />
  </div>

  <div class="hpModalRow">
    <label class="hpModalLabel">Phone (SG)</label>
    <input id="mPhone" class="hpModalInput" type="text"
      value="${currentPhone.replace(/"/g, "&quot;")}" />
  </div>

  <div class="hpModalErr" style="color:#b00020;font-weight:800;"></div>
`,

        onPrimary: async ({ overlay, close }) => {
          const err = overlay.querySelector(".hpModalErr");

          const newName = overlay.querySelector("#mName").value.trim();
          const newEmail = overlay.querySelector("#mEmail").value.trim();
          const newPhone = overlay.querySelector("#mPhone").value.trim();

          if (!newName) {
            err.textContent = "Name cannot be empty.";
            return;
          }

          // email change (same as account.js)
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
              await verifyBeforeUpdateEmail(user, newEmail);
              err.style.color = "#1b5e20";
              err.textContent =
                "✅ Verification email sent. Please verify to complete the change.";
              return;
            } catch (e) {
              if (e.code === "auth/requires-recent-login") {
                err.textContent =
                  "⚠️ Please log out and log in again, then try.";
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

          await updateProfile(user, { displayName: newName });

          await setDoc(
            doc(db, "users", user.uid),
            { name: newName, phone: newPhone, email: newEmail || user.email },
            { merge: true },
          );
          location.href = "stall-menu.html?first=1";
          setText("ownerName", newName);
          setText("profileName", newName);
          setText("phone", newPhone || "—");
          setText("email", newEmail || user.email);

          u.name = newName;
          u.phone = newPhone;
          u.email = newEmail || user.email;

          close();
        },
      });
    });

    /* =========================
   Notification Preferences
========================= */

    function readPrefs() {
      return {
        newOrders: document.getElementById("prefNewOrders")?.checked || false,
        orderUpdates:
          document.getElementById("prefOrderUpdates")?.checked || false,
        newReview: document.getElementById("prefNewReview")?.checked || false,
        hygieneInspection:
          document.getElementById("prefHygiene")?.checked || false,
      };
    }

    function applyPrefs(prefs = {}) {
      document.getElementById("prefNewOrders").checked = !!prefs.newOrders;
      document.getElementById("prefOrderUpdates").checked =
        !!prefs.orderUpdates;
      document.getElementById("prefNewReview").checked = !!prefs.newReview;
      document.getElementById("prefHygiene").checked =
        !!prefs.hygieneInspection;
    }

    /* Load prefs from Firestore */
    applyPrefs(u.notificationPrefs);

    /* Save prefs */
    document
      .getElementById("savePrefsBtn")
      ?.addEventListener("click", async () => {
        try {
          await setDoc(
            doc(db, "users", user.uid),
            {
              notificationPrefs: readPrefs(),
            },
            { merge: true },
          );
          alert("✅ Preferences saved.");
        } catch (err) {
          console.error(err);
          alert(`❌ Failed to save preferences: ${err.code || err.message}`);
        }
      });
    /* =========================
       Change Password popup
    ========================= */
    $("changePwBtn")?.addEventListener("click", () => {
      const email = user.email;
      if (!email) return;

      openModal({
        title: "Change Password",
        primaryText: "Send Reset Email",
        bodyHtml: `
          <p style="font-weight:800;">Reset password for:</p>
          <p style="margin-bottom:12px;">${email}</p>
          <div class="hpModalErr" style="color:#b00020;font-weight:800;"></div>
        `,
        onPrimary: async ({ overlay, close }) => {
          try {
            await sendPasswordResetEmail(auth, email);
            close();
          } catch (e) {
            overlay.querySelector(".hpModalErr").textContent =
              e.message || "Failed to send reset email.";
          }
        },
      });
    });

    // ✅ wire edit stall AFTER stallRef + stallCache are ready
    wireEditStallDetails(user);
  } catch (err) {
    console.error("stall-account.js error:", err);
  }
});

/* =========================
   Logout + staff nav
========================= */
function doLogout() {
  signOut(auth).then(() => (location.href = "signin.html"));
}

$("logoutBtn")?.addEventListener("click", doLogout);
$("logoutBtn2")?.addEventListener("click", doLogout);

$("manageStaffBtn")?.addEventListener("click", () => {
  location.href = "stall-staff.html";
});
