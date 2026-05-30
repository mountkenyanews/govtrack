import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";

export default async function handler(req: any, res: any) {
  const log: string[] = [];
  log.push("Debug handler started.");
  
  const firebaseConfig = {
    projectId: "idyllic-art-v8gvj",
    appId: "1:568813002354:web:f036c352fe8e956caf6ceb",
    apiKey: "AIzaSyClW2YAS3lEyEr6P_NagV_hef9V_KYnGhI",
    authDomain: "idyllic-art-v8gvj.firebaseapp.com",
    firestoreDatabaseId: "ai-studio-f1130241-c3c4-434f-b90e-aa93968a3f50",
    storageBucket: "idyllic-art-v8gvj.firebasestorage.app",
    messagingSenderId: "568813002354"
  };

  try {
    log.push("Initializing Firebase...");
    const firebaseApp = initializeApp(firebaseConfig);
    log.push("Firebase initialized. Getting Firestore...");
    const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId || "(default)");
    log.push("Firestore fetched. Reading document...");
    const docRef = doc(db, "server_db", "master_db");
    const docSnap = await getDoc(docRef);
    log.push(`Document read completed. Exists: ${docSnap.exists()}`);
    res.json({ success: true, log, keys: docSnap.exists() ? Object.keys(docSnap.data() || {}) : [] });
  } catch (err: any) {
    log.push(`Error caught: ${err.message || String(err)}`);
    res.status(500).json({ success: false, error: err.message, stack: err.stack, log });
  }
}
