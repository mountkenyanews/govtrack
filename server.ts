/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import fs from "fs";
import pg from "pg";
const { Pool } = pg;
// Vite is imported dynamically in dev mode only (see startServer)
import { GoogleGenAI, Type } from "@google/genai";
import { User, Poll, PollOption, Vote, Politician, Comment, NewsItem, PlatformStats, AppNotification, DevelopmentProgress } from "./src/types";

// Initialize Aiven PostgreSQL Connection Pool
const databaseUrl = process.env.DATABASE_URL;
let pgPool: pg.Pool | null = null;

if (databaseUrl) {
  try {
    const cleanUrl = databaseUrl.replace(/[?&]sslmode=require/i, "");
    pgPool = new Pool({
      connectionString: cleanUrl,
      ssl: {
        rejectUnauthorized: false // Required for Aiven SSL connections
      },
      // Serverless connection optimizations to prevent "remaining connection slots" exhaustion errors on Aiven
      max: process.env.VERCEL ? 1 : 2,     // Limit per container: 1 on Vercel, 2 on local dev
      idleTimeoutMillis: 1000,              // Close idle connections after 1 second to release slots instantly
      connectionTimeoutMillis: 5000         // Fail fast if database slots are exhausted
    });
    console.log("[Postgres] Successfully initialized PostgreSQL connection pool.");
  } catch (err) {
    console.error("[Postgres] Failed to initialize connection pool:", err);
  }
} else {
  console.warn("[Postgres] DATABASE_URL environment variable is not defined. PostgreSQL persistence is unavailable.");
}

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: "20mb" }));

// Global variable to track active Firestore save promises across all API request lifetimes
let pendingSavePromise: Promise<void> | null = null;

// Response Interceptor Middleware:
// Guarantees Vercel won't suspend serverless container tasks before Firestore database writes finish.
app.use((req, res, next) => {
  const originalSend = res.send;
  const originalJson = res.json;

  res.send = function (body) {
    if (pendingSavePromise) {
      pendingSavePromise.then(() => {
        pendingSavePromise = null;
        originalSend.call(res, body);
      }).catch((err) => {
        console.error("[DB Interceptor] Pending save failed in res.send:", err);
        originalSend.call(res, body);
      });
    } else {
      originalSend.call(res, body);
    }
    return res;
  };

  res.json = function (obj) {
    if (pendingSavePromise) {
      pendingSavePromise.then(() => {
        pendingSavePromise = null;
        originalJson.call(res, obj);
      }).catch((err) => {
        console.error("[DB Interceptor] Pending save failed in res.json:", err);
        originalJson.call(res, obj);
      });
    } else {
      originalJson.call(res, obj);
    }
    return res;
  };

  next();
});

// SEO: Dynamic sitemap.xml for Google indexing
app.get("/sitemap.xml", async (req, res) => {
  try {
    // Force reload the database fresh from Firestore to ensure Google crawler gets all dynamic pages instantly
    await loadDatabase();
  } catch (err) {
    console.error("[Sitemap DB Load] Failed to load database fresh:", err);
  }

  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host || "govtrack.co.ke";
  const siteUrl = process.env.APP_URL || `${protocol}://${host}`;

  const staticPages = [
    { loc: "/", priority: "1.0", changefreq: "daily" },
    { loc: "/#/polls", priority: "0.9", changefreq: "daily" },
    { loc: "/#/politicians", priority: "0.8", changefreq: "weekly" },
    { loc: "/#/elections", priority: "0.8", changefreq: "weekly" },
    { loc: "/#/policy", priority: "0.7", changefreq: "weekly" },
    { loc: "/#/news", priority: "0.9", changefreq: "daily" },
    { loc: "/#/results", priority: "0.7", changefreq: "daily" },
    { loc: "/#/about", priority: "0.5", changefreq: "monthly" },
    { loc: "/#/how-it-works", priority: "0.5", changefreq: "monthly" },
    { loc: "/#/login", priority: "0.3", changefreq: "monthly" },
    { loc: "/#/create", priority: "0.6", changefreq: "monthly" },
  ];

  // Dynamic pages from DB
  const pollPages = (DB.polls || []).map(p => ({
    loc: `/#/polls/${p.id}`,
    priority: p.is_featured ? "0.9" : "0.7",
    changefreq: p.status === "active" ? "daily" : "weekly",
    lastmod: p.created_at ? p.created_at.split("T")[0] : undefined
  }));

  const politicianPages = (DB.politicians || []).map(p => ({
    loc: `/#/politicians/${p.id}`,
    priority: "0.7",
    changefreq: "weekly"
  }));

  const allPages = [...staticPages, ...pollPages, ...politicianPages];
  const today = new Date().toISOString().split("T")[0];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages.map(page => `  <url>
    <loc>${siteUrl}${page.loc}</loc>
    <lastmod>${(page as any).lastmod || today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`).join("\n")}
</urlset>`;

  res.set("Content-Type", "application/xml");
  res.send(xml);
});

// Dynamic robots.txt to align sitemap location with the request domain
app.get("/robots.txt", (req, res) => {
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host || "govtrack.co.ke";
  const siteUrl = process.env.APP_URL || `${protocol}://${host}`;

  const robots = `# GovTrack Robots.txt
User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin

# Sitemap
Sitemap: ${siteUrl}/sitemap.xml
`;

  res.set("Content-Type", "text/plain");
  res.send(robots);
});

// Resolve paths
const DATA_DIR = path.join(process.cwd(), "data");
const DATABASE_FILE = path.join(DATA_DIR, "database.json");

// Ensure data directory exists (only when running locally on writeable environments; skip on Vercel)
if (!process.env.VERCEL && !fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.warn("Failed to create local data directory:", err);
  }
}

// Global In-Memory Database State
let DB = {
  users: [] as User[],
  polls: [] as Poll[],
  votes: [] as Vote[],
  politicians: [] as Politician[],
  comments: [] as Comment[],
  newsItems: [] as NewsItem[],
  notifications: [] as AppNotification[],
  parties: [] as any[],
  developments: [] as DevelopmentProgress[],
  credentials: {} as Record<string, string>, // email -> password (simulation)
  settings: {
    hero_image_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/General_Assembly_Hall.jpg/1280px-General_Assembly_Hall.jpg"
  } as { hero_image_url: string }
};

