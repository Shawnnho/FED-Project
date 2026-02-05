import {
  getFirestore,
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  getStorage,
  ref,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

import { app } from "./firebase.js";

const db = getFirestore(app);
const storage = getStorage(app);
const centresList = document.getElementById("centresList");

async function loadCentres() {
  const snapshot = await getDocs(collection(db, "centres"));

  for (const docSnap of snapshot.docs) {
    const centre = docSnap.data();
    const centreId = docSnap.id;

    let imgUrl = "images/default-centre.jpg"; // local fallback

    if (centre.imagePath) {
      try {
        imgUrl = await getDownloadURL(ref(storage, centre.imagePath));
      } catch (e) {
        console.warn("Image missing:", centre.imagePath, e.code || e.message);
      }
    }

    const card = document.createElement("a");
    card.className = "centre-card";
    card.href = `centre.html?centreId=${centreId}`;

    card.innerHTML = `
      <div class="centre-img">
        <img src="${imgUrl}" alt="${centre.name}">
      </div>
      <div class="centre-content">
        <h3>${centre.name || centreId}</h3>
        <p class="centre-meta">Centre ID: ${centreId}</p>
      </div>
    `;

    centresList.appendChild(card);
  }
}

loadCentres();
