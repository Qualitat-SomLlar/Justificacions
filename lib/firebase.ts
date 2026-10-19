import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, Auth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  Firestore
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDO8KG4Ps6Es073rtc1emggR5q4XKx-2ck",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "justificacions.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "justificacions",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "justificacions.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "750826720127",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:750826720127:web:fab4d52a4aa88f584be84a",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-T17HVPLRTH"
};

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
auth = getAuth(app);
try {
  db = initializeFirestore(app, {
    // Optional fields (e.g. comentaris) may be undefined; without this option Firestore rejects the write
    ignoreUndefinedProperties: true,
    // Browser cache in IndexedDB: changes made offline are kept and sent when the connection
    // comes back, and reloads only download what changed. Falls back to memory if unavailable.
    ...(typeof window !== "undefined"
      ? { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }
      : {}),
  });
} catch {
  // Already initialised (hot reload)
  db = getFirestore(app);
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account"
});

export { app, auth, db };
