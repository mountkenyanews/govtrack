/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Politician } from "../types";
import { api } from "../utils/api";
import { PoliticianAvatar, ApprovalRingChart } from "../components/Shared";
import { Search, Flame, Sliders, ChevronRight } from "lucide-react";

interface PoliticiansViewProps {
  onNavigate: (path: string) => void;
}

export const PoliticiansView: React.FC<PoliticiansViewProps> = ({ onNavigate }) => {
  const [loading, setLoading] = useState(true);
  const [politicians, setPoliticians] = useState<Politician[]>([]);
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("All");
  const [sort, setSort] = useState("Approval Rating (High→Low)");

  const countriesList = ["All", "Kenya", "USA", "UK", "South Africa", "Nigeria", "France", "Germany"];

  useEffect(() => {
    const fetchLeaders = async () => {
      try {
        setLoading(true);
        const data = await api.getPoliticians({ search, country, sort });
        setPoliticians(data);
      } catch (err) {
        console.error("Failed to load leaders list", err);
      } finally {
        setLoading(false);
      }
    };

    const delayDebounce = setTimeout(() => {
      fetchLeaders();
    }, 450);

    return () => clearTimeout(delayDebounce);
  }, [search, country, sort]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="border-b border-slate-100 pb-4">
        <h1 className="text-3xl font-black text-[#0A1628] tracking-tight">Tracked Political Leaders</h1>
        <p className="text-xs text-slate-500">Live dynamic approval rating census compiled transparently from public ballot histories.</p>
      </div>

      {/* Control row */}
      <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-wrap items-center justify-between gap-4">
        {/* search Bar */}
        <div className="relative flex-1 min-w-[280px]">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search representative by name, political office, or alignment..."
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-brand-gold text-slate-800 font-medium"
          />
        </div>

        {/* Filters and sorting */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-lg p-2 font-bold focus:outline-none"
          >
            {countriesList.map((cnt) => (
              <option key={cnt} value={cnt}>{cnt === "All" ? "🌐 All Nations" : `🇳🇵 ${cnt}`}</option>
            ))}
          </select>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-lg p-2 font-bold focus:outline-none"
          >
            <option value="Approval Rating (High→Low)">Sort: Approval Rating</option>
            <option value="Most Polled">Sort: Most Appearances</option>
            <option value="Alphabetical">Sort: Alphabetical</option>
          </select>
        </div>
      </div>

      {/* Grid displays */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="bg-white border border-slate-100 p-6 rounded-xl space-y-4 animate-pulse-slow flex flex-col items-center">
              <div className="w-20 h-20 bg-slate-200 rounded-full"></div>
              <div className="h-4 bg-slate-200 rounded w-1/2"></div>
              <div className="h-3 bg-slate-100 rounded w-3/4"></div>
              <div className="h-8 bg-slate-100 rounded-lg w-full"></div>
            </div>
          ))}
        </div>
      ) : politicians.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {politicians.map((pol) => {
            return (
              <div 
                key={pol.id}
                onClick={() => onNavigate(`/politicians/${pol.id}`)}
                className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm flex flex-col justify-between h-full items-center text-center hover:shadow-md hover:border-slate-200/80 transition cursor-pointer"
              >
                <div className="flex flex-col items-center">
                  <PoliticianAvatar 
                    name={pol.full_name} 
                    photo_url={pol.photo_url} 
                    party_color={pol.party_color} 
                    size="lg" 
                    showTooltip={false} 
                  />

                  {/* Body labels */}
                  <div className="mt-4">
                    <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 font-mono">
                      {pol.country}
                    </span>
                    <h3 className="font-extrabold text-slate-900 leading-tight text-md mt-0.5 hover:text-brand-gold transition-colors">
                      {pol.full_name}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 font-semibold truncate max-w-[180px]">
                      {pol.title}
                    </p>
                    <span 
                      className="inline-block text-[9px] font-bold px-2.5 py-0.5 rounded-full mt-2 text-white"
                      style={{ backgroundColor: pol.party_color || "#3b82f6" }}
                    >
                      {pol.party}
                    </span>
                  </div>
                </div>

                {/* Ring stats indicators */}
                <div className="mt-6 pt-4 border-t border-slate-50 w-full flex items-center justify-around">
                  <div className="flex items-center gap-2">
                    <ApprovalRingChart approvalPercent={pol.approval_rating} size={42} />
                    <div className="text-left">
                      <span className="block text-[8px] text-slate-400 font-bold uppercase tracking-widest font-mono">Approval</span>
                      <span className="text-sm font-black font-mono text-slate-800">{pol.approval_rating}%</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="block text-[8px] text-slate-400 font-bold uppercase tracking-widest font-mono">Appearances</span>
                    <span className="text-xs font-mono font-bold text-slate-700 inline-flex items-center gap-0.5">
                      <Flame className="w-3.5 h-3.5 text-orange-500" />
                      {pol.total_poll_appearances} Polls
                    </span>
                  </div>
                </div>

                <div className="mt-4 w-full">
                  <button
                    onClick={() => onNavigate(`/politicians/${pol.id}`)}
                    className="w-full bg-slate-50 hover:bg-[#0A1628] hover:text-white text-slate-700 font-bold text-xs py-2 rounded border border-slate-200 transition flex items-center justify-center gap-1"
                  >
                    <span>Inspect Profile</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-slate-50 rounded-xl p-16 border border-dashed text-center border-slate-200">
          <span className="text-4xl text-slate-300 block">👤</span>
          <h3 className="font-extrabold text-slate-700 mt-2">No tracked delegates match your query</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">Try verifying search spellings or resetting local country categories.</p>
        </div>
      )}
    </div>
  );
};
