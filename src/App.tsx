/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Navigation } from "./components/Navigation";
import { Footer } from "./components/Footer";

// All Pages
import { HomeView } from "./pages/HomeView";
import { BrowsePollsView } from "./pages/BrowsePollsView";
import { PollDetailView } from "./pages/PollDetailView";
import { PoliticiansView } from "./pages/PoliticiansView";
import { PoliticianProfileView } from "./pages/PoliticianProfileView";
import { PartyProfileView } from "./pages/PartyProfileView";
import { ElectionsView } from "./pages/ElectionsView";
import { PolicyView } from "./pages/PolicyView";
import { ResultsView } from "./pages/ResultsView";
import { CreatePollView } from "./pages/CreatePollView";
import { DashboardView } from "./pages/DashboardView";
import { AdminView } from "./pages/AdminView";
import { NewsView } from "./pages/NewsView";
import { AboutView } from "./pages/AboutView";
import { HowItWorksView } from "./pages/HowItWorksView";
import { LoginRegisterView } from "./pages/LoginRegisterView";

export default function App() {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    const hash = window.location.hash;
    if (!hash) return "/";
    return hash.replace("#", "") || "/";
  });

  const handleNavigate = (path: string) => {
    window.history.pushState(null, "", `#${path}`);
    setCurrentPath(path);
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      setCurrentPath(hash.replace("#", "") || "/");
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // Simple and powerful router parsing inside App component
  const renderCurrentView = () => {
    // 1. Detailed Polls View matching: /polls/:id
    if (currentPath.startsWith("/polls/")) {
      const idStr = currentPath.split("/polls/")[1];
      const pollId = parseInt(idStr, 10);
      if (!isNaN(pollId)) {
        return <PollDetailView pollId={pollId} onNavigate={handleNavigate} />;
      }
    }

    // 2. Detailed Politician View matching: /politicians/:id
    if (currentPath.startsWith("/politicians/")) {
      const idStr = currentPath.split("/politicians/")[1];
      const politicianId = parseInt(idStr, 10);
      if (!isNaN(politicianId)) {
        return <PoliticianProfileView politicianId={politicianId} onNavigate={handleNavigate} />;
      }
    }

    // 2.5. Detailed Party View matching: /parties/:id
    if (currentPath.startsWith("/parties/")) {
      const idStr = currentPath.split("/parties/")[1];
      const partyId = parseInt(idStr, 10);
      if (!isNaN(partyId)) {
        return <PartyProfileView partyId={partyId} onNavigate={handleNavigate} />;
      }
    }

    // 3. Simple literal matchings
    switch (currentPath) {
      case "/":
        return <HomeView onNavigate={handleNavigate} />;
      case "/polls":
        return <BrowsePollsView onNavigate={handleNavigate} />;
      case "/politicians":
        return <PoliticiansView onNavigate={handleNavigate} />;
      case "/elections":
        return <ElectionsView onNavigate={handleNavigate} />;
      case "/policy":
        return <PolicyView onNavigate={handleNavigate} />;
      case "/results":
        return <ResultsView />;
      case "/create":
        return <CreatePollView onNavigate={handleNavigate} />;
      case "/dashboard":
        return <DashboardView onNavigate={handleNavigate} />;
      case "/admin":
        return <AdminView onNavigate={handleNavigate} />;
      case "/news":
        return <NewsView onNavigate={handleNavigate} />;
      case "/about":
        return <AboutView />;
      case "/how-it-works":
        return <HowItWorksView />;
      case "/login":
        return <LoginRegisterView onNavigate={handleNavigate} />;
      default:
        if (currentPath.startsWith("/news/")) {
          const idStr = currentPath.split("/news/")[1];
          const newsId = parseInt(idStr, 10);
          if (!isNaN(newsId)) {
            return <NewsView initialArticleId={newsId} onNavigate={handleNavigate} />;
          }
        }
        return (
          <div className="max-w-md mx-auto py-20 text-center space-y-4 text-slate-700">
            <span className="text-4xl text-slate-350 block">🏷️</span>
            <h3 className="font-extrabold text-[#0A1628] text-sm font-mono uppercase">Page Not Found</h3>
            <p className="text-xs text-slate-405">This political registry is either under scheduled verification or has been moved.</p>
            <button 
              onClick={() => handleNavigate("/")}
              className="bg-[#0A1628] hover:bg-[#F5A623] text-white hover:text-[#0A1628] font-bold text-xs px-5 py-2 rounded"
            >
              Analyze Main Dashboard
            </button>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between font-sans">
      <Navigation currentPath={currentPath} onNavigate={handleNavigate} />
      
      {/* Dynamic Content Body Area */}
      <main className="flex-1">
        {renderCurrentView()}
      </main>

      <Footer onNavigate={handleNavigate} />
    </div>
  );
}