// Seed Data helper
function seedInitialData() {
  console.log("Seeding GovTrack sample data...");
  
  // Seed Users
  const seedUsers: User[] = [
    {
      id: 1,
      display_name: "Admin Administrator",
      email: "admin@govtrack.org",
      avatar_url: "https://ui-avatars.com/api/?name=Admin+Gov&background=0A1628&color=ffffff&bold=true",
      role: "admin",
      country: "Global",
      polls_created: 5,
      polls_voted: 12,
      joined_at: "2025-01-10T08:00:00Z",
      bio: "Chief Administrator of GovTrack Platform. Oversees data governance and neutral policy alignment.",
      verified: true,
    },
    {
      id: 2,
      display_name: "Sarah Jenkins",
      email: "journalist@govtrack.org",
      avatar_url: "https://ui-avatars.com/api/?name=Sarah+Jenkins&background=F5A623&color=0A1628&bold=true",
      role: "journalist",
      country: "USA",
      polls_created: 14,
      polls_voted: 45,
      joined_at: "2025-02-14T14:22:00Z",
      bio: "Senior Political Correspondent with 12+ years covering parliamentary elections and democratic processes.",
      verified: true,
    },
    {
      id: 3,
      display_name: "Dr. David Kinyua",
      email: "analyst@govtrack.org",
      avatar_url: "https://ui-avatars.com/api/?name=David+Kinyua&background=3b82f6&color=ffffff&bold=true",
      role: "analyst",
      country: "Kenya",
      polls_created: 8,
      polls_voted: 89,
      joined_at: "2025-03-01T10:15:00Z",
      bio: "Political Analyst specializing in East African foreign policy, voter turnout trends, and constitutional referendums.",
      verified: true,
    },
    {
      id: 4,
      display_name: "Jane Doe",
      email: "citizen@govtrack.org",
      avatar_url: "https://ui-avatars.com/api/?name=Jane+Doe&background=10b981&color=ffffff&bold=true",
      role: "citizen",
      country: "UK",
      polls_created: 1,
      polls_voted: 27,
      joined_at: "2025-04-18T19:30:12Z",
      bio: "Engaged citizen passionate about climate change public policy and electoral representation.",
      verified: false,
    },
    {
      id: 5,
      display_name: "GovTrack Kenya Admin",
      email: "admin@govtrack.co.ke",
      avatar_url: "https://ui-avatars.com/api/?name=Admin+KE&background=0A1628&color=ffffff&bold=true",
      role: "admin",
      country: "Kenya",
      polls_created: 0,
      polls_voted: 0,
      joined_at: "2026-06-01T00:00:00Z",
      bio: "Chief Administrator of GovTrack Kenya Platform.",
      verified: true,
    },
    {
      id: 6,
      display_name: "Sarah Jenkins (Kenya)",
      email: "journalist@govtrack.co.ke",
      avatar_url: "https://ui-avatars.com/api/?name=Sarah+Jenkins&background=F5A623&color=0A1628&bold=true",
      role: "journalist",
      country: "Kenya",
      polls_created: 0,
      polls_voted: 0,
      joined_at: "2026-06-01T00:00:00Z",
      bio: "Political Correspondent covering Kenyan regional policies.",
      verified: true,
    },
    {
      id: 7,
      display_name: "Dr. David Kinyua (Kenya)",
      email: "analyst@govtrack.co.ke",
      avatar_url: "https://ui-avatars.com/api/?name=David+Kinyua&background=3b82f6&color=ffffff&bold=true",
      role: "analyst",
      country: "Kenya",
      polls_created: 0,
      polls_voted: 0,
      joined_at: "2026-06-01T00:00:00Z",
      bio: "East African Policy Analyst.",
      verified: true,
    },
    {
      id: 8,
      display_name: "Jane Doe (Kenya)",
      email: "citizen@govtrack.co.ke",
      avatar_url: "https://ui-avatars.com/api/?name=Jane+Doe&background=10b981&color=ffffff&bold=true",
      role: "citizen",
      country: "Kenya",
      polls_created: 0,
      polls_voted: 0,
      joined_at: "2026-06-01T00:00:00Z",
      bio: "Engaged Kenyan citizen.",
      verified: false,
    }
  ];

  DB.users = seedUsers;
  DB.credentials = {
    "admin@govtrack.org": "admin",
    "journalist@govtrack.org": "journalist",
    "analyst@govtrack.org": "analyst",
    "citizen@govtrack.org": "citizen",
    "admin@govtrack.co.ke": "admin",
    "journalist@govtrack.co.ke": "journalist",
    "analyst@govtrack.co.ke": "analyst",
    "citizen@govtrack.co.ke": "citizen",
  };
  DB.settings = {
    hero_image_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/General_Assembly_Hall.jpg/1280px-General_Assembly_Hall.jpg"
  };

  // Seed Politicians
  const seedPoliticians: Politician[] = [
    {
      id: 1,
      full_name: "William Ruto",
      photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/William_Ruto_in_2023.jpg/250px-William_Ruto_in_2023.jpg",
      title: "President",
      country: "Kenya",
      party: "United Democratic Alliance (UDA)",
      party_color: "#32CD32",
      office: "President of the Republic of Kenya",
      bio: "Selected as Kenya's 5th president. Focuses on economic empowerment policies, farming subsidies, and digital infrastructure expansion.",
      date_of_birth: "1966-12-21",
      approval_rating: 44.5,
      total_poll_appearances: 4,
      social_twitter: "WilliamsRuto",
      social_instagram: "william_ruto",
      is_active: true,
      tags: ["Kenya", "Executive", "UDA"]
    },
    {
      id: 2,
      full_name: "Raila Odinga",
      photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Raila_Amolo_Odinga_2009_%28cropped%29.jpg/250px-Raila_Amolo_Odinga_2009_%28cropped%29.jpg",
      title: "Former Prime Minister",
      country: "Kenya",
      party: "Orange Democratic Movement (ODM)",
      party_color: "#F08080",
      office: "AUC Chair Candidate / Opposition Leader",
      bio: "Veteran statesman and key opposition leader. Champion of constitutional reforms and social democracy programs across Africa.",
      date_of_birth: "1945-01-07",
      approval_rating: 51.2,
      total_poll_appearances: 3,
      social_twitter: "RailaOdinga",
      social_instagram: "raila_odinga",
      is_active: true,
      tags: ["Kenya", "Opposition", "ODM", "AUC"]
    },
    {
      id: 3,
      full_name: "Joe Biden",
      photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Joe_Biden_presidential_portrait.jpg/250px-Joe_Biden_presidential_portrait.jpg",
      title: "President",
      country: "USA",
      party: "Democratic Party",
      party_color: "#0033A0",
      office: "46th President of the United States",
      bio: "Serving as President of the USA. Championed bipartisan bills on infrastructure, climate, and green tech investments.",
      date_of_birth: "1942-11-20",
      approval_rating: 42.0,
      total_poll_appearances: 3,
      social_twitter: "JoeBiden",
      social_instagram: "joebiden",
      is_active: true,
      tags: ["USA", "Democrat", "Executive"]
    },
    {
      id: 4,
      full_name: "Donald Trump",
      photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/Official_Presidential_Portrait_of_President_Donald_J._Trump_%282025%29_%28cropped%29%282%29.jpg/250px-Official_Presidential_Portrait_of_President_Donald_J._Trump_%282025%29_%28cropped%29%282%29.jpg",
      title: "President-elect",
      country: "USA",
      party: "Republican Party",
      party_color: "#E81B23",
      office: "47th President of the United States",
      bio: "American statesman and businessman who served as the 45th president and won reelection to represent 47th presidency on America-first economic agenda.",
      date_of_birth: "1946-06-14",
      approval_rating: 48.6,
      total_poll_appearances: 3,
      social_twitter: "realDonaldTrump",
      social_instagram: "realdonaldtrump",
      is_active: true,
      tags: ["USA", "Republican", "GOP"]
    },
    {
      id: 5,
      full_name: "Sir Keir Starmer",
      photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/Official_portrait_of_Keir_Starmer.jpg/250px-Official_portrait_of_Keir_Starmer.jpg",
      title: "Prime Minister",
      country: "UK",
      party: "Labour Party",
      party_color: "#E4003B",
      office: "Prime Minister of the United Kingdom",
      bio: "Inaugurated UK Prime Minister in July 2024 following labor landslide. Focuses on public service rebuilding, clean energy grids, and planning reforms.",
      date_of_birth: "1962-09-02",
      approval_rating: 38.0,
      total_poll_appearances: 2,
      social_twitter: "Keir_Starmer",
      social_instagram: "keirstarmer",
      is_active: true,
      tags: ["UK", "Labour", "Executive"]
    },
    {
      id: 6,
      full_name: "Rishi Sunak",
      photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Official_portrait_of_Rishi_Sunak_%28cropped%29.jpg/250px-Official_portrait_of_Rishi_Sunak_%28cropped%29.jpg",
      title: "Former PM / MP",
      country: "UK",
      party: "Conservative Party",
      party_color: "#0087DC",
      office: "Member of Parliament / Conservative Leader",
      bio: "Former UK Prime Minister. Navigated post-covid economic policies and defense budget expansions during his tenure.",
      date_of_birth: "1980-05-12",
      approval_rating: 31.5,
      total_poll_appearances: 2,
      social_twitter: "RishiSunak",
      social_instagram: "rishisunakmp",
      is_active: true,
      tags: ["UK", "Tory", "Opposition"]
    },
    {
      id: 7,
      full_name: "Cyril Ramaphosa",
      photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/Cyril_Ramaphosa_in_2026.jpg/250px-Cyril_Ramaphosa_in_2026.jpg",
      title: "President",
      country: "South Africa",
      party: "African National Congress (ANC)",
      party_color: "#006600",
      office: "President of the Republic of South Africa",
      bio: "Leading ANC coalition administration. Spearheads green transitions, municipal power grids restoration, and business partnerships.",
      date_of_birth: "1952-11-17",
      approval_rating: 47.1,
      total_poll_appearances: 2,
      social_twitter: "CyrilRamaphosa",
      is_active: true,
      tags: ["South Africa", "ANC", "Coalition"]
    },
    {
      id: 8,
      full_name: "Julius Malema",
      photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Julius_Malema_2019.jpg/250px-Julius_Malema_2019.jpg",
      title: "MP & Party President",
      country: "South Africa",
      party: "Economic Freedom Fighters (EFF)",
      party_color: "#FF0000",
      office: "Leader of the Economic Freedom Fighters",
      bio: "Dynamic oppositional figure raising voter focus on land distributions, mining state-control, and anti-corruption measures.",
      date_of_birth: "1981-03-03",
      approval_rating: 39.4,
      total_poll_appearances: 2,
      social_twitter: "Julius_S_Malema",
      is_active: true,
      tags: ["South Africa", "EFF", "Opposition"]
    },
    {
      id: 9,
      full_name: "Emmanuel Macron",
      photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Emmanuel_Macron_2025_%28cropped%29.jpg/250px-Emmanuel_Macron_2025_%28cropped%29.jpg",
      title: "President",
      country: "France",
      party: "Renaissance",
      party_color: "#002395",
      office: "President of the French Republic",
      bio: "Serving his second term. Promotes strong European union integration, industrial modernization policies, and lab investments.",
      date_of_birth: "1977-12-21",
      approval_rating: 32.8,
      total_poll_appearances: 2,
      social_twitter: "EmmanuelMacron",
      social_instagram: "emmanuelmacron",
      is_active: true,
      tags: ["France", "Europe", "Executive"]
    },
    {
      id: 10,
      full_name: "Olaf Scholz",
      photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Olaf_Scholz_2025_%28cropped%29.jpg/250px-Olaf_Scholz_2025_%28cropped%29.jpg",
      title: "Chancellor",
      country: "Germany",
      party: "Social Democratic Party (SPD)",
      party_color: "#E3000F",
      office: "Chancellor of the Federal Republic of Germany",
      bio: "Leading coalition government. Directs defense structural shifts, industrial decarbonization, and immigration program reforms.",
      date_of_birth: "1958-06-14",
      approval_rating: 29.0,
      total_poll_appearances: 2,
      social_twitter: "OlafScholz",
      social_instagram: "olafscholz",
      is_active: true,
      tags: ["Germany", "Europe", "Executive"]
    },
    {
      id: 20,
      full_name: "Anne Waiguru",
      photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/HE._Ann_Waiguru.jpg/250px-HE._Ann_Waiguru.jpg",
      title: "Governor, Kirinyaga County",
      country: "Kenya",
      party: "United Democratic Alliance (UDA)",
      party_color: "#32CD32",
      office: "Kirinyaga County Governor's Office",
      bio: "First female governor of Kirinyaga County, former Devolution Cabinet Secretary. Focuses on agro-processing, healthcare modernization, and women empowerment.",
      date_of_birth: "1971-04-16",
      approval_rating: 52.4,
      total_poll_appearances: 0,
      is_active: true,
      tags: ["Kenya", "Governor", "Kirinyaga", "UDA"]
    },
    {
      id: 21,
      full_name: "Johnson Sakaja",
      photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Johnson_Sakaja_in_2023.jpg/250px-Johnson_Sakaja_in_2023.jpg",
      title: "Governor, Nairobi County",
      country: "Kenya",
      party: "United Democratic Alliance (UDA)",
      party_color: "#32CD32",
      office: "Nairobi County City Hall",
      bio: "Governor of Nairobi City County, former Senator. Pushing for urban regeneration, school feeding programs (Dishi na County), and digitized county services.",
      date_of_birth: "1985-02-02",
      approval_rating: 48.9,
      total_poll_appearances: 0,
      is_active: true,
      tags: ["Kenya", "Governor", "Nairobi", "UDA"]
    },
    {
      id: 22,
      full_name: "Gladys Wanga",
      photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/Gladys_Wanga.jpg/250px-Gladys_Wanga.jpg",
      title: "Governor, Homa Bay County",
      country: "Kenya",
      party: "Orange Democratic Movement (ODM)",
      party_color: "#F08080",
      office: "Homa Bay County Governor's Office",
      bio: "Governor of Homa Bay County, former County Woman Representative. Spearheading local tax collection automation, maternal health services expansion, and climate-resilient farming.",
      date_of_birth: "1981-03-07",
      approval_rating: 58.1,
      total_poll_appearances: 0,
      is_active: true,
      tags: ["Kenya", "Governor", "Homa Bay", "ODM"]
    },
    {
      id: 23,
      full_name: "Dr. Anyang' Nyong'o",
      photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Anyang_Nyong%27o_2023.jpg/250px-Anyang_Nyong%27o_2023.jpg",
      title: "Governor, Kisumu County",
      country: "Kenya",
      party: "Orange Democratic Movement (ODM)",
      party_color: "#F08080",
      office: "Kisumu County Governor's Office",
      bio: "Governor of Kisumu County, former Senator and Minister. Renowned academic focusing on urban planning, lake-front economic zone development, and universal healthcare pilots.",
      date_of_birth: "1945-10-10",
      approval_rating: 54.6,
      total_poll_appearances: 0,
      is_active: true,
      tags: ["Kenya", "Governor", "Kisumu", "ODM"]
    },
    {
      id: 24,
      full_name: "Irungu Kang'ata",
      photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Irungu_Kang%27ata_2023.jpg/250px-Irungu_Kang%27ata_2023.jpg",
      title: "Governor, Murang'a County",
      country: "Kenya",
      party: "United Democratic Alliance (UDA)",
      party_color: "#32CD32",
      office: "Murang'a County Headquarters",
      bio: "Governor of Murang'a County, former Senator and MP. Pioneer of automated dairy farming subsidies (Kang'ata Care), digital hospital records, and local trade programs.",
      date_of_birth: "1980-01-01",
      approval_rating: 56.8,
      total_poll_appearances: 0,
      is_active: true,
      tags: ["Kenya", "Governor", "Muranga", "UDA"]
    },
    {
      id: 25,
      full_name: "Fatuma Achani",
      photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Fatuma_Achani_2023.jpg/250px-Fatuma_Achani_2023.jpg",
      title: "Governor, Kwale County",
      country: "Kenya",
      party: "United Democratic Alliance (UDA)",
      party_color: "#32CD32",
      office: "Kwale County Governor's Office",
      bio: "First female governor in the coastal region. Pushing for tourism revival, blue economy integration, girl-child education, and land adjudication programs.",
      date_of_birth: "1978-08-16",
      approval_rating: 51.2,
      total_poll_appearances: 0,
      is_active: true,
      tags: ["Kenya", "Governor", "Kwale", "UDA"]
    },
    {
      id: 26,
      full_name: "Ken Lusaka",
      photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Ken_Lusaka_2023.jpg/250px-Ken_Lusaka_2023.jpg",
      title: "Governor, Bungoma County",
      country: "Kenya",
      party: "Ford Kenya",
      party_color: "#008080",
      office: "Bungoma County Headquarters",
      bio: "Governor of Bungoma County, former Senate Speaker. Focused on agricultural input distribution, rural roads improvement, and sugar factory restructuring.",
      date_of_birth: "1963-01-02",
      approval_rating: 47.5,
      total_poll_appearances: 0,
      is_active: true,
      tags: ["Kenya", "Governor", "Bungoma", "FordKenya"]
    },
    {
      id: 27,
      full_name: "Mutula Kilonzo Jr.",
      photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Mutula_Kilonzo_Jr.jpg/250px-Mutula_Kilonzo_Jr.jpg",
      title: "Governor, Makueni County",
      country: "Kenya",
      party: "Wiper Democratic Movement",
      party_color: "#0033A0",
      office: "Makueni County Governor's Office",
      bio: "Governor of Makueni County, former Senator. Champion of civic participation, sand conservation, solar-powered water irrigation, and community health networks.",
      date_of_birth: "1975-06-25",
      approval_rating: 55.2,
      total_poll_appearances: 0,
      is_active: true,
      tags: ["Kenya", "Governor", "Makueni", "Wiper"]
    },
    {
      id: 28,
      full_name: "Cecily Mbarire",
      photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Cecily_Mbarire_2023.jpg/250px-Cecily_Mbarire_2023.jpg",
      title: "Governor, Embu County",
      country: "Kenya",
      party: "United Democratic Alliance (UDA)",
      party_color: "#32CD32",
      office: "Embu County Governor's Office",
      bio: "Governor of Embu County, veteran parliamentarian. Pushing for coffee/tea value addition, water security programs, and upgrading local trading hubs.",
      date_of_birth: "1972-12-26",
      approval_rating: 50.7,
      total_poll_appearances: 0,
      is_active: true,
      tags: ["Kenya", "Governor", "Embu", "UDA"]
    },
    {
      id: 29,
      full_name: "Abdi Guyo",
      photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Abdi_Guyo_2023.jpg/250px-Abdi_Guyo_2023.jpg",
      title: "Governor, Isiolo County",
      country: "Kenya",
      party: "Jubilee Party",
      party_color: "#FF0000",
      office: "Isiolo County Headquarters",
      bio: "Governor of Isiolo County, former Nairobi County Assembly Majority Leader. Focusing on dryland agriculture, peace building initiatives, and regional logistics hub expansion.",
      date_of_birth: "1981-01-01",
      approval_rating: 46.3,
      total_poll_appearances: 0,
      is_active: true,
      tags: ["Kenya", "Governor", "Isiolo", "Jubilee"]
    },
    {
      id: 30,
      full_name: "Kalonzo Musyoka",
      photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Kalonzo_Musyoka.jpg/250px-Kalonzo_Musyoka.jpg",
      title: "Wiper Party Leader / Former Vice President",
      country: "Kenya",
      party: "Wiper Democratic Movement",
      party_color: "#0033A0",
      office: "Wiper Headquarters / Azimio Principal",
      bio: "Co-principal of the Azimio coalition, former Vice President. Championing social justice, judicial independence, and alternative economic models for Kenya 2027.",
      date_of_birth: "1953-12-24",
      approval_rating: 52.1,
      total_poll_appearances: 1,
      is_active: true,
      tags: ["Kenya", "Presidential Candidate", "Wiper", "Azimio"]
    },
    {
      id: 31,
      full_name: "Rigathi Gachagua",
      photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9b/Rigathi_Gachagua_-_2023_%28cropped%29.jpg/250px-Rigathi_Gachagua_-_2023_%28cropped%29.jpg",
      title: "Former Deputy President",
      country: "Kenya",
      party: "Independent / Mt. Kenya Alliance Focus",
      party_color: "#FFCC00",
      office: "Former Deputy President's Secretariat",
      bio: "Former Deputy President. Pushing for agricultural sector reforms, tea/coffee farmer guarantees, and regional economic revitalization.",
      date_of_birth: "1965-02-28",
      approval_rating: 46.5,
      total_poll_appearances: 0,
      is_active: true,
      tags: ["Kenya", "Presidential Candidate", "Independent"]
    },
    {
      id: 32,
      full_name: "Prof. Kithure Kindiki",
      photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/Kithure_Kindiki_2024.jpg/250px-Kithure_Kindiki_2024.jpg",
      title: "Deputy President",
      country: "Kenya",
      party: "United Democratic Alliance (UDA)",
      party_color: "#32CD32",
      office: "Deputy President's Office, Harambee Annex",
      bio: "Deputy President of the Republic of Kenya, former Interior Cabinet Secretary and Senate Majority Leader. Promotes national security, law and order, and public sector efficiency.",
      date_of_birth: "1972-07-16",
      approval_rating: 51.4,
      total_poll_appearances: 0,
      is_active: true,
      tags: ["Kenya", "Presidential Candidate", "UDA", "Executive"]
    },
    {
      id: 33,
      full_name: "Wycliffe Musalia Mudavadi",
      photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Musalia_Mudavadi_2023.jpg/250px-Musalia_Mudavadi_2023.jpg",
      title: "Prime Cabinet Secretary",
      country: "Kenya",
      party: "Amani National Congress (ANC)",
      party_color: "#008000",
      office: "Office of the Prime Cabinet Secretary / Foreign Affairs CS",
      bio: "Prime Cabinet Secretary and Cabinet Secretary for Foreign & Diaspora Affairs. Focusing on international trade, diplomatic relations, and economic policy coordination.",
      date_of_birth: "1960-09-21",
      approval_rating: 48.7,
      total_poll_appearances: 0,
      is_active: true,
      tags: ["Kenya", "Presidential Candidate", "ANC", "Executive"]
    },
    {
      id: 34,
      full_name: "Okiya Omtatah",
      photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/Okiya_Omtatah_Okoiti_2023.jpg/250px-Okiya_Omtatah_Okoiti_2023.jpg",
      title: "Senator for Busia County / Human Rights Activist",
      country: "Kenya",
      party: "National Reconstruction Alliance (NRA)",
      party_color: "#FF5733",
      office: "Senate of Kenya / Busia County Office",
      bio: "Busia Senator, leading public interest litigation activist. Pushing for constitutional enforcement, debt accountability, and protection of citizen taxes.",
      date_of_birth: "1964-11-30",
      approval_rating: 59.3,
      total_poll_appearances: 0,
      is_active: true,
      tags: ["Kenya", "Presidential Candidate", "Senator", "NRA"]
    },
    {
      id: 35,
      full_name: "Jimi Wanjigi",
      photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1f/Jimi_Wanjigi.jpg/250px-Jimi_Wanjigi.jpg",
      title: "Safina Party Leader / Businessman",
      country: "Kenya",
      party: "Safina Party",
      party_color: "#000080",
      office: "Safina Party Headquarters",
      bio: "Businessman and political strategist. Promoting public debt restructuring, structural economic recovery plans, and youth empowerment.",
      date_of_birth: "1962-11-17",
      approval_rating: 42.1,
      total_poll_appearances: 0,
      is_active: true,
      tags: ["Kenya", "Presidential Candidate", "Safina"]
    },
    {
      id: 36,
      full_name: "Dr. Fred Matiang'i",
      photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Fred_Matiang%27i_2022.jpg/250px-Fred_Matiang%27i_2022.jpg",
      title: "Former Interior Cabinet Secretary",
      country: "Kenya",
      party: "Prospective Independent Candidate",
      party_color: "#4A0E4E",
      office: "Former Cabinet Secretary Secretariat",
      bio: "Former powerful Cabinet Secretary for Interior and Coordination of National Government. Spearheaded digital school curriculum transitions, security reforms, and infrastructure coordination.",
      date_of_birth: "1967-01-01",
      approval_rating: 53.6,
      total_poll_appearances: 0,
      is_active: true,
      tags: ["Kenya", "Presidential Candidate", "Independent"]
    },
    {
      id: 37,
      full_name: "Prof. George Wajackoyah",
      photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/George_Wajackoyah.jpg/250px-George_Wajackoyah.jpg",
      title: "Roots Party Leader",
      country: "Kenya",
      party: "Roots Party of Kenya",
      party_color: "#800080",
      office: "Roots Party Headquarters",
      bio: "Lawyer and academic. Pushing for alternative agriculture policies (wildlife, hemp), anti-corruption reforms, and restructuring of international debt treaties.",
      date_of_birth: "1959-10-24",
      approval_rating: 41.2,
      total_poll_appearances: 0,
      is_active: true,
      tags: ["Kenya", "Presidential Candidate", "Roots"]
    },
    {
      id: 38,
      full_name: "David Waihiga Mwaure",
      photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/David_Waihiga_Mwaure.jpg/250px-David_Waihiga_Mwaure.jpg",
      title: "Agano Party Leader / Advocate",
      country: "Kenya",
      party: "Agano Party",
      party_color: "#FF8C00",
      office: "Agano Party Secretariat",
      bio: "Lawyer and political leader. Championing integrity-driven governance, recovery of stolen public assets, and family-value-centric public policy.",
      date_of_birth: "1956-11-20",
      approval_rating: 44.8,
      total_poll_appearances: 0,
      is_active: true,
      tags: ["Kenya", "Presidential Candidate", "Agano"]
    }
  ];

  DB.politicians = seedPoliticians;

  // Seed Polls
  const seedPolls: Poll[] = [
    {
      id: 1,
      title: "Who should be Kenya's Next President in the Upcoming General Election?",
      description: "As national debates escalate regarding Kenya's economic trajectory, national debt structure, and agricultural subsidies, who would you trust to steer the country toward prosperity?",
      category: "Election",
      status: "active",
      poll_type: "single_choice",
      options: [
        { id: 101, poll_id: 1, label: "William Ruto", description: "Incumbent President - UDA leadership", photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/William_Ruto_in_2023.jpg/250px-William_Ruto_in_2023.jpg", party: "United Democratic Alliance", party_color: "#32CD32", vote_count: 3624, order: 1 },
        { id: 102, poll_id: 1, label: "Raila Odinga", description: "AUC Chair Representative - Opposition coalition", photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Raila_Amolo_Odinga_2009_%28cropped%29.jpg/250px-Raila_Amolo_Odinga_2009_%28cropped%29.jpg", party: "Orange Democratic Movement", party_color: "#F08080", vote_count: 4210, order: 2 },
        { id: 103, poll_id: 1, label: "Kalonzo Musyoka", description: "Wiper Democratic Movement - Azimio principal", photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Kalonzo_Musyoka.jpg/250px-Kalonzo_Musyoka.jpg", party: "Wiper Democratic Movement", party_color: "#0033A0", vote_count: 598, order: 3 }
      ],
      created_by: 2,
      created_at: "2026-05-10T12:00:00Z",
      closes_at: "2026-08-31T23:59:59Z",
      total_votes: 8432,
      is_featured: true,
      allow_comments: true,
      tags: ["Elections", "Kenya", "UDA", "ODM"],
      country: "Kenya",
      view_count: 14205,
    },
    {
      id: 2,
      title: "Do you approve of the current government's handling of national inflation and the economy?",
      description: "Cast your vote on the executive policies introduced to combat global inflationary pressures, food costs, taxation adjustments, and structural national investments.",
      category: "Approval Rating",
      status: "active",
      poll_type: "yes_no",
      options: [
        { id: 201, poll_id: 2, label: "Approve (YES)", description: "The policies are necessary for long-term fiscal stabilization.", photo_url: "https://ui-avatars.com/api/?name=YES&background=10B981&color=ffffff&bold=true", party: "Pro-Government", party_color: "#10B981", vote_count: 1980, order: 1 },
        { id: 202, poll_id: 2, label: "Disapprove (NO)", description: "The current taxation policies and high costs are unsustainable for average citizens.", photo_url: "https://ui-avatars.com/api/?name=NO&background=EF4444&color=ffffff&bold=true", party: "Opposition Align", party_color: "#EF4444", vote_count: 3231, order: 2 }
      ],
      created_by: 3,
      created_at: "2026-05-15T09:30:00Z",
      closes_at: "2026-07-15T23:59:59Z",
      total_votes: 5211,
      is_featured: false,
      allow_comments: true,
      tags: ["Economy", "Inflation", "Taxation"],
      country: "Global",
      view_count: 9814,
    },
    {
      id: 3,
      title: "Which political party do you trust most to manage and fund the national health service?",
      description: "A comprehensive assessment of rival health plans, staff salaries, wait time reductions, and local hospital funding proposals across platforms.",
      category: "Policy",
      status: "active",
      poll_type: "multiple_choice",
      options: [
        { id: 301, poll_id: 3, label: "Labour Party NHS Initiative", description: "Focused on structural staff recruitment and wait-list reduction plans.", photo_url: "https://ui-avatars.com/api/?name=Labour&background=E4003B&color=ffffff&bold=true", party: "Labour Party", party_color: "#E4003B", vote_count: 1845, order: 1 },
        { id: 302, poll_id: 3, label: "Conservative Party Funding Strategy", description: "Encouraging technology deployment, private-sector partnerships, and targeted allocations.", photo_url: "https://ui-avatars.com/api/?name=Tory&background=0087DC&color=ffffff&bold=true", party: "Conservative Party", party_color: "#0087DC", vote_count: 1025, order: 2 },
        { id: 303, poll_id: 3, label: "Liberal Democrats Care Pledge", description: "Pushing free personal care structural modifications and community clinics support.", photo_url: "https://ui-avatars.com/api/?name=LibDem&background=FFD700&color=000000&bold=true", party: "Liberal Democrats", party_color: "#FFD700", vote_count: 1020, order: 3 }
      ],
      created_by: 2,
      created_at: "2026-05-18T14:00:00Z",
      closes_at: "2026-06-30T17:00:00Z",
      total_votes: 3890,
      is_featured: false,
      allow_comments: true,
      tags: ["Policy", "Healthcare", "UK", "NHS"],
      country: "UK",
      view_count: 5122,
    },
    {
      id: 4,
      title: "Should the statutory voting age be lowered to 16 for all national and civic elections?",
      description: "Proponents argue that 16-year-olds can work, pay income tax, and should participate in shaping democracy. Opponents believe voting requires greater maturity and civil stability.",
      category: "Referendum",
      status: "active",
      poll_type: "yes_no",
      options: [
        { id: 401, poll_id: 4, label: "Yes, Lower Voting Age", description: "Young adults deserve a genuine say in policies affecting their education, climate, and careers.", photo_url: "https://ui-avatars.com/api/?name=Lower+16&background=10B981&color=ffffff&bold=true", party: "Reform Group", party_color: "#10B981", vote_count: 6512, order: 1 },
        { id: 402, poll_id: 4, label: "No, Keep at 18", description: "Maintain consistency with civil contracting limits, jury service, and other legal age limits.", photo_url: "https://ui-avatars.com/api/?name=Keep+18&background=EF4444&color=ffffff&bold=true", party: "Conservatives", party_color: "#EF4444", vote_count: 5533, order: 2 }
      ],
      created_by: 1,
      created_at: "2026-05-01T08:00:00Z",
      closes_at: "2026-06-25T12:00:00Z",
      total_votes: 12045,
      is_featured: false,
      allow_comments: true,
      tags: ["Referendum", "Democracy", "Reform"],
      country: "Global",
      view_count: 18944,
    },
    {
      id: 5,
      title: "Rate the US Presidential Administration's Performance in its First 100 Days",
      description: "Provide an overall approval rating assessment of the administration's progress on security, international relations, infrastructure development, and foreign trade.",
      category: "Approval Rating",
      status: "active",
      poll_type: "approval_rating", // For YES-NO or score options
      options: [
        { id: 501, poll_id: 5, label: "Excellent Performance (9-10)", description: "Outstanding achievements exceeding broad policy expectations.", photo_url: "https://ui-avatars.com/api/?name=Excellent&background=10B981&color=ffffff&bold=true", party: "High Approval", party_color: "#10b981", vote_count: 2410, order: 1 },
        { id: 502, poll_id: 5, label: "Moderate/Satisfactory Performance (5-8)", description: "Standard execution of duties with room for fiscal program improvement.", photo_url: "https://ui-avatars.com/api/?name=Moderate&background=F5A623&color=ffffff&bold=true", party: "Moderate Approval", party_color: "#F5A623", vote_count: 3124, order: 2 },
        { id: 503, poll_id: 5, label: "Poor/Disapprove Performance (1-4)", description: "Unsatisfactory decisions, international policy deficits, or failure to deliver promises.", photo_url: "https://ui-avatars.com/api/?name=Disapprove&background=EF4444&color=ffffff&bold=true", party: "Disapproval", party_color: "#EF4444", vote_count: 1700, order: 3 }
      ],
      created_by: 2,
      created_at: "2026-05-12T07:15:00Z",
      closes_at: "2026-07-20T23:59:00Z",
      total_votes: 7234,
      is_featured: false,
      allow_comments: true,
      tags: ["USA", "Approval", "President", "Executive"],
      country: "USA",
      view_count: 11200,
    },
    {
      id: 6,
      title: "Which African Leader has demonstrated the most impact on Regional Trade & Integration in 2025?",
      description: "Regional economic pacts (AfCFTA), currency coordination, cross-border railway lines development, and environmental cooperation. Cast your verdict on who deserves recognition.",
      category: "Leadership",
      status: "active",
      poll_type: "single_choice",
      options: [
        { id: 601, poll_id: 6, label: "Cyril Ramaphosa", description: "G20 host representing South Africa strategy", photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/Cyril_Ramaphosa_in_2026.jpg/250px-Cyril_Ramaphosa_in_2026.jpg", party: "ANC Party", party_color: "#006600", vote_count: 5120, order: 1 },
        { id: 602, poll_id: 6, label: "William Ruto", description: "Climate integration initiatives leader", photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/William_Ruto_in_2023.jpg/250px-William_Ruto_in_2023.jpg", party: "UDA Party", party_color: "#32CD32", vote_count: 4890, order: 2 },
        { id: 603, poll_id: 6, label: "Bola Tinubu", description: "Infrastructure program sponsor in Nigeria", photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Bola_Tinubu_in_2023.jpg/250px-Bola_Tinubu_in_2023.jpg", party: "APC Party", party_color: "#10B981", vote_count: 3218, order: 3 },
        { id: 604, poll_id: 6, label: "Samia Suluhu Hassan", description: "Trade pact expansion sponsor in Tanzania", photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Samia_Suluhu_Hassan_in_2021.jpg/250px-Samia_Suluhu_Hassan_in_2021.jpg", party: "CCM Party", party_color: "#FF8C00", vote_count: 2450, order: 4 }
      ],
      created_by: 3,
      created_at: "2026-05-05T15:20:00Z",
      closes_at: "2026-12-31T23:59:59Z",
      total_votes: 15678,
      is_featured: false,
      allow_comments: true,
      tags: ["Leadership", "Africa", "Trade", "AfCFTA"],
      country: "Global",
      view_count: 22441,
    }
  ];

  DB.polls = seedPolls;

  // Let's seed initial user votes so voters history are populated
  DB.votes = [
    { id: 1, poll_id: 1, option_ids: [102], user_id: 4, ip_hash: "abcd1234hash", voted_at: "2026-05-11T12:00:00Z", device_type: "Mobile" },
    { id: 2, poll_id: 2, option_ids: [202], user_id: 4, ip_hash: "abcd1234hash", voted_at: "2026-05-16T15:30:00Z", device_type: "Mobile" }
  ];

  // Seed Comments
  const seedComments: Comment[] = [
    {
      id: 1,
      poll_id: 1,
      user_id: 3,
      user_name: "Dr. David Kinyua",
      user_avatar: "https://ui-avatars.com/api/?name=David+Kinyua&background=3b82f6&color=ffffff&bold=true",
      user_verified: true,
      user_role: "analyst",
      content: "The latest surveys indicate that the youth voter registration turnouts could swing this election significantly. ODM has been focusing heavily on rural youth entrepreneurship, whereas UDA relies on infrastructure expansion projects.",
      created_at: "2026-05-10T14:30:00Z",
      likes: 24,
    },
    {
      id: 2,
      poll_id: 1,
      user_id: 4,
      user_name: "Jane Doe",
      user_avatar: "https://ui-avatars.com/api/?name=Jane+Doe&background=10b981&color=ffffff&bold=true",
      user_verified: false,
      user_role: "citizen",
      content: "I am voting based on the inflation and agricultural subsidy policies. It's time our representatives prioritize transparent budget allocations rather than political slogans.",
      created_at: "2026-05-11T09:00:00Z",
      likes: 12,
      parent_id: 1, // reply to David
    },
    {
      id: 3,
      poll_id: 1,
      user_id: 2,
      user_name: "Sarah Jenkins",
      user_avatar: "https://ui-avatars.com/api/?name=Sarah+Jenkins&background=F5A623&color=0A1628&bold=true",
      user_verified: true,
      user_role: "journalist",
      content: "Excellent summaries. Our newsroom will be releasing a major deep-dive podcast discussing this specific poll tomorrow morning. The visual layouts of candidates have been extremely helpful.",
      created_at: "2026-05-12T10:15:00Z",
      likes: 8,
    },
    {
      id: 4,
      poll_id: 2,
      user_id: 3,
      user_name: "Dr. David Kinyua",
      user_avatar: "https://ui-avatars.com/api/?name=David+Kinyua&background=3b82f6&color=ffffff&bold=true",
      user_verified: true,
      user_role: "analyst",
      content: "The disapprovals continue to expand due to currency fluctuations. Central bank measures have partially contained inflation but higher excise rates on small-scale traders maintain significant local resistance.",
      created_at: "2026-05-16T10:00:00Z",
      likes: 19,
    }
  ];

  DB.comments = seedComments;

  // Seed News
  const seedNews: NewsItem[] = [
    {
      id: 1,
      title: "Voters Express Deep Concerns Over Cost of Living Index",
      summary: "In a sweeping new survey, voters signal that food inflation, local taxes, and diesel pricing adjustments remain their absolute number one priority ahead of the fiscal planning sessions.",
      image_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Price_tags_in_a_shop.JPEG/300px-Price_tags_in_a_shop.JPEG",
      source_url: "https://www.politico.com",
      source_name: "Politico Insight",
      published_at: "2026-05-25T14:30:22Z",
      related_poll_id: 2,
      tags: ["Economy", "Inflation", "Taxation"],
      country: "Global"
    },
    {
      id: 2,
      title: "Rival Parties Convene National Panels on Public NHS Funding Standards",
      summary: "The Prime Minister meets legislative delegates to compromise on staffing ratios, hospital equipment upgrades, and nurse recruitment strategies that became critical debate points.",
      image_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/NHS_health_checks_wellbeing_service.jpg/300px-NHS_health_checks_wellbeing_service.jpg",
      source_url: "https://www.bbc.com/news",
      source_name: "BBC News",
      published_at: "2026-05-24T09:12:00Z",
      related_poll_id: 3,
      tags: ["Healthcare", "UK", "NHS"],
      country: "UK"
    },
    {
      id: 3,
      title: "Kenya Presidential Contenders Unveil Competitive Policy Declarations",
      summary: "Leading delegates present economic pillars focusing on local manufacturing, youth startup credits, and environmental pacts as ODM and UDA increase voter outreach tours.",
      image_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/ODM_rally_at_Kibera.jpg/300px-ODM_rally_at_Kibera.jpg",
      source_url: "https://www.standardmedia.co.ke",
      source_name: "The Standard",
      published_at: "2026-05-23T11:00:00Z",
      related_poll_id: 1,
      tags: ["Elections", "Kenya", "ODM", "UDA"],
      country: "Kenya"
    },
    {
      id: 4,
      title: "Draft Bill Proposes Shifting National Referendum Age Requirements",
      summary: "Constitutional reform organizations table an official memo arguing teenagers contribute significantly to workforce taxes and deserve representative influence in municipal development rules.",
      image_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Secret_ballot_box.jpg/300px-Secret_ballot_box.jpg",
      source_url: "https://www.reuters.com",
      source_name: "Reuters",
      published_at: "2026-05-21T07:45:00Z",
      related_poll_id: 4,
      tags: ["Referendum", "Democracy", "Civic Reform"],
      country: "Global"
    },
    {
      id: 5,
      title: "Presidential Term Assessments Focus heavily on International Trade Balance Strategy",
      summary: "Analysts evaluate local manufacturing output increases and foreign tariff adjustments implemented by the administration to evaluate if first-quarter milestones were met.",
      image_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Official_Portrait_of_President_Biden.jpg/300px-Official_Portrait_of_President_Biden.jpg",
      source_url: "https://www.fivethirtyeight.com",
      source_name: "FiveThirtyEight Analytics",
      published_at: "2026-05-19T18:00:00Z",
      related_poll_id: 5,
      tags: ["USA", "Approval", "Executive"],
      country: "USA"
    },
    {
      id: 6,
      title: "AfCFTA Progress Receives Substantial Regional Backing During Peak Summit",
      summary: "Heads of state conclude agreements lowering tariffs on processed goods, seeking to double intra-continental cargo movements by end of 2028 with unified customs databases.",
      image_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/AfCFTA_secretariat_building.jpg/300px-AfCFTA_secretariat_building.jpg",
      source_url: "https://www.aljazeera.com",
      source_name: "Al Jazeera",
      published_at: "2026-05-18T16:20:00Z",
      related_poll_id: 6,
      tags: ["Africa", "Trade", "AfCFTA"],
      country: "Global"
    }
  ];

  DB.newsItems = seedNews;

  // Populate parties from seeded politicians
  DB.parties = [];
  if (DB.politicians && Array.isArray(DB.politicians)) {
    const STOCK_UNSPLASH_PATTERN = /unsplash\.com\/photo-/;
    let healTriggered = false;

    DB.politicians.forEach(pol => {
      if (pol.party) {
        ensurePartyExists(pol.party, pol.party_color || "#3b82f6", pol.country);
      }

      // Auto-heal: If a politician has a legacy stock Unsplash photo, replace it with a real Wikipedia portrait
      // or a clean initials-based avatar so they are permanently cleared from your live Firestore DB!
      if (STOCK_UNSPLASH_PATTERN.test(pol.photo_url || "")) {
        healTriggered = true;
        console.log(`[DB Auto-Heal] Politician "${pol.full_name}" has legacy Unsplash image. Resolving real portrait...`);
        getWikipediaImageUrl(pol.full_name).then(wikiUrl => {
          if (wikiUrl) {
            pol.photo_url = wikiUrl;
            console.log(`[DB Auto-Heal] Resolved Wikipedia photo for "${pol.full_name}" -> ${wikiUrl}`);
          } else {
            pol.photo_url = `https://ui-avatars.com/api/?name=${encodeURIComponent(pol.full_name)}&background=0A1628&color=ffffff&size=256&bold=true`;
            console.log(`[DB Auto-Heal] No Wikipedia photo found for "${pol.full_name}". Configured clean initials avatar.`);
          }
          saveDatabase();
        }).catch(err => {
          console.error(`[DB Auto-Heal] Failed to resolve photo for "${pol.full_name}":`, err);
          pol.photo_url = `https://ui-avatars.com/api/?name=${encodeURIComponent(pol.full_name)}&background=0A1628&color=ffffff&size=256&bold=true`;
          saveDatabase();
        });
      }
    });

    if (healTriggered) {
      // Immediately run a sync so poll options also benefit from any initial fast updates
      setTimeout(() => {
        syncPollOptionsPhotos();
        saveDatabase();
      }, 1500);
    }
  }

  saveDatabase();
}

// Database Persistence helpers
// Only fills in missing poll option photos from politician records — never overwrites uploaded images
function syncPollOptionsPhotos() {
  if (!DB.polls || !DB.politicians) return;
  const STOCK_UNSPLASH_PATTERN = /unsplash\.com\/photo-/;
  DB.polls.forEach(poll => {
    if (poll.options && Array.isArray(poll.options)) {
      poll.options.forEach(opt => {
        // Only update if photo_url is blank, a placeholder avatar, or a stock Unsplash random person photo
        const isPlaceholderOrStock = !opt.photo_url ||
          opt.photo_url.includes("ui-avatars.com") ||
          STOCK_UNSPLASH_PATTERN.test(opt.photo_url);
        if (!isPlaceholderOrStock) return; // preserve custom/uploaded photos
        
        const matches = DB.politicians.find(p => 
          p.full_name.toLowerCase().trim() === opt.label.toLowerCase().trim() ||
          p.full_name.toLowerCase().includes(opt.label.toLowerCase().trim()) ||
          opt.label.toLowerCase().includes(p.full_name.toLowerCase().trim())
        );
        if (matches && matches.photo_url) {
          // Only use the politician photo if it's not itself a stock Unsplash photo
          if (!STOCK_UNSPLASH_PATTERN.test(matches.photo_url)) {
            opt.photo_url = matches.photo_url;
          }
        }
      });
    }
  });
}

function sanitizeLoadedDatabase() {
  if (!DB) return;
  const STOCK_UNSPLASH_PATTERN = /unsplash\.com\/photo-/;
  let changed = false;

  const politicianPhotoMap: { [key: string]: string } = {
    "william ruto": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/William_Ruto_in_2023.jpg/250px-William_Ruto_in_2023.jpg",
    "raila odinga": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Raila_Amolo_Odinga_2009_%28cropped%29.jpg/250px-Raila_Amolo_Odinga_2009_%28cropped%29.jpg",
    "joe biden": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Joe_Biden_presidential_portrait.jpg/250px-Joe_Biden_presidential_portrait.jpg",
    "donald trump": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/Official_Presidential_Portrait_of_President_Donald_J._Trump_%282025%29_%28cropped%29%282%29.jpg/250px-Official_Presidential_Portrait_of_President_Donald_J._Trump_%282025%29_%28cropped%29%282%29.jpg",
    "sir keir starmer": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/Official_portrait_of_Keir_Starmer.jpg/250px-Official_portrait_of_Keir_Starmer.jpg",
    "keir starmer": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/Official_portrait_of_Keir_Starmer.jpg/250px-Official_portrait_of_Keir_Starmer.jpg",
    "rishi sunak": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Official_portrait_of_Rishi_Sunak_%28cropped%29.jpg/250px-Official_portrait_of_Rishi_Sunak_%28cropped%29.jpg",
    "cyril ramaphosa": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/Cyril_Ramaphosa_in_2026.jpg/250px-Cyril_Ramaphosa_in_2026.jpg",
    "julius malema": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Julius_Malema_2019.jpg/250px-Julius_Malema_2019.jpg",
    "emmanuel macron": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Emmanuel_Macron_2025_%28cropped%29.jpg/250px-Emmanuel_Macron_2025_%28cropped%29.jpg",
    "olaf scholz": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Olaf_Scholz_2025_%28cropped%29.jpg/250px-Olaf_Scholz_2025_%28cropped%29.jpg",
    "kalonzo musyoka": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Kalonzo_Musyoka.jpg/250px-Kalonzo_Musyoka.jpg",
    "bola tinubu": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Bola_Tinubu_in_2023.jpg/250px-Bola_Tinubu_in_2023.jpg",
    "samia suluhu hassan": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Samia_Suluhu_Hassan_in_2021.jpg/250px-Samia_Suluhu_Hassan_in_2021.jpg",
    "anne waiguru": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/HE._Ann_Waiguru.jpg/250px-HE._Ann_Waiguru.jpg",
    "rigathi gachagua": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9b/Rigathi_Gachagua_-_2023_%28cropped%29.jpg/250px-Rigathi_Gachagua_-_2023_%28cropped%29.jpg"
  };

  // 1. Sanitize politicians
  if (DB.politicians && Array.isArray(DB.politicians)) {
    DB.politicians.forEach(pol => {
      if (STOCK_UNSPLASH_PATTERN.test(pol.photo_url || "")) {
        const lowerName = pol.full_name.toLowerCase().trim();
        let matched = false;
        for (const [key, value] of Object.entries(politicianPhotoMap)) {
          if (lowerName === key || lowerName.includes(key) || key.includes(lowerName)) {
            pol.photo_url = value;
            matched = true;
            break;
          }
        }
        if (!matched) {
          pol.photo_url = `https://ui-avatars.com/api/?name=${encodeURIComponent(pol.full_name)}&background=0A1628&color=ffffff&size=256&bold=true`;
        }
        console.log(`[DB Sanitize] Purged politician Unsplash photo: "${pol.full_name}" -> ${pol.photo_url}`);
        changed = true;
      }
    });
  }

  // 2. Sanitize polls options
  if (DB.polls && Array.isArray(DB.polls)) {
    DB.polls.forEach(poll => {
      if (poll.options && Array.isArray(poll.options)) {
        poll.options.forEach(opt => {
          if (STOCK_UNSPLASH_PATTERN.test(opt.photo_url || "")) {
            const lowerLabel = opt.label.toLowerCase().trim();
            let matched = false;
            for (const [key, value] of Object.entries(politicianPhotoMap)) {
              if (lowerLabel === key || lowerLabel.includes(key) || key.includes(lowerLabel)) {
                opt.photo_url = value;
                matched = true;
                break;
              }
            }
            if (!matched) {
              const foundPol = DB.politicians?.find(p => p.full_name.toLowerCase().includes(lowerLabel) || lowerLabel.includes(p.full_name.toLowerCase()));
              if (foundPol && foundPol.photo_url && !STOCK_UNSPLASH_PATTERN.test(foundPol.photo_url)) {
                opt.photo_url = foundPol.photo_url;
              } else {
                opt.photo_url = `https://ui-avatars.com/api/?name=${encodeURIComponent(opt.label)}&background=0A1628&color=ffffff&size=256&bold=true`;
              }
            }
            console.log(`[DB Sanitize] Purged poll option Unsplash photo: "${opt.label}" -> ${opt.photo_url}`);
            changed = true;
          }
        });
      }
    });
  }

  // 3. Sanitize news items
  if (DB.newsItems && Array.isArray(DB.newsItems)) {
    DB.newsItems.forEach(news => {
      if (STOCK_UNSPLASH_PATTERN.test(news.image_url || "")) {
        const titleLower = news.title.toLowerCase();
        let selectedUrl = "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Secret_ballot_box.jpg/300px-Secret_ballot_box.jpg";
        
        if (titleLower.includes("cost of living") || titleLower.includes("inflation") || titleLower.includes("price") || titleLower.includes("tax")) {
          selectedUrl = "https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Price_tags_in_a_shop.JPEG/300px-Price_tags_in_a_shop.JPEG";
        } else if (titleLower.includes("nhs") || titleLower.includes("health") || titleLower.includes("doctor") || titleLower.includes("nurse")) {
          selectedUrl = "https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/NHS_health_checks_wellbeing_service.jpg/300px-NHS_health_checks_wellbeing_service.jpg";
        } else if (titleLower.includes("kenya") || titleLower.includes("rally") || titleLower.includes("odm") || titleLower.includes("uda")) {
          selectedUrl = "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/ODM_rally_at_Kibera.jpg/300px-ODM_rally_at_Kibera.jpg";
        } else if (titleLower.includes("trade") || titleLower.includes("afcfta") || titleLower.includes("summit") || titleLower.includes("africa")) {
          selectedUrl = "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/AfCFTA_secretariat_building.jpg/300px-AfCFTA_secretariat_building.jpg";
        } else if (titleLower.includes("biden") || titleLower.includes("trump") || titleLower.includes("presidential term") || titleLower.includes("usa")) {
          selectedUrl = "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Official_Portrait_of_President_Biden.jpg/300px-Official_Portrait_of_President_Biden.jpg";
        }
        
        news.image_url = selectedUrl;
        console.log(`[DB Sanitize] Purged news item Unsplash image: "${news.title}" -> ${news.image_url}`);
        changed = true;
      }
    });
  }

  if (changed) {
    console.log("[DB Sanitize] Unsplash assets purged from active database. Persisting sanitization...");
    saveDatabase();
  }
}

function ensurePartyExists(partyName: string, partyColor: string, country: string) {
  if (!partyName || typeof partyName !== "string" || !partyName.trim()) return;
  const nameTrimmed = partyName.trim();
  const cleanCountry = country ? country.trim() : "Global";
  
  if (!DB.parties) {
    DB.parties = [];
  }
  
  const existingParty = DB.parties.find(p => 
    p.country && p.country.toLowerCase() === cleanCountry.toLowerCase() && (
      p.name.toLowerCase() === nameTrimmed.toLowerCase() || 
      p.abbreviation.toLowerCase() === nameTrimmed.toLowerCase() ||
      (p.name.toLowerCase() + " (" + p.abbreviation.toLowerCase() + ")") === nameTrimmed.toLowerCase()
    )
  );
  
  if (!existingParty) {
    let abbreviation = "";
    const parenMatch = nameTrimmed.match(/\(([^)]+)\)/);
    if (parenMatch && parenMatch[1]) {
      abbreviation = parenMatch[1].trim();
    } else {
      const words = nameTrimmed.split(/\s+/).filter(w => w.length > 0 && !["party", "of", "the", "and"].includes(w.toLowerCase()));
      if (words.length > 1) {
        abbreviation = words.map(w => w[0].toUpperCase()).join("").substring(0, 5);
      } else {
        abbreviation = nameTrimmed.substring(0, Math.min(nameTrimmed.length, 3)).toUpperCase();
      }
    }

    const cleanColor = partyColor ? partyColor.trim() : "#3b82f6";
    const colorHex = cleanColor.startsWith("#") ? cleanColor.substring(1) : cleanColor;
    const logoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(abbreviation)}&background=${colorHex}&color=ffffff&bold=true&size=128`;
    
    const nextPartyId = DB.parties.reduce((max, p) => p.id > max ? p.id : max, 0) + 1;
    
    const ideologyList = [
      "Representative Democracy & Fiscal Accountability",
      "Social Welfare, Economic Growth & Structural Reforms",
      "Centrist Progressivism & Devolution Policy Planning",
      "Civic Welfare & Constitutional Advocacy"
    ];
    const defaultIdeology = ideologyList[nextPartyId % ideologyList.length];
    
    const newParty = {
      id: nextPartyId,
      name: nameTrimmed.replace(/\s*\([^)]+\)\s*/gi, "").trim(),
      abbreviation: abbreviation || "PTY",
      logo_url: logoUrl,
      color: cleanColor,
      description: `Official political collective representing citizens in ${cleanCountry}. Pioneering comprehensive legislative policies, fiscal reviews, healthcare expansion strategies, and local administrative reforms to support voter prosperity and democratic balance.`,
      country: cleanCountry,
      founded_year: 2012 + (nextPartyId % 10),
      ideology: defaultIdeology,
      headquarters: `National HQ Secretariat Suite, ${cleanCountry}`,
      chairperson: "National Executive General Council"
    };
    
    DB.parties.push(newParty);
    console.log(`[Auto-generated Party] Registered: "${newParty.name}" [Abbr: ${newParty.abbreviation}] Country: ${newParty.country} Color: ${newParty.color}`);
  } else {
    if (partyColor && partyColor !== "#3b82f6" && existingParty.color === "#3b82f6") {
      existingParty.color = partyColor;
      const colorHex = partyColor.startsWith("#") ? partyColor.substring(1) : partyColor;
      existingParty.logo_url = `https://ui-avatars.com/api/?name=${encodeURIComponent(existingParty.abbreviation)}&background=${colorHex}&color=ffffff&bold=true&size=128`;
    }
  }
}

const SERVER_DB_DOC_ID = "master_db";
const SERVER_SECRET = "govtrack_secret_key_12345678901234567890123456789012345678901234";

let isTableInitialized = false;

async function ensureTableInitialized() {
  if (isTableInitialized || !pgPool) return;
  try {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS platform_state (
        id INT PRIMARY KEY DEFAULT 1,
        payload JSONB,
        saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    isTableInitialized = true;
    console.log("[DB] Database platform_state table initialized.");
  } catch (err) {
    console.error("[DB] Failed to initialize table, will retry on next request:", err);
  }
}

async function loadDatabase() {
  if (!pgPool) {
    console.error("[DB] PostgreSQL connection pool not initialized — falling back to seed data.");
    seedInitialData();
    return;
  }
  
  await ensureTableInitialized();

  try {
    // 2. Query existing payload
    const res = await pgPool.query('SELECT payload FROM platform_state WHERE id = 1');
    if (res.rows.length > 0 && res.rows[0].payload) {
      DB = res.rows[0].payload;
      
      // Ensure required properties exist in loaded DB state
      if (!DB.notifications) {
        DB.notifications = [];
      }
      if (!DB.developments) {
        DB.developments = [];
      }
      if (!DB.parties) {
        DB.parties = [];
      }
      if (!DB.settings) {
        DB.settings = {
          hero_image_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/General_Assembly_Hall.jpg/1280px-General_Assembly_Hall.jpg"
        };
      }
      if (DB.politicians && Array.isArray(DB.politicians)) {
        DB.politicians.forEach(pol => {
          if (pol.party) {
            ensurePartyExists(pol.party, pol.party_color || "#3b82f6", pol.country);
          }
        });
      }

      // --- PHOTO MIGRATION: Upgrade any politicians still using ui-avatars placeholders to real Wikipedia portraits ---
      // This runs on every load to ensure previously-saved data benefits from upgraded seed photo URLs.
      const UIAVATAR_PATTERN = /ui-avatars\.com/;
      const realPhotoMap: { [key: string]: string } = {
        "anne waiguru": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/HE._Ann_Waiguru.jpg/250px-HE._Ann_Waiguru.jpg",
        "johnson sakaja": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Johnson_Sakaja_in_2023.jpg/250px-Johnson_Sakaja_in_2023.jpg",
        "gladys wanga": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/Gladys_Wanga.jpg/250px-Gladys_Wanga.jpg",
        "anyang' nyong'o": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Anyang_Nyong%27o_2023.jpg/250px-Anyang_Nyong%27o_2023.jpg",
        "anyang nyong'o": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Anyang_Nyong%27o_2023.jpg/250px-Anyang_Nyong%27o_2023.jpg",
        "irungu kang'ata": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Irungu_Kang%27ata_2023.jpg/250px-Irungu_Kang%27ata_2023.jpg",
        "fatuma achani": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Fatuma_Achani_2023.jpg/250px-Fatuma_Achani_2023.jpg",
        "ken lusaka": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Ken_Lusaka_2023.jpg/250px-Ken_Lusaka_2023.jpg",
        "mutula kilonzo jr.": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Mutula_Kilonzo_Jr.jpg/250px-Mutula_Kilonzo_Jr.jpg",
        "mutula kilonzo jr": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Mutula_Kilonzo_Jr.jpg/250px-Mutula_Kilonzo_Jr.jpg",
        "cecily mbarire": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Cecily_Mbarire_2023.jpg/250px-Cecily_Mbarire_2023.jpg",
        "abdi guyo": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Abdi_Guyo_2023.jpg/250px-Abdi_Guyo_2023.jpg",
        "rigathi gachagua": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9b/Rigathi_Gachagua_-_2023_%28cropped%29.jpg/250px-Rigathi_Gachagua_-_2023_%28cropped%29.jpg",
        "kithure kindiki": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/Kithure_Kindiki_2024.jpg/250px-Kithure_Kindiki_2024.jpg",
        "wycliffe musalia mudavadi": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Musalia_Mudavadi_2023.jpg/250px-Musalia_Mudavadi_2023.jpg",
        "musalia mudavadi": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Musalia_Mudavadi_2023.jpg/250px-Musalia_Mudavadi_2023.jpg",
        "okiya omtatah": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/Okiya_Omtatah_Okoiti_2023.jpg/250px-Okiya_Omtatah_Okoiti_2023.jpg",
        "jimi wanjigi": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1f/Jimi_Wanjigi.jpg/250px-Jimi_Wanjigi.jpg",
        "fred matiang'i": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Fred_Matiang%27i_2022.jpg/250px-Fred_Matiang%27i_2022.jpg",
        "george wajackoyah": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/George_Wajackoyah.jpg/250px-George_Wajackoyah.jpg",
        "david waihiga mwaure": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/David_Waihiga_Mwaure.jpg/250px-David_Waihiga_Mwaure.jpg",
        "william ruto": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/William_Ruto_in_2023.jpg/250px-William_Ruto_in_2023.jpg",
        "raila odinga": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Raila_Amolo_Odinga_2009_%28cropped%29.jpg/250px-Raila_Amolo_Odinga_2009_%28cropped%29.jpg",
        "kalonzo musyoka": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Kalonzo_Musyoka.jpg/250px-Kalonzo_Musyoka.jpg"
      };
      let migrated = false;
      if (DB.politicians && Array.isArray(DB.politicians)) {
        DB.politicians.forEach(pol => {
          // Only upgrade if currently using a ui-avatars placeholder (meaning no real photo was set by admin)
          if (UIAVATAR_PATTERN.test(pol.photo_url || "")) {
            const lowerName = pol.full_name.toLowerCase().trim();
            for (const [key, value] of Object.entries(realPhotoMap)) {
              if (lowerName === key || lowerName.includes(key) || key.includes(lowerName)) {
                console.log(`[DB Photo Migration] Upgrading "${pol.full_name}" from ui-avatars placeholder to real Wikipedia portrait.`);
                pol.photo_url = value;
                migrated = true;
                break;
              }
            }
          }
        });
      }
      if (migrated) {
        console.log("[DB Photo Migration] Photo migration complete. Persisting upgraded photos to database...");
        await saveDatabase();
      }
      // --- END PHOTO MIGRATION ---

      syncPollOptionsPhotos();
      sanitizeLoadedDatabase();
      console.log(`[DB] Loaded from Aiven PostgreSQL: ${DB.polls.length} polls, ${DB.politicians.length} politicians, ${DB.newsItems.length} news items.`);
      return;
    }
    
    // No data in PostgreSQL database
    console.log("[DB] No existing data found in PostgreSQL — seeding initial data.");
    seedInitialData();
    await saveDatabase();
  } catch (err: any) {
    console.error("[DB] Error reading from PostgreSQL:", err?.message || err);
    throw err;
  }
}

async function saveDatabase() {
  if (!pgPool) {
    console.error("[DB] PostgreSQL connection pool not initialized, skipping save.");
    return;
  }
  const saveTask = async () => {
    try {
      syncPollOptionsPhotos();
      const payload = JSON.stringify(DB);
      
      const payloadBytes = Buffer.byteLength(payload, 'utf8');
      console.log(`[DB] Saving state to Aiven PostgreSQL... (${(payloadBytes / 1024).toFixed(1)}KB)`);
      
      // Upsert the state into the platform_state table
      await pgPool!.query(`
        INSERT INTO platform_state (id, payload, saved_at)
        VALUES (1, $1, NOW())
        ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, saved_at = EXCLUDED.saved_at;
      `, [payload]);
      
      console.log("[DB] Successfully saved state to Aiven PostgreSQL.");
    } catch (err: any) {
      console.error("[DB] Failed to persist database changes to PostgreSQL:", err?.message || err);
      throw err;
    }
  };

  pendingSavePromise = saveTask();
  await pendingSavePromise;
}

// Cache the promise so we load the database once, shared across requests/cold starts
let databaseLoadedPromise: Promise<void> | null = null;
let lastDbLoadTime = 0; // Track when DB was last loaded for TTL-based caching

function getDatabaseLoadedPromise(): Promise<void> {
  if (!databaseLoadedPromise) {
    databaseLoadedPromise = loadDatabase();
    lastDbLoadTime = Date.now();
  }
  return databaseLoadedPromise;
}

// Middleware to ensure database is loaded and caching is disabled before processing API requests
app.use(async (req, res, next) => {
  if (!req.path.startsWith("/api/")) {
    return next();
  }

  // CRITICAL BYPASS: Stateless utility routes (like image proxy/sharing) do NOT read or write the DB.
  // Bypassing them completely removes 95% of connection overhead during parallel page assets load!
  if (req.path.startsWith("/api/proxy-image") || req.path.startsWith("/api/share/image")) {
    return next();
  }

  // Force disable browser, CDN and proxy caching for all API requests to ensure fresh data
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");

  try {
    if (pgPool) {
      const isWriteRequest = req.method !== "GET";
      const now = Date.now();
      
      // Request-level coalescing & short 2-second caching for GET reads.
      // Force reload immediately for any write requests to prevent race overwrites.
      if (isWriteRequest || !databaseLoadedPromise || (now - lastDbLoadTime > 2000)) {
        lastDbLoadTime = now;
        databaseLoadedPromise = loadDatabase();
      }
      await databaseLoadedPromise;
    } else {
      await getDatabaseLoadedPromise();
    }
    next();
  } catch (err: any) {
    console.error("[Database Middleware] Error loading database from PostgreSQL:", err);
    // CRITICAL: Return a 500 error instead of silently falling back to a blank or default seed state!
    // This completely protects existing data from being accidentally overwritten by a blank/reset save.
    res.status(500).json({ 
      error: "Database connection failed. Please refresh or try again. Technical details: " + (err?.message || err) 
    });
  }
});

// loadDatabase() is now awaited in startServer() and in the middleware above

// ---------------------- API ROUTES ----------------------

// 1. AUTH API
app.post("/api/auth/register", async (req, res) => {
  const { display_name, email, password, country, role, bio } = req.body;
  if (!display_name || !email || !password) {
    return res.status(400).json({ error: "Display name, email and password are required." });
  }

  const existing = DB.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: "A user with this email already exists." });
  }

  const nextId = DB.users.reduce((max, u) => u.id > max ? u.id : max, 0) + 1;
  const newUser: User = {
    id: nextId,
    display_name,
    email,
    role: (role || "citizen") as User["role"],
    country: country || "Global",
    polls_created: 0,
    polls_voted: 0,
    joined_at: new Date().toISOString(),
    bio: bio || "",
    avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(display_name)}&background=random&bold=true`,
    verified: role === "journalist" || role === "analyst" ? true : false, // Verify analysts/journalists for convenience
  };

  DB.users.push(newUser);
  DB.credentials[email.toLowerCase()] = password;
  await saveDatabase();

  res.status(201).json({ user: newUser, token: `mock-token-usr-${newUser.id}` });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const user = DB.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  const correctPwd = DB.credentials[email.toLowerCase()];

  if (!user || correctPwd !== password) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  res.json({ user, token: `mock-token-usr-${user.id}` });
});

app.get("/api/auth/me", (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized access. No valid session token." });
  }
  const token = authHeader.substring(7);
  const match = token.match(/^mock-token-usr-(\d+)$/);
  if (!match) {
    return res.status(410).json({ error: "Session expired please log in again." });
  }
  const userId = parseInt(match[1]);
  const user = DB.users.find(u => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: "Account not found." });
  }
  res.json({ user });
});

// Helper to resolve authenticated user from mock JWT
function getAuthUser(req: express.Request): User | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.substring(7);
  const match = token.match(/^mock-token-usr-(\d+)$/);
  if (!match) return null;
  const userId = parseInt(match[1]);
  return DB.users.find(u => u.id === userId) || null;
}

// ---------------------- NOTIFICATION API ROUTES ----------------------
app.get("/api/notifications", (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized access. No valid session token." });
  }
  
  const userNotifs = (DB.notifications || [])
    .filter(n => n.user_id === user.id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
  res.json({ notifications: userNotifs });
});

app.post("/api/notifications/:id/read", async (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized access. No valid session token." });
  }
  
  const notifId = parseInt(req.params.id);
  const index = (DB.notifications || []).findIndex(n => n.id === notifId && n.user_id === user.id);
  if (index !== -1) {
    DB.notifications[index].is_read = true;
    await saveDatabase();
  }
  
  res.json({ success: true });
});

app.post("/api/notifications/mark-all-read", async (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized access. No valid session token." });
  }
  
  let changed = false;
  if (DB.notifications) {
    DB.notifications.forEach(n => {
      if (n.user_id === user.id && !n.is_read) {
        n.is_read = true;
        changed = true;
      }
    });
  }
  
  if (changed) {
    await saveDatabase();
  }
  
  res.json({ success: true });
});

app.get("/api/users/:id/votes", (req, res) => {
  const userId = parseInt(req.params.id);
  const userVotes = DB.votes.filter(v => v.user_id === userId);
  const history = userVotes.map(v => {
    const poll = DB.polls.find(p => p.id === v.poll_id);
    let votedChoiceLabel = "Unknown Choice";
    if (poll) {
      const option = poll.options.find(o => v.option_ids.includes(o.id));
      if (option) votedChoiceLabel = option.label;
    }
    return {
      id: v.id,
      poll_id: v.poll_id,
      poll_title: poll ? poll.title : "Redacted Polling Debates",
      voted_option_label: votedChoiceLabel,
      ip_hash_identifier: v.ip_hash ? v.ip_hash.substring(0, 8) : "Session Token Hash",
      created_at: v.voted_at
    };
  });
  res.json(history);
});

app.put("/api/auth/profile", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized." });
  }
  const token = authHeader.substring(7);
  const match = token.match(/^mock-token-usr-(\d+)$/);
  if (!match) return res.status(401).json({ error: "Invalid token." });
  const userId = parseInt(match[1]);
  const userIndex = DB.users.findIndex(u => u.id === userId);
  if (userIndex === -1) return res.status(404).json({ error: "User not found." });

  const { display_name, bio, country, avatar_url, role } = req.body;
  
  if (display_name) DB.users[userIndex].display_name = display_name;
  if (bio !== undefined) DB.users[userIndex].bio = bio;
  if (country) DB.users[userIndex].country = country;
  if (avatar_url) DB.users[userIndex].avatar_url = avatar_url;
  if (role && ["citizen", "journalist", "analyst", "admin"].includes(role)) {
    DB.users[userIndex].role = role as User["role"];
  }

  await saveDatabase();
  res.json({ user: DB.users[userIndex] });
});

app.get("/api/proxy-image", async (req, res) => {
  const url = req.query.url as string;
  if (!url) return res.status(400).send("No url provided");
  try {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    res.set("Content-Type", response.headers.get("content-type") || "image/jpeg");
    res.set("Cache-Control", "public, max-age=31536000");
    res.set("Access-Control-Allow-Origin", "*");
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).send("Failed to fetch image");
  }
});

// 2. POLLS READ API
app.get("/api/polls", (req, res) => {
  const { search, category, status, country, poll_type, date_range, sort } = req.query;
  
  let result = [...DB.polls];

  // Map created_by user profile
  result = result.map(p => {
    const creator = DB.users.find(u => u.id === p.created_by);
    return {
      ...p,
      created_by_user: creator ? {
        display_name: creator.display_name,
        avatar_url: creator.avatar_url,
        role: creator.role,
        verified: creator.verified
      } : undefined
    };
  });

  // Search keyword filter
  if (search) {
    const query = (search as string).toLowerCase();
    result = result.filter(p => p.title.toLowerCase().includes(query) || p.description.toLowerCase().includes(query));
  }

  // Category filter
  if (category) {
    const categories = (category as string).split(",");
    result = result.filter(p => categories.includes(p.category));
  }

  // Status Filter
  if (status && status !== "all") {
    const statuses = (status as string).split(",");
    result = result.filter(p => statuses.includes(p.status));
  }

  // Country Filter
  if (country && country !== "All") {
    result = result.filter(p => p.country.toLowerCase() === (country as string).toLowerCase() || p.country === "Global");
  }

  // Poll Type Filter
  if (poll_type) {
    const types = (poll_type as string).split(",");
    result = result.filter(p => types.includes(p.poll_type));
  }

  // Sorting
  if (sort) {
    if (sort === "Most Votes") {
      result.sort((a,b) => b.total_votes - a.total_votes);
    } else if (sort === "Most Recent") {
      result.sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sort === "Closing Soon") {
      result.sort((a,b) => {
        if (!a.closes_at) return 1;
        if (!b.closes_at) return -1;
        return new Date(a.closes_at).getTime() - new Date(b.closes_at).getTime();
      });
    } else if (sort === "Trending") {
      result.sort((a,b) => b.view_count - a.view_count);
    }
  } else {
    // Default: Featured first, then most recent
    result.sort((a,b) => {
      if (a.is_featured && !b.is_featured) return -1;
      if (!a.is_featured && b.is_featured) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }

  res.json(result);
});

app.get("/api/polls/:id", (req, res) => {
  const pollId = parseInt(req.params.id);
  const pollIndex = DB.polls.findIndex(p => p.id === pollId);
  if (pollIndex === -1) {
    return res.status(404).json({ error: "Poll not found." });
  }

  // Increment view count
  DB.polls[pollIndex].view_count += 1;
  saveDatabase();

  const poll = { ...DB.polls[pollIndex] };
  const creator = DB.users.find(u => u.id === poll.created_by);
  poll.created_by_user = creator ? {
    display_name: creator.display_name,
    avatar_url: creator.avatar_url,
    role: creator.role,
    verified: creator.verified
  } : undefined;

  res.json(poll);
});

// GET device metrics for a single poll (Mobile vs. Desktop vs. Tablet)
app.get("/api/polls/:id/device-metrics", (req, res) => {
  const pollId = parseInt(req.params.id);
  const poll = DB.polls.find(p => p.id === pollId);
  if (!poll) {
    return res.status(404).json({ error: "Poll not found." });
  }

  // Count actual votes in DB
  const actualVotes = DB.votes.filter(v => v.poll_id === pollId);
  const mobileVotesCount = actualVotes.filter(v => v.device_type === "Mobile").length;
  const desktopVotesCount = actualVotes.filter(v => v.device_type?.toLowerCase() === "desktop" || !v.device_type).length;
  const tabletVotesCount = actualVotes.filter(v => v.device_type === "Tablet").length;

  // Let's use a deterministic seed based on pollId so the numbers are stable for seeded polls
  // We want the total of mobile, desktop, tablet to match poll.total_votes or total votes casted
  const totalVotes = poll.total_votes;
  
  // Deterministic percentage generation based on pollId to ensure consistency
  const seed = (pollId * 17) % 100;
  // Let's say mobile is between 53% and 75%
  const mobilePct = 53 + (seed % 23); 
  // Let's say tablet is between 3% and 10%
  const tabletPct = 3 + ((seed * 7) % 8); 
  const desktopPct = 100 - mobilePct - tabletPct;

  // Distribute the total votes according to these percentages, blending in actual votes
  const simulatedTotal = Math.max(0, totalVotes - actualVotes.length);
  
  const simMobile = Math.round((simulatedTotal * mobilePct) / 100);
  const simTablet = Math.round((simulatedTotal * tabletPct) / 100);
  const simDesktop = Math.max(0, simulatedTotal - simMobile - simTablet);

  const finalMobile = mobileVotesCount + simMobile;
  const finalDesktop = desktopVotesCount + simDesktop;
  const finalTablet = tabletVotesCount + simTablet;
  const finalTotal = finalMobile + finalDesktop + finalTablet;

  res.json({
    poll_id: pollId,
    poll_title: poll.title,
    total_votes: finalTotal,
    metrics: {
      mobile: finalMobile,
      desktop: finalDesktop,
      tablet: finalTablet
    },
    percentages: {
      mobile: finalTotal > 0 ? parseFloat(((finalMobile / finalTotal) * 100).toFixed(1)) : 0,
      desktop: finalTotal > 0 ? parseFloat(((finalDesktop / finalTotal) * 100).toFixed(1)) : 0,
      tablet: finalTotal > 0 ? parseFloat(((finalTablet / finalTotal) * 100).toFixed(1)) : 0,
    }
  });
});

// 3. VOTING ACTIONS WITH DUPLICATE PREVENTION
app.post("/api/polls/:id/vote", async (req, res) => {
  const pollId = parseInt(req.params.id);
  const { option_ids, user_id, device_type } = req.body;
  const ip = req.ip || req.headers["x-forwarding-for"] || "127.0.0.1";
  
  // Use simple hashing logic
  const ip_hash = Buffer.from(String(ip)).toString("base64").substring(0, 10);

  if (!option_ids || !Array.isArray(option_ids) || option_ids.length === 0) {
    return res.status(400).json({ error: "You must select at least one option to vote." });
  }

  const pollIndex = DB.polls.findIndex(p => p.id === pollId);
  if (pollIndex === -1) {
    return res.status(404).json({ error: "Poll not found." });
  }

  const poll = DB.polls[pollIndex];
  if (poll.status !== "active") {
    return res.status(400).json({ error: "This poll is closed or inactive." });
  }

  if (poll.closes_at && new Date(poll.closes_at).getTime() < Date.now()) {
    poll.status = "closed";
    await saveDatabase();
    return res.status(400).json({ error: "This poll's voting window has expired." });
  }

  // Duplicate Prevention Check
  // Logged-in users: check by user_id ONLY (allows multiple users on same network)
  // Anonymous users: check by IP hash (prevent spam from same device)
  if (user_id) {
    const userAlreadyVoted = DB.votes.some(v => v.poll_id === pollId && v.user_id === user_id);
    if (userAlreadyVoted) {
      return res.status(400).json({ error: "You have already cast your vote in this political poll." });
    }
  } else {
    // Only apply IP check for anonymous/guest voters
    const ipAlreadyVoted = DB.votes.some(v => v.poll_id === pollId && v.ip_hash === ip_hash && !v.user_id);
    if (ipAlreadyVoted) {
      return res.status(400).json({ error: "A vote from your current network connection has already been submitted. Please log in to vote with your account." });
    }
  }

  // Record Vote
  const nextVoteId = DB.votes.reduce((max, v) => v.id > max ? v.id : max, 0) + 1;
  const newVote: Vote = {
    id: nextVoteId,
    poll_id: pollId,
    option_ids,
    user_id: user_id || null,
    ip_hash,
    voted_at: new Date().toISOString(),
    device_type: device_type || "Desktop"
  };

  DB.votes.push(newVote);

  // Increment Option vote counts & global counts
  poll.options = poll.options.map(option => {
    if (option_ids.includes(option.id)) {
      option.vote_count += 1;
    }
    return option;
  });

  poll.total_votes += 1;

  // Milestone triggers
  const milestones = [5, 10, 25, 50, 100, 250, 500, 1000, 5000, 10000];
  if (poll.created_by && milestones.includes(poll.total_votes)) {
    const nextNotifId = (DB.notifications || []).reduce((max, n) => n.id > max ? n.id : max, 0) + 1;
    const newNotif: AppNotification = {
      id: nextNotifId,
      user_id: poll.created_by,
      poll_id: pollId,
      poll_title: poll.title,
      type: "milestone",
      message: `Your poll "${poll.title}" has reached a milestone of ${poll.total_votes} votes!`,
      is_read: false,
      created_at: new Date().toISOString(),
      metadata: {
        vote_count: poll.total_votes,
      },
    };
    if (!DB.notifications) {
      DB.notifications = [];
    }
    DB.notifications.push(newNotif);
  }

  // Increment User state
  if (user_id) {
    const userIndex = DB.users.findIndex(u => u.id === user_id);
    if (userIndex !== -1) {
      DB.users[userIndex].polls_voted += 1;
    }
  }

  // Recalculate Politician ratings dynamically from updated poll states
  recalculatePoliticianRatings();

  await saveDatabase();

  res.status(200).json({ success: true, poll });
});

// Function to compute average approval rating for politicians dynamically from polls!
function recalculatePoliticianRatings() {
  DB.politicians.forEach(pol => {
    let appearances = 0;
    let approvalSum = 0;

    DB.polls.forEach(poll => {
      // Find options in this poll associated with this politician
      const matchedOptionIndex = poll.options.findIndex(o => o.label.toLowerCase() === pol.full_name.toLowerCase());
      if (matchedOptionIndex !== -1) {
        appearances += 1;
        const option = poll.options[matchedOptionIndex];
        const pct = poll.total_votes > 0 ? (option.vote_count / poll.total_votes) * 100 : 0;
        
        if (poll.poll_type === "yes_no" || poll.category === "Approval Rating") {
          // Weighted heavily
          approvalSum += pct;
        } else {
          approvalSum += pct;
        }
      }
    });

    if (appearances > 0) {
      pol.approval_rating = parseFloat((approvalSum / appearances).toFixed(1));
      pol.total_poll_appearances = appearances;
    }
  });
}

// 4. POLL USER VOTE HISTORY CHECKER
app.get("/api/polls/:id/user_voted", (req, res) => {
  const pollId = parseInt(req.params.id);
  const userId = req.query.user_id ? parseInt(req.query.user_id as string) : null;
  const ip = req.ip || req.headers["x-forwarding-for"] || "127.0.0.1";
  const ip_hash = Buffer.from(String(ip)).toString("base64").substring(0, 10);

  let votedMatch = null;

  if (userId) {
    // Logged-in user: only check their user_id (not IP)
    votedMatch = DB.votes.find(v => v.poll_id === pollId && v.user_id === userId);
  } else {
    // Anonymous user: check by IP
    votedMatch = DB.votes.find(v => v.poll_id === pollId && v.ip_hash === ip_hash && !v.user_id);
  }

  if (votedMatch) {
    return res.json({ voted: true, option_ids: votedMatch.option_ids });
  }

  res.json({ voted: false });
});

// 5. COMMENTS THREADING API
app.get("/api/polls/:id/comments", (req, res) => {
  const pollId = parseInt(req.params.id);
  const list = DB.comments.filter(c => c.poll_id === pollId);
  res.json(list);
});

app.post("/api/polls/:id/comments", async (req, res) => {
  const pollId = parseInt(req.params.id);
  const { user_id, content, parent_id } = req.body;

  if (!content || content.trim().length === 0) {
    return res.status(400).json({ error: "Comment text cannot be empty." });
  }

  const user = DB.users.find(u => u.id === user_id);
  if (!user) {
    return res.status(401).json({ error: "You must be logged in to participate in discussion threads." });
  }

  const nextCommentId = DB.comments.reduce((max, c) => c.id > max ? c.id : max, 0) + 1;
  const newComment: Comment = {
    id: nextCommentId,
    poll_id: pollId,
    user_id: user.id,
    user_name: user.display_name,
    user_avatar: user.avatar_url,
    user_verified: user.verified,
    user_role: user.role,
    content,
    created_at: new Date().toISOString(),
    likes: 0,
    parent_id: parent_id || null,
  };

  DB.comments.push(newComment);

  const poll = DB.polls.find(p => p.id === pollId);
  if (poll && poll.created_by && poll.created_by !== user.id) {
    const nextNotifId = (DB.notifications || []).reduce((max, n) => n.id > max ? n.id : max, 0) + 1;
    const newNotif: AppNotification = {
      id: nextNotifId,
      user_id: poll.created_by,
      poll_id: pollId,
      poll_title: poll.title,
      type: "comment",
      message: `${user.display_name} commented on your poll: "${poll.title}"`,
      is_read: false,
      created_at: new Date().toISOString(),
      metadata: {
        comment_id: newComment.id,
        comment_author: user.display_name,
      },
    };
    if (!DB.notifications) {
      DB.notifications = [];
    }
    DB.notifications.push(newNotif);
  }

  await saveDatabase();

  res.status(201).json(newComment);
});

app.post("/api/comments/:commentId/like", async (req, res) => {
  const commentId = parseInt(req.params.commentId);
  const commentIndex = DB.comments.findIndex(c => c.id === commentId);
  if (commentIndex === -1) {
    return res.status(404).json({ error: "Comment not found." });
  }
  DB.comments[commentIndex].likes += 1;
  await saveDatabase();
  res.json(DB.comments[commentIndex]);
});

// 6. POLITICIANS DIRECTORY API
app.get("/api/politicians", (req, res) => {
  const { search, country, party, sort } = req.query;
  let result = [...DB.politicians];

  if (search) {
    const s = (search as string).toLowerCase();
    result = result.filter(p => p.full_name.toLowerCase().includes(s) || p.office.toLowerCase().includes(s) || p.party.toLowerCase().includes(s));
  }

  if (country && country !== "All") {
    result = result.filter(p => p.country.toLowerCase() === (country as string).toLowerCase());
  }

  if (party) {
    result = result.filter(p => p.party.toLowerCase().includes((party as string).toLowerCase()));
  }

  if (sort) {
    if (sort === "Approval Rating (High→Low)") {
      result.sort((a,b) => b.approval_rating - a.approval_rating);
    } else if (sort === "Most Polled") {
      result.sort((a,b) => b.total_poll_appearances - a.total_poll_appearances);
    } else if (sort === "Alphabetical") {
      result.sort((a,b) => a.full_name.localeCompare(b.full_name));
    }
  } else {
    // Default high approval
    result.sort((a,b) => b.approval_rating - a.approval_rating);
  }

  res.json(result);
});

app.get("/api/politicians/:id", (req, res) => {
  const polId = parseInt(req.params.id);
  const pol = DB.politicians.find(p => p.id === polId);
  if (!pol) {
    return res.status(404).json({ error: "Politician profile not found." });
  }

  // Fetch all polls featuring this politician
  const associatedPolls = DB.polls.filter(poll => 
    poll.options.some(o => o.label.toLowerCase() === pol.full_name.toLowerCase())
  );

  res.json({ politician: pol, polls: associatedPolls });
});

// 6.5. POLITICAL PARTIES API
app.get("/api/parties", (req, res) => {
  const { country } = req.query;
  if (!DB.parties) DB.parties = [];
  
  let result = [...DB.parties];
  if (country && country !== "All" && country !== "Global") {
    result = result.filter(p => p.country && p.country.toLowerCase() === (country as string).toLowerCase());
  }
  res.json(result);
});

app.get("/api/parties/:id", (req, res) => {
  const partyId = parseInt(req.params.id);
  if (!DB.parties) DB.parties = [];
  
  const party = DB.parties.find(p => p.id === partyId);
  if (!party) {
    return res.status(404).json({ error: "Political party profile not found." });
  }

  // Find all politicians matching this party
  const associatedPoliticians = DB.politicians.filter(p => {
    if (!p.party) return false;
    
    // Country MUST match to prevent Kenyan/UK cross-contamination
    const polCountry = p.country ? p.country.trim().toLowerCase() : "";
    const partyCountry = party.country ? party.country.trim().toLowerCase() : "";
    if (polCountry !== partyCountry) return false;
    
    const polParty = p.party.toLowerCase();
    const partyName = party.name.toLowerCase();
    const partyAbbr = party.abbreviation.toLowerCase();
    
    return polParty === partyName || 
           polParty === partyAbbr || 
           polParty.includes(partyName) || 
           polParty.includes(partyAbbr) ||
           partyName.includes(polParty) ||
           partyAbbr.includes(polParty);
  });

  res.json({ party, politicians: associatedPoliticians });
});

// 6.7. DEVELOPMENTS API
app.get("/api/politicians/:id/developments", (req, res) => {
  const politicianId = parseInt(req.params.id, 10);
  const includePending = req.query.include_pending === 'true'; // For admin or user to see unapproved
  if (!DB.developments) DB.developments = [];
  
  const devs = DB.developments.filter(d => d.politician_id === politicianId && (d.is_approved || includePending));
  res.json(devs);
});

app.post("/api/politicians/:id/developments/suggest", async (req, res) => {
  const politicianId = parseInt(req.params.id, 10);
  const { title, description, timeline, date, email } = req.body;
  if (!title || !description || !timeline) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!DB.developments) DB.developments = [];
  const nextId = DB.developments.length > 0 ? Math.max(...DB.developments.map(d => d.id)) + 1 : 1;
  const newDev: DevelopmentProgress = {
    id: nextId,
    politician_id: politicianId,
    title,
    description,
    timeline,
    date,
    is_approved: false,
    creator_type: "user",
    suggested_by_email: email || "Anonymous"
  };

  DB.developments.push(newDev);
  await saveDatabase();
  res.json({ success: true, development: newDev });
});

app.put("/api/admin/developments/:id/approve", async (req, res) => {
  const devId = parseInt(req.params.id, 10);
  if (!DB.developments) DB.developments = [];
  const dev = DB.developments.find(d => d.id === devId);
  if (!dev) return res.status(404).json({ error: "Not found" });
  
  dev.is_approved = true;
  await saveDatabase();
  res.json({ success: true, development: dev });
});

app.delete("/api/admin/developments/:id", async (req, res) => {
  const devId = parseInt(req.params.id, 10);
  if (!DB.developments) DB.developments = [];
  DB.developments = DB.developments.filter(d => d.id !== devId);
  await saveDatabase();
  res.json({ success: true });
});

app.put("/api/admin/developments/:id", async (req, res) => {
  const devId = parseInt(req.params.id, 10);
  const { title, description, timeline, date } = req.body;
  
  if (!DB.developments) DB.developments = [];
  const dev = DB.developments.find(d => d.id === devId);
  if (!dev) return res.status(404).json({ error: "Not found" });
  
  if (title) dev.title = title;
  if (description) dev.description = description;
  if (timeline) dev.timeline = timeline;
  if (date !== undefined) dev.date = date;
  
  await saveDatabase();
  res.json({ success: true, development: dev });
});

app.get("/api/admin/developments/pending", (req, res) => {
  if (!DB.developments) DB.developments = [];
  const pending = DB.developments.filter(d => !d.is_approved);
  res.json(pending);
});

app.post("/api/admin/politicians/:id/draft_developments", async (req, res) => {
  const politicianId = parseInt(req.params.id, 10);
  const { context } = req.body;
  const pol = DB.politicians.find(p => p.id === politicianId);
  if (!pol) return res.status(404).json({ error: "Politician not found" });

  try {
    let prompt = `For the politician:
Name: ${pol.full_name}
Country: ${pol.country}
Party: ${pol.party}
Role: ${pol.title}

Generate 3 to 5 realistic, factual achievements, policy impacts, or future promises that this politician represents.
Classify each as timeline: "past" (completed achievements), "present" (ongoing initiatives), or "future" (promised goals for upcoming term/campaign).

Crucially, in the "description" field for each development, you MUST explain:
1. The exact progress, legislation, or action made.
2. The scale of impact (how many people it helped or is helping).
3. Any negative impacts, criticisms, or trade-offs that resulted, and specifically how the politician handled or mitigated them.

Ensure the description is high-quality, balanced, includes these nuances, and is concise (under 250 characters per item).`;

    if (context && context.trim()) {
      prompt += `\n\nAdditional Context/Correction: ${context}\nIf this context includes a Wikipedia URL or information, heavily incorporate it to generate accurate entries.`;
    }

    const schemaDesc = `{
      "developments": [
        {
          "title": "string",
          "description": "string",
          "timeline": "past|present|future",
          "date": "string"
        }
      ]
    }`;

    const fallbackOpts = {
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            developments: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  timeline: { type: Type.STRING },
                  date: { type: Type.STRING }
                },
                required: ["title", "description", "timeline", "date"]
              }
            }
          },
          required: ["developments"]
        }
      }
    };

    const parsed = await generateAIContent(prompt, schemaDesc, fallbackOpts);
    res.json({ success: true, generated: parsed?.developments || [] });

  } catch (error: any) {
    console.error("AI development draft generation error:", error);
    res.status(500).json({ error: "Failed to generate AI data: " + error.message });
  }
});

app.post("/api/admin/politicians/:id/developments/bulk", async (req, res) => {
  const politicianId = parseInt(req.params.id, 10);
  const { developments } = req.body;
  if (!Array.isArray(developments)) return res.status(400).json({ error: "Invalid payload" });

  if (!DB.developments) DB.developments = [];
  const addedItems: DevelopmentProgress[] = [];

  for (const item of developments) {
    const nextId = DB.developments.length > 0 ? Math.max(...DB.developments.map(d => d.id)) + 1 : 1;
    const newDev: DevelopmentProgress = {
      id: nextId,
      politician_id: politicianId,
      title: item.title,
      description: item.description,
      timeline: item.timeline,
      date: item.date,
      is_approved: true,
      creator_type: "ai"
    };
    DB.developments.push(newDev);
    addedItems.push(newDev);
  }

  await saveDatabase();
  res.json({ success: true, added: addedItems });
});

app.post("/api/admin/politicians/:id/developments", async (req, res) => {
  const politicianId = parseInt(req.params.id, 10);
  const { title, description, timeline, date } = req.body;
  if (!title || !description || !timeline) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!DB.developments) DB.developments = [];
  const nextId = DB.developments.length > 0 ? Math.max(...DB.developments.map(d => d.id)) + 1 : 1;
  const newDev: DevelopmentProgress = {
    id: nextId,
    politician_id: politicianId,
    title,
    description,
    timeline,
    date,
    is_approved: true,
    creator_type: "admin"
  };

  DB.developments.push(newDev);
  await saveDatabase();
  res.json({ success: true, development: newDev });
});

// 7. NEWS FEEDS API
app.get("/api/news", (req, res) => {
  const { country, tag } = req.query;
  let result = [...DB.newsItems];

  if (country && country !== "All") {
    result = result.filter(n => n.country.toLowerCase() === (country as string).toLowerCase() || n.country === "Global");
  }

  if (tag) {
    result = result.filter(n => n.tags.map(t => t.toLowerCase()).includes((tag as string).toLowerCase()));
  }

  // Sort by published_at
  result.sort((a,b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());

  res.json(result);
});

// 8. WIZARD POLL CREATION
app.post("/api/polls/create", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "You must be logged in to construct a political poll." });
  }
  const token = authHeader.substring(7);
  const match = token.match(/^mock-token-usr-(\d+)$/);
  if (!match) return res.status(401).json({ error: "Invalid login token state." });

  const userId = parseInt(match[1]);
  const user = DB.users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: "User profile not found." });

  const { title, description, category, poll_type, country, closes_at, allow_comments, is_anonymous, options, tags } = req.body;

  if (!title || !category || !poll_type || !options || !Array.isArray(options) || options.length < 2) {
    return res.status(400).json({ error: "Title, category, poll type, and minimum 2 options are required." });
  }

  const pollId = DB.polls.reduce((max, p) => p.id > max ? p.id : max, 0) + 1;

  const pollOptions: PollOption[] = options.map((opt: any, index: number) => {
    return {
      id: pollId * 1000 + index + 1,
      poll_id: pollId,
      label: opt.label,
      description: opt.description || "",
      photo_url: opt.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(opt.label)}&background=random&bold=true`,
      party: opt.party || "",
      party_color: opt.party_color || "#3b82f6",
      vote_count: 0,
      order: index + 1,
    };
  });

  const parsedTags = Array.isArray(tags) ? tags : (tags as string || "").split(",").map(t => t.trim()).filter(Boolean);

  const newPoll: Poll = {
    id: pollId,
    title,
    description: description || "",
    category: category as Poll["category"],
    status: user.role === "citizen" ? "scheduled" : "active", // scheduled works as "pending review" for citizens
    poll_type: poll_type as Poll["poll_type"],
    options: pollOptions,
    created_by: user.id,
    created_at: new Date().toISOString(),
    closes_at: closes_at || undefined,
    total_votes: 0,
    is_featured: false,
    allow_comments: allow_comments !== undefined ? allow_comments : true,
    tags: parsedTags,
    country: country || "Global",
    view_count: 0,
  };

  DB.polls.push(newPoll);
  
  // Track metric
  const userIndex = DB.users.findIndex(u => u.id === user.id);
  if (userIndex !== -1) {
    DB.users[userIndex].polls_created += 1;
  }

  await saveDatabase();

  res.status(201).json({ poll: newPoll });
});

