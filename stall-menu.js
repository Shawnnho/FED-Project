/*************************************************
 * stall-menu.js — Stall Holder Menu (Add + Edit popup + Image upload)
 *************************************************/

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  getDoc,
  query,
  orderBy,
  onSnapshot,
  updateDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  getStorage,
  ref as sRef,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

/* ================= FIREBASE ================= */
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

/* ================= DOM ================= */
const menuTitle = document.getElementById("menuTitle");
const statusEl = document.getElementById("status");
const listEl = document.getElementById("menuList");
const emptyState = document.getElementById("emptyState");
const btnAdd = document.getElementById("btnAdd");
const btnAdd2 = document.getElementById("btnAdd2");

const stallNameEl = document.getElementById("stallName");
const ownerNameEl = document.getElementById("ownerName");

document.getElementById("logoutBtn")?.addEventListener("click", async () => {
  await signOut(auth);
  location.href = "signin.html";
});

/* ===== Add Modal (existing in your HTML) ===== */
const addModal = document.getElementById("addMenuModal");
const addClose = document.getElementById("closeAddMenu");
const addCancel = document.getElementById("cancelAddMenu");
const nameInput = document.getElementById("menuName");
const priceInput = document.getElementById("menuPrice");
const saveBtn = document.getElementById("saveMenu");

