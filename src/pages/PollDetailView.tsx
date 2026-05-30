/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { Poll, PollOption, Comment, User } from "../types";
import { api, getSavedUser } from "../utils/api";
import { 
  CategoryBadge, 
  CountdownTimer, 
  PoliticianAvatar, 
  VoteProgressBar, 
  ShareButtons 
} from "../components/Shared";
import { 
  Trophy, 
  MessageSquare, 
  ThumbsUp, 
  Eye, 
  ChevronRight, 
  User as UserIcon, 
  CheckCircle,
  HelpCircle,
  Calendar,
  Layers,
  Activity,
  AlertTriangle,
  RotateCw
} from "lucide-react";

interface PollDetailViewProps {
  pollId: number;
  onNavigate: (path: string) => void;
}

export const PollDetailView: React.FC<PollDetailViewProps> = ({ pollId, onNavigate }) => {
  const [loading, setLoading] = useState(true);
  const [poll, setPoll] = useState<Poll | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [voted, setVoted] = useState(false);
  const [votedOptionIds, setVotedOptionIds] = useState<number[]>([]);
  
  // Form input states
  const [selectedOptions, setSelectedOptions] = useState<number[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(getSavedUser());
  const [commentInput, setCommentInput] = useState("");
  const [replyTargetId, setReplyTargetId] = useState<number | null>(null);
  const [replyInput, setReplyInput] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [manualRefreshing, setManualRefreshing] = useState(false);

  // Load basic details
  const fetchInitialDetails = async (showLoadingIndicator = true) => {
    try {
      if (showLoadingIndicator) setLoading(true);
      // Load poll details
      const details = await api.getPoll(pollId);
      setPoll(details);

      // Load votes list check
      const votedCheck = await api.getUserVotedState(pollId, currentUser?.id);
      if (votedCheck.voted && votedCheck.option_ids) {
        setVoted(true);
        setVotedOptionIds(votedCheck.option_ids);
      } else {
        setVoted(false);
        setVotedOptionIds([]);
      }

      // Load comments
      const comms = await api.getComments(pollId);
      setComments(comms);
    } catch (err: any) {
      console.error("Failed to load poll detail", err);
      setErrorMsg(err.message || "Target poll could not be loaded.");
    } finally {
      if (showLoadingIndicator) setLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialDetails(true);
  }, [pollId, currentUser?.id]);

  const handleManualRefresh = async () => {
    setManualRefreshing(true);
    await fetchInitialDetails(false);
    setTimeout(() => {
      setManualRefreshing(false);
    }, 600);
  };

  const handleOptionClick = (optionId: number) => {
    if (poll?.poll_type === "multiple_choice" || poll?.poll_type === "ranked_choice") {
      if (selectedOptions.includes(optionId)) {
        setSelectedOptions(selectedOptions.filter(id => id !== optionId));
      } else {
        setSelectedOptions([...selectedOptions, optionId]);
      }
    } else {
      // Single choice, yes_no, approval rating
      setSelectedOptions([optionId]);
    }
  };

  const handleCastVote = async () => {
    setErrorMsg("");
    setSuccessMsg("");
    if (selectedOptions.length === 0) {
      setErrorMsg("Please select at least one political candidate or issue option.");
      return;
    }

    try {
      const res = await api.castVote(pollId, selectedOptions, currentUser?.id, "Web browser");
      if (res.success) {
        setVoted(true);
        setVotedOptionIds(selectedOptions);
        setPoll(res.poll);
        setSuccessMsg("Your official ballot opinion has been recorded successfully!");
        
        // Show Success toast simulation
        setTimeout(() => setSuccessMsg(""), 4000);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Your ballot submission failed. Duplicate check caught double voting.");
    }
  };

  const handlePostComment = async (parentId: number | null = null) => {
    const input = parentId ? replyInput : commentInput;
    if (!input.trim()) return;

    if (!currentUser) {
      setErrorMsg("You must create a free citizen account or log in to submit comments.");
      return;
    }

    try {
      const freshComment = await api.postComment(pollId, currentUser.id, input, parentId);
      setComments([...comments, freshComment]);
      
      if (parentId) {
        setReplyInput("");
        setReplyTargetId(null);
      } else {
        setCommentInput("");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to submit comment thread.");
    }
  };

  const handleLikeComment = async (commentId: number) => {
    try {
      const updated = await api.likeComment(commentId);
      setComments(comments.map(c => c.id === commentId ? { ...c, likes: updated.likes } : c));
    } catch {
      // Fail silently
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center space-y-4">
        <div className="w-12 h-12 border-4 border-[#F5A623] border-t-[#0A1628] rounded-full animate-spin mx-auto"></div>
        <p className="font-bold text-slate-500 font-mono animate-pulse">Retrieving live census polling counts...</p>
      </div>
    );
  }

  if (!poll) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <AlertTriangle className="w-12 h-12 text-[#F5A623] mx-auto" />
        <h3 className="font-extrabold text-slate-800">Political Poll Not Found</h3>
        <p className="text-xs text-slate-500">The requested opinion index does not exist or has been removed by platform moderation.</p>
        <button onClick={() => onNavigate("/polls")} className="bg-[#0A1628] text-white text-xs font-bold px-4 py-2 rounded">
          Browse Back to Directories
        </button>
      </div>
    );
  }

  // Calculate stats
  const isClosed = poll.status === "closed" || (poll.closes_at && new Date(poll.closes_at).getTime() < Date.now());
  const showResultsDirectly = voted || isClosed;

  // Find leader
  let leaderOption: PollOption | null = null;
  if (poll.total_votes > 0) {
    leaderOption = poll.options.reduce((prev, curr) => (curr.vote_count > prev.vote_count ? curr : prev));
  }

  // Pure React dynamic SVG Line chart of vote aggregates over mock historic progression as requested!
  const renderTrendChart = () => {
    if (poll.options.length === 0) return null;
    const padding = 30;
    const width = 500;
    const height = 140;

    // Simulate 5 data intervals of growth
    const intervals = [0.1, 0.35, 0.6, 0.82, 1.0];
    const votesHistory = intervals.map((multiplier, idx) => ({
      label: `Day ${idx * 2 + 1}`,
      val: Math.round(poll.total_votes * multiplier)
    }));

    const maxVal = Math.max(...votesHistory.map(d => d.val), 1);
    
    // Map to SVG coordinates
    const points = votesHistory.map((d, i) => {
      const x = padding + (i / (votesHistory.length - 1)) * (width - padding * 2);
      const y = height - padding - (d.val / maxVal) * (height - padding * 2);
      return { x, y, label: d.label, val: d.val };
    });

    const pathData = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

    return (
      <div className="bg-white p-4 rounded-xl border border-slate-100 space-y-3">
        <h4 className="text-xs font-black tracking-widest text-slate-400 uppercase">CHRONOLOGICAL ENGAGEMENT</h4>
        <div className="w-full overflow-x-auto">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[320px] h-36">
            {/* Grid Lines */}
            <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#f1f5f9" strokeWidth="2" />
            <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="#f8fafc" strokeWidth="1" />
            
            {/* Stroke Trend Line */}
            <path d={pathData} fill="none" stroke="#F5A623" strokeWidth="3" strokeLinecap="round" />

            {/* Interaction checkpoints */}
            {points.map((p, i) => (
              <g key={i} className="group cursor-help">
                <circle cx={p.x} cy={p.y} r="5" fill="#0A1628" stroke="#F5A623" strokeWidth="2" />
                <text x={p.x} y={p.y - 10} textAnchor="middle" className="text-[9px] fill-slate-800 font-bold font-mono">
                  {p.val.toLocaleString()}
                </text>
                <text x={p.x} y={height - 10} textAnchor="middle" className="text-[9px] fill-slate-500 font-mono font-medium">
                  {p.label}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>
    );
  };

  // Pure SVG Pie Chart breakdown as specified in requirements
  const renderPieChartBreakdown = () => {
    if (poll.options.length === 0 || poll.total_votes === 0) return null;
    let accumulatedAngle = 0;
    const size = 180;
    const center = size / 2;
    const radius = size * 0.4;
    
    const colors = ["#0033A0", "#F08080", "#32CD32", "#E81B23", "#E4003B", "#FFD700", "#10B981"];

    return (
      <div className="bg-white p-4 rounded-xl border border-slate-100 flex flex-col items-center justify-center space-y-4">
        <h4 className="text-xs font-black tracking-widest text-slate-400 uppercase">VOLUMETRIC SPLIT</h4>
        <div className="relative w-44 h-44 flex items-center justify-center">
          <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full transform -rotate-90">
            {poll.options.map((option, index) => {
              const fraction = option.vote_count / poll.total_votes;
              const angle = fraction * 360;
              
              if (angle === 0) return null;

              // Calculate SVG arc paths
              const x1 = center + radius * Math.cos((accumulatedAngle * Math.PI) / 180);
              const y1 = center + radius * Math.sin((accumulatedAngle * Math.PI) / 180);
              
              accumulatedAngle += angle;
              
              const x2 = center + radius * Math.cos((accumulatedAngle * Math.PI) / 180);
              const y2 = center + radius * Math.sin((accumulatedAngle * Math.PI) / 180);
              
              const largeArcFlag = angle > 180 ? 1 : 0;
              const col = option.party_color || colors[index % colors.length];

              const pathString = `
                M ${center} ${center}
                L ${x1} ${y1}
                A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}
                Z
              `;

              return (
                <path 
                  key={option.id}
                  d={pathString} 
                  fill={col}
                  stroke="#ffffff"
                  strokeWidth="2"
                  className="transition-opacity duration-300 hover:opacity-90"
                  title={`${option.label}: ${fraction * 100}%`}
                />
              );
            })}
            {/* Center cutout to make it a gorgeous modern Donut chart! */}
            <circle cx={center} cy={center} r={radius * 0.52} fill="#ffffff" />
          </svg>
          <div className="absolute text-center leading-tight">
            <span className="block text-xl font-mono font-black text-slate-800 leading-none">
              {poll.total_votes.toLocaleString()}
            </span>
            <span className="text-[8px] uppercase font-bold text-slate-450 leading-none mt-1">Votes</span>
          </div>
        </div>

        {/* Custom legendary map colors */}
        <div className="w-full space-y-1">
          {poll.options.map((option, index) => {
            const col = option.party_color || colors[index % colors.length];
            return (
              <div key={option.id} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: col }}></span>
                <span className="font-bold text-slate-700 truncate flex-1">{option.label}</span>
                <span className="font-mono text-slate-500 text-[10px]">
                  {((option.vote_count / poll.total_votes) * 100).toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      
      {/* Dynamic SEO Tag simulation using React breadcrumbs */}
      <div className="flex justify-between items-center text-xs text-slate-400 font-bold flex-wrap gap-2">
        <div className="flex items-center gap-1">
          <button onClick={() => onNavigate("/")} className="hover:text-slate-600">Home</button>
          <span>&gt;</span>
          <button onClick={() => onNavigate("/polls")} className="hover:text-slate-600">Polls</button>
          <span>&gt;</span>
          <span className="text-slate-600 truncate max-w-[200px]">{poll.category}</span>
        </div>
        
        <button 
          onClick={handleManualRefresh}
          disabled={manualRefreshing}
          className="text-slate-500 hover:text-[#0A1628] flex items-center gap-1 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          title="Refresh census metrics"
        >
          <RotateCw className={`w-3.5 h-3.5 ${manualRefreshing ? "animate-spin" : ""}`} />
          <span>{manualRefreshing ? "Syncing..." : "Sync Live Counts"}</span>
        </button>
      </div>

      {poll.status === "scheduled" && (
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-bold text-amber-800">Citizen Poll Awaiting Administrative Authorization</h4>
            <p className="text-[11px] text-slate-600 mt-0.5">
              To support democratic neutrality, simple polls created by citizen level accounts are held briefly for standard bias validation. Platform journalists/analysts see active state directly.
            </p>
          </div>
        </div>
      )}

      {/* Main Container Grid */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        
        {/* Dynamic header panel */}
        <div className="p-6 md:p-8 bg-slate-900 text-white space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CategoryBadge category={poll.category} />
            <div className="flex items-center gap-2 text-xs font-bold">
              <span>🇵🇸 {poll.country}</span>
              <CountdownTimer closes_at={poll.closes_at} status={poll.status} />
            </div>
          </div>

          <h1 className="text-xl md:text-3xl font-black leading-tight tracking-tight">
            {poll.title}
          </h1>

          <p className="text-sm text-slate-300 leading-relaxed">
            {poll.description}
          </p>

          {/* Creator tag Info alignment */}
          <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-slate-400 border-t border-white/5">
            {poll.created_by_user ? (
              <div className="flex items-center gap-2">
                <img src={poll.created_by_user.avatar_url} className="w-6 h-6 rounded-full border border-white/10" referrerPolicy="no-referrer" />
                <span className="font-bold text-slate-200">{poll.created_by_user.display_name}</span>
                {poll.created_by_user.verified && (
                  <span className="text-blue-400" title="Veritable Journalist/Analyst Check">
                    <CheckCircle className="w-3.5 h-3.5 fill-[#0A1628]" />
                  </span>
                )}
                <span className="text-[9px] bg-slate-800 text-[#F5A623] px-1.5 py-0.25 rounded uppercase">
                  {poll.created_by_user.role}
                </span>
              </div>
            ) : (
              <span>Created by GovTrack system representative</span>
            )}
            <span>•</span>
            <div className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span>Created: {new Date(poll.created_at).toLocaleDateString()}</span>
            </div>
            <span>•</span>
            <div className="flex items-center gap-1.5 font-mono">
              <Eye className="w-3.5 h-3.5 text-slate-500" />
              <span>{poll.view_count.toLocaleString()} views</span>
            </div>
          </div>
        </div>

        {/* Voting form OR Live results container */}
        <div className="p-6 md:p-8 space-y-6">
          
          {errorMsg && (
            <div className="bg-red-50 text-red-700 p-3 text-xs font-bold rounded-lg border border-red-150 animate-shake">
              ⚠️ {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="bg-emerald-50 text-emerald-800 p-3 text-xs font-bold rounded-lg border border-emerald-150">
              ✓ {successMsg}
            </div>
          )}

          {showResultsDirectly ? (
            /* LIVE RESULTS SECTION */
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="font-black text-slate-800 text-sm tracking-wider uppercase font-mono flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                  Live Vote Standing Outcomes
                </h3>
                {voted && (
                  <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-200">
                    ✓ Your ballot submitted
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Progress lists */}
                <div className="lg:col-span-7 space-y-3.5">
                  {poll.options.map((opt) => {
                    const isSelectedVal = votedOptionIds.includes(opt.id);
                    const isLeading = leaderOption?.id === opt.id;
                    return (
                      <div key={opt.id} className="relative">
                        <VoteProgressBar
                          label={opt.label}
                          photo_url={opt.photo_url}
                          vote_count={opt.vote_count}
                          total_votes={poll.total_votes}
                          party_color={opt.party_color}
                          isLeading={isLeading}
                          party={opt.party}
                          selected={isSelectedVal}
                        />
                        {isSelectedVal && (
                          <div className="absolute top-3 right-3 text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.25 rounded font-mono uppercase">
                            Your Vote
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Pie Chart display visual */}
                <div className="lg:col-span-5">
                  {renderPieChartBreakdown()}
                </div>
              </div>

              {/* Trajectory history graph */}
              {renderTrendChart()}
            </div>
          ) : (
            /* ACTIVE VOTING FORM */
            <div className="space-y-6">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="font-black text-slate-800 text-sm tracking-wider uppercase font-mono">
                  Anonymous Official Public Ballot Form
                </h3>
                <p className="text-[11px] text-slate-450 mt-1">
                  Select your chosen political figure or choice options below. You are permitted to select multiple if a multiple choice template layout is allowed.
                </p>
              </div>

              <div className="space-y-3">
                {poll.options.map((opt) => {
                  const isChecked = selectedOptions.includes(opt.id);
                  return (
                    <div
                      key={opt.id}
                      onClick={() => handleOptionClick(opt.id)}
                      className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between hover:bg-slate-50/50 ${
                        isChecked 
                          ? "border-brand-gold bg-brand-gold/5 shadow" 
                          : "border-slate-100 bg-white"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <PoliticianAvatar name={opt.label} photo_url={opt.photo_url} party_color={opt.party_color} size="md" showTooltip={false} />
                        <div className="text-left">
                          <h4 className="font-extrabold text-[#0A1628] text-sm flex items-center gap-2">
                            {opt.label}
                            {opt.party && (
                              <span 
                                className="text-[9px] rounded-full px-2 py-0.25 text-white"
                                style={{ backgroundColor: opt.party_color || "#3b82f6" }}
                              >
                                {opt.party}
                              </span>
                            )}
                          </h4>
                          <p className="text-xs text-slate-500 mt-0.5 leading-snug">{opt.description}</p>
                        </div>
                      </div>

                      {/* Custom input checks */}
                      <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center">
                        {isChecked && (
                          <span className="w-3 h-3 bg-brand-gold rounded-full"></span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-4 flex flex-col md:flex-row items-center justify-between gap-4 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 italic">
                  🛡 Double voting is checked automatically using secure IP matching filters. Citizens vote anonymously.
                </p>
                <button
                  onClick={handleCastVote}
                  className="w-full md:w-auto bg-[#0A1628] hover:bg-brand-gold text-white hover:text-[#0A1628] font-black text-sm px-8 py-3 rounded-lg shadow-md transition transform hover:scale-[1.02] inline-flex items-center justify-center gap-1.5"
                >
                  Cast Official Vote <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Social widget share cards */}
          <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-left space-y-0.5">
              <h4 className="font-extrabold text-[#0A1628] text-xs">Share or Embed this Poll widget</h4>
              <p className="text-[10px] text-slate-500">Enable readers of your blogs/news reports to vote dynamically.</p>
            </div>
            <ShareButtons url={`/polls/${poll.id}`} title={poll.title} />
          </div>

        </div>
      </div>

      {/* DISCUSSIONS / COMMENTS SECTIONS */}
      {poll.allow_comments && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
              <MessageSquare className="w-4.5 h-4.5 text-[#F5A623]" />
              Debates & Community Threads ({comments.length})
            </h3>
          </div>

          {/* Post Comment form */}
          {currentUser ? (
            <div className="space-y-2">
              <textarea
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                placeholder="Post your analytical opinion on this political index..."
                maxLength={400}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs focus:outline-none focus:border-brand-gold text-slate-800 font-medium"
                rows={3}
              />
              <div className="flex justify-between items-center text-[10px] text-slate-400">
                <span>Remain respectful of community guidelines. Max 400 chars.</span>
                <button
                  onClick={() => handlePostComment(null)}
                  className="bg-[#0A1628] text-white font-extrabold text-xs px-4 py-2 rounded"
                >
                  Post Comment
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-4 text-center">
              <p className="text-xs text-slate-500 font-medium font-mono">You must sign in to join community discussion boards.</p>
              <button 
                onClick={() => onNavigate("/login")} 
                className="mt-2.5 bg-[#0A1628] text-white text-[11px] font-bold px-3 py-1.5 rounded"
              >
                Sign In
              </button>
            </div>
          )}

          {/* Thread list */}
          <div className="space-y-4">
            {comments.filter(c => !c.parent_id).length > 0 ? (
              comments.filter(c => !c.parent_id).map((com) => {
                const replies = comments.filter(c => c.parent_id === com.id);
                return (
                  <div key={com.id} className="p-4 bg-slate-50/50 rounded-xl border border-slate-100 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <img 
                          src={com.user_avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(com.user_name)}`} 
                          className="w-8 h-8 rounded-full border object-cover" 
                          referrerPolicy="no-referrer"
                        />
                        <div className="text-left leading-tight">
                          <p className="text-xs font-black text-slate-800 flex items-center gap-1">
                            {com.user_name}
                            {com.user_verified && <CheckCircle className="w-3.5 h-3.5 text-blue-500 fill-white" />}
                            <span className="text-[9px] bg-slate-200 font-bold capitalize text-slate-600 px-1 rounded-sm">
                              {com.user_role}
                            </span>
                          </p>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {new Date(com.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      <button 
                        onClick={() => handleLikeComment(com.id)}
                        className="flex items-center gap-1.5 text-slate-400 hover:text-[#0A1628]"
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                        <span className="font-mono text-[10px] font-bold">{com.likes}</span>
                      </button>
                    </div>

                    <p className="text-xs text-slate-700 leading-normal pl-10">
                      {com.content}
                    </p>

                    {/* Quick replies block */}
                    <div className="pl-10 space-y-2.5 border-l-2 border-slate-100 ml-4 py-1">
                      {replies.map(rep => (
                        <div key={rep.id} className="bg-white p-2.5 rounded-lg border border-slate-100 space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-black text-slate-800">{rep.user_name}</span>
                              {rep.user_verified && <CheckCircle className="w-3.5 h-3.5 text-blue-500 fill-white" />}
                              <span className="text-[8px] bg-slate-100 text-slate-500 px-1 rounded-sm uppercase">{rep.user_role}</span>
                            </div>
                            <span className="text-[9px] text-slate-400 font-mono">{new Date(rep.created_at).toLocaleDateString()}</span>
                          </div>
                          <p className="text-xs text-slate-600 font-mediumLeading leading-normal">{rep.content}</p>
                        </div>
                      ))}

                      {/* Reply field */}
                      {currentUser && (
                        <div>
                          {replyTargetId === com.id ? (
                            <div className="flex gap-2 pt-1.5">
                              <input
                                type="text"
                                placeholder={`Write a reply to ${com.user_name}...`}
                                value={replyInput}
                                onChange={(e) => setReplyInput(e.target.value)}
                                className="flex-1 bg-white border border-slate-200 rounded-lg p-2 text-xs focus:outline-none focus:border-brand-gold text-slate-800"
                              />
                              <button
                                onClick={() => handlePostComment(com.id)}
                                className="bg-[#0A1628] text-white px-3.5 rounded text-xs font-bold"
                              >
                                Reply
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setReplyTargetId(com.id);
                                setReplyInput("");
                              }}
                              className="text-[10px] text-brand-gold font-bold hover:underline"
                            >
                              Post a Reply →
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-6 text-center text-xs text-slate-400 italic">
                No civic comments posted on this poll yet. Start the debate above!
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