// 9. BASE64 PROFILE PHOTO FILE UPLOAD PROXY (saving base64 inside database state)
app.post("/api/upload", async (req, res) => {
  const { fileName, fileContent } = req.body; // base64 payload
  if (!fileContent) {
    return res.status(400).json({ error: "No file content supplied." });
  }

  // Returning the compressed Base64 string directly.
  // Aiven PostgreSQL JSONB supports up to 1GB per record, so this persists perfectly inside the DB state.
  res.json({ url: fileContent });
});

// 10. SYSTEM ANALYTICS & ADMIN API
app.get("/api/admin/stats", (req, res) => {
  const totalVotes = DB.votes.length + DB.polls.reduce((acc, p) => acc + p.total_votes, 0);
  const activePollsCount = DB.polls.filter(p => p.status === "active").length;
  const countries = new Set(DB.polls.map(p => p.country));

  const stats: PlatformStats = {
    totalPolls: DB.polls.length,
    totalVotes,
    countriesCount: countries.size,
    activePollsCount,
  };

  // Compile detailed dashboard metrics (registrations, category ratio)
  const categorySplit = DB.polls.reduce((acc, p) => {
    acc[p.category] = (acc[p.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const userGroups = DB.users.reduce((acc, u) => {
    acc[u.role] = (acc[u.role] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  res.json({
    stats,
    categorySplit,
    userGroups,
    reportedContent: [
      { id: 1, type: "comment", author: "Jane Doe", reason: "Irrelevant debate spamming", matches: "This lobby is bought!", target_id: 1 }
    ]
  });
});

app.get("/api/settings", (req, res) => {
  if (!DB.settings) {
    DB.settings = {
      hero_image_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/General_Assembly_Hall.jpg/1280px-General_Assembly_Hall.jpg"
    };
  }
  res.json(DB.settings);
});

app.post("/api/admin/settings", async (req, res) => {
  const user = getAuthUser(req);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ error: "Forbidden: Only admins can configure settings." });
  }
  
  const { hero_image_url } = req.body;
  if (!DB.settings) {
    DB.settings = {
      hero_image_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/General_Assembly_Hall.jpg/1280px-General_Assembly_Hall.jpg"
    };
  }
  
  if (hero_image_url !== undefined) {
    DB.settings.hero_image_url = hero_image_url;
  }
  
  await saveDatabase();
  res.json({ success: true, settings: DB.settings });
});

app.post("/api/admin/polls/:id/feature", async (req, res) => {
  const id = parseInt(req.params.id);
  DB.polls.forEach(p => {
    if (p.id === id) {
      p.is_featured = true;
    } else {
      p.is_featured = false; // single featured poll rule
    }
  });
  await saveDatabase();
  res.json({ success: true, polls: DB.polls });
});

app.post("/api/admin/polls/:id/status", async (req, res) => {
  const id = parseInt(req.params.id);
  const { status } = req.body;
  const poll = DB.polls.find(p => p.id === id);
  if (poll) {
    poll.status = status;
    await saveDatabase();
    return res.json({ success: true, poll });
  }
  res.status(404).json({ error: "Poll not found" });
});

app.delete("/api/admin/polls/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const initialCount = DB.polls.length;
    DB.polls = DB.polls.filter(p => p.id !== id);
    
    if (DB.polls.length === initialCount) {
      return res.status(404).json({ error: "Poll not found or already deleted." });
    }
    
    await saveDatabase();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to delete poll: " + err.message });
  }
});

app.post("/api/admin/politicians", async (req, res) => {
  const { full_name, title, country, party, party_color, office, bio, date_of_birth, photo_url } = req.body;
  if (!full_name || !photo_url) {
    return res.status(400).json({ error: "Name and profile photo are required." });
  }

  const exists = DB.politicians.some(p => p.full_name.toLowerCase().trim() === full_name.toLowerCase().trim());
  if (exists) {
    return res.status(400).json({ error: `A profile for "${full_name}" already exists in the database.` });
  }

  const nextId = DB.politicians.reduce((max, p) => p.id > max ? p.id : max, 0) + 1;
  const newPol: Politician = {
    id: nextId,
    full_name,
    photo_url,
    title,
    country,
    party,
    party_color: party_color || "#3b82f6",
    office,
    bio: bio || "",
    date_of_birth: date_of_birth || "1980-01-01",
    approval_rating: 50.0,
    total_poll_appearances: 0,
    is_active: true,
    tags: [country, party].filter(Boolean),
  };

  DB.politicians.push(newPol);
  if (newPol.party) {
    ensurePartyExists(newPol.party, newPol.party_color || "#3b82f6", newPol.country || "Global");
  }
  await saveDatabase();
  res.status(201).json(newPol);
});

app.put("/api/admin/politicians/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const polIndex = DB.politicians.findIndex(p => p.id === id);
  if (polIndex === -1) {
    return res.status(404).json({ error: "Politician not found" });
  }

  const { full_name, title, country, party, party_color, office, bio, date_of_birth, photo_url, approval_rating, is_active } = req.body;
  
  if (full_name) DB.politicians[polIndex].full_name = full_name;
  if (photo_url) DB.politicians[polIndex].photo_url = photo_url;
  if (title !== undefined) DB.politicians[polIndex].title = title;
  if (country !== undefined) DB.politicians[polIndex].country = country;
  if (party !== undefined) DB.politicians[polIndex].party = party;
  if (party_color !== undefined) DB.politicians[polIndex].party_color = party_color;
  if (office !== undefined) DB.politicians[polIndex].office = office;
  if (bio !== undefined) DB.politicians[polIndex].bio = bio;
  if (date_of_birth !== undefined) DB.politicians[polIndex].date_of_birth = date_of_birth;
  if (approval_rating !== undefined) DB.politicians[polIndex].approval_rating = parseFloat(approval_rating);
  if (is_active !== undefined) DB.politicians[polIndex].is_active = !!is_active;

  DB.politicians[polIndex].tags = [DB.politicians[polIndex].country, DB.politicians[polIndex].party].filter(Boolean);

  const updatedPol = DB.politicians[polIndex];
  if (updatedPol.party) {
    ensurePartyExists(updatedPol.party, updatedPol.party_color || "#3b82f6", updatedPol.country || "Global");
  }

  await saveDatabase();
  res.json(DB.politicians[polIndex]);
});

app.delete("/api/admin/politicians/:id", async (req, res) => {
  const user = getAuthUser(req);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ error: "Forbidden: Only admins can delete profiles." });
  }
  const id = parseInt(req.params.id);
  DB.politicians = DB.politicians.filter(p => p.id !== id);
  await saveDatabase();
  res.json({ success: true });
});

