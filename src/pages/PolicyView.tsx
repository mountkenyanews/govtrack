/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Poll } from "../types";
import { api } from "../utils/api";
import { PollCard } from "../components/Shared";
import { Vote, FileText, CheckCircle2, ChevronRight, Bookmark } from "lucide-react";

interface PolicyViewProps {
  onNavigate: (path: string) => void;
}

export const PolicyView: React.FC<PolicyViewProps> = ({ onNavigate }) => {
  const [loading, setLoading] = useState(true);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [activeChip, setActiveChip] = useState<string>("All");

  const chips = ["All", "Healthcare", "Economy", "Education", "Security", "Environment", "Infrastructure", "Taxation"];

  useEffect(() => {
    const fetchPolicyPolls = async () => {
      try {
        setLoading(true);
        const list = await api.getPolls();
        // filter polls with categories like Policy, Referendum, or matching tag keyword
        const policyItems = list.filter(p => p.category === "Policy" || p.category === "Referendum" || p.tags.includes("Policy"));
        setPolls(policyItems);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchPolicyPolls();
  }, []);

  const filteredPolls = activeChip === "All"
    ? polls
    : polls.filter(p => p.tags.map(t => t.toLowerCase()).includes(activeChip.toLowerCase()) || p.title.toLowerCase().includes(activeChip.toLowerCase()));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      
      {/* Policy banner */}
      <section className="bg-gradient-to-r from-brand-blue to-slate-900 rounded-2xl p-6 md:p-8 text-white relative overflow-hidden shadow">
        <div className="max-w-2xl text-left space-y-3">
          <span className="text-[#F5A623] font-bold text-xs uppercase tracking-widest font-mono">Constitutional Debates & bills</span>
          <h1 className="text-2xl md:text-4xl font-black leading-none tracking-tight">
            Policy & Referendum Audits
          </h1>
          <p className="text-xs text-slate-350 leading-relaxed">
            Vote on non-partisan issues shaping health, education funding, climate legislation, and national economic plans. Support or oppose with transparent breakdowns.
          </p>
        </div>
      </section>

      {/* Filter Chips row */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none">
        {chips.map((chip) => (
          <button
            key={chip}
            onClick={() => setActiveChip(chip)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition ${
              activeChip === chip
                ? "bg-[#0A1628] text-[#F5A623]"
                : "bg-slate-100 text-slate-655 hover:bg-slate-200"
            }`}
          >
            {chip}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3].map(n => (
            <div key={n} className="bg-white border p-6 rounded-xl animate-pulse h-44"></div>
          ))}
        </div>
      ) : filteredPolls.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPolls.map((poll) => (
            <PollCard 
              key={poll.id} 
              poll={poll} 
              onSelect={(id) => onNavigate(`/polls/${id}`)} 
            />
          ))}
        </div>
      ) : (
        <div className="bg-slate-50 rounded-xl p-16 text-center border border-dashed border-slate-200">
          <span className="text-3xl text-slate-300 block">📊</span>
          <h3 className="font-bold text-slate-700 mt-2">No active debates under "{activeChip}"</h3>
          <p className="text-xs text-slate-450 mt-1 max-w-sm mx-auto">Click "All" above to inspect standard cross-border public policy referendums.</p>
        </div>
      )}
    </div>
  );
};
