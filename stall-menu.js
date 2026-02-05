/*************************************************
 * stall-menu.js — Stall Holder Menu (supports NEW menu schema)
 * NEW fields supported:
 *  - category, prices (map), img, desc, hotAvailable, active
 * Backwards compatible:
 *  - price, description, imageUrl, available
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
  limit,
  onSnapshot,
  updateDoc,
  deleteDoc,
  addDoc,
  setDoc,
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

/* ===== Edit Modal (existing in your HTML) ===== */
const editModal = document.getElementById("editMenuModal");
const editClose = document.getElementById("closeEditMenu");
const editName = document.getElementById("editName");
const editPrice = document.getElementById("editPrice");
const editImg = document.getElementById("editImg");
const editDesc = document.getElementById("editDesc");
const editImgPreview = document.getElementById("editImgPreview");
const deleteItemBtn = document.getElementById("deleteItemBtn");
const saveEditBtn = document.getElementById("saveEditBtn");

let supportsSizePricing = false;
let supportsAddons = false;

/* ================= HELPERS ================= */
function makeIdFromName(name) {
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
}

function ensureAddonsUI(show) {
  const body = editModal?.querySelector(".hpModalBody");
  if (!body) return null;

  let wrap = document.getElementById("editAddonsWrap");

  if (!show) {
    if (wrap) wrap.remove();
    return null;
  }
  if (wrap) return wrap;

  wrap = document.createElement("div");
  wrap.id = "editAddonsWrap";
  wrap.className = "hpModalRow";
  wrap.style.marginTop = "10px";
  wrap.innerHTML = `
    <label class="hpModalLabel">Add-ons (optional)</label>

    <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
      <input id="newAddonName" class="hpModalInput" placeholder="Add-on name (e.g., Fried Egg)" style="flex:1; min-width:220px;" />
      <input id="newAddonPrice" class="hpModalInput" placeholder="Price" inputmode="decimal" style="width:140px;" />
      <button type="button" id="addAddonBtn" class="copyBtn">Add add-on</button>
    </div>

    <div class="muted" style="margin-top:8px; font-size:12px;">
      Create add-ons here, then tick which add-ons apply to this menu item.
    </div>

    <div id="addonsList" style="margin-top:10px; display:grid; gap:10px;"></div>
  `;
  body.appendChild(wrap);
  return wrap;
}

function renderAddonsList(addonsAll, selectedIds) {
  const list = document.getElementById("addonsList");
  if (!list) return;

  if (!addonsAll.length) {
    list.innerHTML = `<div class="muted">No add-ons yet. Add one above.</div>`;
    return;
  }

  list.innerHTML = addonsAll
    .filter((a) => a.active !== false)
    .map((a) => {
      const checked = selectedIds.includes(a.id) ? "checked" : "";
      const priceText =
        a.price != null ? `$${Number(a.price).toFixed(2)}` : "—";
      return `
        <label style="display:flex; gap:10px; align-items:center; padding:10px; border:1px solid #eee; border-radius:12px;">
          <input type="checkbox" class="addonChk" data-id="${a.id}" ${checked} />
          <div style="flex:1;">
            <div style="font-weight:900;">${esc(a.name || a.id)}</div>
            <div class="muted" style="font-size:12px;">${priceText}</div>
          </div>
        </label>
      `;
    })
    .join("");
}

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
  return Number.isFinite(x) ? `$${x.toFixed(2)}` : "—";
}

function parseMoney(v) {
  const s = String(v ?? "").trim();
  if (!s) return NaN;
  const x = Number(s);
  return Number.isFinite(x) ? x : NaN;
}

function openOverlay(modalEl) {
  if (!modalEl) return;
  modalEl.hidden = false;
  document.body.style.overflow = "hidden";
}
function closeOverlay(modalEl) {
  if (!modalEl) return;
  modalEl.hidden = true;
  document.body.style.overflow = "";
}

// ✅ Universal labels (you can keep adding keys over time)
const PRICE_LABELS = {
  // Drinks
  hot: "Hot",
  cold_s: "Cold (S)",
  cold_m: "Cold (M)",
  cold_l: "Cold (L)",

  // Chicken rice
  quarter_upper: "Quarter (Upper) 四分之一(上庄)",
  quarter_lower: "Quarter (Lower) 四分之一(下庄)",
  half: "Half (半只鸡)",
  whole: "Whole (一只鸡)",

  // Generic
  small: "Small",
  medium: "Medium",
  large: "Large",
};