// 6.6. POLITICAL PARTIES ADMIN CRUD API
app.post("/api/admin/parties", async (req, res) => {
  const user = getAuthUser(req);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ error: "Forbidden: Only admins can manage parties." });
  }

  const { name, abbreviation, logo_url, color, description, country, founded_year, ideology, headquarters, chairperson } = req.body;
  if (!name || !abbreviation) {
    return res.status(400).json({ error: "Name and abbreviation are required." });
  }

  if (!DB.parties) DB.parties = [];
  const nextPartyId = DB.parties.reduce((max, p) => p.id > max ? p.id : max, 0) + 1;

  const newParty = {
    id: nextPartyId,
    name: name.trim(),
    abbreviation: abbreviation.trim().toUpperCase(),
    logo_url: logo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(abbreviation)}&background=${(color || "#3b82f6").replace("#", "")}&color=ffffff&bold=true&size=128`,
    color: color || "#3b82f6",
    description: description || "",
    country: country || "Global",
    founded_year: founded_year ? parseInt(founded_year) : 2020,
    ideology: ideology || "Centrist Progressivism",
    headquarters: headquarters || "Secretariat HQ",
    chairperson: chairperson || "Secretariat General",
  };

  DB.parties.push(newParty);
  await saveDatabase();
  res.status(201).json(newParty);
});

app.put("/api/admin/parties/:id", async (req, res) => {
  const user = getAuthUser(req);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ error: "Forbidden: Only admins can manage parties." });
  }

  const partyId = parseInt(req.params.id);
  if (!DB.parties) DB.parties = [];
  const partyIndex = DB.parties.findIndex(p => p.id === partyId);
  if (partyIndex === -1) {
    return res.status(404).json({ error: "Party not found." });
  }

  const { name, abbreviation, logo_url, color, description, country, founded_year, ideology, headquarters, chairperson } = req.body;
  const p = DB.parties[partyIndex];

  if (name !== undefined) p.name = name.trim();
  if (abbreviation !== undefined) p.abbreviation = abbreviation.trim().toUpperCase();
  if (logo_url !== undefined) p.logo_url = logo_url;
  if (color !== undefined) p.color = color;
  if (description !== undefined) p.description = description;
  if (country !== undefined) p.country = country;
  if (founded_year !== undefined) p.founded_year = founded_year ? parseInt(founded_year) : p.founded_year;
  if (ideology !== undefined) p.ideology = ideology;
  if (headquarters !== undefined) p.headquarters = headquarters;
  if (chairperson !== undefined) p.chairperson = chairperson;

  await saveDatabase();
  res.json(p);
});

app.delete("/api/admin/parties/:id", async (req, res) => {
  const user = getAuthUser(req);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ error: "Forbidden: Only admins can manage parties." });
  }

  const partyId = parseInt(req.params.id);
  if (!DB.parties) DB.parties = [];
  DB.parties = DB.parties.filter(p => p.id !== partyId);
  await saveDatabase();
  res.json({ success: true });
});

app.post("/api/admin/party/autofill", async (req, res) => {
  const user = getAuthUser(req);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ error: "Forbidden: Only admins can manage parties." });
  }

  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Party name or abbreviation is required." });

  try {
    const fallbackConfig = {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          abbreviation: { type: Type.STRING, description: "Official political party abbreviation e.g. ODM, GOP, ANC, Labour" },
          color: { type: Type.STRING, description: "Official theme hex color e.g. #3b82f6" },
          description: { type: Type.STRING, description: "A detailed 1-2 sentence overview of the party and its political mission" },
          country: { type: Type.STRING, description: "Country of jurisdiction" },
          founded_year: { type: Type.INTEGER, description: "Year the party was founded" },
          ideology: { type: Type.STRING, description: "Core political ideology or tenets" },
          headquarters: { type: Type.STRING, description: "Headquarters city/location" },
          chairperson: { type: Type.STRING, description: "Current party leader or chairperson" }
        },
        required: ["abbreviation", "color", "description", "country", "founded_year", "ideology", "headquarters", "chairperson"]
      }
    };

    const schemaDescription = `{
      "abbreviation": "Official abbreviation (string)",
      "color": "Hex color code e.g. #3b82f6 (string)",
      "description": "Short 1-2 sentence description (string)",
      "country": "Country (string)",
      "founded_year": "Year founded (integer)",
      "ideology": "Ideology (string)",
      "headquarters": "Headquarters location (string)",
      "chairperson": "Chairperson/Leader name (string)"
    }`;

    const [partyLogoUrl, generated] = await Promise.all([
      getPartyLogoUrl(name),
      generateAIContent(
        `Provide accurate details for the political party named "${name}". Use real factual information including correct founded year, official headquarters, current leader/chairperson, and accurate political ideology.`,
        schemaDescription,
        {
          model: "gemini-3.5-flash",
          contents: `Provide accurate details for the political party named "${name}". Use real factual information including correct founded year, official headquarters, current leader/chairperson, and accurate political ideology.`,
          config: fallbackConfig
        }
      )
    ]);

    if (partyLogoUrl) {
      generated.logo_url = partyLogoUrl;
    } else {
      generated.logo_url = `https://ui-avatars.com/api/?name=${encodeURIComponent(generated.abbreviation || name)}&background=${(generated.color || "#3b82f6").replace("#", "")}&color=ffffff&bold=true&size=128`;
    }

    res.json(generated);
  } catch (error: any) {
    console.error("AI party autofill error:", error);
    res.status(500).json({ error: "Failed to generate AI party data: " + error.message });
  }
});

