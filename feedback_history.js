import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  collectionGroup,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

/* CONFIG */
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

// DOM Elements
const gridEl = document.getElementById("historyGrid");
const statusEl = document.getElementById("statusMsg");
const loadMoreContainer = document.getElementById("loadMoreContainer");
const tabBtns = document.querySelectorAll(".grid-tab-btn");

let allItems = [];
let currentTab = "review"; 

// --- Helper: Gold Stars ---
function getStars(n) {
  const count = parseInt(n) || 0;
  let s = "";
  for (let i = 0; i < count; i++) s += "★";
  for (let i = count; i < 5; i++) s += "☆"; 
  return s;
}

// --- Render Card HTML ---
function createCard(item) {
  const userName = item.userName || "Anonymous";
  const avatarLetter = userName.charAt(0).toUpperCase();

  // If review, show stars. If complaint, show Ticket badge.
  const starContent = item.type === 'review' 
    ? getStars(item.rating) 
    : `<span style="color: #d9382c; font-weight:bold; font-size:14px;">Complaint Ticket</span>`;

  const bodyText = item.type === 'review' ? item.text : item.message;
  // Fallback for stall name
  const stallName = item.stallName || item.stall || "Unknown Stall";

  // ✅ NEW: Dynamic Image Logic
  // This works for BOTH Reviews and Complaints
  let imageHtml = "";
  if (item.imageUrl) {
    imageHtml = `<img src="${item.imageUrl}" class="card-evidence-img" alt="Evidence" loading="lazy" />`;
  }

  return `
    <article class="grid-card">
      <div class="card-user-row">
        <div class="card-avatar">${avatarLetter}</div>
        <div class="card-username">${userName}</div>
      </div>

      <div class="card-stars">${starContent}</div>

      <div class="card-text">
        ${bodyText || "No additional text provided."}
      </div>

      ${imageHtml}

      <div class="card-footer">
        <img src="images/orange-house.png" class="stall-icon" alt="stall">
        ${stallName}
      </div>
    </article>
  `;
}

// --- Render Logic ---
function render() {
  const filtered = allItems.filter(item => item.type === currentTab);

  if (filtered.length === 0) {
    gridEl.innerHTML = "";
    statusEl.style.display = "block";
    statusEl.textContent = `No ${currentTab}s found.`;
    if (loadMoreContainer) loadMoreContainer.style.display = "none";
    return;
  }

  statusEl.style.display = "none";

  // ✅ SCROLLABLE UPDATE: Render ALL items (removed .slice)
  gridEl.innerHTML = filtered.map(createCard).join("");
  
  // Hide load more button permanently
  if (loadMoreContainer) loadMoreContainer.style.display = "none"; 
}

// --- Fetch Data ---
async function fetchData(user) {
  statusEl.textContent = "Loading...";
  gridEl.innerHTML = "";

  try {
    // 1. Fetch Complaints (Easy, top-level collection)
    const q1 = query(collection(db, "complaints"), where("uid", "==", user.uid));
    
    let complaints = [];
    try {
      const snap1 = await getDocs(q1);
      complaints = snap1.docs.map(d => ({ type: 'complaint', ...d.data() }));
    } catch (e) { console.error("Complaints error:", e); }

    // 2. Fetch Reviews (THE NEW WAY - No Index Needed)
    // We will loop through every stall to find your reviews.
    let reviews = [];
    
    try {
      // A. Get list of all stalls first
      const stallsSnap = await getDocs(collection(db, "stalls"));
      
      // B. Create a query for EACH stall
      const reviewPromises = stallsSnap.docs.map(async (stallDoc) => {
        const stallId = stallDoc.id;
        // Search inside THIS specific stall
        const q = query(
          collection(db, "stalls", stallId, "reviews"), 
          where("userId", "==", user.uid)
        );
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ type: 'review', ...d.data() }));
      });

      // C. Wait for all stall searches to finish
      const results = await Promise.all(reviewPromises);
      
      // D. Flatten the list (combine all results into one array)
      reviews = results.flat();

    } catch (e) { 
      console.error("Reviews loop error:", e); 
    }

    // 3. Combine & Sort by Date (Newest first)
    allItems = [...complaints, ...reviews].sort((a, b) => {
      const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return tB - tA;
    });

    render();

  } catch (err) {
    console.error("Critical Error:", err);
    statusEl.textContent = "Error loading history.";
  }
}

// --- Event Listeners ---
tabBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    tabBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentTab = btn.dataset.tab;
    render();
  });
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    fetchData(user);
  } else {
    statusEl.textContent = "Please log in to view history.";
  }
});