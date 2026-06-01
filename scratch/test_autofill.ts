import dotenv from "dotenv";
dotenv.config();

// We will simulate generateAIContent and Wikipedia image resolution
import { Type } from "@google/genai";

const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.API_KEY;
const groqApiKey = process.env.GROQ_API_KEY;

console.log("GROQ API KEY:", groqApiKey ? "Exists" : "Missing");
console.log("GEMINI API KEY:", geminiKey ? "Exists" : "Missing");

async function getWikipediaImageUrl(name: string): Promise<string> {
  try {
    const headers = { "User-Agent": "GovTrackApp/1.0 (contact@govtrack.co.ke)" };
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name)}&format=json&origin=*`;
    const searchRes = await fetch(searchUrl, { headers });
    const searchData = await searchRes.json() as any;
    const title = searchData?.query?.search?.[0]?.title;
    if (!title) return "";

    const imgUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&piprop=thumbnail|original&pithumbsize=250&titles=${encodeURIComponent(title)}&redirects=1&origin=*`;
    const imgRes = await fetch(imgUrl, { headers });
    const imgData = await imgRes.json() as any;
    const pages = imgData?.query?.pages || {};
    for (const key of Object.keys(pages)) {
      const page = pages[key];
      if (page.thumbnail?.source) {
        return page.thumbnail.source;
      }
    }
  } catch (err) {
    console.error("Wiki err:", err);
  }
  return "";
}

async function testAutofill() {
  const name = "William Ruto";
  console.log(`\nTesting Wikipedia resolution for "${name}"...`);
  const wikiUrl = await getWikipediaImageUrl(name);
  console.log("Resolved Wiki URL:", wikiUrl);

  const prompt = `Provide accurate details for the politician named "${name}". Use real information. If you don't have a photo URL, provide a placeholder URL.`;
  const schemaDescription = `{
    "title": "Title or designation (string)",
    "country": "Country jurisdiction (string)",
    "party": "Political party name (string)",
    "party_color": "Hex color code (string)",
    "office": "Specific Head of Office (string)",
    "photo_url": "Image URL (string)",
    "date_of_birth": "Date of birth (string)",
    "bio": "Detailed biography (string)"
  }`;

  console.log("\nAttempting AI generation via Groq...");
  if (groqApiKey) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${groqApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: "You are an AI assistant. Return JSON conforming to schema:\n" + schemaDescription },
            { role: "user", content: prompt }
          ],
          response_format: { type: "json_object" },
          temperature: 0.2
        })
      });
      console.log("Groq status:", response.status);
      const text = await response.text();
      console.log("Groq output snippet:", text.substring(0, 300));
    } catch (err) {
      console.error("Groq err:", err);
    }
  }

  console.log("\nAttempting AI generation via Gemini Fallback...");
  if (geminiKey) {
    try {
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${prompt}\n\nReturn ONLY valid JSON matching this schema: ${schemaDescription}` }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.2,
            }
          })
        }
      );
      console.log("Gemini status:", geminiResponse.status);
      const text = await geminiResponse.text();
      console.log("Gemini output snippet:", text.substring(0, 300));
    } catch (err) {
      console.error("Gemini err:", err);
    }
  }
}

testAutofill();
