import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";

const firebaseConfig = {
  projectId: "idyllic-art-v8gvj",
  appId: "1:568813002354:web:f036c352fe8e956caf6ceb",
  apiKey: "AIzaSyClW2YAS3lEyEr6P_NagV_hef9V_KYnGhI",
  authDomain: "idyllic-art-v8gvj.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-f1130241-c3c4-434f-b90e-aa93968a3f50",
  storageBucket: "idyllic-art-v8gvj.firebasestorage.app",
  messagingSenderId: "568813002354"
};

console.log("Initializing Firebase with config:", firebaseConfig);

try {
  const firebaseApp = initializeApp(firebaseConfig);
  console.log("Firebase App initialized successfully.");
  
  const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId || "(default)");
  console.log("Firestore connection initialized.");
  
  const docRef = doc(db, "server_db", "master_db");
  console.log("Document reference created. Fetching document...");
  
  getDoc(docRef).then((docSnap) => {
    console.log("Fetch completed!");
    if (docSnap.exists()) {
      console.log("Document exists!");
      const data = docSnap.data();
      console.log("Data payload keys:", Object.keys(data || {}));
      process.exit(0);
    } else {
      console.log("Document does NOT exist in database.");
      process.exit(0);
    }
  }).catch((err) => {
    console.error("Error during getDoc:", err);
    process.exit(1);
  });
} catch (err) {
  console.error("Initialization error:", err);
  process.exit(1);
}
