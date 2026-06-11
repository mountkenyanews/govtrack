/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Poll, Politician, NewsItem, PlatformStats } from "../types";
import { api } from "../utils/api";
import { PollCard, PoliticianAvatar, ApprovalRingChart, getProxiedImageUrl } from "../components/Shared";
import { stripHtmlTags } from "../utils/richText";
import { 
  Vote, 
  TrendingUp, 
  ChevronRight, 
  Plus, 
  ArrowRight, 
  Sparkles, 
  Globe, 
  Activity, 
  Users, 
  Flag 
} from "lucide-react";

interface HomeViewProps {
  onNavigate: (path: string) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ onNavigate }) => {
  const [loading, setLoading] = useState(true);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [politicians, setPoliticians] = useState<Politician[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [stats, setStats] = useState<PlatformStats>({
    totalPolls: 18,
    totalVotes: 54490,
    countriesCount: 12,
    activePollsCount: 6
  });
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [settings, setSettings] = useState<{ hero_image_url: string }>({
    hero_image_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/General_Assembly_Hall.jpg/1280px-General_Assembly_Hall.jpg"
  });

  useEffect(() => {
    const loadHomeData = async () => {
      try {
        setLoading(true);
        const pollsData = await api.getPolls({ status: "active" });
        const politiciansData = await api.getPoliticians({ sort: "Approval Rating (High→Low)" });
        const newsData = await api.getNews();
        
        setPolls(pollsData);
        setPoliticians(politiciansData);
        setNews(newsData.slice(0, 3));

        // Load correct platform metadata stats from endpoint
        const adminStats = await api.getAdminStats().catch(() => null);
        if (adminStats && adminStats.stats) {
          setStats(adminStats.stats);
        }

        // Fetch platform settings for the dynamic hero background
        const settingsData = await api.getSettings().catch(() => null);
        if (settingsData && settingsData.hero_image_url) {
          setSettings(settingsData);
        }
      } catch (err) {
        console.error("Home loading failed", err);
      } finally {
        setLoading(false);
      }
    };

    loadHomeData();
  }, []);

  useEffect(() => {
    const handleSettingsChange = async () => {
      try {
        const settingsData = await api.getSettings().catch(() => null);
        if (settingsData && settingsData.hero_image_url) {
          setSettings(settingsData);
        }
      } catch (err) {
        console.error("Failed to update settings dynamically", err);
      }
    };

    window.addEventListener("govtrack_settings_change", handleSettingsChange);
    return () => {
      window.removeEventListener("govtrack_settings_change", handleSettingsChange);
    };
  }, []);

  // Find featured poll
  const featuredPoll = polls.find(p => p.is_featured && p.status === "active") || polls[0];
  const otherActivePolls = polls.filter(p => p.id !== (featuredPoll?.id || -1));

  // Category list filter
  const categories = [
    "All", "Election", "Approval Rating", "Policy", "Leadership", "Referendum", "International", "Local Government"
  ];

  const filteredPolls = selectedCategory === "All" 
    ? otherActivePolls 
    : otherActivePolls.filter(p => p.category === selectedCategory);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center space-y-4">
        <div className="w-12 h-12 border-4 border-brand-gold border-t-brand-blue rounded-full animate-spin mx-auto"></div>
        <p className="font-bold text-slate-500 font-mono animate-pulse">Synchronizing worldwide electoral opinion data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-12 pb-16">
      {/* SECTION A: Hero Section with African voting style consensus background */}
      <section className="relative overflow-hidden bg-[#0A1628] text-white pt-24 pb-16 px-4 md:px-8 min-h-[460px] flex flex-col justify-center">
        {/* Editorial Background Image layer */}
        <div className="absolute inset-0 z-0 select-none">
          <img 
            src={getProxiedImageUrl(settings.hero_image_url)}
            alt="Global electoral and representative assembly" 
            className="w-full h-full object-cover opacity-55 sm:opacity-70 md:opacity-75 transition-opacity duration-300 object-center md:object-right"
            referrerPolicy="no-referrer"
          />
          {/* Responsive gradients: keeps left-aligned text legible while letting the beautiful assembly image shine clearly on the right */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#0a1628] via-[#0a1628]/90 md:via-[#0a1628]/65 to-[#0a1628]/40 md:to-transparent"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a1628] via-transparent to-transparent"></div>
        </div>

        <div className="max-w-7xl mx-auto space-y-8 relative z-10 w-full my-auto">
          <div className="max-w-3xl space-y-6 text-left">
            <div className="inline-flex items-center gap-1.5 bg-[#F5A623]/20 text-[#F5A623] text-xs font-black uppercase tracking-widest px-3 py-1.5 rounded-full border border-[#F5A623]/30 backdrop-blur-xs">
              <Sparkles className="w-3.5 h-3.5 fill-[#F5A623]" />
              Empowering Democratic Insights · Traditional Consensus
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight leading-none text-white font-heading">
              Track the Pulse of <span className="text-[#F5A623]">Democracy</span>
            </h1>

            <p className="text-base md:text-lg text-slate-250 max-w-2xl leading-relaxed font-sans font-medium drop-shadow-xs">
              Real-time, aggregate-authenticated polls on elections, public policy, and leadership. Vote securely, trace transparent metrics, and analyze trends.
            </p>

            <div className="flex flex-wrap items-center gap-3.5 pt-4">
              <button 
                onClick={() => onNavigate("/polls")}
                className="bg-[#F5A623] hover:bg-[#F5A623]/95 text-[#0A1628] font-black text-sm px-8 py-3.5 rounded-xl shadow-lg transform hover:scale-[1.02] transition-all"
              >
                Vote Live Now
              </button>
              <button 
                onClick={() => onNavigate("/create")}
                className="bg-white/10 hover:bg-white/20 text-white font-bold text-sm px-6 py-3.5 rounded-xl border border-white/20 transition-all flex items-center gap-1.5 backdrop-blur-xs"
              >
                <Plus className="w-4 h-4" /> Create a Poll
              </button>
            </div>
          </div>
        </div>

        {/* Live Ticker Bar */}
        <div className="max-w-7xl mx-auto mt-16 border-t border-slate-800 pt-5 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
            <strong className="text-slate-200">Live Metric Broadcast:</strong> 
            <span>🗳 {stats.totalVotes.toLocaleString()} votes cast across {stats.countriesCount} countries</span>
          </div>
          <div className="flex items-center gap-4">
            <span>📊 {stats.totalPolls} issues tracked</span>
            <span className="hidden sm:inline">|</span>
            <span>🔥 {stats.activePollsCount} hot polls active today</span>
          </div>
        </div>
      </section>

      {/* SECTION B: Featured Poll Banner */}
      {featuredPoll && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-r from-slate-900 to-[#0A1628] rounded-2xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden ring-1 ring-white/10">
            <div className="absolute top-4 right-4 bg-brand-gold text-[#0A1628] font-black uppercase text-[9px] tracking-wider px-2.5 py-1 rounded">
              FEATURED POLL
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-6 space-y-4">
                <span className="inline-flex items-center gap-1.5 bg-blue-500/10 text-blue-300 text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border border-blue-500/20">
                  <Activity className="w-3.5 h-3.5" />
                  {featuredPoll.category}
                </span>

                <h2 className="text-2xl md:text-3.5xl font-extrabold tracking-tight leading-tight">
                  {featuredPoll.title}
                </h2>

                <p className="text-sm text-slate-300 leading-relaxed">
                  {featuredPoll.description}
                </p>

                <div className="flex items-center gap-4 text-xs text-slate-400">
                  <span className="font-mono">{featuredPoll.total_votes.toLocaleString()} Votes cast</span>
                  <span>•</span>
                  <span>Closes: {featuredPoll.closes_at ? new Date(featuredPoll.closes_at).toLocaleDateString() : "Ongoing"}</span>
                </div>

                <div className="pt-3">
                  <button
                    onClick={() => onNavigate(`/polls/${featuredPoll.id}`)}
                    className="bg-[#F5A623] hover:bg-[#F5A623]/90 text-[#0A1628] font-extrabold text-sm px-6 py-2.5 rounded shadow transition hover:scale-[1.02]"
                  >
                    VOTE IN THIS POLL
                  </button>
                </div>
              </div>

              {/* Options visualizer */}
              <div className="lg:col-span-6 space-y-3 bg-white/5 p-4 rounded-xl border border-white/10">
                <h4 className="text-xs font-black tracking-widest text-[#F5A623] uppercase mb-1">CURRENT STANDINGS</h4>
                {featuredPoll.options.slice(0, 3).map((opt) => {
                  const pct = featuredPoll.total_votes > 0 ? (opt.vote_count / featuredPoll.total_votes) * 100 : 0;
                  return (
                    <div key={opt.id} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <PoliticianAvatar name={opt.label} photo_url={opt.photo_url} party_color={opt.party_color} size="sm" showTooltip={false} />
                          <span className="font-bold">{opt.label}</span>
                          {opt.party && <span className="text-[9px] opacity-60">({opt.party})</span>}
                        </div>
                        <span className="font-mono font-black text-brand-gold">{pct.toFixed(1)}%</span>
                      </div>
                      <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full" 
                          style={{ width: `${pct}%`, backgroundColor: opt.party_color || "#F5A623" }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* SECTION E: Tracked Leaders scroll row */}
      {politicians.length > 0 && (
        <section className="bg-slate-50 border-y border-slate-100 py-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-extrabold text-[#0A1628] tracking-tight">
                  Most Tracked Political Leaders
                </h2>
                <p className="text-xs text-slate-500">Live compiled approval scores aggregate from all active poll categories.</p>
              </div>
              <button 
                onClick={() => onNavigate("/politicians")}
                className="text-xs font-bold text-[#0A1628] hover:text-brand-gold inline-flex items-center gap-1 group"
              >
                <span>All Leaders</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>

            {/* Horizontal flow */}
            <div className="flex gap-4 overflow-x-auto pb-4 pt-2 -mx-4 px-4 scrollbar-thin">
              {politicians.map((pol) => (
                <div 
                  key={pol.id}
                  onClick={() => onNavigate(`/politicians/${pol.id}`)}
                  className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col items-center text-center w-48 shrink-0 cursor-pointer hover:border-slate-200 hover:shadow transition-all"
                >
                  <PoliticianAvatar name={pol.full_name} photo_url={pol.photo_url} party_color={pol.party_color} size="lg" showTooltip={false} />
                  
                  <div className="mt-3 min-w-0">
                    <h4 className="font-extrabold text-[#0A1628] text-sm truncate">{pol.full_name}</h4>
                    <p className="text-[10px] text-slate-500 truncate mt-0.5">{pol.title} · {pol.country}</p>
                  </div>

                  {/* Ring approval index */}
                  <div className="mt-4 flex items-center justify-center gap-2">
                    <ApprovalRingChart approvalPercent={pol.approval_rating} size={42} />
                    <div className="text-left">
                      <span className="block text-[8px] text-slate-400 font-bold uppercase tracking-wider leading-none">Approval</span>
                      <span className="text-xs font-extrabold font-mono text-slate-800">{pol.approval_rating}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* SECTION C & D: Active Polls with Category Filtering */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-extrabold text-[#0A1628] tracking-tight">
                Active Public Opinion Polls
              </h2>
              <p className="text-xs text-slate-500">Cast your vote on constitutional bills, cabinet approvals, local governments, and foreign policy.</p>
            </div>
          </div>

          {/* scrollable horizontal category list */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wide whitespace-nowrap transition-colors ${
                  selectedCategory === cat
                    ? "bg-[#0A1628] text-[#F5A623]"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Grid display */}
        {filteredPolls.length > 0 ? (
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
          <div className="bg-slate-50 rounded-xl p-12 text-center border border-dashed border-slate-200">
            <span className="text-3xl text-slate-400 block mb-2">🗳</span>
            <h4 className="font-extrabold text-slate-700">No active polls in this category yet</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">Be the first to draft a public debate and seek voter insights.</p>
            <button 
              onClick={() => onNavigate("/create")}
              className="mt-4 inline-flex items-center gap-1 bg-[#0A1628] text-white text-xs font-bold px-4 py-2 rounded"
            >
              <Plus className="w-3.5 h-3.5" /> Launch Poll
            </button>
          </div>
        )}

        <div className="text-center">
          <button 
            onClick={() => onNavigate("/polls")}
            className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-[#0A1628] font-bold text-xs px-5 py-2.5 rounded border border-slate-200 transition-colors"
          >
            <span>Explore All Active Polls</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* SECTION F: Breaking News & Insights plus Trending list */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* News column */}
        <div className="lg:col-span-8 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-xl font-extrabold text-[#0A1628] tracking-tight">
              Electoral Insights & Fact Reports
            </h2>
            <button 
              onClick={() => onNavigate("/news")}
              className="text-xs font-bold text-[#0A1628] hover:text-brand-gold"
            >
              View Feed
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {news.map((item) => (
              <div 
                key={item.id}
                className="bg-white rounded-lg border border-slate-100 shadow-sm overflow-hidden flex flex-col h-full"
              >
                <div className="aspect-video w-full bg-slate-100 overflow-hidden relative">
                  <img src={getProxiedImageUrl(item.image_url)} alt={item.title} className="w-full h-full object-cover" />
                  <span className="absolute bottom-2 left-2 bg-slate-900/80 text-white text-[9px] px-1.5 py-0.5 rounded font-bold font-mono">
                    {item.source_name}
                  </span>
                </div>
                <div className="p-3 flex-1 flex flex-col justify-between space-y-3">
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-[#F5A623] uppercase">{item.country}</span>
                    <h4 className="font-bold text-slate-800 text-xs line-clamp-2 hover:text-[#0A1628]">
                      {item.title}
                    </h4>
                    <p className="text-[10px] text-slate-500 line-clamp-3">{stripHtmlTags(item.summary)}</p>
                  </div>
                  {item.related_poll_id && (
                    <button
                      onClick={() => onNavigate(`/polls/${item.related_poll_id}`)}
                      className="text-[10px] font-extrabold text-[#F5A623] hover:underline text-left block"
                    >
                      📊 Vote in related poll →
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Trending Column */}
        <div className="lg:col-span-4 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-xl font-extrabold text-[#0A1628] tracking-tight flex items-center gap-1.5">
              <TrendingUp className="w-5 h-5 text-brand-gold" />
              Trending Polls Last 24h
            </h2>
          </div>

          <div className="space-y-3">
            {polls.slice(0, 5).map((poll, index) => (
              <div 
                key={poll.id}
                onClick={() => onNavigate(`/polls/${poll.id}`)}
                className="p-3 bg-white rounded-lg border border-slate-100 shadow-xs hover:border-slate-200 transition cursor-pointer flex items-start gap-3"
              >
                <span className="font-mono text-lg font-black text-slate-300 w-5 text-center mt-0.5">
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">
                    {poll.category}
                  </span>
                  <h4 className="font-bold text-xs text-slate-800 leading-tight mt-1 truncate">
                    {poll.title}
                  </h4>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                    {poll.total_votes.toLocaleString()} votes cast
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION H: CTA banner strip */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-[#0A1628] text-white p-8 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6 border border-slate-800 text-center md:text-left">
          <div className="space-y-1">
            <h3 className="text-lg font-extrabold tracking-tight">Have an opinion on an ongoing debate?</h3>
            <p className="text-xs text-slate-400">Launch your own interactive polling widget in under 60 seconds.</p>
          </div>
          <button 
            onClick={() => onNavigate("/create")}
            className="bg-[#F5A623] hover:bg-[#F5A623]/95 text-[#0A1628] font-black text-xs px-6 py-3 rounded shadow transition transform hover:scale-[1.02]"
          >
            Create your poll now
          </button>
        </div>
      </section>
    </div>
  );
};
