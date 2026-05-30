/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Poll } from "../types";
import { api } from "../utils/api";
import { 
  BarChart, 
  BarChart2, 
  TrendingUp, 
  Cpu, 
  Compass, 
  Users, 
  Clock, 
  AlertCircle,
  Smartphone,
  Monitor,
  Tablet,
  Activity
} from "lucide-react";

export const ResultsView: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [stats, setStats] = useState({
    totalPolls: 18,
    totalVotes: 54490,
    countriesCount: 12,
    activePollsCount: 6
  });

  const [selectedPollId, setSelectedPollId] = useState<number | string>("");
  const [deviceStats, setDeviceStats] = useState<{
    poll_id: number;
    poll_title: string;
    total_votes: number;
    metrics: { mobile: number; desktop: number; tablet: number };
    percentages: { mobile: number; desktop: number; tablet: number };
  } | null>(null);
  const [loadingDeviceStats, setLoadingDeviceStats] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const list = await api.getPolls();
        setPolls(list);
        if (list.length > 0) {
          setSelectedPollId(list[0].id);
        }

        const res = await api.getAdminStats().catch(() => null);
        if (res && res.stats) {
          setStats(res.stats);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  useEffect(() => {
    if (!selectedPollId) return;

    const fetchDeviceMetrics = async () => {
      try {
        setLoadingDeviceStats(true);
        const data = await api.getPollDeviceMetrics(Number(selectedPollId));
        setDeviceStats(data);
      } catch (err) {
        console.error("Failed to load device metrics", err);
      } finally {
        setLoadingDeviceStats(false);
      }
    };

    fetchDeviceMetrics();
  }, [selectedPollId]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center space-y-4">
        <div className="w-12 h-12 border-4 border-brand-gold border-t-[#0A1628] rounded-full animate-spin mx-auto"></div>
        <p className="font-bold text-slate-500 font-mono animate-pulse">Computing platform metrics and splits...</p>
      </div>
    );
  }

  // Calculate controversial splits (those closest to 50/50 splits or has close candidate indices)
  const controversialPolls = [...polls]
    .filter(p => p.options.length === 2 && p.total_votes > 100)
    .sort((a,b) => {
      const diffA = Math.abs(a.options[0].vote_count - a.options[1].vote_count);
      const diffB = Math.abs(b.options[0].vote_count - b.options[1].vote_count);
      return diffA - diffB;
    })
    .slice(0, 3);

  // Trending week
  const trendingPolls = [...polls].sort((a,b) => b.total_votes - a.total_votes).slice(0, 5);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      <div className="border-b border-slate-100 pb-4">
        <h1 className="text-3xl font-black text-[#0A1628] tracking-tight">Platform Analytics Board</h1>
        <p className="text-xs text-slate-500">Neutral statistical breakdown of total aggregate ballots and controversial divisions.</p>
      </div>

      {/* Stats row Grid counters */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: "Total Platform Polls", value: stats.totalPolls, icon: BarChart2, suffix: "Debates", col: "text-blue-500" },
          { label: "Total Votes Processed", value: stats.totalVotes.toLocaleString(), icon: Users, suffix: "Ballots", col: "text-emerald-500" },
          { label: "Participating Sovereign Nations", value: stats.countriesCount, icon: Compass, suffix: "Countries", col: "text-purple-500" },
          { label: "Live Debates Active Now", value: stats.activePollsCount, icon: Clock, suffix: "Active", col: "text-brand-gold" }
        ].map((item, idx) => {
          const IconComp = item.icon;
          return (
            <div key={idx} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
              <div className="text-left space-y-1">
                <span className="block text-[10px] uppercase font-bold text-slate-400 font-mono tracking-wider">{item.label}</span>
                <span className="text-3xl font-black font-mono text-[#0A1628] block">{item.value}</span>
                <span className="text-[10px] text-slate-500 font-semibold">{item.suffix} registered</span>
              </div>
              <div className={`p-3 rounded-lg bg-slate-50/50 ${item.col}`}>
                <IconComp className="w-6 h-6" />
              </div>
            </div>
          );
        })}
      </section>

      {/* Main Graph Splits Grid */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Trending Sparklines */}
        <div className="lg:col-span-8 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-6">
          <div className="border-b border-slate-50 pb-3 flex items-center justify-between">
            <h3 className="font-extrabold text-[#0A1628] text-sm tracking-wider uppercase font-mono flex items-center gap-1.5">
              <TrendingUp className="w-5 h-5 text-brand-gold" />
              High Engagement Debates (Most Voted)
            </h3>
          </div>

          <div className="divide-y divide-slate-100">
            {trendingPolls.map((poll, index) => {
              return (
                <div key={poll.id} className="py-4 first:pt-0 last:pb-0 flex flex-col md:flex-row items-baseline justify-between gap-4 text-left">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-slate-300">#0{index + 1}</span>
                      <span className="bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded text-[9px]">
                        {poll.category}
                      </span>
                    </div>
                    <h4 className="font-extrabold text-xs text-slate-900 leading-snug truncate max-w-[480px]">
                      {poll.title}
                    </h4>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <span className="block text-sm font-mono font-black text-[#0A1628]">{poll.total_votes.toLocaleString()}</span>
                      <span className="block text-[9px] text-slate-400 font-bold font-mono uppercase">Cumulative</span>
                    </div>
                    {/* Compact layout progress Spark lines */}
                    <div className="w-16 bg-slate-100 h-2 rounded overflow-hidden">
                      <div className="h-full bg-[#F5A623] rounded" style={{ width: `${Math.min(100, (poll.total_votes / stats.totalVotes) * 900)}%` }}></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Controversial Margins divisions */}
        <div className="lg:col-span-4 bg-[#0A1628] text-white p-6 rounded-2xl border border-slate-800 shadow-sm space-y-6">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="font-extrabold text-brand-gold text-sm tracking-widest uppercase font-mono flex items-center gap-1.5">
              <AlertCircle className="w-5 h-5" />
              Closest Splits (Near 50/50 Margins)
            </h3>
          </div>

          <div className="space-y-4 text-left">
            {controversialPolls.length > 0 ? (
              controversialPolls.map((poll) => {
                const opt1 = poll.options[0];
                const opt2 = poll.options[1];
                const pct1 = (opt1.vote_count / poll.total_votes) * 100;
                const pct2 = (opt2.vote_count / poll.total_votes) * 105; // layout adjustments
                return (
                  <div key={poll.id} className="space-y-2 bg-slate-900 p-3.5 rounded-xl border border-slate-800">
                    <h4 className="font-bold text-xs truncate text-slate-200">{poll.title}</h4>
                    <div className="space-y-1.5 pt-1.5">
                      <div className="flex justify-between text-[10px] font-mono text-slate-400">
                        <span>{opt1.label} ({pct1.toFixed(0)}%)</span>
                        <span>({(opt2.vote_count / poll.total_votes * 100).toFixed(0)}%) {opt2.label}</span>
                      </div>
                      <div className="h-2.5 w-full bg-slate-800 rounded-full flex overflow-hidden">
                        <div className="h-full" style={{ width: `${pct1}%`, backgroundColor: opt1.party_color || "#EF4444" }}></div>
                        <div className="h-full flex-1" style={{ backgroundColor: opt2.party_color || "#10B981" }}></div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-xs text-slate-400 italic py-4">
                No standard double-option controversial referendums active currently.
              </div>
            )}
          </div>
        </div>

      </section>

      {/* SECTION F: Voter Device Distribution */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden p-6 space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-slate-50 pb-4 gap-4">
          <div className="text-left space-y-1">
            <h3 className="font-extrabold text-[#0A1628] text-sm tracking-wider uppercase font-mono flex items-center gap-1.5">
              <Activity className="w-5 h-5 text-amber-500 animate-pulse" />
              Voter Access & Device Distribution
            </h3>
            <p className="text-xs text-slate-500 font-sans">
              Dynamic hardware device audit for electors. Select a debate to analyze native interface usage.
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <label htmlFor="poll-device-select" className="text-xs font-mono font-bold text-slate-400 uppercase">
              Select Debate:
            </label>
            <div className="relative">
              <select
                id="poll-device-select"
                value={selectedPollId}
                onChange={(e) => setSelectedPollId(e.target.value)}
                className="appearance-none bg-slate-50 border border-slate-200 rounded-xl py-2 pl-3 pr-8 text-xs font-bold text-[#0A1628] shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-transparent transition"
              >
                {polls.map((poll) => (
                  <option key={poll.id} value={poll.id}>
                    {poll.title.length > 55 ? `${poll.title.substring(0, 52)}...` : poll.title}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-[#0A1628]">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {loadingDeviceStats ? (
          <div className="py-12 text-center space-y-3">
            <div className="w-8 h-8 border-3 border-brand-gold border-t-transparent rounded-full animate-spin mx-auto mr-1 inline-block"></div>
            <p className="text-xs font-mono text-slate-400 animate-pulse">Retrieving user-agent aggregates...</p>
          </div>
        ) : deviceStats ? (
          <div className="space-y-6">
            
            {/* Visual Contiguous Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono font-bold">
                <span className="text-[#0A1628]">Voter hardware share ratio</span>
                <span className="text-slate-400">{deviceStats.total_votes.toLocaleString()} total votes audited</span>
              </div>
              
              <div className="h-8 w-full bg-slate-100 rounded-xl overflow-hidden flex shadow-inner border border-slate-200/55">
                {deviceStats.percentages.mobile > 0 && (
                  <div 
                    className="bg-[#F5A623] h-full flex items-center justify-center text-white text-[10px] sm:text-xs font-black font-mono transition-all duration-500 ease-out"
                    style={{ width: `${deviceStats.percentages.mobile}%` }}
                    title={`Mobile: ${deviceStats.percentages.mobile}% (${deviceStats.metrics.mobile.toLocaleString()} votes)`}
                  >
                    {deviceStats.percentages.mobile > 15 && `Mobile ${deviceStats.percentages.mobile}%`}
                  </div>
                )}
                {deviceStats.percentages.desktop > 0 && (
                  <div 
                    className="bg-[#0A1628] h-full flex items-center justify-center text-white text-[10px] sm:text-xs font-black font-mono transition-all duration-500 ease-out border-l border-white/20"
                    style={{ width: `${deviceStats.percentages.desktop}%` }}
                    title={`Desktop: ${deviceStats.percentages.desktop}% (${deviceStats.metrics.desktop.toLocaleString()} votes)`}
                  >
                    {deviceStats.percentages.desktop > 15 && `Desktop ${deviceStats.percentages.desktop}%`}
                  </div>
                )}
                {deviceStats.percentages.tablet > 0 && (
                  <div 
                    className="bg-blue-600 h-full flex items-center justify-center text-white text-[10px] sm:text-xs font-black font-mono transition-all duration-500 ease-out border-l border-white/20"
                    style={{ width: `${deviceStats.percentages.tablet}%` }}
                    title={`Tablet: ${deviceStats.percentages.tablet}% (${deviceStats.metrics.tablet.toLocaleString()} votes)`}
                  >
                    {deviceStats.percentages.tablet > 15 && `Tablet ${deviceStats.percentages.tablet}%`}
                  </div>
                )}
              </div>
            </div>

            {/* Platform breakdowns Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Mobile Device */}
              <div id="device-mobile-card-results" className="border border-slate-100 rounded-2xl p-5 bg-slate-50/20 text-left space-y-3 shadow-xs hover:border-slate-200 transition">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-[#0A1628]">Mobile Platform</h4>
                      <span className="text-[10px] font-mono font-bold text-slate-400">Smartphones & mobile browsers</span>
                    </div>
                  </div>
                  <span className="text-xl font-black font-mono text-[#F5A623]">{deviceStats.percentages.mobile}%</span>
                </div>
                <div className="border-t border-slate-100 pt-2 flex justify-between items-baseline">
                  <span className="text-[10px] font-medium text-slate-500 font-mono">Ballots Audited:</span>
                  <span className="text-xs font-bold font-mono text-slate-700">{deviceStats.metrics.mobile.toLocaleString()}</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed font-sans">
                  Represents participants voting via smartphones. High values typical for breaking debates shared through instant messenger apps or mobile news.
                </p>
              </div>

              {/* Desktop Device */}
              <div id="device-desktop-card-results" className="border border-slate-100 rounded-2xl p-5 bg-slate-50/20 text-left space-y-3 shadow-xs hover:border-slate-200 transition">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-[#0A1628]/5 rounded-lg text-[#0A1628]">
                      <Monitor className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-[#0A1628]">Desktop Terminal</h4>
                      <span className="text-[10px] font-mono font-bold text-slate-400">Windows, macOS & Linux setups</span>
                    </div>
                  </div>
                  <span className="text-xl font-black font-mono text-[#0A1628]">{deviceStats.percentages.desktop}%</span>
                </div>
                <div className="border-t border-slate-100 pt-2 flex justify-between items-baseline">
                  <span className="text-[10px] font-medium text-slate-500 font-mono">Ballots Audited:</span>
                  <span className="text-xs font-bold font-mono text-slate-700">{deviceStats.metrics.desktop.toLocaleString()}</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed font-sans">
                  Represents workstation access. Higher ratio is common for complex policy initiatives or long-form debates where voters perform deep, tabbed research.
                </p>
              </div>

              {/* Tablet Device */}
              <div id="device-tablet-card-results" className="border border-slate-100 rounded-2xl p-5 bg-slate-50/20 text-left space-y-3 shadow-xs hover:border-slate-200 transition">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                      <Tablet className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-[#0A1628]">Tablet Device</h4>
                      <span className="text-[10px] font-mono font-bold text-slate-400">iPads and Android touchpads</span>
                    </div>
                  </div>
                  <span className="text-xl font-black font-mono text-blue-600">{deviceStats.percentages.tablet}%</span>
                </div>
                <div className="border-t border-slate-100 pt-2 flex justify-between items-baseline">
                  <span className="text-[10px] font-medium text-slate-500 font-mono">Ballots Audited:</span>
                  <span className="text-xs font-bold font-mono text-slate-700">{deviceStats.metrics.tablet.toLocaleString()}</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed font-sans">
                  Includes tablet and medium-screen touch devices. Represents relaxed browsing patterns, hybrid reading habits, and high-definition graphic displays.
                </p>
              </div>

            </div>
          </div>
        ) : (
          <div className="py-6 text-center text-xs italic text-slate-400">
            No active metrics databases loaded. Please seed or configure.
          </div>
        )}
      </section>

    </div>
  );
};
