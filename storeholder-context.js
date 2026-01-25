import {
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "./firebase.js";

export async function getStoreholderCtx(uid) {
  const usnap = await getDoc(doc(db, "users", uid));
  if (!usnap.exists()) return null;

  const u = usnap.data();
  const centreId = u.centreId;
  const stallId = u.stallId || uid;

  if (!centreId) return null;

  return {
    centreId,
    stallId,
    stallPath: u.stallPath || `centres/${centreId}/stalls/${stallId}`,
  };
}
