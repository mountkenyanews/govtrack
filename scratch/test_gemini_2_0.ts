import dotenv from "dotenv";
dotenv.config();

const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.API_KEY;

async function testGemini2() {
  console.log("Testing with exact gemini-2.0-flash URL...");
  try {
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Hello, who are you? Answer in 1 sentence." }] }],
          generationConfig: {
            temperature: 0.2,
          }
        })
      }
    );
    console.log("Gemini 2.0 Status:", geminiResponse.status);
    const body = await geminiResponse.text();
    console.log("Response Body:", body);
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}

testGemini2();
