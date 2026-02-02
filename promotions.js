import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  Timestamp,
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

let currentUser = null;
let claimedCodes = new Set();
let claimedDailyIds = new Set();

function todayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`; // e.g. 2026-01-23
}

function voucherDocId(promo, code) {
  // claimOnce: true -> forever (one doc)
  // claimOnce: false -> daily (one doc per day)
  return promo.claimOnce === false ? `${code}_${todayKey()}` : code;
}

const DAY = 24 * 60 * 60 * 1000;

async function loadClaimedCodes(uid) {
  const snap = await getDocs(collection(db, "users", uid, "vouchers"));

  claimedCodes = new Set();
  claimedDailyIds = new Set();

  snap.docs.forEach((d) => {
    const id = (d.id || "").toUpperCase();
    if (id.includes("_")) claimedDailyIds.add(id);
    else claimedCodes.add(id);
  });
}

// ---- PROMO DATA  Pull (REAL-TIME EXPIRY) ----
let promos = [];

async function loadPromos() {
  const snap = await getDocs(collection(db, "promotions"));

  promos = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      // convert Firestore Timestamp → number (so your existing logic still works)
      expiresAt: data.expiresAt?.toMillis ? data.expiresAt.toMillis() : 0,
    };
  });
}

// ---- DOM ----
const promoList = document.getElementById("promoList");
const promoSearch = document.getElementById("promoSearch");
const typeFilter = document.getElementById("typeFilter");
const statusFilter = document.getElementById("statusFilter");
const sortFilter = document.getElementById("sortFilter");
const promoSub = document.getElementById("promoSub");

const redeemInput = document.getElementById("redeemInput");
const redeemBtn = document.getElementById("redeemBtn");
const redeemMsg = document.getElementById("redeemMsg");

const toast = document.getElementById("promoToast");

const IS_PROMO_PAGE = !!promoList;

// ---- EXPIRY HELPERS (REAL TIME) ----
export function isExpired(p) {
  return Date.now() > p.expiresAt;
}

if (IS_PROMO_PAGE) {
  onAuthStateChanged(auth, async (u) => {
    if (!u) {
      currentUser = null;
      claimedCodes.clear();
      claimedDailyIds.clear();

      await loadPromos();
      render();
      return;
    }

    currentUser = u;
    await loadClaimedCodes(u.uid);
    await loadPromos();
    render();
  });

  // ---- UI HELPERS ----
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), 1400);
  }

  function daysLeft(p) {
    const ms = p.expiresAt - Date.now();
    return Math.ceil(ms / DAY);
  }

  function statusOf(p) {
    const d = daysLeft(p);
    if (d <= 0) return "expired";
    return d <= 7 ? "expiring" : "active";
  }

  // ---- FILTERS ----
  function matches(p) {
    // auto-hide expired promos
    if (isExpired(p)) return false;

    const q = (promoSearch.value || "").trim().toLowerCase();
    const t = typeFilter.value;
    const s = statusFilter.value;

    const qOk =
      !q ||
      p.title.toLowerCase().includes(q) ||
      p.desc.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q);

    const tOk = t === "all" || p.type === t;
    const sOk = s === "all" || statusOf(p) === s;

    return qOk && tOk && sOk;
  }

  function sortPromos(arr) {
    const mode = sortFilter.value;

    if (mode === "expSoon") {
      // sort by live days left
      return [...arr].sort((a, b) => daysLeft(a) - daysLeft(b));
    }

    if (mode === "best") {
      const score = (p) =>
        p.type === "percent" ? 3 : p.type === "cash" ? 2 : 1;
      return [...arr].sort((a, b) => score(b) - score(a));
    }

    // popular default
    return [...arr].sort((a, b) => (b.popular === true) - (a.popular === true));
  }

  // ---- FIRESTORE: CLAIM VOUCHER ----
  async function claimVoucher(codeRaw) {
    if (!currentUser) {
      showToast("Please login to claim vouchers");
      return;
    }

    const code = (codeRaw || "").trim().toUpperCase();
    const promo = promos.find((p) => p.code.toUpperCase() === code);

    if (!promo) return showToast("Promo not found");
    if (isExpired(promo)) return showToast("This promo is expired");

    const docId = voucherDocId(promo, code);
    const ref = doc(db, "users", currentUser.uid, "vouchers", docId);

    const snap = await getDoc(ref);
    if (snap.exists()) return showToast("Already claimed");

    await setDoc(ref, {
      code,
      claimedAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(promo.expiresAt),
      used: false,
      usedAt: null,
    });
    if (promo.claimOnce === false) {
      claimedDailyIds.add(docId.toUpperCase());
    } else {
      claimedCodes.add(code.toUpperCase());
    }

    render();
    showToast(`Claimed: ${code}`);
  }

  // ---- RENDER ----
  function renderCard(p) {
    const d = daysLeft(p);
    const exp = statusOf(p);

    const expText =
      d <= 0
        ? "❌ Expired"
        : d === 1
          ? "⏳ Expires in 1 day"
          : `⏳ Expires in ${d} days`;

    const redText =
      p.redemptionsLeft == null ? "" : `• 🎫 ${p.redemptionsLeft} left`;
    const codeUpper = p.code.toUpperCase();
    const dailyIdUpper = `${codeUpper}_${todayKey()}`.toUpperCase();

    const isClaimed =
      p.claimOnce === false
        ? claimedDailyIds.has(dailyIdUpper)
        : claimedCodes.has(codeUpper);

    return `
    <article class="card">
      <div class="cardImg">
        <div class="imgFrame">
          ${
            p.img
              ? `<img src="${p.img}" alt="${p.title}">`
              : `<img src="images/promo_placeholder.png" alt="${p.title}">`
          }
        </div>
      </div>

      <div class="cardBody">
        <div class="cardTop">
          <h3 class="title">${p.title}</h3>
          ${p.popular ? `<span class="badgePopular">Hot Deal</span>` : ``}
        </div>

        <p class="desc">${p.desc}</p>

        <div class="promoChips">
          <span class="promoChip ${exp === "expiring" ? "expiring" : ""}">
            ${expText} ${redText}
          </span>
          <span class="promoChip">Type: ${p.type.toUpperCase()}</span>
        </div>

        <div class="cardBottom">
          <div class="promoCodeRow" style="width:100%;">
            <div class="promoCodeBox" data-codebox>${p.code}</div>

            <button class="copyBtn" data-copy="${p.code}">Copy</button>
           <button class="copyBtn" data-claim="${p.code}" ${isClaimed ? "disabled" : ""}>
  ${isClaimed ? "Claimed ✓" : "Claim"}