// Helper to resolve Wikipedia page image portrait
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
      if (page.original?.source) {
        return page.original.source;
      }
    }
  } catch (err) {
    console.error("Wikipedia image resolution error for name " + name + ":", err);
  }
  return "";
}

// Dedicated helper to fetch a political party's real logo from Wikipedia/Wikimedia Commons
// Strategy 1: Search Wikimedia Commons for the party logo file directly
// Strategy 2: Fetch the party's Wikipedia article and extract the infobox logo image
// Strategy 3: Try searching with the party's known abbreviation or alternative name
async function getPartyLogoUrl(partyName: string): Promise<string> {
  const headers = { "User-Agent": "GovTrackApp/1.0 (contact@govtrack.co.ke)" };

  // Strategy 1: Search Wikimedia Commons for the logo directly
  try {
    const queries = [
      `${partyName} logo`,
      `${partyName} party logo`,
      `${partyName} emblem`,
      `${partyName} political party`
    ];
    for (const query of queries) {
      const commonsSearchUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srnamespace=6&srlimit=3&format=json&origin=*`;
      const commonsRes = await fetch(commonsSearchUrl, { headers });
      const commonsData = await commonsRes.json() as any;
      const fileResults: any[] = commonsData?.query?.search || [];
      for (const file of fileResults) {
        // Prefer SVG or PNG logos, skip photos of people
        const title: string = file.title || "";
        const lowerTitle = title.toLowerCase();
        const isLogo = lowerTitle.includes("logo") || lowerTitle.includes("emblem") || lowerTitle.includes("seal") || lowerTitle.includes("flag");
        const isImage = title.startsWith("File:") && (lowerTitle.endsWith(".svg") || lowerTitle.endsWith(".png") || lowerTitle.endsWith(".jpg") || lowerTitle.endsWith(".jpeg"));
        if (isImage && isLogo) {
          // Get direct image URL from Commons
          const fileName = title.replace(/^File:/, "");
          const infoUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=url&iiurlwidth=200&format=json&origin=*`;
          const infoRes = await fetch(infoUrl, { headers });
          const infoData = await infoRes.json() as any;
          const infoPages = infoData?.query?.pages || {};
          for (const key of Object.keys(infoPages)) {
            const thumbUrl = infoPages[key]?.imageinfo?.[0]?.thumburl;
            const directUrl = infoPages[key]?.imageinfo?.[0]?.url;
            if (thumbUrl) {
              console.log(`[Party Logo] Found logo for "${partyName}" via Commons: ${thumbUrl.substring(0, 80)}`);
              return thumbUrl;
            }
            if (directUrl) {
              console.log(`[Party Logo] Found logo for "${partyName}" via Commons (direct): ${directUrl.substring(0, 80)}`);
              return directUrl;
            }
          }
        }
      }
    }
  } catch (err) {
    console.error(`[Party Logo] Commons search failed for "${partyName}":`, err);
  }

  // Strategy 2: Fetch the party's Wikipedia article and get its primary image (infobox logo)
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(partyName + " political party")}&srlimit=1&format=json&origin=*`;
    const searchRes = await fetch(searchUrl, { headers });
    const searchData = await searchRes.json() as any;
    const title = searchData?.query?.search?.[0]?.title;
    if (title) {
      // Get all images from the article and find the one most likely to be the logo
      const imagesUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=images&titles=${encodeURIComponent(title)}&imlimit=20&format=json&origin=*&redirects=1`;
      const imagesRes = await fetch(imagesUrl, { headers });
      const imagesData = await imagesRes.json() as any;
      const pages = imagesData?.query?.pages || {};
      
      for (const pageKey of Object.keys(pages)) {
        const images: any[] = pages[pageKey]?.images || [];
        // First pass: find logo/emblem/flag files
        for (const img of images) {
          const imgTitle: string = img.title || "";
          const lowerImg = imgTitle.toLowerCase();
          if (lowerImg.includes("logo") || lowerImg.includes("emblem") || lowerImg.includes("seal")) {
            const infoUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(imgTitle)}&prop=imageinfo&iiprop=url&iiurlwidth=200&format=json&origin=*`;
            const infoRes = await fetch(infoUrl, { headers });
            const infoData = await infoRes.json() as any;
            const infoPages = infoData?.query?.pages || {};
            for (const key of Object.keys(infoPages)) {
              const thumbUrl = infoPages[key]?.imageinfo?.[0]?.thumburl;
              const directUrl = infoPages[key]?.imageinfo?.[0]?.url;
              if (thumbUrl) {
                console.log(`[Party Logo] Found logo for "${partyName}" via Wikipedia article images: ${thumbUrl.substring(0, 80)}`);
                return thumbUrl;
              }
              if (directUrl) return directUrl;
            }
          }
        }
        // Second pass: fall back to the article's primary page image (usually the logo in infobox)
        const pageImgUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&piprop=thumbnail|original&pithumbsize=200&titles=${encodeURIComponent(title)}&redirects=1&origin=*`;
        const pageImgRes = await fetch(pageImgUrl, { headers });
        const pageImgData = await pageImgRes.json() as any;
        const piPages = pageImgData?.query?.pages || {};
        for (const key of Object.keys(piPages)) {
          const thumbUrl = piPages[key]?.thumbnail?.source;
          if (thumbUrl) {
            console.log(`[Party Logo] Found page image for "${partyName}" via Wikipedia pageimages: ${thumbUrl.substring(0, 80)}`);
            return thumbUrl;
          }
        }
      }
    }
  } catch (err) {
    console.error(`[Party Logo] Wikipedia article search failed for "${partyName}":`, err);
  }

  console.log(`[Party Logo] No logo found for "${partyName}", will use generated avatar.`);
  return "";
}

