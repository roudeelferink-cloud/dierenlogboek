// Kopieer dit bestand naar src/config.js en vul de echte waarden in.
// config.js staat in .gitignore en wordt dus nooit gecommit.

// Firebase web-config: Firebase Console → Projectinstellingen → Je apps →
// Web-app → SDK-configuratie. Spark-plan (gratis) is voldoende.
export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

// URL van de gedeployde Cloudflare Worker (fotoherkenning), bijv.
// "https://dierenlogboek-herkenning.jouwnaam.workers.dev"
// Leeg laten = herkenning uit; opslaan blijft gewoon werken.
export const WORKER_URL = "";