function prettifyKey(key) {
  return String(key || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function ensureEditPriceFields(show) {
  const body = editModal?.querySelector(".hpModalBody");
  if (!body) return null;

  let wrap = document.getElementById("editPricesWrap");

  if (!show) {
    if (wrap) wrap.remove();
    return null;
  }
  if (wrap) return wrap;

  wrap = document.createElement("div");
  wrap.id = "editPricesWrap";
  wrap.className = "hpModalRow";
  wrap.style.marginTop = "10px";

  wrap.innerHTML = `
    <label class="hpModalLabel">Variant prices (optional)</label>

    <div id="priceRows" style="display:grid; gap:10px;"></div>

    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
      <input id="newPriceKey" class="hpModalInput" placeholder="Key (e.g. half, cold_m)" style="flex:1; min-width:200px;" />
      <input id="newPriceValue" class="hpModalInput" placeholder="Price" inputmode="decimal" style="width:140px;" />
      <button type="button" id="addPriceRowBtn" class="copyBtn">Add option</button>
    </div>
  `;

  body.appendChild(wrap);

  wrap.querySelector("#addPriceRowBtn").addEventListener("click", () => {
    const key = wrap.querySelector("#newPriceKey").value.trim();
    const val = parseMoney(wrap.querySelector("#newPriceValue").value);

    if (!key) return alert("Enter a key (e.g. half, cold_m)");
    if (!Number.isFinite(val) || val <= 0) return alert("Enter a valid price");

    addPriceRow(key, val);

    wrap.querySelector("#newPriceKey").value = "";
    wrap.querySelector("#newPriceValue").value = "";
  });

  return wrap;
}

function addPriceRow(key, value = "") {
  const rows = document.getElementById("priceRows");
  if (!rows) return;

  if (rows.querySelector(`[data-key="${key}"]`)) return;

  const label = PRICE_LABELS[key] || prettifyKey(key);

  const row = document.createElement("div");
  row.dataset.key = key;
  row.style.display = "grid";
  row.style.gridTemplateColumns = "1fr 140px 90px";
  row.style.gap = "10px";
  row.style.alignItems = "center";

  row.innerHTML = `
    <div style="font-weight:900;">${esc(label)} <span class="muted" style="font-weight:700;">(${esc(key)})</span></div>
    <input class="hpModalInput priceVal" inputmode="decimal" placeholder="Price" value="${value}" />
    <button type="button" class="copyBtn dangerBtn2 removePriceBtn">Remove</button>
  `;

  row
    .querySelector(".removePriceBtn")
    .addEventListener("click", () => row.remove());
  rows.appendChild(row);
}

function readPricesFromEdit() {
  const rows = document.querySelectorAll("#priceRows [data-key]");
  const prices = {};

  rows.forEach((row) => {
    const key = row.dataset.key;
    const v = parseMoney(row.querySelector(".priceVal")?.value);
    if (Number.isFinite(v) && v > 0) prices[key] = v;
  });

  return Object.keys(prices).length ? prices : null;
}

function fillEditPrices(prices) {
  const rows = document.getElementById("priceRows");
  if (!rows) return;

  rows.innerHTML = "";
  if (!prices || typeof prices !== "object") return;

  const keys = Object.keys(prices).sort((a, b) => a.localeCompare(b));
  keys.forEach((k) => addPriceRow(k, prices[k]));
}

function formatPrices(pricesObj) {
  if (!pricesObj || typeof pricesObj !== "object") return "";
  const keys = Object.keys(pricesObj).sort((a, b) => a.localeCompare(b));
  return keys
    .filter((k) => pricesObj[k] != null)
    .map((k) => `${PRICE_LABELS[k] || prettifyKey(k)}: ${money(pricesObj[k])}`)
    .join(" • ");
}

/* ================= Inject extra fields into ADD modal =================
   Your HTML add modal only has name + price.
   We'll inject category + description + image into the modal body.
*/
let addCatEl = null;
let addDescEl = null;
let addImgEl = null;
let addImgPreviewEl = null;

function ensureAddExtras() {
  if (!addModal) return;
  const body = addModal.querySelector(".hpModalBody");
  if (!body) return;

  // Category
  addCatEl = document.getElementById("menuCategory");
  if (!addCatEl) {
    const row = document.createElement("div");
    row.className = "hpModalRow";
    row.innerHTML = `
      <label class="hpModalLabel">Category</label>
      <input id="menuCategory" class="hpModalInput" placeholder="Coffee / Tea / Specials" />
    `;
    body.appendChild(row);
    addCatEl = row.querySelector("#menuCategory");
  }

  // Description (maps to NEW 'desc' and old 'description')
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
      <input id="menuImage" type="file" accept="image/*" class="hpModalFile" />
      <div style="margin-top:10px; display:flex; gap:12px; align-items:center;">
        <div class="menuImgWrap" id="menuImageWrap" style="width:140px; height:92px; display:none;">
          <img id="menuImagePreview" src="" alt="Preview" class="hpStallImagePreview" />
        </div>
        <div style="font-weight:800; opacity:.7; font-size:13px;">
          Optional. JPG/PNG recommended.
        </div>
      </div>
    `;
    body.appendChild(row);
    addImgEl = row.querySelector("#menuImage");
    addImgPreviewEl = row.querySelector("#menuImagePreview");

    const wrap = row.querySelector("#menuImageWrap");
    addImgEl.addEventListener("change", () => {
      const f = addImgEl.files?.[0];
      if (!f) {
        addImgPreviewEl.removeAttribute("src");
        wrap.style.display = "none";
        return;
      }
      addImgPreviewEl.src = URL.createObjectURL(f);
      wrap.style.display = "block";
    });
  } else {
    addImgPreviewEl = document.getElementById("menuImagePreview");
  }
}

/* ================= Storage upload helper ================= */
async function uploadMenuImage({ stallId, uid, file }) {
  const safeName = `${Date.now()}_${Math.random().toString(16).slice(2)}_${file.name}`;
  const path = `menuImages/${stallId}/${uid}/${safeName}`;

  const fileRef = sRef(storage, path);
  await uploadBytes(fileRef, file, { contentType: file.type || "image/jpeg" });
  return await getDownloadURL(fileRef);
}

/* ================= STOREHOLDER CONTEXT (FIXED) =================
   Your previous code assumed stall doc id == user.uid.
   Now we use users/{uid}.stallId (which you already store).
*/
async function getStoreholderContext(uid) {
  const usnap = await getDoc(doc(db, "users", uid));
  if (!usnap.exists()) return null;

  const u = usnap.data();
  if (u.role !== "storeholder") return null;

  const centreId = u.centreId;
  const stallId = u.stallId;
  if (!centreId || !stallId) return null;

  const stallRef = doc(db, "centres", centreId, "stalls", stallId);
  const stallSnap = await getDoc(stallRef);

  const stallData = stallSnap.exists() ? stallSnap.data() : {};

  return {
    centreId,
    stallId,
    userName: u.name || "Owner",
    stallName: stallData.stallName || "Your Stall",

    // ✅ CAPABILITIES (THIS WAS MISSING)
    supportsSizePricing: !!stallData.supportsSizePricing,
    supportsAddons: !!stallData.supportsAddons,

    stallRef,
  };
}

/* ================= MAIN ================= */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    location.href = "signin.html";
    return;
  }

  ensureAddExtras();
  setStatus("Loading menu…");

  const ctx = await getStoreholderContext(user.uid);
  if (!ctx) {
    setStatus(
      "No stall found (missing centreId / stallId / stall record).",
      true,
    );
    return;
  }

  const {
    centreId,
    stallId,
    stallName,
    userName,
    stallRef,
    supportsSizePricing: ssp,
    supportsAddons: sa,
  } = ctx;

  supportsSizePricing = ssp;
  supportsAddons = sa;

  if (stallNameEl) stallNameEl.textContent = stallName;
  if (ownerNameEl) ownerNameEl.textContent = userName;
  if (menuTitle) menuTitle.textContent = `Menu — ${stallName}`;

  /* ===== Add Modal controls ===== */
  function openAddModal() {
    if (!addModal) return;
    nameInput.value = "";
    priceInput.value = "";
    if (addCatEl) addCatEl.value = "";
    if (addDescEl) addDescEl.value = "";
    if (addImgEl) addImgEl.value = "";
    if (addImgPreviewEl) {
      addImgPreviewEl.removeAttribute("src");
      const wrap = document.getElementById("menuImageWrap");
      if (wrap) wrap.style.display = "none";
    }
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

  /* ===== Edit modal close ===== */
  editClose?.addEventListener("click", () => closeOverlay(editModal));
  editModal?.addEventListener("click", (e) => {
    if (e.target === editModal) closeOverlay(editModal);
  });
  editImg?.addEventListener("change", () => {
    const f = editImg.files?.[0];
    if (!f) return;
    editImgPreview.src = URL.createObjectURL(f);
  });

  // ✅ Menu collection (FIXED: uses stallId, not user.uid)
  const menuCol = collection(
    db,
    "centres",
    centreId,
    "stalls",
    stallId,
    "menu",
  );
  const addonsCol = collection(
    db,
    "centres",
    centreId,
    "stalls",
    stallId,
    "addons",
  );

  /* ===== ADD ITEM =====
     Creates BOTH old fields (price/description/imageUrl/available)
     AND new fields (category/desc/img/active).
     So your app stays compatible.
  */
  saveBtn?.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    const price = parseMoney(priceInput.value);
    const category = addCatEl?.value?.trim() || "";
    const desc = addDescEl?.value?.trim() || "";

    if (!name) return alert("Please enter item name");
    if (!Number.isFinite(price) || price <= 0)
      return alert("Enter a valid price");

    try {
      saveBtn.disabled = true;
      setStatus("Adding item…");

      let imageUrl = "";
      const imgFile = addImgEl?.files?.[0];
      if (imgFile) {
        imageUrl = await uploadMenuImage({
          stallId,
          uid: user.uid,
          file: imgFile,
        });
      }

      await addDoc(menuCol, {
        // common
        name,
        category,
        active: true,
        hotAvailable: true,

        // NEW-style fields
        desc,
        img: "", // (if you want, you can put a local path here instead)
        prices: null,

        // OLD-style fields (keep for other pages that still use them)
        price,
        description: desc,
        imageUrl,
        available: true,

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

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

  /* ===== LISTEN + RENDER ===== */
  const q = query(menuCol, orderBy("createdAt", "desc"));

  let editingItemId = null;
  let editingCurrentImageUrl = "";
  let editingCurrentImg = ""; // NEW img field
  let editingUsesPrices = false;

  onSnapshot(
    q,
    (snap) => {
      if (snap.empty) {
        listEl.innerHTML = "";
        emptyState.hidden = false;
        setStatus("");
        return;
      }

      emptyState.hidden = true;

      // optional stall stats
      updateDoc(stallRef, {
        hasMenu: true,
        menuCount: snap.size,
        updatedAt: serverTimestamp(),
      }).catch(() => {});

      listEl.innerHTML = snap.docs
        .map((d) => {
          const it = d.data() || {};
          const id = d.id;

          const name = esc(it.name || "Untitled");
          const category = esc(it.category || "—");

          // NEW desc field (fallback old description)
          const desc = esc(it.desc || it.description || "—");

          // NEW prices map (fallback old price)
          const pricesLine = it.prices ? formatPrices(it.prices) : "";
          const priceLine = pricesLine
            ? pricesLine
            : `Price: ${money(it.price)}`;

          // NEW active field (fallback old available)
          const isActive = (it.active ?? it.available !== false) === true;

          // image: prefer Storage URL, then new img path, then default
          const img = it.imageUrl
            ? esc(it.imageUrl)
            : it.img
              ? esc(it.img)
              : "images/defaultfood.png";

          return `
            <article class="menuCard" data-id="${id}" data-active="${isActive ? "1" : "0"}">
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

                <div style="margin-top:6px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                  <span class="prep completed" style="text-transform:none;">${category}</span>
                  <span class="prep ${isActive ? "completed" : "cancelled"}" style="text-transform:none;">
                    ${isActive ? "Active" : "Inactive"}
                  </span>
                  ${it.hotAvailable === false ? `<span class="prep cancelled" style="text-transform:none;">No Hot</span>` : ``}
                </div>

                <div class="menuPriceAction" style="margin-top:10px;">
                  ${esc(priceLine)}
                </div>
              </div>

              <div class="menuActionRow">
                <button class="copyBtn" data-action="toggle">
                  ${isActive ? "Deactivate" : "Activate"}
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

  /* ===== CARD ACTIONS ===== */
  listEl.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const card = e.target.closest("[data-id]");
    if (!card) return;

    const itemId = card.dataset.id;
    const action = btn.dataset.action;

    const itemRef = doc(
      db,
      "centres",
      centreId,
      "stalls",
      stallId,
      "menu",
      itemId,
    );

    try {
      if (action === "toggle") {
        const isActiveNow = card.dataset.active === "1";

        // Toggle both fields for compatibility
        await updateDoc(itemRef, {
          active: !isActiveNow,
          available: !isActiveNow,
          updatedAt: serverTimestamp(),
        });
      }

      if (action === "edit") {
        const snap = await getDoc(itemRef);
        if (!snap.exists()) return;

        const it = snap.data() || {};

        // ✅ Add-ons UI (only if this stall supports it)
        ensureAddonsUI(supportsAddons);

        let selectedAddonIds = Array.isArray(it.addons) ? [...it.addons] : [];
        let unsubAddons = null;

        const stopAddonsListener = () => {
          if (unsubAddons) {
            unsubAddons();
            unsubAddons = null;
          }
        };

        if (supportsAddons) {
          const addonsQ = query(addonsCol, orderBy("createdAt", "desc"));

          unsubAddons = onSnapshot(addonsQ, (asnap) => {
            const addonsAll = asnap.docs.map((d) => ({
              id: d.id,
              ...d.data(),
            }));
            renderAddonsList(addonsAll, selectedAddonIds);
          });

          // Create addon
          document.getElementById("addAddonBtn").onclick = async () => {
            const n = document.getElementById("newAddonName").value.trim();
            const pRaw = document.getElementById("newAddonPrice").value.trim();
            if (!n) return alert("Enter add-on name");

            const addonId = makeIdFromName(n);
            const price = pRaw ? Number(pRaw) : null;
            if (pRaw && (!Number.isFinite(price) || price < 0))
              return alert("Enter valid add-on price");

            await setDoc(
              doc(addonsCol, addonId),
              {
                name: n,
                price,
                active: true,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              },
              { merge: true },
            );

            document.getElementById("newAddonName").value = "";
            document.getElementById("newAddonPrice").value = "";
          };

          // Track checkbox changes
          const addonsListEl = document.getElementById("addonsList");
          addonsListEl.onchange = (ev) => {
            const chk = ev.target.closest(".addonChk");
            if (!chk) return;

            const id = chk.dataset.id;
            if (chk.checked) {
              if (!selectedAddonIds.includes(id)) selectedAddonIds.push(id);
            } else {
              selectedAddonIds = selectedAddonIds.filter((x) => x !== id);
            }
          };
        }

        editingItemId = itemId;
        ensureEditPriceFields(supportsSizePricing);

        if (supportsSizePricing) {
          fillEditPrices(it.prices || null);
        }

        // Image sources
        editingCurrentImageUrl = it.imageUrl || "";
        editingCurrentImg = it.img || "";
        editingUsesPrices = !!it.prices;

        // Fill modal
        editName.value = it.name || "";
        editDesc.value = it.desc || it.description || "";

        // If this item uses prices map, we won't let you edit single price (to avoid wrecking your seeded data)
        editPrice.disabled = false;
        editPrice.placeholder = it.prices
          ? "Optional (leave empty if using size prices)"
          : "";
        editPrice.value = it.price != null ? String(it.price) : "";

        // Preview image
        const previewSrc = it.imageUrl || it.img || "images/defaultfood.png";
        editImgPreview.src = previewSrc;

        // Clear file input
        if (editImg) editImg.value = "";

        // Bind save/delete
        saveEditBtn.onclick = async () => {
          const newName = editName.value.trim();
          if (!newName) return alert("Please enter item name");

          const pricesMap = supportsSizePricing ? readPricesFromEdit() : null;

          const singlePrice = editPrice.value.trim()
            ? parseMoney(editPrice.value)
            : null;

          if (!pricesMap && singlePrice === null) {
            return alert(
              "Enter either a single price OR at least one size price.",
            );
          }

          if (singlePrice !== null && singlePrice <= 0) {
            return alert("Enter a valid single price");
          }

          try {
            saveEditBtn.disabled = true;
            setStatus("Saving changes…");

            let imageUrl = editingCurrentImageUrl;
            const imgFile = editImg?.files?.[0];
            if (imgFile) {
              imageUrl = await uploadMenuImage({
                stallId,
                uid: user.uid,
                file: imgFile,
              });
            }

            // Update (keep both schemas)
            await updateDoc(itemRef, {
              addons: supportsAddons ? selectedAddonIds : [],
              name: newName,

              desc: editDesc.value.trim(),
              description: editDesc.value.trim(),

              prices: pricesMap, // object or null
              hotAvailable: pricesMap ? true : (it.hotAvailable ?? true),

              // 🔄 keep OLD schema compatible
              price: pricesMap ? null : singlePrice,

              imageUrl: imageUrl || "",
              updatedAt: serverTimestamp(),
            });

            stopAddonsListener();
            setStatus("");
            closeOverlay(editModal);
          } catch (err) {
            console.error(err);
            alert("Failed to save changes (check Firestore + Storage rules).");
            setStatus("Failed to save changes.", true);
          } finally {
            saveEditBtn.disabled = false;
          }
        };

        deleteItemBtn.onclick = async () => {
          if (!confirm("Delete this menu item?")) return;
          stopAddonsListener();
          await deleteDoc(itemRef);
          closeOverlay(editModal);
        };

        openOverlay(editModal);
        editName?.focus();
      }

      if (action === "delete") {
        if (confirm("Delete this menu item?")) await deleteDoc(itemRef);
      }
    } catch (err) {
      console.error(err);
      setStatus("Action failed. Check Firestore/Storage permissions.", true);
    }
  });
});
