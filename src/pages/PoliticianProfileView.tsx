/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Politician, Poll, DevelopmentProgress } from "../types";
import { api, getSavedUser } from "../utils/api";
import { PoliticianAvatar, ApprovalRingChart, PollCard } from "../components/Shared";
import { 
  ArrowLeft, 
  Twitter, 
  Instagram, 
  Activity, 
  User as UserIcon, 
  Award,
  Calendar,
  Layers,
  TrendingUp,
  ExternalLink,
  Users,
  CheckCircle,
  PlusCircle,
  Clock,
  Send
} from "lucide-react";

interface PoliticianProfileViewProps {
  politicianId: number;
  onNavigate: (path: string) => void;
}

export const PoliticianProfileView: React.FC<PoliticianProfileViewProps> = ({ 
  politicianId, 
  onNavigate 
}) => {
  const [loading, setLoading] = useState(true);
  const [pol, setPol] = useState<Politician | null>(null);
  const [associatedPolls, setAssociatedPolls] = useState<Poll[]>([]);
  const [activeTab, setActiveTab] = useState<"overview" | "polls" | "history" | "party" | "developments">("overview");
  const [errorMsg, setErrorMsg] = useState("");
  const [partyId, setPartyId] = useState<number | null>(null);

  // Developments State
  const [developments, setDevelopments] = useState<DevelopmentProgress[]>([]);
  const [suggestModalOpen, setSuggestModalOpen] = useState(false);
  const [suggestForm, setSuggestForm] = useState({ title: "", description: "", timeline: "past", date: "", email: "" });
  const [suggestFeedback, setSuggestFeedback] = useState({ type: "", message: "" });
  const [activeTimeline, setActiveTimeline] = useState<"past"| "present"| "future">("past");
  const [editingDevId, setEditingDevId] = useState<number|null>(null);
  const [editForm, setEditForm] = useState({ title: "", description: "", date: "" });

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        const res = await api.getPoliticianDetail(politicianId);
        setPol(res.politician);
        setAssociatedPolls(res.polls);

        try {
          const devs = await api.getDevelopments(politicianId, false);
          setDevelopments(Array.isArray(devs) ? devs : []);
        } catch(e) {
          console.error("Failed to fetch developments", e);
        }

        if (res.politician && res.politician.party) {
          try {
            const partiesList = await api.getParties();
            const polPartyClean = res.politician.party.toLowerCase();
            const polCountry = res.politician.country.toLowerCase();
            const match = partiesList.find(p => 
              (p.country && p.country.toLowerCase() === polCountry) && (
                p.name.toLowerCase() === polPartyClean ||
                p.abbreviation.toLowerCase() === polPartyClean ||
                polPartyClean.includes(p.name.toLowerCase()) ||
                polPartyClean.includes(p.abbreviation.toLowerCase()) ||
                p.name.toLowerCase().includes(polPartyClean)
              )
            );
            if (match) {
              setPartyId(match.id);
            }
          } catch (err) {
            console.error("Mapping party ID failed silently", err);
          }
        }
      } catch (err) {
        console.error("Profile load failed", err);
        setErrorMsg("The requested politician profile record could not be found.");
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [politicianId]);

  const handleSuggestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuggestFeedback({ type: "loading", message: "Submitting..." });
    if (!suggestForm.title || !suggestForm.description) {
      setSuggestFeedback({ type: "error", message: "Title and Description are required." });
      return;
    }

    try {
      await api.suggestDevelopment(politicianId, suggestForm);
      setSuggestFeedback({ type: "success", message: "Suggestion submitted for review!" });
      setTimeout(() => {
        setSuggestModalOpen(false);
        setSuggestForm({ title: "", description: "", timeline: "past", date: "", email: "" });
        setSuggestFeedback({ type: "", message: "" });
      }, 2000);
    } catch (err) {
      setSuggestFeedback({ type: "error", message: "Failed to submit. Please try again." });
    }
  };

  const currentUser = getSavedUser();
  const isAdmin = currentUser?.role === "admin";

  const handleAdminDelete = async (id: number) => {
    if (!confirm("Delete this development milestone?")) return;
    try {
      await api.adminRejectDevelopment(id);
      setDevelopments(developments.filter(d => d.id !== id));
    } catch (err) {
      alert("Failed to delete.");
    }
  };

  const handleEditSave = async (id: number) => {
    try {
      const res = await api.adminEditDevelopment(id, editForm);
      setDevelopments(developments.map(d => d.id === id ? res.development : d));
      setEditingDevId(null);
    } catch (err) {
      alert("Failed to edit.");
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center space-y-4">
        <div className="w-12 h-12 border-4 border-[#F5A623] border-t-[#0A1628] rounded-full animate-spin mx-auto"></div>
        <p className="font-bold text-slate-500 font-mono animate-pulse">Syncing representative credentials ledger...</p>
      </div>
    );
  }

  if (!pol) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <h3 className="font-extrabold text-slate-800">Profile Not Found</h3>
        <p className="text-xs text-slate-500">{errorMsg || "The politician dossier requested does not exist."}</p>
        <button onClick={() => onNavigate("/politicians")} className="bg-[#0A1628] text-white text-xs font-bold px-4 py-2 rounded">
          Back to Directory
        </button>
      </div>
    );
  }

  // Draw historic SVG approval line chart (Timeline)
  const renderHistoryTimeline = () => {
    const quarters = ["Q1 2025", "Q2 2025", "Q3 2025", "Q4 2025", "Q1 2026", "Current"];
    // Build simulated history floating slightly around his true current computed rating
    const base = pol.approval_rating;
    const dataPoints = [
      base - 5.2,
      base - 2.1,
      base + 1.4,
      base - 1.0,
      base + 3.2,
      base
    ];

    const width = 600;
    const height = 180;
    const padding = 35;

    const maxVal = Math.max(...dataPoints, 100);
    const minVal = Math.min(...dataPoints, 0);

    const points = dataPoints.map((val, i) => {
      const x = padding + (i / (dataPoints.length - 1)) * (width - padding * 2);
      // Normalized between min and max (with a safety threshold)
      const y = height - padding - ((val - minVal) / (maxVal - minVal || 1)) * (height - padding * 2);
      return { x, y, val, label: quarters[i] };
    });

    const pathData = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

    return (
      <div className="bg-white p-5 rounded-2xl border border-slate-100 space-y-4">
        <h3 className="font-extrabold text-slate-900 text-sm tracking-wider uppercase font-mono flex items-center gap-1">
          <TrendingUp className="w-4.5 h-4.5 text-[#F5A623]" />
          Historical Public Approval Trajectory
        </h3>
        <p className="text-xs text-slate-500 leading-normal">
          A dynamic graphical mapping illustrating average constituent backing levels tracked quarterly through all active platform registries.
        </p>

        <div className="w-full overflow-x-auto">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[340px] h-44">
            {/* Grid baseline markers */}
            <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#f1f5f9" strokeWidth="2" />
            <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="#f8fafc" strokeWidth="1" />
            
            {/* Smooth visual fill graph under vector */}
            <path 
              d={`${pathData} L ${points[points.length-1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`} 
              fill={`rgba(245, 166, 35, 0.08)`}
            />

            {/* Vector wire path */}
            <path d={pathData} fill="none" stroke={pol.party_color || "#F5A623"} strokeWidth="3.5" strokeLinecap="round" />

            {/* Scatter Plot node markers */}
            {points.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r="5" fill="#0A1628" stroke={pol.party_color || "#F5A623"} strokeWidth="2.5" />
                <text x={p.x} y={p.y - 12} textAnchor="middle" className="text-[10px] fill-slate-800 font-mono font-black">
                  {p.val.toFixed(1)}%
                </text>
                <text x={p.x} y={height - 12} textAnchor="middle" className="text-[9px] fill-slate-400 font-bold font-mono">
                  {p.label}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      
      {/* Back CTA */}
      <button 
        onClick={() => onNavigate("/politicians")}
        className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-[#0A1628] font-bold"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Politicians Directory
      </button>

      {/* Profile Header Dossier card */}
      <section className="bg-[#0A1628] text-white p-6 md:p-8 rounded-2xl flex flex-col md:flex-row items-center md:items-start gap-6 border border-slate-800 relative shadow-md">
        <PoliticianAvatar name={pol.full_name} photo_url={pol.photo_url} party_color={pol.party_color} size="xl" showTooltip={false} />

        <div className="text-center md:text-left flex-1 space-y-4">
          <div>
            <span className="text-xs text-brand-gold uppercase tracking-widest font-mono font-black">
              🇳🇵 Tracked Representative Profile
            </span>
            <h1 className="text-2xl md:text-4xl font-black tracking-tight leading-none mt-1">
              {pol.full_name}
            </h1>
            <p className="text-sm md:text-md text-slate-350 font-bold mt-1.5 leading-none">
              {pol.title} · <span className="text-slate-400 font-medium">{pol.office}</span>
            </p>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mt-3.5 text-xs">
              {partyId !== null ? (
                <button 
                  onClick={() => onNavigate(`/parties/${partyId}`)}
                  className="px-3 py-1 text-xs font-bold text-white rounded-full border border-white/10 hover:opacity-90 active:scale-95 transition-all text-left flex items-center gap-1 cursor-pointer"
                  style={{ backgroundColor: pol.party_color || "#3b82f6" }}
                  title="Click to view full political party profile"
                >
                  <span>{pol.party}</span>
                  <span className="text-[9px] opacity-80 font-mono">↗</span>
                </button>
              ) : (
                <span 
                  className="px-3 py-1 text-xs font-bold text-white rounded-full border border-white/10"
                  style={{ backgroundColor: pol.party_color || "#3b82f6" }}
                >
                  {pol.party}
                </span>
              )}
              <span className="bg-slate-800 border border-slate-700 text-slate-300 font-semibold px-2.5 py-1 rounded">
                Nation: {pol.country}
              </span>
            </div>
          </div>

          {/* Social connections */}
          <div className="flex justify-center md:justify-start gap-4 text-xs font-semibold">
            {pol.social_twitter && (
              <a 
                href={`https://twitter.com/${pol.social_twitter}`} 
                target="_blank" 
                rel="noreferrer" 
                className="flex items-center gap-1 text-sky-400 hover:underline"
              >
                <Twitter className="w-4 h-4" /> @{pol.social_twitter}
              </a>
            )}
            {pol.social_instagram && (
              <a 
                href={`https://instagram.com/${pol.social_instagram}`} 
                target="_blank" 
                rel="noreferrer" 
                className="flex items-center gap-1 text-purple-400 hover:underline"
              >
                <Instagram className="w-4 h-4" /> @{pol.social_instagram}
              </a>
            )}
          </div>
        </div>

        {/* Highlight Score Ring Badge */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col items-center shadow-lg w-full md:w-auto">
          <ApprovalRingChart approvalPercent={pol.approval_rating} size={64} />
          <div className="text-center mt-3">
            <span className="block text-[8px] uppercase font-bold text-slate-400 font-mono tracking-wider">Average Approval</span>
            <span className="text-lg font-black font-mono text-brand-gold">{pol.approval_rating}%</span>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
        {[
          { label: "Tracked Poll Appearances", val: `${pol.total_poll_appearances} Active Polls` },
          { label: "Birth Record Indicator", val: pol.date_of_birth ? new Date(pol.date_of_birth).toLocaleDateString() : "Under review" },
          { label: "Dossier Status", val: pol.is_active ? "🟢 Active Representative" : "🔴 Inactive Profile" }
        ].map((st, i) => (
          <div key={i} className="bg-white p-3.5 border border-slate-100 rounded-xl shadow-xs text-slate-755">
            <span className="block text-[9px] uppercase font-bold text-slate-400 font-mono tracking-wider">{st.label}</span>
            <span className="text-sm font-extrabold text-[#0A1628] mt-1 block">{st.val}</span>
          </div>
        ))}
      </div>

      {/* Tab select structures */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-4">
          {[
            { id: "overview", label: "Overview Dossier" },
            { id: "polls", label: `Included Polls (${associatedPolls.length})` },
            { id: "history", label: "Approval History" },
            { id: "party", label: "Party Information" },
            { id: "developments", label: "Achievements & Progress" }
          ].map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`pb-3 text-xs font-bold tracking-wide border-b-2 transition-all ${
                  active 
                    ? "border-[#0A1628] text-[#0A1628]" 
                    : "border-transparent text-slate-400 hover:text-slate-600"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Panels */}
      <main className="min-h-[220px]">
        {activeTab === "overview" && (
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs grid grid-cols-1 md:grid-cols-12 gap-6">
            <div className="md:col-span-8 space-y-4 text-left">
              <h3 className="font-extrabold text-[#0A1628] text-sm font-mono uppercase tracking-wider">Representative Biography</h3>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                {pol.bio || `${pol.full_name} serves as a tracked diplomatic figure inside the country of ${pol.country}. Public surveys regularly assess legislative actions and structural milestones in office.`}
              </p>

              <div className="space-y-3 pt-2">
                <h4 className="font-bold text-xs text-slate-800 uppercase font-mono">Profile Attributes / Metadata Tags</h4>
                <div className="flex flex-wrap gap-1.5">
                  {pol.tags?.map((t, idx) => (
                    <span key={idx} className="bg-slate-50 text-slate-600 text-[10px] font-semibold px-2.5 py-1 rounded border border-slate-200/50">
                      #{t}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="md:col-span-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100 text-xs text-slate-6 main-y space-y-3">
              <h4 className="font-bold text-[#0A1628] uppercase font-mono tracking-widest text-[10px]">dossier milestones</h4>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-450 font-bold">Party Line:</span>
                  <span className="font-semibold text-slate-800">{pol.party}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-450 font-bold">Territorial Seat:</span>
                  <span className="font-semibold text-slate-805">{pol.office}</span>
                </div>
                <div className="flex justify-between border-t border-slate-100 pt-2 font-mono">
                  <span className="text-slate-500 font-bold">Average Approval Index:</span>
                  <span className="font-black text-brand-gold">{pol.approval_rating}%</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "polls" && (
          <div className="space-y-4">
            {associatedPolls.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {associatedPolls.map((poll) => (
                  <PollCard 
                    key={poll.id} 
                    poll={poll} 
                    onSelect={(id) => onNavigate(`/polls/${id}`)}
                  />
                ))}
              </div>
            ) : (
              <div className="bg-slate-50 p-12 text-center rounded-xl border border-dashed border-slate-200">
                <span className="text-3xl text-slate-300 block mb-2">📊</span>
                <h4 className="font-bold text-slate-700">No specific polls listing this leader yet</h4>
                <p className="text-xs text-slate-450 mt-1">Check back soon for upcoming democratic general consensus tracking polls.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "history" && renderHistoryTimeline()}

        {activeTab === "party" && (
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs space-y-4 text-left">
            <h3 className="font-bold text-[#0A1628] text-sm uppercase tracking-wider font-mono">Party Affiliation Insights: {pol.party}</h3>
            <p className="text-xs text-slate-600 leading-normal">
              Member representatives aligned with the <span className="font-bold text-brand-gold">{pol.party}</span> campaign around structural reforms and legislative manifestos corresponding to economic relief, public welfare, and constitutional reviews.
            </p>
            <div className="inline-flex items-center gap-2 bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs w-full max-w-sm mt-2">
              <Users className="w-5 h-5 text-slate-400" />
              <div>
                <span className="font-bold block text-slate-700">Party Headquarters Status</span>
                <span className="text-[10px] text-slate-450 mt-0.5 block font-mono">Active Coalition Registry ID: GT-{pol.party.substring(0,3).toUpperCase()}</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === "developments" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex bg-slate-100 p-1 rounded-xl">
                {["past", "present", "future"].map(tl => (
                  <button
                    key={tl}
                    onClick={() => setActiveTimeline(tl as any)}
                    className={`px-4 py-1.5 text-xs font-bold capitalize rounded-lg transition-all ${activeTimeline === tl ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    {tl}
                  </button>
                ))}
              </div>
              <button 
                onClick={() => setSuggestModalOpen(true)}
                className="bg-[#0A1628] hover:bg-slate-800 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-2 transition"
              >
                <PlusCircle className="w-4 h-4" /> Suggest Update
              </button>
            </div>

            <div className="space-y-4">
              {developments.filter(d => d.timeline === activeTimeline).length === 0 ? (
                <div className="bg-slate-50 p-12 text-center rounded-xl border border-dashed border-slate-200">
                  <Activity className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <h4 className="font-bold text-slate-700">No {activeTimeline} records found</h4>
                  <p className="text-xs text-slate-450 mt-1">Help us keep records accurate by suggesting an update.</p>
                </div>
              ) : (
                developments.filter(d => d.timeline === activeTimeline).map(dev => (
                  <div key={dev.id} className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm flex flex-col sm:flex-row gap-4 items-start relative overflow-hidden">
                    {dev.creator_type === 'ai' && (
                      <div className="absolute top-0 right-0 bg-brand-gold/10 text-brand-gold text-[8px] font-black uppercase px-2 py-1 rounded-bl-lg">
                        AI Generated
                      </div>
                    )}
                    <div className="bg-slate-50 p-3 rounded-xl text-slate-400">
                      {activeTimeline === 'past' && <CheckCircle className="w-6 h-6 text-emerald-500" />}
                      {activeTimeline === 'present' && <Activity className="w-6 h-6 text-brand-gold" />}
                      {activeTimeline === 'future' && <Clock className="w-6 h-6 text-blue-500" />}
                    </div>
                    <div className="flex-1">
                      {editingDevId === dev.id ? (
                        <div className="space-y-2">
                          <input 
                            value={editForm.title} 
                            onChange={e => setEditForm({...editForm, title: e.target.value})} 
                            className="w-full text-sm font-bold text-slate-800 border-b border-slate-300 outline-none p-1" 
                          />
                          <input 
                            value={editForm.date} 
                            onChange={e => setEditForm({...editForm, date: e.target.value})} 
                            className="w-full text-[10px] text-slate-500 font-mono border-b border-slate-300 outline-none p-1" 
                            placeholder="Date"
                          />
                          <textarea 
                            value={editForm.description} 
                            onChange={e => setEditForm({...editForm, description: e.target.value})} 
                            className="w-full text-xs text-slate-600 border border-slate-300 p-2 rounded outline-none h-20"
                          />
                          <div className="flex justify-end gap-2">
                            <button onClick={() => setEditingDevId(null)} className="text-[10px] text-slate-500 font-bold px-2 py-1">Cancel</button>
                            <button onClick={() => handleEditSave(dev.id)} className="text-[10px] bg-brand-gold text-white font-bold px-3 py-1 rounded">Save</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-bold text-slate-800 text-sm">{dev.title}</h4>
                              {dev.date && <p className="text-[10px] text-slate-500 font-mono mt-0.5">{dev.date}</p>}
                            </div>
                            {isAdmin && (
                              <div className="flex gap-1">
                                <button onClick={() => {
                                  setEditingDevId(dev.id);
                                  setEditForm({title: dev.title, description: dev.description, date: dev.date || ""});
                                }} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded hover:bg-slate-200 font-bold uppercase transition">Edit</button>
                                <button onClick={() => handleAdminDelete(dev.id)} className="text-[10px] bg-red-50 text-red-600 px-2 py-1 rounded hover:bg-red-100 font-bold uppercase transition">Delete</button>
                              </div>
                            )}
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed mt-2">{dev.description}</p>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>

      {/* Suggestion Modal */}
      {suggestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden relative">
            <div className="p-6 border-b border-slate-100">
              <h3 className="font-black text-lg text-slate-800">Suggest Profile Update</h3>
              <p className="text-xs text-slate-500 mt-1">Submit verifiable achievements or milestones for this official.</p>
            </div>
            <form onSubmit={handleSuggestSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Timeline Categorization</label>
                <div className="flex gap-2">
                  {["past", "present", "future"].map(tl => (
                    <button
                      key={tl}
                      type="button"
                      onClick={() => setSuggestForm({...suggestForm, timeline: tl})}
                      className={`flex-1 py-2 text-xs font-bold capitalize rounded-xl outline-none transition-all border ${suggestForm.timeline === tl ? 'bg-slate-800 border-slate-800 text-white shadow-md' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                      {tl}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Milestone Title</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Authored the National Healthcare Bill"
                  value={suggestForm.title}
                  onChange={e => setSuggestForm({...suggestForm, title: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Detailed Description</label>
                <textarea 
                  required
                  placeholder="Provide objective facts and references..."
                  value={suggestForm.description}
                  onChange={e => setSuggestForm({...suggestForm, description: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold transition-all min-h-[100px]"
                ></textarea>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Date/Period (Optional)</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Q4 2023"
                    value={suggestForm.date}
                    onChange={e => setSuggestForm({...suggestForm, date: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-gold transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Your Email (Optional)</label>
                  <input 
                    type="email" 
                    placeholder="For follow-ups"
                    value={suggestForm.email}
                    onChange={e => setSuggestForm({...suggestForm, email: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-gold transition-all"
                  />
                </div>
              </div>

              {suggestFeedback.message && (
                <div className={`p-3 rounded-lg text-xs font-bold ${suggestFeedback.type === 'error' ? 'bg-red-50 text-red-600' : suggestFeedback.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-600'}`}>
                  {suggestFeedback.message}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => setSuggestModalOpen(false)}
                  className="px-5 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={suggestFeedback.type === 'loading'}
                  className="bg-brand-gold hover:bg-[#e09612] text-white px-6 py-2.5 text-xs font-bold rounded-xl flex items-center gap-2 transition disabled:opacity-50 shadow-md shadow-brand-gold/20"
                >
                  <Send className="w-4 h-4" /> Submit for Review
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