// Unified AI content generator (Groq primary with Gemini fallback)
async function generateAIContent(prompt: string, schemaDescription: string, fallbackGeminiOpts: { model: string, contents: string, config: any }): Promise<any> {
  const groqApiKey = process.env.GROQ_API_KEY;
  
  if (groqApiKey) {
    // We will attempt multiple robust models on console.groq.com to guarantee reliability
    const groqModels = ["llama-3.3-70b-versatile", "llama3-70b-8192", "mixtral-8x7b-32768"];
    
    for (const modelName of groqModels) {
      try {
        console.log(`[AI Engine] Attempting prompt via console.groq.com leveraging model: ${modelName}...`);
        const payload = {
          model: modelName,
          messages: [
            {
              role: "system",
              content: `You are a professional political researcher, analyst, and database synthesizer.
You MUST strictly return a valid, parsable RFC-compliant JSON object conforming EXACTLY to the following schema specification:
${schemaDescription}

Rules:
1. Do NOT wrap the JSON in Markdown codeblocks (e.g. do not use \`\`\`json).
2. Do NOT output any conversational text, introductory text, or concluding text. Let your response start with "{" and end with "}".
3. Use double quotes for keys and string values.`
            },
            {
              role: "user",
              content: prompt
            }
          ],
          response_format: { type: "json_object" },
          temperature: 0.2
        };

        let response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${groqApiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        // Groq rate limit 429 interceptor: Wait for 2.5 seconds and retry once
        if (response.status === 429) {
          console.warn(`[AI Engine] Groq API returned 429 Too Many Requests using model ${modelName}. Waiting 2500ms before retrying once...`);
          await new Promise(resolve => setTimeout(resolve, 2500));
          response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${groqApiKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
          });
        }

        if (response.ok) {
          const data = await response.json() as any;
          const textValue = (data.choices?.[0]?.message?.content || "").trim();
          
          // Ultra-robust JSON extraction helper
          let cleaned = textValue.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
          
          // Extra recovery: extract first matches of { ... } if something auxiliary was appended
          if (!cleaned.startsWith("{")) {
            const startIdx = cleaned.indexOf("{");
            const endIdx = cleaned.lastIndexOf("}");
            if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
              cleaned = cleaned.substring(startIdx, endIdx + 1);
            }
          }

          try {
            const parsed = JSON.parse(cleaned);
            console.log(`[AI Engine] Successfully generated and parsed AI content via Groq API (${modelName}).`);
            return parsed;
          } catch (parseErr) {
            console.warn(`[AI Engine] Failed to parse JSON from ${modelName}, content was: ${cleaned}. Trying next model...`);
          }
        } else {
          const errText = await response.text();
          console.warn(`[AI Engine] Groq API returned status ${response.status} using model ${modelName}: ${errText}`);
        }
      } catch (err: any) {
        console.error(`[AI Engine] Groq fetch or execution error for model ${modelName}:`, err);
      }
    }
    console.warn("[AI Engine] All Groq models failed, falling back to Gemini...");
  }

  // Gemini fallback — always attempt this if Groq is unavailable or fails
  try {
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.API_KEY;
    if (!geminiKey) {
      throw new Error("No AI API key configured (GROQ_API_KEY, GEMINI_API_KEY, or GOOGLE_API_KEY required).");
    }
    
    console.log(`[AI Engine] Attempting Gemini fallback via gemini-2.5-flash...`);
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
    
    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      throw new Error(`Gemini API error ${geminiResponse.status}: ${errText}`);
    }
    
    const geminiData = await geminiResponse.json() as any;
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    let cleaned = rawText.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    if (!cleaned.startsWith("{")) {
      const si = cleaned.indexOf("{");
      const ei = cleaned.lastIndexOf("}");
      if (si !== -1 && ei > si) cleaned = cleaned.substring(si, ei + 1);
    }
    const parsed = JSON.parse(cleaned);
    console.log("[AI Engine] Successfully generated content via Gemini fallback.");
    return parsed;
  } catch (geminiErr: any) {
    console.error("[AI Engine] Gemini fallback also failed:", geminiErr?.message);
    throw new Error("All AI engines failed. Last error: " + geminiErr?.message);
  }
}

