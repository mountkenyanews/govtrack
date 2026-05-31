/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import fs from "fs";
// Vite is imported dynamically in dev mode only (see startServer)
import { GoogleGenAI, Type } from "@google/genai";
import { User, Poll, PollOption, Vote, Politician, Comment, NewsItem, PlatformStats, AppNotification, DevelopmentProgress } from "./src/types";

// Firebase Integration
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import { getStorage, ref as storageRef, uploadString, getDownloadURL } from "firebase/storage";

let firebaseConfig: any = null;

if (process.env.FIREBASE_CONFIG) {
  try {
    firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG);
    console.log("[Firebase] Successfully loaded config from FIREBASE_CONFIG environment variable.");
  } catch (err: any) {
    console.error("[Firebase] Failed to parse FIREBASE_CONFIG. Falling back.", err);
  }
}

if (!firebaseConfig && process.env.FIREBASE_PROJECT_ID) {
  firebaseConfig = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    appId: process.env.FIREBASE_APP_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    firestoreDatabaseId: process.env.FIREBASE_FIRESTORE_DATABASE_ID || "(default)"
  };
  console.log("[Firebase] Loaded config from individual environment variables.");
}

if (!firebaseConfig) {
  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      console.log("[Firebase] Loaded config from local firebase-applet-config.json file.");
    }
  } catch (err) {
    console.warn("[Firebase] Local firebase-applet-config.json load error.", err);
  }
}

// Fallback to hardcoded production applet credentials if still not loaded (ensuring zero-config serverless works out-of-the-box!)
if (!firebaseConfig || !firebaseConfig.projectId) {
  firebaseConfig = {
    projectId: "idyllic-art-v8gvj",
    appId: "1:568813002354:web:f036c352fe8e956caf6ceb",
    apiKey: "AIzaSyClW2YAS3lEyEr6P_NagV_hef9V_KYnGhI",
    authDomain: "idyllic-art-v8gvj.firebaseapp.com",
    firestoreDatabaseId: "ai-studio-f1130241-c3c4-434f-b90e-aa93968a3f50",
    storageBucket: "idyllic-art-v8gvj.firebasestorage.app",
    messagingSenderId: "568813002354"
  };
  console.log("[Firebase] Loaded default production applet credentials fallback.");
}

let firebaseApp: any = null;
let db: any = null;
let storage: any = null;

try {
  // Prevent duplicate Firebase app initialization (important for hot-reload dev)
  firebaseApp = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId || "(default)");
  storage = getStorage(firebaseApp);
  console.log("[Firebase] Successfully initialized Firebase Services.");
  console.log(`[Firebase] Using Firestore DB: ${firebaseConfig.firestoreDatabaseId || "(default)"}, Storage: ${firebaseConfig.storageBucket}`);
} catch (err) {
  console.error("[Firebase] Fatal initialization error: ", err);
}

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: "20mb" }));

