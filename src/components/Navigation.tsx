/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { User } from "../types";
import { getSavedUser, clearSession, broadcastSessionChange } from "../utils/api";
import { 
  Menu, 
  X, 
  User as UserIcon, 
  LogOut, 
  Plus, 
  ShieldAlert, 
  Info,
  Sliders,
  Vote,
  Compass,
  FileText
} from "lucide-react";

interface NavigationProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export const Navigation: React.FC<NavigationProps> = ({ currentPath, onNavigate }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(getSavedUser());
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    const handleSessionChange = () => {
      setCurrentUser(getSavedUser());
    };

    window.addEventListener("govtrack_session_change", handleSessionChange);
    return () => {
      window.removeEventListener("govtrack_session_change", handleSessionChange);
    };
  }, []);

  const handleLogout = () => {
    clearSession();
    broadcastSessionChange();
    setIsDropdownOpen(false);
    onNavigate("/");
  };

  const navMenuItems = [
    { label: "Home", path: "/", icon: Compass },
    { label: "Polls", path: "/polls", icon: Vote },
    { label: "Elections", path: "/elections", icon: Sliders },
    { label: "Politicians", path: "/politicians", icon: UserIcon },
    { label: "Policy", path: "/policy", icon: FileText },
    { label: "News Feed", path: "/news", icon: Info },
    { label: "Analytics", path: "/results", icon: ShieldAlert }
  ];

  const handleNavClick = (path: string) => {
    onNavigate(path);
    setIsMobileMenuOpen(false);
    setIsDropdownOpen(false);
  };

  const isSelected = (path: string) => {
    if (path === "/") return currentPath === "/";
    return currentPath.startsWith(path);
  };

  return (
    <header className="sticky top-0 z-40 bg-[#0A1628] text-white shadow-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo Brand Mark */}
          <div className="flex items-center gap-3">
            <button 
              onClick={() => handleNavClick("/")} 
              className="flex items-center gap-2 group text-left"
            >
              <div className="w-10 h-10 rounded-sm bg-[#F5A623] flex items-center justify-center text-[#0A1628] font-bold shadow-md transition-transform group-hover:scale-105">
                <Vote className="w-5 h-5" />
              </div>
              <div>
                <span className="block text-lg font-black tracking-tighter text-white uppercase group-hover:text-brand-gold">
                  GovTrack
                </span>
                <span className="block text-[8px] tracking-widest text-[#F5A623] font-bold uppercase transition-opacity">
                  Voice & Accountability
                </span>
              </div>
            </button>
          </div>

          {/* Desktop Navigation Link Menu */}
          <nav className="hidden lg:flex items-center gap-1">
            {navMenuItems.map((item) => {
              const active = isSelected(item.path);
              return (
                <button
                  key={item.path}
                  onClick={() => handleNavClick(item.path)}
                  className={`px-3.5 py-2 rounded font-bold text-xs tracking-wide transition-all ${
                    active 
                      ? "text-white bg-white/10" 
                      : "text-slate-300 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Quick CTA and User details */}
          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={() => handleNavClick("/create")}
              className="inline-flex items-center gap-1 bg-[#F5A623] hover:bg-[#F5A623]/90 text-[#0A1628] font-black text-xs px-3.5 py-2.5 rounded shadow transition-all hover:scale-[1.02]"
            >
              <Plus className="w-4 h-4" />
              <span>Create Poll</span>
            </button>

            {currentUser ? (
              <div className="relative">
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="flex items-center gap-2.5 bg-slate-800 hover:bg-slate-700/80 p-1.5 rounded-full pr-3 border border-slate-700 transition"
                >
                  <img 
                    src={currentUser.avatar_url} 
                    alt={currentUser.display_name} 
                    className="w-8 h-8 rounded-full border border-slate-600 object-cover" 
                    referrerPolicy="no-referrer"
                  />
                  <div className="text-left leading-tight hidden lg:block">
                    <span className="block text-xs font-bold text-slate-100 max-w-[100px] truncate">
                      {currentUser.display_name}
                    </span>
                    <span className="block text-[9px] font-semibold text-[#F5A623] uppercase">
                      {currentUser.role}
                    </span>
                  </div>
                </button>

                {isDropdownOpen && (
                  <div className="absolute right-0 mt-2.5 w-52 bg-white rounded-lg shadow-xl text-slate-800 overflow-hidden border border-slate-100 z-50">
                    <div className="p-3 border-b border-slate-50">
                      <p className="font-extrabold text-sm text-[#0A1628] truncate">{currentUser.display_name}</p>
                      <p className="text-[10px] text-slate-400 font-mono truncate">{currentUser.email}</p>
                    </div>

                    <button
                      onClick={() => handleNavClick("/dashboard")}
                      className="w-full text-left px-4 py-2.5 text-xs hover:bg-slate-50 font-semibold text-slate-700 flex items-center gap-2"
                    >
                      <UserIcon className="w-4 h-4 text-slate-400" />
                      <span>My Dashboard</span>
                    </button>

                    {currentUser.role === "admin" && (
                      <button
                        onClick={() => handleNavClick("/admin")}
                        className="w-full text-left px-4 py-2.5 text-xs hover:bg-red-50 font-bold text-red-600 flex items-center gap-2 bg-red-50/20 border-y border-red-50"
                      >
                        <ShieldAlert className="w-4 h-4" />
                        <span>Platform Admin</span>
                      </button>
                    )}

                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2.5 text-xs hover:bg-slate-50 font-semibold text-red-500 flex items-center gap-2"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Log Out</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => handleNavClick("/login")}
                className="bg-white/10 hover:bg-white/20 text-white font-bold text-xs px-4 py-2.5 rounded border border-white/25 transition-all"
              >
                Sign In
              </button>
            )}
          </div>

          {/* Hamburger Menu Icon for Mobile screens */}
          <div className="flex lg:hidden items-center gap-2">
            {!currentUser && (
              <button
                onClick={() => handleNavClick("/login")}
                className="text-xs bg-white/10 text-white font-bold px-3 py-1.5 rounded border border-white/20 mr-1"
              >
                Login
              </button>
            )}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700"
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Overlay */}
      {isMobileMenuOpen && (
        <div className="lg:hidden bg-[#0A1628] border-t border-slate-800 animate-fade-in divide-y divide-slate-800/60 pb-4">
          <div className="p-3 flex items-center justify-between">
            {currentUser && (
              <div 
                onClick={() => handleNavClick("/dashboard")}
                className="flex items-center gap-2 cursor-pointer"
              >
                <img src={currentUser.avatar_url} className="w-9 h-9 rounded-full object-cover" />
                <div className="text-left leading-tight">
                  <p className="text-xs font-bold text-white">{currentUser.display_name}</p>
                  <p className="text-[9px] text-[#F5A623] font-bold uppercase">{currentUser.role}</p>
                </div>
              </div>
            )}
            <button
              onClick={() => handleNavClick("/create")}
              className="inline-flex items-center gap-1 bg-[#F5A623] text-[#0A1628] font-bold text-xs px-3.5 py-1.5 rounded"
            >
              <Plus className="w-4 h-4" />
              <span>Create Poll</span>
            </button>
          </div>

          <div className="p-2 space-y-1">
            {navMenuItems.map((item) => {
              const active = isSelected(item.path);
              const IconComp = item.icon;
              return (
                <button
                  key={item.path}
                  onClick={() => handleNavClick(item.path)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded text-left text-sm font-bold ${
                    active 
                      ? "bg-white/10 text-white" 
                      : "text-slate-300 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <IconComp className="w-4 h-4 text-[#F5A623]" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="p-3">
            {currentUser ? (
              <div className="space-y-1.5">
                {currentUser.role === "admin" && (
                  <button
                    onClick={() => handleNavClick("/admin")}
                    className="w-full flex items-center gap-2 bg-red-950/40 text-red-400 hover:bg-red-900 border border-red-900 px-4 py-2.5 rounded font-bold text-xs"
                  >
                    <ShieldAlert className="w-4 h-4" />
                    <span>Admin Dashboard</span>
                  </button>
                )}
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 bg-slate-800 text-slate-300 hover:bg-slate-700 px-4 py-2.5 rounded font-bold text-xs"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Log Out of Account</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => handleNavClick("/login")}
                className="w-full bg-[#F5A623] text-[#0A1628] font-black py-2.5 rounded font-bold text-xs"
              >
                Sign In / Join GovTrack
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
