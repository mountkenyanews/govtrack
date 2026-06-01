/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Navigation } from "./components/Navigation";
import { Footer } from "./components/Footer";
import { Info } from "lucide-react";

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
import { PrivacyView } from "./pages/PrivacyView";

import { getSavedUser } from "./utils/api";

export default function App() {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    const hash = window.location.hash;
    if (!hash) return "/";
    return hash.replace("#", "") || "/";
  });

  const [showConsent, setShowConsent] = useState<boolean>(false);

  useEffect(() => {
    const consent = localStorage.getItem("govtrack_consent_choice");
    if (!consent) {
      const timer = setTimeout(() => {
        setShowConsent(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleConsentChoice = (choice: "accepted" | "denied") => {
    localStorage.setItem("govtrack_consent_choice", choice);
    setShowConsent(false);
  };

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
    const currentUser = getSavedUser();

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
        return <AdminView onNavigate={handleNavigate} currentUser={currentUser} />;
      case "/news":
        return <NewsView onNavigate={handleNavigate} />;
      case "/about":
        return <AboutView />;
      case "/how-it-works":
        return <HowItWorksView />;
      case "/privacy":
        return <PrivacyView />;
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

      {/* Floating Cookies & Privacy Consent Banner */}
      {showConsent && (
        <div className="fixed bottom-6 left-6 right-6 md:left-auto md:max-w-md z-50 transition-all duration-500 ease-out transform translate-y-0 opacity-100">
          <div className="bg-slate-950/95 backdrop-blur-md border border-slate-800 text-white rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-[#F5A623]/10 text-[#F5A623] rounded-lg mt-0.5 shrink-0">
                <Info className="w-5 h-5" />
              </div>
              <div className="space-y-1 text-left">
                <h4 className="font-bold text-xs uppercase tracking-wider text-white font-mono">
                  Data Consent & Terms Agreement
                </h4>
                <p className="text-[11px] text-slate-450 leading-relaxed">
                  We use cookies and temporary IP hashes to secure voting outcomes and comply with the <strong>Kenya Data Protection Act, 2019</strong>. By continuing or accepting, you agree to our terms.
                </p>
              </div>
            </div>
            
            <div className="flex items-center justify-between gap-4 pt-1">
              <button
                onClick={() => {
                  handleNavigate("/privacy");
                }}
                className="text-[10px] text-slate-400 hover:text-white underline font-semibold transition cursor-pointer"
              >
                Read Privacy Policy
              </button>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleConsentChoice("denied")}
                  className="px-3.5 py-1.5 rounded text-[10px] font-semibold border border-slate-800 hover:border-slate-600 text-slate-400 hover:text-white transition cursor-pointer"
                >
                  Decline
                </button>
                <button
                  onClick={() => handleConsentChoice("accepted")}
                  className="px-3.5 py-1.5 rounded text-[10px] font-bold bg-[#F5A623] hover:bg-white text-[#0A1628] transition cursor-pointer shadow-sm"
                >
                  Accept & Agree
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
