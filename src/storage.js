// Opslaglaag: Firestore met offline-persistence (veldwerk = vaak geen bereik),
// met een localStorage-fallback zolang er nog geen Firebase-config is ingevuld.
// Opslaan slaagt ALTIJD lokaal; synchronisatie volgt zodra er verbinding is.
import { firebaseConfig } from "./config.js";

export const hasFirebase = !!(firebaseConfig && firebaseConfig.projectId);

const CODE_KEY = "dierenlogboek:familiecode";

export function getFamilyCode() {
  try {
    return localStorage.getItem(CODE_KEY) || "";
  } catch {
    return "";
  }
}

export function setFamilyCode(code) {
  try {
    localStorage.setItem(CODE_KEY, code);
  } catch (e) {
    console.error(e);
  }
}

// ── Firestore-backend ──
let dbPromise = null;
function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const { initializeApp } = await import("firebase/app");
      const {
        initializeFirestore,
        persistentLocalCache,
        persistentMultipleTabManager,
      } = await import("firebase/firestore");
      const app = initializeApp(firebaseConfig);
      // Offline-persistence aan: writes worden lokaal gequeued en snapshots
      // komen uit de lokale cache als er geen bereik is.
      return initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      });
    })();
  }
  return dbPromise;
}

// ── localStorage-fallback (geen Firebase-config) ──
const localListeners = new Set();
function localKey(code) {
  return "dierenlogboek:spots:" + code;
}
function localRead(code) {
  try {
    return JSON.parse(localStorage.getItem(localKey(code)) || "[]");
  } catch {
    return [];
  }
}
function localWrite(code, list) {
  try {
    localStorage.setItem(localKey(code), JSON.stringify(list));
  } catch (e) {
    console.error(e);
  }
  for (const fn of localListeners) fn(list);
}

/**
 * Abonneert op alle spots van de familie. Callback krijgt de volledige lijst.
 * Geeft een unsubscribe-functie terug.
 */
export function subscribeSpots(code, onChange, onError) {
  if (!hasFirebase) {
    const fn = (list) => onChange(list);
    localListeners.add(fn);
    onChange(localRead(code));
    return () => localListeners.delete(fn);
  }

  let unsub = () => {};
  let cancelled = false;
  (async () => {
    try {
      const db = await getDb();
      const { collection, onSnapshot } = await import("firebase/firestore");
      if (cancelled) return;
      unsub = onSnapshot(
        collection(db, "families", code, "spots"),
        (snap) => onChange(snap.docs.map((d) => d.data())),
        (err) => {
          console.error("Firestore snapshot-fout:", err);
          onError && onError(err);
        }
      );
    } catch (err) {
      console.error("Firestore init-fout:", err);
      onError && onError(err);
    }
  })();
  return () => {
    cancelled = true;
    unsub();
  };
}

/**
 * Slaat een spot op. Bewust fire-and-forget: met offline-persistence resolvet
 * de promise pas na server-ack, en opslaan mag nooit blokkeren op netwerk.
 */
export function saveSpot(code, spot) {
  if (!hasFirebase) {
    const list = localRead(code).filter((e) => e.id !== spot.id);
    localWrite(code, [spot, ...list]);
    return;
  }
  (async () => {
    try {
      const db = await getDb();
      const { doc, setDoc } = await import("firebase/firestore");
      setDoc(doc(db, "families", code, "spots", spot.id), spot).catch((e) =>
        console.error("Opslaan naar Firestore mislukt (blijft lokaal gequeued):", e)
      );
    } catch (e) {
      console.error(e);
    }
  })();
}

export function deleteSpot(code, id) {
  if (!hasFirebase) {
    localWrite(code, localRead(code).filter((e) => e.id !== id));
    return;
  }
  (async () => {
    try {
      const db = await getDb();
      const { doc, deleteDoc } = await import("firebase/firestore");
      deleteDoc(doc(db, "families", code, "spots", id)).catch((e) =>
        console.error("Verwijderen uit Firestore mislukt:", e)
      );
    } catch (e) {
      console.error(e);
    }
  })();
}
