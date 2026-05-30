import fetch from "node-fetch";

async function fetchError() {
  console.log("Fetching live Vercel API to retrieve crash details...");
  try {
    const res = await fetch("https://govtrack-five.vercel.app/api/polls");
    const status = res.status;
    const body = await res.text();
    console.log(`HTTP Status: ${status}`);
    console.log("Raw Response Body:");
    try {
      const parsed = JSON.parse(body);
      console.log(JSON.stringify(parsed, null, 2));
    } catch {
      console.log(body);
    }
  } catch (err) {
    console.error("Fetch error:", err);
  }
}

fetchError();
