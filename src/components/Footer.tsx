/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Vote, Twitter, Instagram, Globe, MessageSquare, Award } from "lucide-react";

interface FooterProps {
  onNavigate: (path: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  const currentYear = new Date().getFullYear();

  const primaryLinks = [
    { label: "About Platform", path: "/about" },
    { label: "How It Works", path: "/how-it-works" },
    { label: "Browse Active Polls", path: "/polls" },
    { label: "Tracked Leaders", path: "/politicians" }
  ];

  const policyLinks = [
    { label: "Elections Tracker", path: "/elections" },
    { label: "Policy Debates", path: "/policy" },
    { label: "News & Insights", path: "/news" },
    { label: "Analytics Hub", path: "/results" },
    { label: "Data Privacy & Compliance", path: "/privacy" }
  ];

  return (
    <footer className="bg-[#0A1628] text-slate-300 border-t border-slate-800 pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand Pillar Column */}
          <div className="space-y-4">
            <button 
              onClick={() => onNavigate("/")} 
              className="flex items-center gap-2 text-left"
            >
              <div className="w-9 h-9 rounded bg-[#F5A623] flex items-center justify-center text-[#0A1628] font-black">
                <Vote className="w-5 h-5" />
              </div>
              <div>
                <span className="block text-md font-black tracking-tight text-white uppercase">
                  GovTrack
                </span>
                <span className="block text-[8px] tracking-widest text-[#F5A623] font-bold uppercase font-mono">
                  Your Voice. Their Accountability.
                </span>
              </div>
            </button>
            <p className="text-xs text-slate-400 leading-relaxed max-w-sm">
              GovTrack is the premier independent full-stack polling, approvals, and analytical ecosystem helping citizens voice insights transparently.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <a href="https://x.com" target="_blank" rel="noreferrer" className="w-8 h-8 rounded bg-slate-800 hover:bg-[#F5A623] hover:text-[#0A1628] flex items-center justify-center text-slate-400 transition" title="Twitter / X">
                <Twitter className="w-4 h-4" />
              </a>
              <a href="https://instagram.com" target="_blank" rel="noreferrer" className="w-8 h-8 rounded bg-slate-800 hover:bg-[#F5A623] hover:text-[#0A1628] flex items-center justify-center text-slate-400 transition" title="Instagram">
                <Instagram className="w-4 h-4" />
              </a>
              <a href="https://globe.com" target="_blank" rel="noreferrer" className="w-8 h-8 rounded bg-slate-800 hover:bg-[#F5A623] hover:text-[#0A1628] flex items-center justify-center text-slate-400 transition" title="Global Outreach">
                <Globe className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Quick Menu Column */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold uppercase text-white tracking-widest font-mono">
              Core Directory
            </h4>
            <ul className="space-y-2.5 text-xs">
              {primaryLinks.map((link) => (
                <li key={link.path}>
                  <button 
                    onClick={() => onNavigate(link.path)}
                    className="hover:text-white transition-colors"
                  >
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Policy Pillars Column */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold uppercase text-white tracking-widest font-mono">
              Resources
            </h4>
            <ul className="space-y-2.5 text-xs">
              {policyLinks.map((link) => (
                <li key={link.path}>
                  <button 
                    onClick={() => onNavigate(link.path)}
                    className="hover:text-white transition-colors"
                  >
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Platform Security/Country selectors */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold uppercase text-white tracking-widest font-mono font-black">
              Fair Poll Standards
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              We leverage double-verify tokens and encrypted browser signatures to intercept artificial vote injection attempts, maintaining high statistical precision.
            </p>
            <div className="space-y-1.5 pt-1">
              <label className="block text-[10px] uppercase font-bold text-slate-500">Regional Coverage</label>
              <select className="bg-slate-800 border border-slate-750 text-slate-100 text-xs rounded p-1.5 w-full focus:outline-none focus:ring-1 focus:ring-brand-gold font-semibold">
                <option value="all">🌐 All Regions (Global)</option>
                <option value="ke">🇰🇪 Kenya Coverage</option>
                <option value="us">🇺🇸 United States Coverage</option>
                <option value="uk">🇬🇧 United Kingdom Coverage</option>
                <option value="za">🇿🇦 South Africa Coverage</option>
              </select>
            </div>
          </div>
        </div>

        {/* Brand Warning, Divider and copyright */}
        <div className="mt-12 pt-8 border-t border-slate-800 text-center space-y-4">
          <div className="inline-flex items-center gap-1.5 bg-slate-800/50 px-3.5 py-1.5 rounded-full border border-slate-800">
            <span className="w-2 h-2 rounded-full bg-orange-500"></span>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
              Independent Platform Initiative
            </span>
          </div>

          <p className="text-[10px] text-slate-500 max-w-3xl mx-auto italic leading-normal">
            Disclaimer: GovTrack is a public civic polling and opinion mapping index. We are not associated with, sponsored by, or linked to any government organization, electoral committee, or political affiliation. Votes are fully encrypted, aggregated anonymously, and verified cleanly.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-x-4 gap-y-2 text-xs text-slate-400 pt-1">
            <span>&copy; {currentYear} GovTrack. Designed for democracy. All rights reserved.</span>
            <span className="hidden sm:inline text-slate-600">|</span>
            <button 
              onClick={() => onNavigate("/privacy")}
              className="font-semibold text-[#F5A623] hover:text-white transition-colors underline decoration-slate-600 hover:decoration-white cursor-pointer"
            >
              Data Privacy Policy (Act, 2019)
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};
