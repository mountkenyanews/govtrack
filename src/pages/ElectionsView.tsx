/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Poll } from "../types";
import { api } from "../utils/api";
import { Vote, Calendar, Award, ChevronRight } from "lucide-react";

interface ElectionsViewProps {
  onNavigate: (path: string) => void;
}

export const ElectionsView: React.FC<ElectionsViewProps> = ({ onNavigate }) => {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadElections = async () => {
      try {
        setLoading(true);
        // Load election category polls
        const list = await api.getPolls();
        const elections = list.filter(p => p.category === "Election");
        setPolls(elections);
      } catch (err) {
        console.log(err);
      } finally {
        setLoading(false);
      }
    };
    loadElections();
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      
      {/* Hero Header banner */}
      <section className="bg-slate-900 rounded-2xl p-6 md:p-8 text-white relative overflow-hidden shadow">
        <div className="absolute top-4 right-4 bg-red-600 text-white font-black uppercase text-[10px] tracking-wider px-2 py-0.5 rounded animate-pulse">
          LIVE DEMOCRACY TRACKER
        </div>
        <div className="max-w-2xl text-left space-y-3 relative z-10">
          <span className="text-brand-gold font-bold text-xs uppercase tracking-wider font-mono">National Electoral Milestones</span>
          <h1 className="text-2xl md:text-4.5xl font-black leading-tight tracking-tight">
            Elections Hub & Race Polls 2025–2026
          </h1>
          <p className="text-xs text-slate-300 leading-relaxed">
            Follow critical state, federal, and global general elections. Cast your ballot, analyze consolidated public margin grids, and examine legislative standoffs in real-time.
          </p>
        </div>
      </section>

      {/* Quicklinks */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-4">
        <span className="text-[10px] uppercase font-black text-slate-400 font-mono tracking-widest mr-2">Featured Lists:</span>
        {["Kenya General Election", "US Midterm Contests", "UK Westminster Seats", "General Referendums"].map(link => (
          <button
            key={link}
            onClick={() => onNavigate("/polls")}
            className="bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs px-3.5 py-1.5 rounded-full border border-slate-200 transition"
          >
            🔥 {link}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map(n => (
            <div key={n} className="bg-white border p-6 rounded-xl animate-pulse h-40"></div>
          ))}
        </div>
      ) : polls.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {polls.map((poll) => {
            return (
              <div 
                key={poll.id}
                className="bg-white rounded-2xl border border-slate-150 p-6 shadow-sm flex flex-col justify-between h-full space-y-4 hover:border-slate-200 hover:shadow-md transition-all duration-200"
              >
                <div className="space-y-3 text-left">
                  <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-brand-gold" />
                      Closes: {poll.closes_at ? new Date(poll.closes_at).toLocaleDateString() : "Ongoing"}
                    </span>
                    <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100 text-[10px] font-bold">
                      🇰🇪 {poll.country} Race
                    </span>
                  </div>

                  <h3 className="font-extrabold text-[#0A1628] text-lg hover:text-brand-gold cursor-pointer" onClick={() => onNavigate(`/polls/${poll.id}`)}>
                    {poll.title}
                  </h3>
                  <p className="text-xs text-slate-500 leading-snug line-clamp-2">
                    {poll.description}
                  </p>
                </div>

                {/* Candidate Standing rows */}
                <div className="space-y-2.5 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                  <span className="block text-[8px] font-black tracking-widest text-slate-400 uppercase font-mono">Contenders standings</span>
                  {poll.options.slice(0, 3).map((opt) => {
                    const pct = poll.total_votes > 0 ? (opt.vote_count / poll.total_votes) * 100 : 0;
                    return (
                      <div key={opt.id} className="space-y-1">
                        <div className="flex justify-between items-center text-xs text-slate-700 font-semibold">
                          <span className="truncate">{opt.label} ({opt.party || "Ind"})</span>
                          <span className="font-mono text-slate-900 font-bold">{pct.toFixed(1)}%</span>
                        </div>
                        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: opt.party_color || "#3b82f6" }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Action CTA */}
                <div className="pt-2 flex items-center justify-between border-t border-slate-100 text-xs">
                  <span className="font-mono text-slate-400 font-bold">{poll.total_votes.toLocaleString()} votes cast</span>
                  <button
                    onClick={() => onNavigate(`/polls/${poll.id}`)}
                    className="bg-[#0A1628] hover:bg-brand-gold text-white hover:text-[#0A1628] font-black text-xs px-5 py-2 rounded-md inline-flex items-center gap-1"
                  >
                    <span>Cast Your Ballot</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-slate-50 p-16 text-center border rounded-xl border-dashed border-slate-200">
          <span className="text-4xl">🗳</span>
          <h4 className="font-bold text-slate-750 mt-2">No active legislative elections listed</h4>
          <p className="text-xs text-slate-450 mt-1 max-w-sm mx-auto">Citizen-level polls can be added in categories like Refrendums or Local Government.</p>
        </div>
      )}
    </div>
  );
};