// SEO: Dynamic sitemap.xml for Google indexing
const SITE_URL = process.env.APP_URL || "https://govtrack.co.ke";
app.get("/sitemap.xml", (req, res) => {
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
    <loc>${SITE_URL}${page.loc}</loc>
    <lastmod>${(page as any).lastmod || today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`).join("\n")}
</urlset>`;

  res.set("Content-Type", "application/xml");
  res.send(xml);
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
    }
  ];

  DB.users = seedUsers;
  DB.credentials = {
    "admin@govtrack.org": "admin",
    "journalist@govtrack.org": "journalist",
    "analyst@govtrack.org": "analyst",
    "citizen@govtrack.org": "citizen",
  };

  // Seed Politicians
  const seedPoliticians: Politician[] = [
    {
      id: 1,
      full_name: "William Ruto",
      photo_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&h=256&q=80",
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
      photo_url: "https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?auto=format&fit=crop&w=256&h=256&q=80",
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
      photo_url: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=256&h=256&q=80",
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
      photo_url: "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=256&h=256&q=80",
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
      photo_url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&h=256&q=80",
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
      photo_url: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=256&h=256&q=80",
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
      photo_url: "https://images.unsplash.com/photo-1500048993953-d23a436266cf?auto=format&fit=crop&w=256&h=256&q=80",
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
      photo_url: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=256&h=256&q=80",
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
      photo_url: "https://images.unsplash.com/photo-1542909168-82c3e7fdca5c?auto=format&fit=crop&w=256&h=256&q=80",
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
      photo_url: "https://images.unsplash.com/photo-1519345182560-3f2917c472ef?auto=format&fit=crop&w=256&h=256&q=80",
      title: "Chancellor",
      country: "Germany",
      party: "Social Democratic Party (SPD)",
      party_color: "#E3000F",
      office: "Chancellor of the Federal Republic of Germany",
      bio: "Leading coalition government. Directs defense structural shifts, industrial decarbonization, and immigration program reforms.",
      date_of_birth: "1958-06-14",
      approval_rating: 29.0,
      total_poll_appearances: 2,
      social_twitter: "Bundeskanzler",
      is_active: true,
      tags: ["Germany", "Europe", "SPD"]
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
        { id: 101, poll_id: 1, label: "William Ruto", description: "Incumbent President - UDA leadership", photo_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&h=256&q=80", party: "United Democratic Alliance", party_color: "#32CD32", vote_count: 3624, order: 1 },
        { id: 102, poll_id: 1, label: "Raila Odinga", description: "AUC Chair Representative - Opposition coalition", photo_url: "https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?auto=format&fit=crop&w=256&h=256&q=80", party: "Orange Democratic Movement", party_color: "#F08080", vote_count: 4210, order: 2 },
        { id: 103, poll_id: 1, label: "Kalonzo Musyoka", description: "Wiper Democratic Movement - Azimio principal", photo_url: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=256&h=256&q=80", party: "Wiper Democratic Movement", party_color: "#0033A0", vote_count: 598, order: 3 }
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
        { id: 601, poll_id: 6, label: "Cyril Ramaphosa", description: "G20 host representing South Africa strategy", photo_url: "https://images.unsplash.com/photo-1500048993953-d23a436266cf?auto=format&fit=crop&w=256&h=256&q=80", party: "ANC Party", party_color: "#006600", vote_count: 5120, order: 1 },
        { id: 602, poll_id: 6, label: "William Ruto", description: "Climate integration initiatives leader", photo_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&h=256&q=80", party: "UDA Party", party_color: "#32CD32", vote_count: 4890, order: 2 },
        { id: 603, poll_id: 6, label: "Bola Tinubu", description: "Infrastructure program sponsor in Nigeria", photo_url: "https://images.unsplash.com/photo-1566492031773-4f4e44671857?auto=format&fit=crop&w=256&h=256&q=80", party: "APC Party", party_color: "#10B981", vote_count: 3218, order: 3 },
        { id: 604, poll_id: 6, label: "Samia Suluhu Hassan", description: "Trade pact expansion sponsor in Tanzania", photo_url: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=256&h=256&q=80", party: "CCM Party", party_color: "#FF8C00", vote_count: 2450, order: 4 }
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
      image_url: "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?auto=format&fit=crop&w=600&q=80",
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
      image_url: "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=600&q=80",
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
      image_url: "https://images.unsplash.com/photo-1541872703-74c5e44368f9?auto=format&fit=crop&w=600&q=80",
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
      image_url: "https://images.unsplash.com/photo-1540910419892-4a36d2c3266c?auto=format&fit=crop&w=600&q=80",
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
      image_url: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=600&q=80",
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
      image_url: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=600&q=80",
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

async function loadDatabase() {
  if (!db) {
    console.error("[DB] Firestore not initialized — falling back to seed data.");
    seedInitialData();
    return;
  }
  try {
    const docRef = doc(db, "server_db", SERVER_DB_DOC_ID);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data && data.payload) {
        DB = JSON.parse(data.payload);
        if (!DB.notifications) {
          DB.notifications = [];
        }
        if (!DB.developments) {
          DB.developments = [];
        }
        if (!DB.parties) {
          DB.parties = [];
        }
        // Force-rebuild parties array to heal any pre-existing incorrect or mismatched country entries
        DB.parties = [];
        if (DB.politicians && Array.isArray(DB.politicians)) {
          const PLACEHOLDER_PATTERN = /unsplash\.com\/photo-|ui-avatars\.com/;
          const healPromises: Promise<void>[] = [];

          DB.politicians.forEach(pol => {
            if (pol.party) {
              ensurePartyExists(pol.party, pol.party_color || "#3b82f6", pol.country);
            }

            // Auto-heal: If a politician has a legacy stock Unsplash photo or initials placeholder, try to resolve their real Wikipedia portrait
            // to permanently heal them in your live Firestore DB!
            if (PLACEHOLDER_PATTERN.test(pol.photo_url || "")) {
              console.log(`[DB Auto-Heal] Politician "${pol.full_name}" has placeholder image. Resolving real portrait from Wikipedia...`);
              
              const healPromise = (async () => {
                try {
                  const wikiUrl = await getWikipediaImageUrl(pol.full_name);
                  if (wikiUrl) {
                    pol.photo_url = wikiUrl;
                    console.log(`[DB Auto-Heal] Resolved Wikipedia photo for "${pol.full_name}" -> ${wikiUrl}`);
                  } else {
                    pol.photo_url = `https://ui-avatars.com/api/?name=${encodeURIComponent(pol.full_name)}&background=0A1628&color=ffffff&size=256&bold=true`;
                    console.log(`[DB Auto-Heal] No Wikipedia photo found for "${pol.full_name}". Configured clean initials avatar.`);
                  }
                } catch (err) {
                  console.error(`[DB Auto-Heal] Failed to resolve photo for "${pol.full_name}":`, err);
                  pol.photo_url = `https://ui-avatars.com/api/?name=${encodeURIComponent(pol.full_name)}&background=0A1628&color=ffffff&size=256&bold=true`;
                }
              })();
              
              healPromises.push(healPromise);
            }
          });

          if (healPromises.length > 0) {
            // Await all healing promises so they finish completely inside serverless environments before the execution gets suspended!
            await Promise.all(healPromises);
            syncPollOptionsPhotos();
            await saveDatabase();
          }
        }

        syncPollOptionsPhotos();
        console.log(`[DB] Loaded from Firestore: ${DB.polls.length} polls, ${DB.politicians.length} politicians, ${DB.newsItems.length} news items.`);
        return;
      }
    }
    
    // No data in firestore
    console.log("[DB] No existing data found in Firestore — seeding initial data.");
    seedInitialData();
  } catch (err: any) {
    console.error("[DB] Error reading from Firestore — falling back to seed data:", err?.message || err);
    seedInitialData();
  }
}

async function saveDatabase() {
  if (!db) {
    console.error("[DB] Firestore not initialized, skipping save.");
    return;
  }
  try {
    syncPollOptionsPhotos();
    const payload = JSON.stringify(DB);
    
    // Firestore document limit is 1MB. Warn if approaching it.
    const payloadBytes = Buffer.byteLength(payload, 'utf8');
    if (payloadBytes > 900000) {
      console.warn(`[DB] WARNING: Database payload is ${(payloadBytes / 1024).toFixed(0)}KB — approaching Firestore 1MB document limit!`);
    }
    
    const docRef = doc(db, "server_db", SERVER_DB_DOC_ID);
    await setDoc(docRef, {
      is_server_node: true,
      server_secret: SERVER_SECRET,
      payload,
      saved_at: new Date().toISOString(),
    });
    console.log(`[DB] Saved to Firestore. (${(payloadBytes / 1024).toFixed(1)}KB)`);
  } catch (err: any) {
    console.error("[DB] Failed to persist database changes to Firestore:", err?.message || err);
  }
}

// Cache the promise so we load the database once, shared across requests/cold starts
let databaseLoadedPromise: Promise<void> | null = null;

function getDatabaseLoadedPromise(): Promise<void> {
  if (!databaseLoadedPromise) {
    databaseLoadedPromise = loadDatabase();
  }
  return databaseLoadedPromise;
}

// Middleware to ensure database is loaded before processing API requests
app.use(async (req, res, next) => {
  if (!req.path.startsWith("/api/")) {
    return next();
  }
  try {
    // In Vercel serverless environment, we bypass the cache and load fresh from Firestore
    // on every API request to guarantee we never serve stale cached data from previously-warmed function instances.
    if (process.env.VERCEL) {
      await loadDatabase();
    } else {
      await getDatabaseLoadedPromise();
    }
    next();
  } catch (err) {
    console.error("[Database Middleware] Error awaiting database load:", err);
    next(); // Fallback to current memory state
  }
});

// loadDatabase() is now awaited in startServer() and in the middleware above

// ---------------------- API ROUTES ----------------------

// 1. AUTH API
app.post("/api/auth/register", (req, res) => {
  const { display_name, email, password, country, role, bio } = req.body;
  if (!display_name || !email || !password) {
    return res.status(400).json({ error: "Display name, email and password are required." });
  }

  const existing = DB.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: "A user with this email already exists." });
  }

  const newUser: User = {
    id: DB.users.length + 1,
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
  saveDatabase();

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

app.post("/api/notifications/:id/read", (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized access. No valid session token." });
  }
  
  const notifId = parseInt(req.params.id);
  const index = (DB.notifications || []).findIndex(n => n.id === notifId && n.user_id === user.id);
  if (index !== -1) {
    DB.notifications[index].is_read = true;
    saveDatabase();
  }
  
  res.json({ success: true });
});

app.post("/api/notifications/mark-all-read", (req, res) => {
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
    saveDatabase();
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

app.put("/api/auth/profile", (req, res) => {
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

  saveDatabase();
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
app.post("/api/polls/:id/vote", (req, res) => {
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
    saveDatabase();
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
  const newVote: Vote = {
    id: DB.votes.length + 1,
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
    const newNotif: AppNotification = {
      id: DB.notifications ? DB.notifications.length + 1 : 1,
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

  saveDatabase();

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

app.post("/api/polls/:id/comments", (req, res) => {
  const pollId = parseInt(req.params.id);
  const { user_id, content, parent_id } = req.body;

  if (!content || content.trim().length === 0) {
    return res.status(400).json({ error: "Comment text cannot be empty." });
  }

  const user = DB.users.find(u => u.id === user_id);
  if (!user) {
    return res.status(401).json({ error: "You must be logged in to participate in discussion threads." });
  }

  const newComment: Comment = {
    id: DB.comments.length + 1,
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
    const newNotif: AppNotification = {
      id: DB.notifications ? DB.notifications.length + 1 : 1,
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

  saveDatabase();

  res.status(201).json(newComment);
});

app.post("/api/comments/:commentId/like", (req, res) => {
  const commentId = parseInt(req.params.commentId);
  const commentIndex = DB.comments.findIndex(c => c.id === commentId);
  if (commentIndex === -1) {
    return res.status(404).json({ error: "Comment not found." });
  }
  DB.comments[commentIndex].likes += 1;
  saveDatabase();
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

app.post("/api/politicians/:id/developments/suggest", (req, res) => {
  const politicianId = parseInt(req.params.id, 10);
  const { title, description, timeline, date, email } = req.body;
  if (!title || !description || !timeline) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!DB.developments) DB.developments = [];
  const newDev: DevelopmentProgress = {
    id: DB.developments.length > 0 ? Math.max(...DB.developments.map(d => d.id)) + 1 : 1,
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
  saveDatabase().catch(console.error);
  res.json({ success: true, development: newDev });
});

app.put("/api/admin/developments/:id/approve", (req, res) => {
  const devId = parseInt(req.params.id, 10);
  if (!DB.developments) DB.developments = [];
  const dev = DB.developments.find(d => d.id === devId);
  if (!dev) return res.status(404).json({ error: "Not found" });
  
  dev.is_approved = true;
  saveDatabase().catch(console.error);
  res.json({ success: true, development: dev });
});

app.delete("/api/admin/developments/:id", (req, res) => {
  const devId = parseInt(req.params.id, 10);
  if (!DB.developments) DB.developments = [];
  DB.developments = DB.developments.filter(d => d.id !== devId);
  saveDatabase().catch(console.error);
  res.json({ success: true });
});

app.put("/api/admin/developments/:id", (req, res) => {
  const devId = parseInt(req.params.id, 10);
  const { title, description, timeline, date } = req.body;
  
  if (!DB.developments) DB.developments = [];
  const dev = DB.developments.find(d => d.id === devId);
  if (!dev) return res.status(404).json({ error: "Not found" });
  
  if (title) dev.title = title;
  if (description) dev.description = description;
  if (timeline) dev.timeline = timeline;
  if (date !== undefined) dev.date = date;
  
  saveDatabase().catch(console.error);
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

Ensure the description is comprehensive, balanced, and includes these nuances.`;

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

app.post("/api/admin/politicians/:id/developments/bulk", (req, res) => {
  const politicianId = parseInt(req.params.id, 10);
  const { developments } = req.body;
  if (!Array.isArray(developments)) return res.status(400).json({ error: "Invalid payload" });

  if (!DB.developments) DB.developments = [];
  const addedItems: DevelopmentProgress[] = [];

  for (const item of developments) {
    const newDev: DevelopmentProgress = {
      id: DB.developments.length > 0 ? Math.max(...DB.developments.map(d => d.id)) + 1 : 1,
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

  saveDatabase().catch(console.error);
  res.json({ success: true, added: addedItems });
});

app.post("/api/admin/politicians/:id/developments", (req, res) => {
  const politicianId = parseInt(req.params.id, 10);
  const { title, description, timeline, date } = req.body;
  if (!title || !description || !timeline) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!DB.developments) DB.developments = [];
  const newDev: DevelopmentProgress = {
    id: DB.developments.length > 0 ? Math.max(...DB.developments.map(d => d.id)) + 1 : 1,
    politician_id: politicianId,
    title,
    description,
    timeline,
    date,
    is_approved: true,
    creator_type: "admin"
  };

  DB.developments.push(newDev);
  saveDatabase().catch(console.error);
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
app.post("/api/polls/create", (req, res) => {
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

  const pollId = DB.polls.length + 1;

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

  saveDatabase();

  res.status(201).json({ poll: newPoll });
});

// 9. BASE44 PROFILE PHOTO FILE UPLOAD PROXY (saving base64 inside JSON file)
app.post("/api/upload", async (req, res) => {
  const { fileName, fileContent } = req.body; // base64 payload
  if (!fileContent) {
    return res.status(400).json({ error: "No file content supplied." });
  }

  try {
    const fileId = Date.now().toString() + "-" + fileName;
    const fileRef = storageRef(storage, "uploads/" + fileId);
    
    await uploadString(fileRef, fileContent, 'data_url');
    const downloadUrl = await getDownloadURL(fileRef);
    
    res.json({ url: downloadUrl });
  } catch (err) {
    console.error("Storage upload failed", err);
    // Fallback to base64 if storage fails
    res.json({ url: fileContent });
  }
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

app.post("/api/admin/polls/:id/feature", (req, res) => {
  const id = parseInt(req.params.id);
  DB.polls.forEach(p => {
    if (p.id === id) {
      p.is_featured = true;
    } else {
      p.is_featured = false; // single featured poll rule
    }
  });
  saveDatabase();
  res.json({ success: true, polls: DB.polls });
});

app.post("/api/admin/polls/:id/status", (req, res) => {
  const id = parseInt(req.params.id);
  const { status } = req.body;
  const poll = DB.polls.find(p => p.id === id);
  if (poll) {
    poll.status = status;
    saveDatabase();
    return res.json({ success: true, poll });
  }
  res.status(404).json({ error: "Poll not found" });
});

app.delete("/api/admin/polls/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const initialCount = DB.polls.length;
    DB.polls = DB.polls.filter(p => p.id !== id);
    
    if (DB.polls.length === initialCount) {
      return res.status(404).json({ error: "Poll not found or already deleted." });
    }
    
    saveDatabase();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to delete poll: " + err.message });
  }
});

app.post("/api/admin/politicians", (req, res) => {
  const { full_name, title, country, party, party_color, office, bio, date_of_birth, photo_url } = req.body;
  if (!full_name || !photo_url) {
    return res.status(400).json({ error: "Name and profile photo are required." });
  }

  const newPol: Politician = {
    id: DB.politicians.length + 1,
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
  saveDatabase();
  res.status(201).json(newPol);
});

app.put("/api/admin/politicians/:id", (req, res) => {
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

  saveDatabase();
  res.json(DB.politicians[polIndex]);
});

app.delete("/api/admin/politicians/:id", (req, res) => {
  const user = getAuthUser(req);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ error: "Forbidden: Only admins can delete profiles." });
  }
  const id = parseInt(req.params.id);
  DB.politicians = DB.politicians.filter(p => p.id !== id);
  saveDatabase();
  res.json({ success: true });
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

// Unified AI content generator (Groq primary with Gemini fallback)
async function generateAIContent(prompt: string, schemaDescription: string, fallbackGeminiOpts: { model: string, contents: string, config: any }): Promise<any> {
  const groqApiKey = process.env.GROQ_API_KEY;
  
  if (groqApiKey) {
    // We will attempt multiple robust models on console.groq.com to guarantee reliability
    const groqModels = ["llama-3.3-70b-versatile", "llama3-70b-8192", "mixtral-8x7b-32768"];
    
    for (const modelName of groqModels) {
      try {
        console.log(`[AI Engine] Attempting prompt via console.groq.com leveraging model: ${modelName}...`);
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${groqApiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
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
          })
        });

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
    
    console.log(`[AI Engine] Attempting Gemini fallback via gemini-2.0-flash...`);
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
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

app.post("/api/admin/politicians/bulk", (req, res) => {
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
    saveDatabase();
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

app.put("/api/admin/polls/:id", (req, res) => {
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

  saveDatabase();
  res.json(poll);
});

app.put("/api/admin/news/:id", (req, res) => {
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

  saveDatabase();
  res.json(DB.newsItems[newsIndex]);
});

app.delete("/api/admin/news/:id", (req, res) => {
  const id = parseInt(req.params.id);
  DB.newsItems = DB.newsItems.filter(n => n.id !== id);
  saveDatabase();
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

app.delete("/api/admin/comments/:id", (req, res) => {
  const id = parseInt(req.params.id);
  DB.comments = DB.comments.filter(c => c.id !== id);
  saveDatabase();
  res.json({ success: true });
});

app.post("/api/admin/news", (req, res) => {
  const { title, summary, image_url, source_url, source_name, related_poll_id, country, tags } = req.body;
  if (!title || !summary) {
    return res.status(400).json({ error: "Title and summary are required." });
  }

  const newNews: NewsItem = {
    id: DB.newsItems.length + 1,
    title,
    summary,
    image_url: image_url || "https://images.unsplash.com/photo-1540910419892-4a36d2c3266c?auto=format&fit=crop&w=600&q=80",
    source_url: source_url || "https://www.politico.com",
    source_name: source_name || "GovTrack Feed",
    published_at: new Date().toISOString(),
    related_poll_id: related_poll_id ? parseInt(related_poll_id) : null,
    country: country || "Global",
    tags: tags ? tags.split(",").map((t: string) => t.trim()) : [],
  };

  DB.newsItems.push(newNews);
  saveDatabase();
  res.status(201).json(newNews);
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
        console.error("Database load failed, using seed data:", err);
        seedInitialData();
      });
    });
  } else {
    // Vercel serverless: load database immediately
    getDatabaseLoadedPromise().then(() => {
      console.log("[Vercel] Database ready.");
    }).catch((err) => {
      console.error("[Vercel] Database load failed, using seed data:", err);
      seedInitialData();
    });
  }
}

startServer();

// Export for Vercel serverless
export default app;

