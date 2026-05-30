<div align="center">

<img src="public/banner.png" alt="GovTrack Banner" width="100%" />

# 🏛️ GovTrack — Voice & Accountability

**A non-partisan political polling and accountability platform for democratic engagement worldwide.**

[![Live Demo](https://img.shields.io/badge/🌐_Live_Demo-govtrack.co.ke-F5A623?style=for-the-badge&labelColor=0A1628)](https://govtrack.co.ke)
[![Railway](https://img.shields.io/badge/Deployed_on-Railway-0B0D0E?style=for-the-badge&logo=railway&logoColor=white)](https://railway.app)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com/)

---

*Track politicians • Vote on polls • Analyze elections • Follow policy developments*

</div>

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 🗳️ Political Polling
- **Single choice**, **multiple choice**, **yes/no**, and **approval rating** poll types
- Real-time vote tallying with animated progress bars
- Featured poll spotlight on the homepage
- Device-type analytics (Desktop/Mobile/Tablet)
- IP-based duplicate vote prevention

</td>
<td width="50%">

### 👥 Politician Profiles
- Comprehensive politician directory with photos, bios, and party affiliations
- Dynamic **approval ratings** computed from poll performance
- AI-powered auto-fill from Wikipedia for quick profile creation
- Development timeline tracking (past, present, future milestones)
- Community-submitted development suggestions with admin approval

</td>
</tr>
<tr>
<td>

### 🏢 Political Parties
- Automatic party registry — parties are created when politicians are added
- Party profile pages with member listing
- Party color theming throughout the UI
- Country-based party filtering

</td>
<td>

### 📰 News Feed
- Curated political news articles linked to relevant polls
- Country and tag-based filtering
- Admin news management dashboard
- Source attribution and external links

</td>
</tr>
<tr>
<td>

### 🤖 AI-Powered Content
- **Groq LLaMA 70B** generates politician development timelines
- AI auto-fill for politician profiles (bio, party, office, DOB)
- AI-assisted poll creation from natural language prompts
- Wikipedia image resolution for politician photos

</td>
<td>

### 🔐 User System & Roles
- **4 user roles**: Admin, Journalist, Analyst, Citizen
- Role-based access control for poll creation & admin features
- Notification system for poll comments and activity
- User dashboard with vote history and profile management

</td>
</tr>
</table>

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19 · TypeScript · Tailwind CSS v4 · Vite |
| **Backend** | Express.js · Node.js 20 · esbuild |
| **Database** | Firebase Firestore (cloud-persisted) |
| **Storage** | Firebase Storage (profile photos, uploads) |
| **AI Engine** | Groq API (LLaMA 3.3 70B Versatile) |
| **Deployment** | Railway (Nixpacks) |
| **SEO** | Dynamic sitemap.xml · robots.txt · JSON-LD Schema |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 20.0.0
- **npm** ≥ 9.x
- A [Firebase](https://firebase.google.com/) project (Firestore + Storage)
- A [Groq](https://console.groq.com/) API key

### 1. Clone & Install

```bash
git clone https://github.com/mountkenyanews/govtrack.git
cd govtrack
npm install
```

### 2. Configure Environment

Copy the example environment file and fill in your credentials:

```bash
cp .env.example .env
```

```env
# Firebase Configuration (JSON string or individual vars)
FIREBASE_CONFIG={"projectId":"...","apiKey":"...","authDomain":"..."}

# OR individual Firebase variables
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_API_KEY=your-api-key
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
FIREBASE_APP_ID=your-app-id
FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=your-sender-id
FIREBASE_FIRESTORE_DATABASE_ID=your-database-id

# AI Content Generation
GROQ_API_KEY=gsk_your_groq_api_key

# Optional
APP_URL=https://your-domain.com
GEMINI_API_KEY=your-gemini-key
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — the app runs with Vite HMR for instant reloads.

### 4. Build for Production

```bash
npm run build
npm start
```

---

## 📁 Project Structure

```
govtrack/
├── public/                  # Static assets (robots.txt, favicon, og-image)
├── src/
│   ├── components/          # Shared UI components
│   │   ├── Navigation.tsx   # Main navigation bar
│   │   ├── Footer.tsx       # Site footer
│   │   ├── Shared.tsx       # Reusable UI primitives
│   │   ├── PosterGenerator.tsx
│   │   └── RichTextEditor.tsx
│   ├── pages/               # Route pages (hash-based SPA)
│   │   ├── HomeView.tsx     # Landing page with featured poll
│   │   ├── BrowsePollsView.tsx
│   │   ├── PollDetailView.tsx
│   │   ├── PoliticiansView.tsx
│   │   ├── PoliticianProfileView.tsx
│   │   ├── PartyProfileView.tsx
│   │   ├── ElectionsView.tsx
│   │   ├── PolicyView.tsx
│   │   ├── ResultsView.tsx
│   │   ├── NewsView.tsx
│   │   ├── CreatePollView.tsx
│   │   ├── DashboardView.tsx
│   │   ├── AdminView.tsx
│   │   ├── LoginRegisterView.tsx
│   │   ├── AboutView.tsx
│   │   └── HowItWorksView.tsx
│   ├── utils/
│   │   ├── api.ts           # API client (fetch wrapper)
│   │   └── richText.ts      # Rich text utilities
│   ├── types.ts             # TypeScript interfaces
│   ├── App.tsx              # Root component & hash router
│   ├── main.tsx             # Entry point
│   └── index.css            # Global styles
├── server.ts                # Express API server (2400+ lines)
├── firebase-applet-config.json
├── firebase-blueprint.json
├── firestore.rules
├── railway.json             # Railway deployment config
├── nixpacks.toml            # Nixpacks build config
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## 🌍 Routes

| Route | Page | Description |
|-------|------|-------------|
| `/#/` | Home | Featured poll, platform stats, latest activity |
| `/#/polls` | Browse Polls | Search, filter, and explore all polls |
| `/#/polls/:id` | Poll Detail | Vote, view results, comment threads |
| `/#/politicians` | Politicians | Directory with search, filter, sort |
| `/#/politicians/:id` | Politician Profile | Bio, approval rating, development timeline |
| `/#/parties/:id` | Party Profile | Party info with member listing |
| `/#/elections` | Elections | Election-category polls and analysis |
| `/#/policy` | Policy | Policy-focused polls and debates |
| `/#/results` | Results | Closed polls with final results |
| `/#/news` | News Feed | Political news linked to polls |
| `/#/create` | Create Poll | Multi-step poll creation wizard |
| `/#/dashboard` | User Dashboard | Vote history, profile, notifications |
| `/#/admin` | Admin Panel | Full CRUD for polls, politicians, news |
| `/#/login` | Auth | Login and registration |
| `/#/about` | About | Platform mission and team |
| `/#/how-it-works` | How It Works | User guide and FAQ |

---

## 🔌 API Endpoints

<details>
<summary><strong>Authentication</strong></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Create new account |
| `POST` | `/api/auth/login` | Login with credentials |
| `GET` | `/api/auth/me` | Get current user profile |
| `PUT` | `/api/auth/profile` | Update profile |

</details>

<details>
<summary><strong>Polls & Voting</strong></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/polls` | List polls (with filters) |
| `GET` | `/api/polls/:id` | Get single poll |
| `POST` | `/api/polls/:id/vote` | Cast vote |
| `GET` | `/api/polls/:id/user_voted` | Check if user voted |
| `POST` | `/api/polls/create` | Create new poll |
| `GET/POST` | `/api/polls/:id/comments` | Poll comments |

</details>

<details>
<summary><strong>Politicians & Parties</strong></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/politicians` | List politicians |
| `GET` | `/api/politicians/:id` | Get politician + polls |
| `GET` | `/api/parties` | List parties |
| `GET` | `/api/parties/:id` | Get party + members |
| `GET` | `/api/politicians/:id/developments` | Development timeline |

</details>

<details>
<summary><strong>Admin</strong></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/stats` | Platform analytics |
| `POST` | `/api/admin/politicians` | Add politician |
| `POST` | `/api/admin/politician/autofill` | AI auto-fill |
| `POST/PUT/DELETE` | `/api/admin/polls/:id/*` | Manage polls |
| `POST/PUT/DELETE` | `/api/admin/news/:id` | Manage news |

</details>

<details>
<summary><strong>SEO</strong></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/sitemap.xml` | Dynamic XML sitemap |
| `GET` | `/robots.txt` | Crawler directives |

</details>

---

## 🚢 Deploy to Railway

1. Fork this repo
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**
3. Select your fork
4. Add environment variables (see [Configuration](#2-configure-environment))
5. Railway auto-builds and deploys on every push

The included `railway.json` and `nixpacks.toml` handle all build configuration automatically.

---

## 👤 Default Accounts

| Email | Password | Role |
|-------|----------|------|
| `admin@govtrack.org` | `admin` | 🔑 Admin |
| `journalist@govtrack.org` | `journalist` | 📰 Journalist |
| `analyst@govtrack.org` | `analyst` | 📊 Analyst |
| `citizen@govtrack.org` | `citizen` | 🗳️ Citizen |

---

## 📊 Data Persistence

GovTrack uses a **dual-storage strategy**:

1. **Firebase Firestore** — Primary cloud database. All data (polls, users, votes, politicians) is persisted in a single `master_db` document.
2. **Seed Data** — On first boot, if no Firestore data exists, the server seeds sample polls, politicians, news, and user accounts automatically.
3. **Firebase Storage** — Profile photos and file uploads are stored in Firebase Storage with download URLs.

---

## 🔒 Security Notes

- Mock JWT tokens are used for authentication (suitable for demo/MVP)
- IP-based vote deduplication prevents ballot stuffing
- Admin routes have role-based access checks
- API keys should be stored as environment variables, never in source code
- Firestore rules should be configured to allow server-side writes only

---

## 📄 License

```
SPDX-License-Identifier: Apache-2.0
```

---

<div align="center">

**Built with ❤️ for democratic accountability**

[Live Demo](https://govtrack.co.ke) · [Report Bug](https://github.com/mountkenyanews/govtrack/issues) · [Request Feature](https://github.com/mountkenyanews/govtrack/issues)

<sub>© 2026 GovTrack by Mount Kenya News. All rights reserved.</sub>

</div>