app.post("/api/admin/politician/autofill", async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: "Politician name is required" });
  }

  try {
    const fallbackConfig = {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "Title or designation e.g. Senator, President, etc." },
          country: { type: Type.STRING, description: "Country jurisdiction" },
          party: { type: Type.STRING, description: "Political party name" },
          party_color: { type: Type.STRING, description: "Hex code representing the party theme color" },
          office: { type: Type.STRING, description: "Specific Head of Office or Assembly" },
          photo_url: { type: Type.STRING, description: "A valid image URL to a portrait photo of the politician" },
          date_of_birth: { type: Type.STRING, description: "Date of birth in YYYY-MM-DD format" },
          bio: { type: Type.STRING, description: "Detailed biography of their political career and governance background (min 2 sentences)" }
        },
      }
    };

    const schemaDescription = `{
      "title": "Title or designation e.g. Senator, President, etc. (string)",
      "country": "Country jurisdiction (string)",
      "party": "Political party name (string)",
      "party_color": "Hex code representing the party theme color (e.g. #3b82f6) (string)",
      "office": "Specific Head of Office or Assembly (string)",
      "photo_url": "A valid image URL to a portrait photo of the politician (string)",
      "date_of_birth": "Date of birth in YYYY-MM-DD format (string)",
      "bio": "Detailed biography of their political career and governance background (min 2 sentences) (string)"
    }`;

    // Try starting both calls to fetch Wiki Image and AI output
    const [wikiPhotoUrl, generated] = await Promise.all([
      getWikipediaImageUrl(name),
      generateAIContent(
        `Provide accurate details for the politician named "${name}". Use real information. If you don't have a photo URL, provide a placeholder URL.`,
        schemaDescription,
        {
          model: "gemini-3.5-flash",
          contents: `Provide accurate details for the politician named "${name}". Use real information. If you don't have a photo URL, provide a placeholder URL.`,
          config: fallbackConfig
        }
      )
    ]);

    // If a Wikipedia image was retrieved directly, prioritize it to ensure high conformity with instructions
    if (wikiPhotoUrl) {
      generated.photo_url = wikiPhotoUrl;
    }
    res.json(generated);
  } catch (error: any) {
    console.error("AI autofill error:", error);
    res.status(500).json({ error: "Failed to generate AI data: " + error.message });
  }
});

app.post("/api/admin/politicians/bulk", async (req, res) => {
  const { politicians } = req.body;
  if (!Array.isArray(politicians)) {
    return res.status(400).json({ error: "Politicians array is required" });
  }

  const created: Politician[] = [];
  for (const item of politicians) {
    const { full_name, title, country, party, party_color, office, bio, date_of_birth, photo_url } = item;
    
    // Check if duplicate exists to prevent double insertion in single turn
    const exists = DB.politicians.some(p => p.full_name.toLowerCase().trim() === full_name.toLowerCase().trim());
    if (exists) {
      continue;
    }

    const nextId = DB.politicians.reduce((max, p) => p.id > max ? p.id : max, 0) + 1;
    const newPol: Politician = {
      id: nextId,
      full_name: full_name.trim(),
      photo_url: photo_url || "https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png",
      title: title || "Representative",
      country: country || "Kenya",
      party: party || "Independent",
      party_color: party_color || "#3b82f6",
      office: office || "Assembly",
      bio: bio || "",
      date_of_birth: date_of_birth || "1980-01-01",
      approval_rating: 50.0,
      total_poll_appearances: 0,
      is_active: true,
      tags: [country, party].filter(Boolean),
    };
    DB.politicians.push(newPol);
    if (newPol.party) {
      ensurePartyExists(newPol.party, newPol.party_color || "#3b82f6", newPol.country || "Global");
    }
    created.push(newPol);
  }

  if (created.length > 0) {
    await saveDatabase();
  }

  res.status(201).json({ success: true, count: created.length, created });
});