</button>

          </div>
        </div>
      </div>
    </article>
  `;
  }

  function renderEmpty() {
    promoList.innerHTML = `
    <div class="emptyState">
      <h2 class="emptyTitle">No promo codes found</h2>
      <div class="bottomReset">
        <button class="resetBtn" id="resetPromoBtn">Reset Filters</button>
      </div>
    </div>
  `;

    document.getElementById("resetPromoBtn").onclick = () => {
      promoSearch.value = "";
      typeFilter.value = "all";
      statusFilter.value = "all";
      sortFilter.value = "popular";
      render();
      showToast("Filters reset");
    };
  }

  function render() {
    const filtered = sortPromos(promos.filter(matches));

    promoSub.textContent =
      `Showing ${filtered.length} promo codes • ` +
      (sortFilter.value === "popular"
        ? "Sorted by Popular"
        : sortFilter.value === "expSoon"
          ? "Sorted by Expiring"
          : "Sorted by Best Value");

    if (filtered.length === 0) return renderEmpty();

    promoList.innerHTML = filtered.map(renderCard).join("");
  }

  // ---- ACTIONS ----
  async function copyCode(code) {
    try {
      await navigator.clipboard.writeText(code);
      showToast(`Copied: ${code}`);
    } catch {
      const t = document.createElement("textarea");
      t.value = code;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
      showToast(`Copied: ${code}`);
    }
  }

  function redeem(codeRaw) {
    const code = (codeRaw || "").trim().toUpperCase();
    redeemMsg.textContent = "";

    if (!code) {
      redeemMsg.textContent = "Please enter a promo code.";
      return;
    }

    const promo = promos.find((p) => p.code.toUpperCase() === code);

    if (!promo) {
      redeemMsg.textContent = "Invalid promo code.";
      showToast("Invalid code");
      return;
    }

    if (isExpired(promo)) {
      redeemMsg.textContent = "This promo code has expired.";
      showToast("Expired code");
      return;
    }

    // Save for checkout (your current behaviour)
    localStorage.setItem("hawkerpoint_applied_promo", code);
    redeemMsg.textContent = `Applied: ${code} (saved for checkout)`;
    showToast(`Applied: ${code}`);
  }

  // ---- EVENTS ----
  promoSearch.addEventListener("input", render);
  typeFilter.addEventListener("change", render);
  statusFilter.addEventListener("change", render);
  sortFilter.addEventListener("change", render);

  promoList.addEventListener("click", (e) => {
    const copyBtn = e.target.closest("[data-copy]");
    if (copyBtn) return copyCode(copyBtn.dataset.copy);

    const claimBtn = e.target.closest("[data-claim]");
    if (claimBtn) return claimVoucher(claimBtn.dataset.claim);
  });

  redeemBtn.addEventListener("click", () => redeem(redeemInput.value));
  redeemInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") redeem(redeemInput.value);
  });

  // ---- INITIAL + LIVE REFRESH ----
  render();
}
