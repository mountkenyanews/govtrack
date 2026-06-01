import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import dotenv from "dotenv";
dotenv.config();

const firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG || "{}");

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");
  const docRef = doc(db, "server_db", "master_db");

  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      const payload = JSON.parse(data.payload);
      console.log("Politicians and their Photos:");
      payload.politicians.forEach((p: any) => {
        console.log(`- ${p.full_name}: ${p.photo_url}`);
      });
    } else {
      console.log("Document does not exist!");
    }
  } catch (err) {
    console.error("Error reading doc:", err);
  }
}

main();