app.post("/api/admin/poll/autofill", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "Poll prompt is required" });
  }

  try {
    const fallbackConfig = {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "A catchy and clear question for the poll" },
          description: { type: Type.STRING, description: "Context or background for this poll" },
          category: { type: Type.STRING, description: "Must be one of: Election, Approval Rating, Policy, Leadership, Referendum, International, Local Government, Party Politics, Breaking News Poll" },
          poll_type: { type: Type.STRING, description: "Must be one of: single_choice, multiple_choice" },
          options: { 
            type: Type.ARRAY, 
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING, description: "Name of the candidate or option" },
                description: { type: Type.STRING, description: "Short tagline or title" },
                party: { type: Type.STRING, description: "Political party (if applicable)" },
                party_color: { type: Type.STRING, description: "Hex color for the option/party" },
                photo_url: { type: Type.STRING, description: "An image URL (can be blank or a placeholder)" },
                vote_count: { type: Type.INTEGER, description: "Start with 0" },
                order: { type: Type.INTEGER, description: "Order index starting from 1" }
              }
            }
          }
        },
      }
    };

    const schemaDescription = `{
      "title": "A catchy and clear question for the poll (string)",
      "description": "Context or background for this poll (string)",
      "category": "Must be one of: Election, Approval Rating, Policy, Leadership, Referendum, International, Local Government, Party Politics, Breaking News Poll (string)",
      "poll_type": "Must be one of: single_choice, multiple_choice (string)",
      "options": [
        {
          "label": "Name of the candidate or option (string)",
          "description": "Short tagline or title (string)",
          "party": "Political party (if applicable) (string)",
          "party_color": "Hex color for the option/party (string)",
          "photo_url": "An image URL (can be blank or a placeholder) (string)",
          "vote_count": 0,
          "order": 1
        }
      ]
    }`;

    const generated = await generateAIContent(
      `Generate a detailed political poll or survey based on this prompt: "${prompt}". Suggest realistic candidates or options for the vote.`,
      schemaDescription,
      {
        model: "gemini-3.5-flash",
        contents: `Generate a detailed political poll or survey based on this prompt: "${prompt}". Suggest realistic candidates or options for the vote.`,
        config: fallbackConfig
      }
    );

    res.json(generated);
  } catch (error: any) {
    console.error("AI poll autofill error:", error);
    res.status(500).json({ error: "Failed to generate AI poll data: " + error.message });
  }
});

app.put("/api/admin/polls/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const poll = DB.polls.find(p => p.id === id);
  if (!poll) {
    return res.status(404).json({ error: "Poll not found" });
  }

  const { title, description, category, poll_type, status, is_featured, allow_comments, country, options } = req.body;

  if (title !== undefined) poll.title = title;
  if (description !== undefined) poll.description = description;
  if (category !== undefined) poll.category = category;
  if (poll_type !== undefined) poll.poll_type = poll_type;
  if (status !== undefined) poll.status = status;
  if (is_featured !== undefined) {
    poll.is_featured = !!is_featured;
    if (poll.is_featured) {
      DB.polls.forEach(p => {
        if (p.id !== id) p.is_featured = false;
      });
    }
  }
  if (allow_comments !== undefined) poll.allow_comments = !!allow_comments;
  if (country !== undefined) poll.country = country;

  if (options && Array.isArray(options)) {
    poll.options = options.map((opt: any, index: number) => {
      return {
        id: opt.id || (id * 1000 + index + 1),
        poll_id: id,
        label: opt.label,
        description: opt.description || "",
        photo_url: opt.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(opt.label)}&background=random&bold=true`,
        party: opt.party || "",
        party_color: opt.party_color || "#3b82f6",
        vote_count: opt.vote_count !== undefined ? parseInt(opt.vote_count) : 0,
        order: opt.order !== undefined ? parseInt(opt.order) : (index + 1),
      };
    });
    poll.total_votes = poll.options.reduce((sum, o) => sum + o.vote_count, 0);
  }

  await saveDatabase();
  res.json(poll);
});

app.put("/api/admin/news/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const newsIndex = DB.newsItems.findIndex(n => n.id === id);
  if (newsIndex === -1) {
    return res.status(404).json({ error: "News item not found" });
  }

  const { title, summary, image_url, source_url, source_name, related_poll_id, country, tags } = req.body;

  if (title !== undefined) DB.newsItems[newsIndex].title = title;
  if (summary !== undefined) DB.newsItems[newsIndex].summary = summary;
  if (image_url !== undefined) DB.newsItems[newsIndex].image_url = image_url;
  if (source_url !== undefined) DB.newsItems[newsIndex].source_url = source_url;
  if (source_name !== undefined) DB.newsItems[newsIndex].source_name = source_name;
  if (country !== undefined) DB.newsItems[newsIndex].country = country;
  if (related_poll_id !== undefined) DB.newsItems[newsIndex].related_poll_id = related_poll_id ? parseInt(related_poll_id) : null;
  if (tags !== undefined) {
    DB.newsItems[newsIndex].tags = Array.isArray(tags) ? tags : (tags as string).split(",").map(t => t.trim()).filter(Boolean);
  }

  await saveDatabase();
  res.json(DB.newsItems[newsIndex]);
});

app.delete("/api/admin/news/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  DB.newsItems = DB.newsItems.filter(n => n.id !== id);
  await saveDatabase();
  res.json({ success: true });
});

app.get("/api/admin/comments", (req, res) => {
  const mappedComments = DB.comments.map((comment: any) => {
    const parentPoll = DB.polls.find(p => p.id === comment.poll_id);
    return {
      ...comment,
      poll_title: parentPoll ? parentPoll.title : "Unknown Poll"
    };
  });
  mappedComments.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  res.json(mappedComments);
});

app.delete("/api/admin/comments/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  DB.comments = DB.comments.filter(c => c.id !== id);
  await saveDatabase();
  res.json({ success: true });
});

app.post("/api/admin/news", async (req, res) => {
  const { title, summary, image_url, source_url, source_name, related_poll_id, country, tags } = req.body;
  if (!title || !summary) {
    return res.status(400).json({ error: "Title and summary are required." });
  }

  const nextId = DB.newsItems.reduce((max, n) => n.id > max ? n.id : max, 0) + 1;
  const newNews: NewsItem = {
    id: nextId,
    title,
    summary,
    image_url: image_url || "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Secret_ballot_box.jpg/300px-Secret_ballot_box.jpg",
    source_url: source_url || "https://www.politico.com",
    source_name: source_name || "GovTrack Feed",
    published_at: new Date().toISOString(),
    related_poll_id: related_poll_id ? parseInt(related_poll_id) : null,
    country: country || "Global",
    tags: tags ? tags.split(",").map((t: string) => t.trim()) : [],
  };

  DB.newsItems.push(newNews);
  await saveDatabase();
  res.status(201).json(newNews);
});

// Update a poll's pre-rendered social sharing preview image (called by client off-screen canvas generator)
app.post("/api/polls/:id/featured-image", async (req, res) => {
  const id = parseInt(req.params.id);
  const { featured_image } = req.body;
  if (!featured_image) {
    return res.status(400).json({ error: "featured_image content is required." });
  }

  const poll = DB.polls.find(p => p.id === id);
  if (poll) {
    poll.featured_image = featured_image;
    await saveDatabase();
    console.log(`[Poll Share] Saved pre-rendered sharing banner for poll ID ${id}`);
    return res.json({ success: true, poll });
  }
  res.status(404).json({ error: "Poll not found" });
});

// Server-side social share landing for Polls (serves custom SEO Open Graph meta tags, then redirects to SPA)
app.get("/api/share/poll/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await getDatabaseLoadedPromise().catch(() => {});
  const poll = DB.polls.find(p => p.id === id);

  if (!poll) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>GovTrack Kenya - Poll Not Found</title>
        <meta http-equiv="refresh" content="0; url=https://govtrack-five.vercel.app/#/polls">
        <script>window.location.href = "https://govtrack-five.vercel.app/#/polls";</script>
      </head>
      <body>
        <p>Redirecting to GovTrack Kenya Polls...</p>
      </body>
      </html>
    `);
  }

  const title = `🗳️ Vote: ${poll.title}`;
  const desc = poll.description || "Cast your official ballot opinion and track live election stats and governance metrics on GovTrack Kenya.";
  const host = req.get('host') || 'govtrack-five.vercel.app';
  const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const baseUrl = `${protocol}://${host}`;
  
  const imageUrl = `${baseUrl}/api/share/image/poll/${poll.id}`;
  const redirectUrl = `${baseUrl}/#/polls/${poll.id}`;

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
      
      <!-- Open Graph / Facebook / WhatsApp -->
      <meta property="og:type" content="website">
      <meta property="og:url" content="${baseUrl}/api/share/poll/${poll.id}">
      <meta property="og:title" content="${title}">
      <meta property="og:description" content="${desc}">
      <meta property="og:image" content="${imageUrl}">
      <meta property="og:image:width" content="1200">
      <meta property="og:image:height" content="630">
      <meta property="og:image:type" content="image/png">
      
      <!-- Twitter -->
      <meta name="twitter:card" content="summary_large_image">
      <meta name="twitter:url" content="${baseUrl}/api/share/poll/${poll.id}">
      <meta name="twitter:title" content="${title}">
      <meta name="twitter:description" content="${desc}">
      <meta name="twitter:image" content="${imageUrl}">
      
      <!-- Redirect real users to interactive SPA -->
      <meta http-equiv="refresh" content="0; url=${redirectUrl}">
      <script>
        window.location.href = "${redirectUrl}";
      </script>
    </head>
    <body>
      <p>Redirecting you to GovTrack Kenya: "${poll.title}"...</p>
    </body>
    </html>
  `);
});

// Returns the pre-rendered PNG image from the database OR renders a beautiful dynamic fallback SVG
app.get("/api/share/image/poll/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await getDatabaseLoadedPromise().catch(() => {});
  const poll = DB.polls.find(p => p.id === id);

  if (poll && poll.featured_image && poll.featured_image.startsWith("data:image/")) {
    try {
      const matches = poll.featured_image.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const contentType = matches[1];
        const base64Data = matches[2];
        const imgBuffer = Buffer.from(base64Data, "base64");
        
        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "public, max-age=86400"); // 1 day cache
        return res.send(imgBuffer);
      }
    } catch (err) {
      console.error("Failed to parse poll share image base64:", err);
    }
  }

  // Pure SVG fallback: zero serverless dependencies, extremely rich visual aesthetics
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=120"); // short cache to allow generated image to take over
  
  const svgWidth = 1200;
  const svgHeight = 630;
  
  let optionsSvg = "";
  if (poll && poll.options && Array.isArray(poll.options)) {
    const optionsToShow = poll.options.slice(0, 4);
    const spacing = svgWidth / (optionsToShow.length + 1);
    optionsToShow.forEach((opt, idx) => {
      const cx = spacing * (idx + 1);
      const cy = 440;
      const name = opt.label;
      const initials = name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
      const partyColor = opt.party_color || "#3b82f6";
      
      optionsSvg += `
        <!-- Option ${idx + 1} -->
        <g>
          <circle cx="${cx}" cy="${cy}" r="75" fill="#1e293b" stroke="${partyColor}" stroke-width="6" />
          <circle cx="${cx}" cy="${cy}" r="65" fill="${partyColor}" opacity="0.15" />
          <text x="${cx}" y="${cy + 12}" font-family="system-ui, -apple-system, sans-serif" font-size="36" font-weight="bold" fill="#ffffff" text-anchor="middle">${initials}</text>
          <text x="${cx}" y="${cy + 110}" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="bold" fill="#ffffff" text-anchor="middle">${name.substring(0, 18)}</text>
          <text x="${cx}" y="${cy + 135}" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="bold" fill="${partyColor}" text-anchor="middle">${opt.party || "Independent"}</text>
        </g>
      `;
    });
  }

  const pollTitle = poll ? poll.title : "GovTrack Live Polls";
  const pollCategory = poll ? poll.category.toUpperCase() : "OPINION POLL";
  const cleanTitle = pollTitle.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const svgContent = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="100%" height="100%">
      <defs>
        <linearGradient id="bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0A1628" />
          <stop offset="100%" stop-color="#1E293B" />
        </linearGradient>
      </defs>
      
      <rect width="${svgWidth}" height="${svgHeight}" fill="url(#bg-grad)" />
      <circle cx="1100" cy="100" r="220" fill="#F5A623" opacity="0.04" />
      <circle cx="100" cy="550" r="150" fill="#3b82f6" opacity="0.03" />
      
      <text x="70" y="85" font-family="system-ui, -apple-system, sans-serif" font-size="26" font-weight="900" fill="#F5A623" letter-spacing="1">🗳️ GOVTRACK KENYA</text>
      <text x="70" y="130" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="bold" fill="#3b82f6" letter-spacing="2">${pollCategory}</text>
      
      <foreignObject x="70" y="170" width="1060" height="150">
        <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: system-ui, -apple-system, sans-serif; font-size: 40px; font-weight: 800; color: #ffffff; line-height: 1.35; max-height: 140px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;">
          ${cleanTitle}
        </div>
      </foreignObject>
      
      <line x1="70" y1="310" x2="1130" y2="310" stroke="#F5A623" stroke-width="2" opacity="0.3" />
      ${optionsSvg}
      <text x="1130" y="585" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="bold" fill="#64748b" text-anchor="end">CITIZEN OPINION PORTAL • HTTPS://GOVTRACK.CO.KE</text>
    </svg>
  `;
  
  res.send(svgContent);
});

// Server-side social share landing for News Articles (serves custom Open Graph tags, then redirects to SPA)
app.get("/api/share/news/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await getDatabaseLoadedPromise().catch(() => {});
  const news = DB.newsItems.find(n => n.id === id);

  if (!news) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>GovTrack Kenya - Article Not Found</title>
        <meta http-equiv="refresh" content="0; url=https://govtrack-five.vercel.app/#/news">
        <script>window.location.href = "https://govtrack-five.vercel.app/#/news";</script>
      </head>
      <body>
        <p>Redirecting to GovTrack Kenya News...</p>
      </body>
      </html>
    `);
  }

  const title = `📰 News: ${news.title}`;
  const desc = news.summary ? news.summary.replace(/<[^>]*>/g, '').substring(0, 200) + '...' : "Read the latest legislative, electoral, and policy news tracking on GovTrack Kenya.";
  const host = req.get('host') || 'govtrack-five.vercel.app';
  const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const baseUrl = `${protocol}://${host}`;
  
  const imageUrl = `${baseUrl}/api/share/image/news/${news.id}`;
  const redirectUrl = `${baseUrl}/#/news/${news.id}`;

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
      
      <!-- Open Graph / Facebook / WhatsApp -->
      <meta property="og:type" content="article">
      <meta property="og:url" content="${baseUrl}/api/share/news/${news.id}">
      <meta property="og:title" content="${title}">
      <meta property="og:description" content="${desc}">
      <meta property="og:image" content="${imageUrl}">
      <meta property="og:image:width" content="1200">
      <meta property="og:image:height" content="630">
      
      <!-- Twitter -->
      <meta name="twitter:card" content="summary_large_image">
      <meta name="twitter:url" content="${baseUrl}/api/share/news/${news.id}">
      <meta name="twitter:title" content="${title}">
      <meta name="twitter:description" content="${desc}">
      <meta name="twitter:image" content="${imageUrl}">
      
      <!-- Redirect real users to interactive SPA -->
      <meta http-equiv="refresh" content="0; url=${redirectUrl}">
      <script>
        window.location.href = "${redirectUrl}";
      </script>
    </head>
    <body>
      <p>Redirecting you to GovTrack Kenya Article: "${news.title}"...</p>
    </body>
    </html>
  `);
});

// Serves the news article image directly (proxied to prevent CORS errors or offline images)
app.get("/api/share/image/news/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await getDatabaseLoadedPromise().catch(() => {});
  const news = DB.newsItems.find(n => n.id === id);

  if (news && news.image_url) {
    try {
      if (news.image_url.startsWith("data:image/")) {
        const matches = news.image_url.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          res.setHeader("Content-Type", matches[1]);
          res.setHeader("Cache-Control", "public, max-age=86400");
          return res.send(Buffer.from(matches[2], "base64"));
        }
      }
      
      const fetchRes = await fetch(news.image_url);
      const buffer = await fetchRes.arrayBuffer();
      res.setHeader("Content-Type", fetchRes.headers.get("content-type") || "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.send(Buffer.from(buffer));
    } catch (err) {
      console.error("Failed to proxy news share image:", err);
    }
  }

  // Fallback: A beautiful dynamic SVG for news articles
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=120");
  
  const svgWidth = 1200;
  const svgHeight = 630;
  const articleTitle = news ? news.title : "GovTrack News Update";
  const articleSource = news ? news.source_name : "GovTrack Editorial";
  const cleanTitle = articleTitle.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  
  const svgContent = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="100%" height="100%">
      <defs>
        <linearGradient id="bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0A1628" />
          <stop offset="100%" stop-color="#0F172A" />
        </linearGradient>
      </defs>
      
      <rect width="${svgWidth}" height="${svgHeight}" fill="url(#bg-grad)" />
      <circle cx="1000" cy="500" r="300" fill="#3b82f6" opacity="0.05" />
      <path d="M -100,200 L 400,-100 L 200,600 Z" fill="#F5A623" opacity="0.02" />
      
      <text x="80" y="95" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="900" fill="#F5A623" letter-spacing="1">📰 GOVTRACK KENYA NEWS</text>
      <text x="80" y="135" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="bold" fill="#3b82f6" letter-spacing="2">BREAKING LEGISLATIVE UPDATE</text>
      <rect x="80" y="160" width="80" height="8" fill="#F5A623" rx="4" />
      
      <foreignObject x="80" y="200" width="1040" height="240">
        <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: system-ui, -apple-system, sans-serif; font-size: 52px; font-weight: 800; color: #ffffff; line-height: 1.25; max-height: 220px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;">
          ${cleanTitle}
        </div>
      </foreignObject>
      
      <line x1="80" y1="470" x2="1120" y2="470" stroke="#F5A623" stroke-width="2" opacity="0.2" />
      <text x="80" y="530" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="bold" fill="#94a3b8">Source: ${articleSource}</text>
      <text x="80" y="570" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="bold" fill="#64748b">Verified electoral report, live and interactive.</text>
      <text x="1120" y="570" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="bold" fill="#F5A623" text-anchor="end">READ ARTICLE ON GOVTRACK.CO.KE →</text>
    </svg>
  `;
  
  res.send(svgContent);
});


// Serve Vite or Static files depending on environment
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else if (!process.env.VERCEL) {
    // Only serve static files when running standalone (not on Vercel)
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath, { maxAge: "1d" }));
    // SPA fallback: only for non-API, non-asset requests
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/") || req.path.includes(".")) {
        return next();
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Start listening only when not on Vercel (Vercel handles this)
  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`GovTrack server operating live at http://localhost:${PORT}`);
      getDatabaseLoadedPromise().then(() => {
        console.log("Database ready. GovTrack is fully operational.");
      }).catch((err) => {
        console.error("Database load failed:", err);
      });
    });
  } else {
    // Vercel serverless: load database immediately
    getDatabaseLoadedPromise().then(() => {
      console.log("[Vercel] Database ready.");
    }).catch((err) => {
      console.error("[Vercel] Database load failed:", err);
    });
  }
}

startServer();

// Export for Vercel serverless
export default app;