/* ================= HELPERS ================= */
function setStatus(msg, isErr = false) {
  if (!statusEl) return;
  statusEl.textContent = msg || "";
  statusEl.style.color = isErr ? "#b00020" : "";
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(n) {
  const x = Number(n);
  return Number.isFinite(x) ? `$${x.toFixed(2)}` : "$0.00";
}

function parseMoney(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function openOverlay(modalEl) {
  if (!modalEl) return;
  modalEl.hidden = false;
  // accessibility niceness
  document.body.style.overflow = "hidden";
}

function closeOverlay(modalEl) {
  if (!modalEl) return;
  modalEl.hidden = true;
  document.body.style.overflow = "";
}

/* ================= Inject extra fields into ADD modal =================
   Your HTML add modal only has name + price.
   We'll inject description + image + preview into the modal body.
*/
let addDescEl = null;
let addImgEl = null;
let addImgPreviewEl = null;

function ensureAddExtras() {
  if (!addModal) return;

  const body = addModal.querySelector(".hpModalBody");
  if (!body) return;

  // Description
  addDescEl = document.getElementById("menuDesc");
  if (!addDescEl) {
    const row = document.createElement("div");
    row.className = "hpModalRow";
    row.innerHTML = `
      <label class="hpModalLabel">Description</label>
      <textarea id="menuDesc" class="hpModalInput" rows="3" placeholder="Short description (optional)"></textarea>
    `;
    body.appendChild(row);
    addDescEl = row.querySelector("#menuDesc");
  }

  // Image + preview
  addImgEl = document.getElementById("menuImage");
  if (!addImgEl) {
    const row = document.createElement("div");
    row.className = "hpModalRow";
    row.innerHTML = `
      <label class="hpModalLabel">Item Image</label>
      <input id="menuImage" type="file" accept="image/*" class="hpModalInput" />
      <div style="margin-top:10px; display:flex; gap:12px; align-items:center;">
        <div class="menuImgWrap" style="width:140px; height:92px;">
          <img id="menuImagePreview" src="images/defaultfood.png" alt="Preview" />
        </div>
        <div style="font-weight:800; opacity:.7; font-size:13px;">
          Optional. JPG/PNG recommended.
        </div>
      </div>
    `;
    body.appendChild(row);
    addImgEl = row.querySelector("#menuImage");
    addImgPreviewEl = row.querySelector("#menuImagePreview");

    addImgEl.addEventListener("change", () => {
      const f = addImgEl.files?.[0];
      if (!f) {
        addImgPreviewEl.src = "images/defaultfood.png";
        return;
      }
      addImgPreviewEl.src = URL.createObjectURL(f);
    });
  } else {
    addImgPreviewEl = document.getElementById("menuImagePreview");
  }
}

/* ================= EDIT MODAL (created by JS) ================= */
let editModal = null;
let editName = null;
let editPrice = null;
let editDesc = null;
let editImg = null;
let editPreview = null;
let editSaveBtn = null;
let editCancelBtn = null;
let editCloseBtn = null;

function ensureEditModal() {
  if (editModal) return;

  editModal = document.createElement("div");
  editModal.id = "editMenuModal";
  editModal.className = "hpModalOverlay";
  editModal.hidden = true;

  editModal.innerHTML = `
    <div class="hpModal">
      <div class="hpModalHead">
        <div class="hpModalTitle">Edit Menu Item</div>
        <button class="hpModalClose" id="closeEditMenu" type="button">✕</button>
      </div>

      <div class="hpModalBody">
        <div class="hpModalRow">
          <label class="hpModalLabel">Item Name</label>
          <input id="editMenuName" class="hpModalInput" placeholder="Laksa" />
        </div>

        <div class="hpModalRow">
          <label class="hpModalLabel">Price ($)</label>
          <input id="editMenuPrice" type="number" step="0.1" class="hpModalInput" placeholder="6.50" />
        </div>

        <div class="hpModalRow">
          <label class="hpModalLabel">Description</label>
          <textarea id="editMenuDesc" class="hpModalInput" rows="3" placeholder="Short description (optional)"></textarea>
        </div>

        <div class="hpModalRow">
          <label class="hpModalLabel">Item Image</label>
          <input id="editMenuImage" type="file" accept="image/*" class="hpModalInput" />
          <div style="margin-top:10px;">
            <div class="menuImgWrap" style="width:160px; height:96px;">
              <img id="editMenuPreview" src="images/defaultfood.png" alt="Preview" />
            </div>
          </div>
        </div>
      </div>

      <div class="hpModalFoot">
        <button class="hpModalBtn ghost" id="cancelEditMenu" type="button">Cancel</button>
        <button class="hpModalBtn primary" id="saveEditMenu" type="button">Save Changes</button>
      </div>
    </div>
  `;

  document.body.appendChild(editModal);

  editName = editModal.querySelector("#editMenuName");
  editPrice = editModal.querySelector("#editMenuPrice");
  editDesc = editModal.querySelector("#editMenuDesc");
  editImg = editModal.querySelector("#editMenuImage");
  editPreview = editModal.querySelector("#editMenuPreview");
  editSaveBtn = editModal.querySelector("#saveEditMenu");
  editCancelBtn = editModal.querySelector("#cancelEditMenu");
  editCloseBtn = editModal.querySelector("#closeEditMenu");

  editImg.addEventListener("change", () => {
    const f = editImg.files?.[0];
    if (!f) return;
    editPreview.src = URL.createObjectURL(f);
  });

  editCancelBtn.addEventListener("click", () => closeOverlay(editModal));
  editCloseBtn.addEventListener("click", () => closeOverlay(editModal));
  editModal.addEventListener("click", (e) => {
    if (e.target === editModal) closeOverlay(editModal);
  });
}

/* ================= STOREHOLDER CONTEXT ================= */
async function getStoreholderContext(uid) {
  const usnap = await getDoc(doc(db, "users", uid));
  if (!usnap.exists()) return null;

  const u = usnap.data();
  if (u.role !== "storeholder") return null;

  const centreId = u.centreId;
  if (!centreId) return null;

  const stallRef = doc(db, "centres", centreId, "stalls", uid);
  const stallSnap = await getDoc(stallRef);

  return {
    centreId,
    userName: u.name || "Owner",
    stallName: stallSnap.exists() ? stallSnap.data().stallName : "Your Stall",
    stallRef,
  };
}

/* ================= Storage upload helper ================= */
async function uploadMenuImage({ stallId, uid, file }) {
  // keep filenames unique
  const safeName = `${Date.now()}_${Math.random().toString(16).slice(2)}_${file.name}`;
  const path = `menuImages/${stallId}/${uid}/${safeName}`;

  const fileRef = sRef(storage, path);
  await uploadBytes(fileRef, file, { contentType: file.type || "image/jpeg" });
  return await getDownloadURL(fileRef);
}

/* ================= MAIN ================= */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    location.href = "signin.html";
    return;
  }

  ensureAddExtras();
  ensureEditModal();

  setStatus("Loading menu…");

  const isFirst = new URLSearchParams(location.search).get("first") === "1";

  const ctx = await getStoreholderContext(user.uid);
  if (!ctx) {
    setStatus("No stall found (missing centreId or stall record).", true);
    return;
  }

  const { centreId, stallName, userName, stallRef } = ctx;

  if (stallNameEl) stallNameEl.textContent = stallName;
  if (ownerNameEl) ownerNameEl.textContent = userName;
  if (menuTitle) menuTitle.textContent = `Menu — ${stallName}`;

  // Use your existing layout modal controls
  function openAddModal() {
    if (!addModal) return;

    nameInput.value = "";
    priceInput.value = "";
    if (addDescEl) addDescEl.value = "";
    if (addImgEl) addImgEl.value = "";
    if (addImgPreviewEl) addImgPreviewEl.src = "images/defaultfood.png";

    openOverlay(addModal);
    nameInput?.focus();
  }
  function closeAddModal() {
    closeOverlay(addModal);
  }

  btnAdd?.addEventListener("click", openAddModal);
  btnAdd2?.addEventListener("click", openAddModal);
  addClose?.addEventListener("click", closeAddModal);
  addCancel?.addEventListener("click", closeAddModal);
  addModal?.addEventListener("click", (e) => {
    if (e.target === addModal) closeAddModal();
  });

  // Menu collection
  const menuCol = collection(
    db,
    "centres",
    centreId,
    "stalls",
    user.uid,
    "menu",
  );

  // ✅ ADD ITEM (with optional image)
  saveBtn?.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    const price = parseMoney(priceInput.value);
    const description = addDescEl?.value?.trim() || "";

    if (!name) return alert("Please enter item name");
    if (!Number.isFinite(price) || price <= 0)
      return alert("Enter a valid price");

    try {
      saveBtn.disabled = true;
      setStatus("Adding item…");

      let imageUrl = "";
      const imgFile = addImgEl?.files?.[0];
      if (imgFile) {
        // stallId = user.uid (matches your Firestore stall doc id)
        imageUrl = await uploadMenuImage({
          stallId: user.uid,
          uid: user.uid,
          file: imgFile,
        });
      }

      await addDoc(menuCol, {
        name,
        price,
        description,
        imageUrl,
        available: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // mark stall live so home can show it
      await updateDoc(stallRef, {
        hasMenu: true,
        updatedAt: serverTimestamp(),
      });

      setStatus("");
      closeAddModal();
    } catch (err) {
      console.error(err);
      alert("Failed to add menu item (check Firestore + Storage rules).");
      setStatus("Failed to add item.", true);
    } finally {
      saveBtn.disabled = false;
    }
  });

  // ===== LISTEN + RENDER (match your CSS structure) =====
  const q = query(menuCol, orderBy("createdAt", "desc"));

  onSnapshot(
    q,
    async (snap) => {
      if (snap.empty) {
        listEl.innerHTML = "";
        emptyState.hidden = false;
        setStatus("");
        return;
      }
      if (snap.empty) {
        listEl.innerHTML = "";
        emptyState.hidden = false;

        if (isFirst) {
          openAddModal(); // ✅ auto pop-up
        }
        return;
      }

      emptyState.hidden = true;

      // keep count for home filters (optional)
      updateDoc(stallRef, {
        hasMenu: true,
        menuCount: snap.size,
        updatedAt: serverTimestamp(),
      }).catch(() => {});

      listEl.innerHTML = snap.docs
        .map((d) => {
          const it = d.data();
          const id = d.id;

          const name = esc(it.name || "Untitled");
          const desc = esc(it.description || "—");
          const price = money(it.price);

          const available = it.available !== false;
          const img = it.imageUrl ? esc(it.imageUrl) : "images/defaultfood.png";

          // ✅ This matches your CSS expectation: menuCard + menuImgWrap + menuInfo
          return `
            <article class="menuCard" data-id="${id}" data-avail="${available ? "1" : "0"}">
              <div class="menuImgWrap">
                <img src="${img}" alt="${name}" />
              </div>

              <div class="menuInfo">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;">
                  <div class="menuName">${name}</div>
                </div>

                <div class="menuDesc" style="font-weight:800; opacity:.75; font-size:13px; line-height:1.25;">
                  ${desc}
                </div>

                <div class="menuLikes" style="margin-top:6px;">
                  <span class="prep ${available ? "completed" : "cancelled"}" style="text-transform:none;">
                    ${available ? "Available" : "Unavailable"}
                  </span>
                </div>
                 <div class="menuPriceAction">${price}</div>
              </div>

              <div class="menuActionRow">
                    <button class="copyBtn" data-action="toggle">
                      ${available ? "Unavailable" : "Available"}
                    </button>
                <button class="copyBtn ghostBtn" data-action="edit">Edit</button>
                <button class="copyBtn dangerBtn2" data-action="delete">Delete</button>
              </div>
            </article>
          `;
        })
        .join("");

      setStatus("");
    },
    (err) => {
      console.error(err);
      setStatus("Failed to load menu. Check Firestore rules.", true);
    },
  );

  // ===== CARD ACTIONS =====
  let editingItemId = null;
  let editingCurrentImageUrl = "";

  listEl.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const card = e.target.closest("[data-id]");
    if (!card) return;

    const itemId = card.dataset.id;
    const action = btn.dataset.action;

    const ref = doc(
      db,
      "centres",
      centreId,
      "stalls",
      user.uid,
      "menu",
      itemId,
    );

    try {
      if (action === "toggle") {
        const isAvail = card.dataset.avail === "1";
        await updateDoc(ref, {
          available: !isAvail,
          updatedAt: serverTimestamp(),
        });
      }

      if (action === "edit") {
        ensureEditModal();

        const snap = await getDoc(ref);
        if (!snap.exists()) return;

        const it = snap.data();
        editingItemId = itemId;
        editingCurrentImageUrl = it.imageUrl || "";

        editName.value = it.name || "";
        editPrice.value = String(it.price ?? "");
        editDesc.value = it.description || "";

        editImg.value = "";
        editPreview.src = it.imageUrl || "images/defaultfood.png";

        // Bind save (overwrite previous handler safely)
        editSaveBtn.onclick = async () => {
          const newName = editName.value.trim();
          const newPrice = parseMoney(editPrice.value);
          const newDesc = editDesc.value.trim();

          if (!newName) return alert("Please enter item name");
          if (!Number.isFinite(newPrice) || newPrice <= 0)
            return alert("Enter a valid price");

          try {
            editSaveBtn.disabled = true;
            setStatus("Saving changes…");

            let imageUrl = editingCurrentImageUrl;
            const imgFile = editImg.files?.[0];
            if (imgFile) {
              imageUrl = await uploadMenuImage({
                stallId: user.uid,
                uid: user.uid,
                file: imgFile,
              });
            }

            await updateDoc(ref, {
              name: newName,
              price: newPrice,
              description: newDesc,
              imageUrl: imageUrl || "",
              updatedAt: serverTimestamp(),
            });

            setStatus("");
            closeOverlay(editModal);
          } catch (err) {
            console.error(err);
            alert("Failed to save changes (check Firestore + Storage rules).");
            setStatus("Failed to save changes.", true);
          } finally {
            editSaveBtn.disabled = false;
          }
        };

        openOverlay(editModal);
        editName?.focus();
      }

      if (action === "delete") {
        if (confirm("Delete this menu item?")) await deleteDoc(ref);
      }
    } catch (err) {
      console.error(err);
      setStatus("Action failed. Check Firestore/Storage permissions.", true);
    }
  });
});
