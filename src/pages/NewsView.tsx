/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { NewsItem, Poll, PollOption, User } from "../types";
import { api, getSavedUser } from "../utils/api";
import { 
  Activity, 
  Clock, 
  FileText, 
  ArrowUpRight, 
  ArrowLeft, 
  CheckCircle, 
  Trophy, 
  TrendingUp, 
  AlertTriangle,
  ChevronRight,
  Eye,
  Calendar,
  Sparkles,
  MessageSquare,
  RotateCw,
  X,
  HelpCircle,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { PoliticianAvatar, VoteProgressBar, getProxiedImageUrl } from "../components/Shared";
import { formatArticleContent, stripHtmlTags } from "../utils/richText";

interface NewsViewProps {
  onNavigate: (path: string) => void;
  initialArticleId?: number;
}

export const NewsView: React.FC<NewsViewProps> = ({ onNavigate, initialArticleId }) => {
  const [loading, setLoading] = useState(true);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [activeArticle, setActiveArticle] = useState<NewsItem | null>(null);
  const [isThumbnailModalOpen, setIsThumbnailModalOpen] = useState(false);

  // Filter States for feed
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCountry, setSelectedCountry] = useState("All");

  // Embedded Poll States
  const [pollLoading, setPollLoading] = useState(false);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [embeddedPoll, setEmbeddedPoll] = useState<Poll | null>(null);
  const [pollVoted, setPollVoted] = useState(false);
  const [pollVotedOptionIds, setPollVotedOptionIds] = useState<number[]>([]);
  const [pollSelectedOptions, setPollSelectedOptions] = useState<number[]>([]);
  const [votingErrorMsg, setVotingErrorMsg] = useState("");
  const [votingSuccessMsg, setVotingSuccessMsg] = useState("");
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  const currentUser = getSavedUser();

  // Load news list
  useEffect(() => {
    const fetchNewsFeed = async () => {
      try {
        setLoading(true);
        const list = await api.getNews();
        setNews(list);

        // If initialArticleId was provided, resolve the active article
        const targetId = initialArticleId;
        if (targetId) {
          const matched = list.find(n => n.id === targetId);
          if (matched) {
            setActiveArticle(matched);
          }
        }
      } catch (err) {
        console.error("Failed to load news feed", err);
      } finally {
        setLoading(false);
      }
    };
    fetchNewsFeed();
  }, [initialArticleId]);

  // Load poll details (on active article change or user change) - No background setInterval loop!
  const loadPollDetails = async (showLoadingIndicator = true) => {
    if (!activeArticle || !activeArticle.related_poll_id) {
      setEmbeddedPoll(null);
      return;
    }

    const pollId = activeArticle.related_poll_id;
    try {
      if (showLoadingIndicator) setPollLoading(true);
      const pollData = await api.getPoll(pollId);
      setEmbeddedPoll(pollData);

      const votedCheck = await api.getUserVotedState(pollId, currentUser?.id);
      if (votedCheck.voted && votedCheck.option_ids) {
        setPollVoted(true);
        setPollVotedOptionIds(votedCheck.option_ids);
      } else {
        setPollVoted(false);
        setPollVotedOptionIds([]);
      }
    } catch (err) {
      console.error("Error loading embedded poll detail", err);
    } finally {
      if (showLoadingIndicator) setPollLoading(false);
    }
  };

  useEffect(() => {
    loadPollDetails(true);
  }, [activeArticle?.id, currentUser?.id]);

  const handleManualRefresh = async () => {
    setManualRefreshing(true);
    await loadPollDetails(false);
    setTimeout(() => {
      setManualRefreshing(false);
    }, 600);
  };

  const handleSelectArticle = (item: NewsItem) => {
    setActiveArticle(item);
    setIsThumbnailModalOpen(false);
    // Push path to history with hash route for shareability
    onNavigate(`/news/${item.id}`);
  };

  const handleSelectArticleThumbnail = (item: NewsItem) => {
    setActiveArticle(item);
    setIsThumbnailModalOpen(true);
    setPollSelectedOptions([]);
    setVotingErrorMsg("");
    setVotingSuccessMsg("");
  };

  const handleCloseModal = () => {
    setIsThumbnailModalOpen(false);
    setActiveArticle(null);
    setEmbeddedPoll(null);
    setPollSelectedOptions([]);
    setVotingErrorMsg("");
    setVotingSuccessMsg("");
  };

  const handleBackToFeed = () => {
    setActiveArticle(null);
    setEmbeddedPoll(null);
    onNavigate("/news");
  };

  const handleOptionClick = (optionId: number) => {
    if (!embeddedPoll) return;
    if (embeddedPoll.poll_type === "multiple_choice" || embeddedPoll.poll_type === "ranked_choice") {
      if (pollSelectedOptions.includes(optionId)) {
        setPollSelectedOptions(pollSelectedOptions.filter(id => id !== optionId));
      } else {
        setPollSelectedOptions([...pollSelectedOptions, optionId]);
      }
    } else {
      setPollSelectedOptions([optionId]);
    }
  };

  const handleCastVote = async () => {
    if (!embeddedPoll) return;
    setVotingErrorMsg("");
    setVotingSuccessMsg("");

    if (pollSelectedOptions.length === 0) {
      setVotingErrorMsg("Please choose an option to cast your official opinion.");
      return;
    }

    try {
      const res = await api.castVote(embeddedPoll.id, pollSelectedOptions, currentUser?.id, "News Reader Web");
      if (res.success) {
        setPollVoted(true);
        setPollVotedOptionIds(pollSelectedOptions);
        setEmbeddedPoll(res.poll);
        setVotingSuccessMsg("Your feedback opinion ballot has been saved successfully!");
        setTimeout(() => setVotingSuccessMsg(""), 4000);
      }
    } catch (err: any) {
      setVotingErrorMsg(err.message || "Ballot submission failed. Double voting filter triggered.");
    }
  };

  // Filter implementation
  const filteredNews = news.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          item.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCountry = selectedCountry === "All" || 
                           item.country.toLowerCase() === selectedCountry.toLowerCase() ||
                           item.country === "Global";

    return matchesSearch && matchesCountry;
  });

  const uniqueCountries = ["All", ...Array.from(new Set(news.map(n => n.country).filter(Boolean)))];

  const isPollClosed = embeddedPoll && (embeddedPoll.status === "closed" || (embeddedPoll.closes_at && new Date(embeddedPoll.closes_at).getTime() < Date.now()));
  const showResults = !!(pollVoted || isPollClosed);
  const leaderOption = embeddedPoll && embeddedPoll.total_votes > 0
    ? embeddedPoll.options.reduce((prev, curr) => (curr.vote_count > prev.vote_count ? curr : prev))
    : null;

  if (activeArticle && !isThumbnailModalOpen) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-left space-y-8">
        {/* Navigation row */}
        <button 
          onClick={handleBackToFeed}
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-900 transition bg-white border px-3.5 py-1.5 rounded-lg shadow-2xs"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Analytics Feed</span>
        </button>

        {/* Editorial Layout Container */}
        <article className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          {/* Banner cover */}
          <div className="aspect-[21/9] w-full bg-slate-100 relative overflow-hidden">
            <img 
              src={getProxiedImageUrl(activeArticle.image_url)} 
              alt={activeArticle.title} 
              className="w-full h-full object-cover" 
            />
            <span className="absolute top-4 left-4 bg-[#0A1628] text-white text-[10px] font-bold px-3 py-1 rounded font-mono shadow-md uppercase tracking-wide">
              {activeArticle.source_name}
            </span>
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent"></div>
          </div>

          <div className="p-6 md:p-10 space-y-6">
            {/* Meta headers */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-450 font-bold border-b border-slate-100 pb-4">
              <span className="bg-slate-100 text-[#0A1628] px-2.5 py-1 rounded-full text-[10px] uppercase font-mono">
                🇵🇸 {activeArticle.country}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                {new Date(activeArticle.published_at).toLocaleDateString()}
              </span>
              <span>•</span>
              <span className="text-slate-505 font-mono">Insight Analyst Report</span>
              {activeArticle.related_poll_id && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1 text-[#F5A623] bg-amber-50 px-2 py-0.5 rounded font-mono text-[10px]">
                    <Sparkles className="w-3 h-3 fill-amber-300" /> Linked Ballot Attached
                  </span>
                </>
              )}
            </div>

            {/* Title */}
            <h1 className="text-2xl md:text-4xl font-black text-[#0A1628] tracking-tight leading-tight">
              {activeArticle.title}
            </h1>

            {/* Editorial Paragraphs of full article text */}
            <div className="text-slate-800 text-sm md:text-base font-normal news-article-content">
              <div 
                dangerouslySetInnerHTML={{ __html: formatArticleContent(activeArticle.summary) }}
              />
              
              <p className="text-xs text-slate-500 italic mt-8 bg-slate-50 p-4 rounded-xl border border-dashed border-slate-200 clear-both">
                Independent electoral and geopolitical reporting is curated from verified legislative registries and expert analytical teams. We aim to present bias-free indicators by direct linkages with public citizen consensus polls.
                <a href={activeArticle.source_url} target="_blank" rel="noopener noreferrer" className="ml-1 text-xs text-[#0A1628] font-black hover:underline inline-flex items-center gap-0.5">
                  Read referenced release official file URL <ArrowUpRight className="w-3 h-3" />
                </a>
              </p>
            </div>

            {/* Attached Tags */}
            {activeArticle.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-2">
                {activeArticle.tags.map((tag, i) => (
                  <span key={i} className="bg-slate-50 text-slate-500 font-mono text-[10px] uppercase px-2 py-0.5 rounded border border-slate-100">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </article>

        {/* RELATED DIRECT POLL ATTACHMENT BOX */}
        {activeArticle.related_poll_id ? (
          <div className="bg-[#0A1628] rounded-3xl p-6 md:p-8 text-white space-y-6 shadow-lg relative overflow-hidden ring-4 ring-slate-100">
            {/* Background elements */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#F5A623]/5 rounded-full blur-3xl pointer-events-none"></div>

            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="space-y-1">
                <span className="text-[10px] tracking-widest uppercase font-mono font-black text-[#F5A623] flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5 text-[#F5A623]" /> Attached Analytical Ballot Panel
                </span>
                <h3 className="text-lg md:text-xl font-bold">What is your opinion after reading this report?</h3>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleManualRefresh}
                  disabled={manualRefreshing || pollLoading}
                  className="text-[10px] font-bold text-slate-300 hover:text-white flex items-center gap-1 bg-white/5 hover:bg-white/10 px-2.5 py-1.5 rounded transition-colors disabled:opacity-50"
                  title="Refresh state census counts"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${manualRefreshing ? "animate-spin" : ""}`} />
                  <span>{manualRefreshing ? "Syncing..." : "Refresh Counts"}</span>
                </button>
                <button 
                  onClick={() => onNavigate(`/polls/${activeArticle.related_poll_id}`)}
                  className="text-[10px] font-bold text-slate-300 hover:text-white flex items-center gap-1 bg-white/5 hover:bg-white/10 px-2.5 py-1.5 rounded transition-colors"
                >
                  <span>Full Thread</span>
                  <MessageSquare className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {pollLoading ? (
              <div className="py-8 text-center space-y-2">
                <div className="w-8 h-8 border-2 border-brand-gold border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="text-xs text-slate-305 font-mono">Synchronizing state census counts...</p>
              </div>
            ) : embeddedPoll ? (
              <div className="space-y-6">
                
                {/* Error / Success feedback reports */}
                {votingErrorMsg && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-100 p-3 text-xs font-bold rounded-xl flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>{votingErrorMsg}</span>
                  </div>
                )}

                {votingSuccessMsg && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-100 p-3 text-xs font-bold rounded-xl">
                    ✓ {votingSuccessMsg}
                  </div>
                )}

                {showResults ? (
                  /* RENDER VOTE RESULTS DIRECTLY BELOW THE NEWS */
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-xs text-slate-400 font-bold uppercase">
                      <span>Live Results Metrics</span>
                      <span>Total Votes: {embeddedPoll.total_votes.toLocaleString()}</span>
                    </div>

                    <div className="space-y-3">
                      {embeddedPoll.options.map((option) => {
                        const isSelectedVal = pollVotedOptionIds.includes(option.id);
                        const isLeading = leaderOption?.id === option.id;
                        return (
                          <div key={option.id} className="relative bg-white/5 rounded-xl border border-white/5 overflow-hidden transition hover:border-white/10">
                            <VoteProgressBar
                              label={option.label}
                              photo_url={option.photo_url}
                              vote_count={option.vote_count}
                              total_votes={embeddedPoll.total_votes}
                              party_color={option.party_color || "#3b82f6"}
                              isLeading={isLeading}
                              party={option.party}
                              selected={isSelectedVal}
                            />
                            {isSelectedVal && (
                              <div 
                                className="absolute top-2.5 right-3 text-[8px] bg-emerald-500 text-white font-mono uppercase px-1.5 py-0.5 rounded font-black tracking-wide"
                                title={!currentUser ? "A ballot was cast from this network IP address." : "You casted this ballot."}
                              >
                                {!currentUser ? "Network Cast" : "Your Casted Ballot"}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {leaderOption && (
                      <div className="bg-white/5 rounded-xl p-3 border border-white/5 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <Trophy className="w-4 h-4 text-brand-gold fill-brand-gold/20" />
                          <span>Current Projection Lead: <strong className="text-white font-black">{leaderOption.label}</strong></span>
                        </div>
                        <span className="font-mono text-brand-gold font-extrabold tracking-wide">
                          {embeddedPoll.total_votes > 0 ? ((leaderOption.vote_count / embeddedPoll.total_votes) * 100).toFixed(1) : 0}%
                        </span>
                      </div>
                    )}

                    {!currentUser && (
                      <div className="text-[10px] text-slate-400 italic bg-white/5 p-3 rounded-xl border border-white/5 leading-normal">
                        ℹ️ <strong>Heads Up:</strong> A vote choice has been recorded from your network IP address. To cast or track ballots tied to your personal registered profile, please log in.
                      </div>
                    )}
                  </div>
                ) : (
                  /* RENDER ACTIVE BALLOT FORM FOR DEMOCRATIC Cast */
                  <div className="space-y-4">
                    <div className="flex justify-between items-center text-xs text-slate-405 font-bold uppercase">
                      <span>Ballot Topic: {embeddedPoll.title}</span>
                      <span className="bg-emerald-500/10 text-emerald-300 border border-emerald-500/10 px-2 py-0.5 rounded text-[9px]">
                        ● Active Poll Open
                      </span>
                    </div>

                    <div className="space-y-3">
                      {embeddedPoll.options.map((option) => {
                        const isChecked = pollSelectedOptions.includes(option.id);
                        return (
                          <div
                            key={option.id}
                            onClick={() => handleOptionClick(option.id)}
                            className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                              isChecked 
                                ? "border-[#F5A623] bg-white/5 shadow-md" 
                                : "border-white/10 bg-white/2 hover:bg-white/5"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <PoliticianAvatar name={option.label} photo_url={option.photo_url} party_color={option.party_color} size="sm" showTooltip={false} />
                              <div className="text-left">
                                <h4 className="font-bold text-sm text-slate-100 flex items-center gap-1.5">
                                  {option.label}
                                  {option.party && (
                                    <span 
                                      className="text-[9px] px-1.5 py-0.25 rounded text-white font-black"
                                      style={{ backgroundColor: option.party_color || "#3b82f6" }}
                                    >
                                      {option.party}
                                    </span>
                                  )}
                                </h4>
                                {option.description && (
                                  <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{option.description}</p>
                                )}
                              </div>
                            </div>

                            <div className="w-5 h-5 rounded-full border border-white/30 flex items-center justify-center">
                              {isChecked && (
                                <span className="w-3 h-3 bg-[#F5A623] rounded-full"></span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="pt-4 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
                      <span className="text-[10px] text-slate-400 italic">
                        🛡 Citizen feedback is logged purely using cryptographically hashed indices. Double check rules secure true voices.
                      </span>
                      <button
                        onClick={handleCastVote}
                        className="w-full sm:w-auto bg-[#F5A623] hover:bg-amber-500 text-slate-900 font-black text-xs px-6 py-2.5 rounded-xl shadow-md transition transform hover:scale-[1.02] flex items-center justify-center gap-1 shrink-0"
                      >
                        Submit Ballot Vote <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">This news article references a debate topic index that has been archived by legislative request.</p>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  // ELSE SHOW MAIN NEWS DIRECTORY / FEED VIEW
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 text-left">
      
      {/* Page Title & Insight Headers */}
      <div className="border-b border-slate-100 pb-5 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-[#0A1628] tracking-tight">Electoral News & Analytical Insights</h1>
          <p className="text-xs text-slate-500 font-medium mt-1">Fact-checked independent legislative reports tied directly to corresponding public ballots.</p>
        </div>

        {/* Filters and Searches */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          {/* Search box */}
          <div className="relative w-full sm:w-64">
            <input 
              type="text" 
              placeholder="Search reports or tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs bg-white border border-slate-200 rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:border-slate-300 text-slate-800"
            />
            <span className="absolute right-3 top-2.5 text-slate-400 text-xs">🔍</span>
          </div>

          {/* Country filter dropdown */}
          <div className="w-full sm:w-auto flex items-center gap-1.5 shrink-0 bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600">
            <span>Region:</span>
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className="bg-transparent border-none outline-none font-bold text-slate-800 cursor-pointer"
            >
              {uniqueCountries.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(n => (
            <div key={n} className="bg-white border rounded-2xl animate-pulse h-80 space-y-3 p-4">
              <div className="w-full bg-slate-200 aspect-video rounded-xl"></div>
              <div className="h-4 bg-slate-200 rounded w-1/3"></div>
              <div className="h-4 bg-slate-200 rounded w-5/6"></div>
              <div className="h-4 bg-slate-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      ) : filteredNews.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredNews.map((item) => {
            return (
              <div 
                key={item.id}
                className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-xs hover:shadow-md hover:border-slate-200 transition-all flex flex-col justify-between group"
              >
                <div>
                  {/* Image Cover */}
                  <div 
                    className="news-card-thumbnail aspect-video w-full bg-slate-100 relative overflow-hidden cursor-pointer" 
                    onClick={() => handleSelectArticleThumbnail(item)}
                  >
                    <img 
                      src={getProxiedImageUrl(item.image_url)} 
                      alt={item.title} 
                      className="w-full h-full object-cover transition duration-500 group-hover:scale-105" 
                    />
                    <span className="absolute top-3 left-3 bg-slate-900/80 text-[10px] font-bold text-white px-2 py-0.5 rounded font-mono uppercase">
                      {item.source_name}
                    </span>
                  </div>

                  {/* Body Info */}
                  <div className="p-5 space-y-2.5">
                    <div className="flex justify-between text-[10px] font-mono font-bold text-slate-400">
                      <span className="bg-slate-50 text-slate-500 px-1.5 py-0.5 rounded">NATION: {item.country}</span>
                      <span className="flex items-center gap-0.5">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(item.published_at).toLocaleDateString()}
                      </span>
                    </div>

                    <h2 
                      className="font-extrabold text-[#0A1628] hover:text-[#F5A623] cursor-pointer transition text-sm leading-snug line-clamp-2"
                      onClick={() => handleSelectArticle(item)}
                    >
                      {item.title}
                    </h2>

                    <p className="text-xs text-slate-500 leading-relaxed line-clamp-3 font-medium">
                      {stripHtmlTags(item.summary)}
                    </p>
                  </div>
                </div>

                {/* Footer attached CTAs */}
                <div className="p-4 border-t border-slate-50 bg-slate-50/50 flex flex-col gap-2">
                  <button
                    onClick={() => handleSelectArticle(item)}
                    className="w-full bg-[#0A1628] hover:bg-brand-gold text-white hover:text-black font-extrabold text-xs py-2.5 rounded-lg flex items-center justify-center gap-1 shadow-xs transition"
                  >
                    <span>📖 Read Full Article & Vote</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-slate-50 p-16 text-center rounded-2xl border border-dashed border-slate-200">
          <FileText className="w-10 h-10 text-slate-400 mx-auto" />
          <h3 className="font-bold text-slate-700 mt-2">No matching reports found</h3>
          <p className="text-xs text-slate-450 mt-1">Refine your search parameters or check back soon for updates.</p>
        </div>
      )}

      {/* SECTION G: News Feed and Ballot Participation FAQs */}
      <section className="bg-slate-50/50 rounded-2xl border border-slate-100 p-6 sm:p-8 space-y-6 mt-12">
        <div className="text-left space-y-2">
          <div className="inline-flex items-center gap-1.5 bg-brand-gold/10 text-amber-800 border border-amber-200/50 px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-extrabold shadow-sm">
            <HelpCircle className="w-3.5 h-3.5 text-amber-700" />
            Voter Resource Directory
          </div>
          <h3 className="font-extrabold text-[#0A1628] text-lg tracking-tight">
            Frequently Asked Questions (FAQs)
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed font-sans max-w-2xl">
            Learn more about how our independent investigative journal sources reporting drafts, secures secret public ballots, and aligns legislative feedback indexes.
          </p>
        </div>

        <div className="space-y-3.5">
          {[
            {
              question: "How are news articles selected for the newsfeed?",
              answer: "Our editorial system pools verified reports from reputable, independent legislative and developmental observation agencies. Only items directly impacting public policy issues or constitutional initiatives with active public ballots are published to GovTrack."
            },
            {
              question: "Who is eligible to participate and vote on the linked public polls?",
              answer: "Every registered user with an active verified session can cast exactly one official opinion ballot per debate. This maintains strict integrity while capturing democratic public sentiment on emerging topics."
            },
            {
              question: "Are my ballots and voter preferences private?",
              answer: "Yes, completely. Ballots are registered with decoupled, anonymized cryptographic hashes. We separate user account records from individual option selections, keeping the system fully transparent and auditable without storing private telemetry."
            },
            {
              question: "How often are the news reports and live projections updated?",
              answer: "News briefs are updated in real-time. Corresponding stats, candidate rankings, and Voter equipment device metrics are calculated automatically as new validated vote packets enter the system."
            },
            {
              question: "Can citizens propose news topics or submit policy draft reporting?",
              answer: "Verified regional council representatives and administrators can draft news briefings. Standard citizens can propose local policy topics or register local feedback via the Dashboard profile to request editorial vetting."
            }
          ].map((faq, idx) => {
            const isOpen = openFaqIndex === idx;
            return (
              <div 
                key={idx}
                className="bg-white border rounded-xl overflow-hidden transition-all duration-250 shadow-2xs hover:shadow-xs"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                  className="w-full px-5 py-4 flex items-center justify-between text-left font-sans transition-colors hover:bg-slate-50/50"
                >
                  <span className="font-extrabold text-xs sm:text-sm text-[#0A1628] pr-4">
                    {faq.question}
                  </span>
                  <span className="text-[#0A1628] shrink-0 p-1 rounded-lg bg-slate-50 border border-slate-100">
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-slate-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-500" />
                    )}
                  </span>
                </button>
                
                {isOpen && (
                  <div className="px-5 pb-5 pt-0.5 border-t border-slate-50 animate-fadeIn">
                    <p className="text-xs text-slate-500 leading-relaxed font-medium font-sans">
                      {faq.answer}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Article focused Modal overlay for Keeping In Context of News Feed */}
      {isThumbnailModalOpen && activeArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          {/* Backdrop Click */}
          <div className="absolute inset-0 cursor-default" onClick={handleCloseModal}></div>
          
          <div className="bg-white w-full max-w-5xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] relative z-10 animate-in zoom-in-95 duration-200">
            {/* Modal sticky top header */}
            <div className="bg-slate-50 border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="bg-[#0A1628] text-white text-[10px] font-bold px-2.5 py-1 rounded font-mono uppercase tracking-wide">
                  {activeArticle.source_name}
                </span>
                <span className="text-xs text-slate-500 font-mono">Focused Analytical Overview</span>
              </div>
              
              <button 
                onClick={handleCloseModal}
                className="w-8 h-8 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-900 transition-colors"
                title="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable multi-panel contents */}
            <div className="overflow-y-auto p-6 md:p-8">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                
                {/* LEFT BLOCK: ARTICLE METADATA & PARAGRAPHS */}
                <div className="lg:col-span-7 space-y-6 text-left">
                  {/* Aspect video banner */}
                  <div className="aspect-video w-full rounded-2xl overflow-hidden bg-slate-100">
                    <img 
                      src={getProxiedImageUrl(activeArticle.image_url)} 
                      alt={activeArticle.title} 
                      className="w-full h-full object-cover" 
                    />
                  </div>

                  {/* Meta items */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 font-bold">
                    <span className="bg-slate-100 text-[#0A1628] px-2.5 py-1 rounded-full text-[10px] uppercase font-mono">
                      🇵🇸 {activeArticle.country}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {new Date(activeArticle.published_at).toLocaleDateString()}
                    </span>
                    <span>•</span>
                    <span className="font-mono">Insight Analyst Report</span>
                  </div>

                  {/* Title */}
                  <h1 className="text-xl md:text-2xl font-black text-[#0A1628] tracking-tight leading-tight">
                    {activeArticle.title}
                  </h1>

                  {/* Full summary text paragraphs */}
                  <div className="text-slate-800 text-xs md:text-sm font-medium news-article-content">
                    <div 
                      dangerouslySetInnerHTML={{ __html: formatArticleContent(activeArticle.summary) }}
                    />
                    <p className="text-[11px] text-slate-500 italic mt-6 bg-slate-50 p-3.5 rounded-xl border border-dashed border-slate-200 clear-both">
                      Independent electoral reporting. Curated from live legislative registries and objective analyses, public-tied sentiment feeds.
                      <a href={activeArticle.source_url} target="_blank" rel="noopener noreferrer" className="ml-1 text-[#0A1628] font-black hover:underline inline-flex items-center gap-0.5">
                        Read release official file URL <ArrowUpRight className="w-3 h-3" />
                      </a>
                    </p>
                  </div>

                  {/* Tag List */}
                  {activeArticle.tags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {activeArticle.tags.map((tag, i) => (
                        <span key={i} className="bg-slate-50 text-slate-500 font-mono text-[9px] uppercase px-2 py-0.5 rounded border border-slate-100">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* RIGHT BLOCK: THE ATTACHED BALLOT WIDGET PANEL */}
                <div className="lg:col-span-5">
                  {activeArticle.related_poll_id ? (
                    <div className="bg-[#0A1628] text-white rounded-2xl p-5 md:p-6 space-y-5 shadow-lg relative overflow-hidden">
                      {/* Ambient background blur inside right card */}
                      <div className="absolute top-0 right-0 w-24 h-24 bg-[#F5A623]/5 rounded-full blur-2xl pointer-events-none"></div>

                      <div className="flex items-center justify-between border-b border-white/10 pb-3">
                        <div className="space-y-0.5">
                          <span className="text-[9px] tracking-widest uppercase font-mono font-black text-[#F5A623] flex items-center gap-1">
                            <Activity className="w-3" /> Attached Analytical Ballot Panel
                          </span>
                          <h3 className="text-sm font-bold">What is your opinion after reading this report?</h3>
                        </div>
                        <button 
                          onClick={handleManualRefresh}
                          disabled={manualRefreshing || pollLoading}
                          className="bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white p-1.5 rounded transition disabled:opacity-50"
                          title="Refresh state census counts"
                        >
                          <RotateCw className={`w-3.5 h-3.5 ${manualRefreshing ? "animate-spin" : ""}`} />
                        </button>
                      </div>

                      {pollLoading ? (
                        <div className="py-8 text-center space-y-2">
                          <div className="w-6 h-6 border-2 border-[#F5A623] border-t-transparent rounded-full animate-spin mx-auto"></div>
                          <p className="text-[10px] text-slate-400 font-mono">Synchronizing state census counts...</p>
                        </div>
                      ) : embeddedPoll ? (
                        <div className="space-y-5">
                          
                          {/* Ballot Errors/Success inside Modal */}
                          {votingErrorMsg && (
                            <div className="bg-red-500/10 border border-red-500/20 text-red-100 p-2.5 text-xs font-bold rounded-lg flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                              <span className="leading-tight">{votingErrorMsg}</span>
                            </div>
                          )}

                          {votingSuccessMsg && (
                            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-100 p-2.5 text-xs font-bold rounded-lg leading-tight">
                              ✓ {votingSuccessMsg}
                            </div>
                          )}

                          {showResults ? (
                            /* Model Result views */
                            <div className="space-y-3">
                              <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono max-w-full">
                                <span>LIVE RESULTS</span>
                                <span>TOTAL: {embeddedPoll.total_votes.toLocaleString()}</span>
                              </div>

                              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                                {embeddedPoll.options.map((option) => {
                                  const isSelectedVal = pollVotedOptionIds.includes(option.id);
                                  const isLeading = leaderOption?.id === option.id;
                                  return (
                                    <div key={option.id} className="relative bg-white/5 rounded-lg border border-white/5 overflow-hidden">
                                      <VoteProgressBar
                                        label={option.label}
                                        photo_url={option.photo_url}
                                        vote_count={option.vote_count}
                                        total_votes={embeddedPoll.total_votes}
                                        party_color={option.party_color || "#3b82f6"}
                                        isLeading={isLeading}
                                        party={option.party}
                                        selected={isSelectedVal}
                                      />
                                      {isSelectedVal && (
                                        <div 
                                          className="absolute top-2 right-2 text-[7px] bg-emerald-500 text-white font-mono uppercase px-1 rounded font-black tracking-wide"
                                          title={!currentUser ? "A ballot was cast from this network IP address." : "You casted this ballot."}
                                        >
                                          {!currentUser ? "Network" : "Casted"}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              {leaderOption && (
                                <div className="bg-white/5 rounded-lg p-2.5 border border-white/5 flex items-center justify-between text-[11px]">
                                  <span className="text-slate-400">Projection Lead: <strong className="text-white font-black">{leaderOption.label}</strong></span>
                                  <span className="font-mono text-[#F5A623] font-bold">
                                    {embeddedPoll.total_votes > 0 ? ((leaderOption.vote_count / embeddedPoll.total_votes) * 100).toFixed(1) : 0}%
                                  </span>
                                </div>
                              )}

                              {!currentUser && (
                                <div className="text-[10px] text-slate-400 italic bg-white/2 p-2.5 rounded-lg border border-white/5 mt-1 leading-normal">
                                  ℹ️ <strong>Guest Status:</strong> A vote has been registered from your network IP. Sign in to track personal ballots.
                                </div>
                              )}
                            </div>
                          ) : (
                            /* Modal Ballot Selector Form */
                            <div className="space-y-3">
                              <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase pb-1">
                                <span className="truncate">Ballot: {embeddedPoll.title}</span>
                                <span className="bg-emerald-500/10 text-emerald-300 border border-emerald-500/10 px-1 py-0.25 rounded text-[8px] tracking-wide uppercase">
                                  ● Open
                                </span>
                              </div>

                              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                                {embeddedPoll.options.map((option) => {
                                  const isChecked = pollSelectedOptions.includes(option.id);
                                  return (
                                    <button
                                      key={option.id}
                                      onClick={() => handleOptionClick(option.id)}
                                      className={`w-full text-left p-3 rounded-xl border-2 transition-all flex items-center justify-between ${
                                        isChecked 
                                          ? "border-[#F5A623] bg-white/5 shadow-md" 
                                          : "border-white/10 bg-white/2 hover:bg-white/5"
                                      }`}
                                    >
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        <PoliticianAvatar name={option.label} photo_url={option.photo_url} party_color={option.party_color} size="xs" showTooltip={false} />
                                        <div className="truncate text-left">
                                          <h4 className="font-bold text-xs text-slate-100 flex items-center gap-1">
                                            <span className="truncate">{option.label}</span>
                                            {option.party && (
                                              <span 
                                                className="text-[8px] px-1 rounded text-white font-black shrink-0"
                                                style={{ backgroundColor: option.party_color || "#3b82f6" }}
                                              >
                                                {option.party}
                                              </span>
                                            )}
                                          </h4>
                                          {option.description && (
                                            <p className="text-[10px] text-slate-400 leading-tight truncate mt-0.5">{option.description}</p>
                                          )}
                                        </div>
                                      </div>

                                      <div className="w-4 h-4 rounded-full border border-white/30 flex items-center justify-center shrink-0">
                                        {isChecked && (
                                          <span className="w-2.5 h-2.5 bg-[#F5A623] rounded-full"></span>
                                        )}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>

                              <div className="pt-2 border-t border-white/5 flex flex-col gap-3">
                                <button
                                  onClick={handleCastVote}
                                  className="w-full bg-[#F5A623] hover:bg-amber-500 text-slate-900 font-extrabold text-xs py-2.5 rounded-lg shadow-md transition transform hover:scale-[1.01] flex items-center justify-center gap-1"
                                >
                                  Submit Ballot Vote <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                                <span className="text-[9px] text-slate-400 italic text-center">
                                  🛡 Hashed cryptographic double filter secure true voices.
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic">No aligned debate catalog details matched.</p>
                      )}
                    </div>
                  ) : (
                    <div className="bg-[#0A1628] text-white rounded-2xl p-6 text-center space-y-2">
                      <FileText className="w-8 h-8 text-slate-400 mx-auto" />
                      <p className="text-xs text-slate-400 italic">No linked analytical voting options are attached to this report.</p>
                    </div>
                  )}

                  {/* Quick exit cue label inside modal side shelf */}
                  <div className="mt-4 bg-slate-50 border border-slate-100 rounded-xl p-3.5 text-center">
                    <p className="text-[11px] text-slate-500 font-medium">
                      Want to join comments or detailed feedback archives?
                    </p>
                    <button
                      onClick={() => {
                        handleCloseModal();
                        handleSelectArticle(activeArticle);
                      }}
                      className="text-[11px] font-bold text-[#0A1628] hover:text-[#F5A623] underline mt-1.5"
                    >
                      Browse full discussion thread &rarr;
                    </button>
                  </div>
                </div>

              </div>
            </div>

            {/* Modal sticky bottom footer bar */}
            <div className="bg-slate-50 border-t border-slate-100 px-6 py-3 flex items-center justify-end">
              <button 
                onClick={handleCloseModal}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs px-5 py-2 rounded-lg transition-colors"
              >
                Done Reading
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
