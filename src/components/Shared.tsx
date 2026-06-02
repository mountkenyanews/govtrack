/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Poll, Politician, PollOption } from "../types";
import { 
  Trophy, 
  Clock, 
  MessageSquare, 
  Eye, 
  CheckCircle, 
  Share2, 
  Twitter, 
  Facebook,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  Award
} from "lucide-react";

// 1. PoliticianAvatar Component
interface PoliticianAvatarProps {
  name: string;
  photo_url: string;
  party_color?: string;
  size?: "sm" | "md" | "lg" | "xl";
  title?: string;
  showTooltip?: boolean;
}

export function getProxiedImageUrl(url: string): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (
    trimmed.startsWith("/") || 
    trimmed.startsWith("data:") || 
    trimmed.startsWith("blob:") || 
    trimmed.startsWith("http://localhost") || 
    trimmed.startsWith("https://ui-avatars.com") ||
    trimmed.includes("firebasestorage")
  ) {
    return trimmed;
  }
  return `/api/proxy-image?url=${encodeURIComponent(trimmed)}`;
}

export const getPerfectPoliticianImage = (name: string, photo_url?: string): string => {
  const url = photo_url?.trim() || "";
  const STOCK_UNSPLASH_PATTERN = /unsplash\.com\/photo-/;
  if (url !== "" && !STOCK_UNSPLASH_PATTERN.test(url)) {
    return getProxiedImageUrl(url);
  }

  // Premium, clean initials avatar based on real politician's name instead of random stock templates
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0a1628&color=ffffff&size=256&bold=true`;
};


export const PoliticianAvatar: React.FC<PoliticianAvatarProps> = ({
  name,
  photo_url,
  party_color = "#3b82f6",
  size = "md",
  title = "",
  showTooltip = true
}) => {
  const sizeClasses = {
    sm: "w-8 h-8 text-[10px]",
    md: "w-12 h-12 text-xs",
    lg: "w-20 h-20 text-lg",
    xl: "w-32 h-32 text-2xl"
  };

  const ringSizes = {
    sm: "ring-2 ring-offset-1",
    md: "ring-3 ring-offset-2",
    lg: "ring-4 ring-offset-2",
    xl: "ring-[6px] ring-offset-4"
  };

  // Safe fallback if the photo_url is loading, blank, or wikimedia/ui-avatar API
  const safePhoto = getPerfectPoliticianImage(name, photo_url);

  return (
    <div 
      className="relative group inline-block flex-shrink-0"
      title={showTooltip && title ? `${name} - ${title}` : name}
    >
      <div 
        className={`${sizeClasses[size]} rounded-full overflow-hidden transition-all duration-300 transform group-hover:scale-105 flex items-center justify-center bg-slate-100 ring-offset-white`}
        style={{ 
          boxShadow: `0 0 0 calc(${size === "sm" ? "1px" : size === "md" ? "2px" : "3px"}) ${party_color}` 
        }}
      >
        <img 
          src={safePhoto} 
          alt={name} 
          onError={(e) => {
            (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0a1628&color=ffffff&size=256&bold=true`;
          }}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
      </div>

      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[200px] pointer-events-none opacity-0 group-hover:opacity-100 bg-slate-900 text-white text-xs px-2 py-1 rounded shadow-md transition-opacity duration-200 z-50 text-center">
          <div className="font-semibold">{name}</div>
          {title && <div className="text-[10px] text-slate-300">{title}</div>}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-900"></div>
        </div>
      )}
    </div>
  );
};

// 2. CategoryBadge Component
interface CategoryBadgeProps {
  category: string;
}

export const CategoryBadge: React.FC<CategoryBadgeProps> = ({ category }) => {
  const badgeStyles: Record<string, string> = {
    "Election": "bg-blue-50 text-blue-700 border-blue-200",
    "Approval Rating": "bg-purple-50 text-purple-700 border-purple-200",
    "Policy": "bg-amber-50 text-amber-700 border-amber-200",
    "Leadership": "bg-teal-50 text-teal-700 border-teal-200",
    "Referendum": "bg-rose-50 text-rose-700 border-rose-200",
    "International": "bg-emerald-50 text-emerald-700 border-emerald-200",
    "Local Government": "bg-stone-50 text-stone-700 border-stone-200",
    "Party Politics": "bg-indigo-50 text-indigo-700 border-indigo-200",
    "Breaking News Poll": "bg-red-50 text-red-700 border-red-200 animate-pulse"
  };

  const styleClass = badgeStyles[category] || "bg-slate-50 text-slate-700 border-slate-200";

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${styleClass}`}>
      {category}
    </span>
  );
};

// 3. CountdownTimer Component
interface CountdownTimerProps {
  closes_at?: string;
  status: string;
}

export const CountdownTimer: React.FC<CountdownTimerProps> = ({ closes_at, status }) => {
  const [timeLeft, setTimeLeft] = useState<string>("");

  useEffect(() => {
    if (status === "closed" || status === "draft") {
      setTimeLeft("");
      return;
    }

    if (!closes_at) {
      setTimeLeft("Ongoing");
      return;
    }

    const updateTimer = () => {
      const now = new Date().getTime();
      const deadline = new Date(closes_at).getTime();
      const diff = deadline - now;

      if (diff <= 0) {
        setTimeLeft("Closed");
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (days > 0) {
        setTimeLeft(`${days}d ${hours}h left`);
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m left`);
      } else {
        setTimeLeft(`${minutes}m left`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 60000); // refresh every minute

    return () => clearInterval(interval);
  }, [closes_at, status]);

  if (status === "closed") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 px-2 py-1 rounded font-medium border border-red-100">
        <span className="w-1.5 h-1.5 rounded-full bg-red-600"></span>
        Closed
      </span>
    );
  }

  if (status === "scheduled") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded font-medium border border-amber-100 animate-pulse">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
        Pending Review
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded font-medium border border-emerald-100">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
      <Clock className="w-3.5 h-3.5" />
      <span>{timeLeft || "Live"}</span>
    </span>
  );
};

// 4. VoteProgressBar Component
interface VoteProgressBarProps {
  label: string;
  photo_url: string;
  vote_count: number;
  total_votes: number;
  party_color?: string;
  isLeading: boolean;
  party?: string;
  onSelect?: () => void;
  selected?: boolean;
  interactive?: boolean;
}

export const VoteProgressBar: React.FC<VoteProgressBarProps> = ({
  label,
  photo_url,
  vote_count,
  total_votes,
  party_color = "#3b82f6",
  isLeading,
  party = "",
  onSelect,
  selected = false,
  interactive = false
}) => {
  const percentage = total_votes > 0 ? (vote_count / total_votes) * 100 : 0;
  
  return (
    <div 
      onClick={interactive && onSelect ? onSelect : undefined}
      className={`p-3 rounded-lg border transition-all duration-200 ${
        interactive ? "cursor-pointer hover:border-brand-gold/80 hover:bg-slate-50" : "bg-white"
      } ${selected ? "border-brand-gold bg-brand-gold/5 ring-1 ring-brand-gold" : "border-slate-100"}`}
    >
      <div className="flex items-center gap-3 mb-2">
        <PoliticianAvatar name={label} photo_url={photo_url} party_color={party_color} size="sm" showTooltip={false} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-sm text-slate-800 truncate">{label}</span>
            {party && (
              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.25 rounded truncate">
                {party}
              </span>
            )}
            {isLeading && (
              <span className="flex-shrink-0 flex items-center gap-0.5 text-[10px] text-amber-600 bg-amber-50 px-1 py-0.25 rounded font-semibold animate-bounce">
                <Trophy className="w-3 h-3" /> Leading
              </span>
            )}
          </div>
          <div className="flex items-baseline justify-between mt-0.5">
            <span className="text-xs text-slate-500 font-mono font-medium">
              {vote_count.toLocaleString()} votes
            </span>
            <span className="text-sm font-extrabold text-slate-900 font-mono">
              {percentage.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
        <div 
          className="h-full rounded-full transition-all duration-1000 ease-out"
          style={{ 
            width: `${percentage}%`,
            backgroundColor: party_color 
          }}
        ></div>
      </div>
    </div>
  );
};

// 5. ApprovalRingChart (Beautiful Custom SVG-based Donut chart)
interface ApprovalRingChartProps {
  approvalPercent: number;
  size?: number;
}

export const ApprovalRingChart: React.FC<ApprovalRingChartProps> = ({
  approvalPercent,
  size = 56
}) => {
  const percent = Math.min(100, Math.max(0, approvalPercent));
  const strokeWidth = size * 0.12;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  let color = "#ef4444"; // Red
  if (percent >= 50) color = "#10b981"; // Green
  else if (percent >= 35) color = "#f5a623"; // Amber

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="w-full h-full transform -rotate-90">
        {/* Background circle */}
        <circle
          className="text-slate-100"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        {/* Progress circle */}
        <circle
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          stroke={color}
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute text-center flex flex-col justify-center items-center">
        <span className="font-mono font-black text-xs text-slate-800">
          {percent.toFixed(0)}%
        </span>
      </div>
    </div>
  );
};

// 6. ShareButtons Component
interface ShareButtonsProps {
  url: string;
  title: string;
}

export const ShareButtons: React.FC<ShareButtonsProps> = ({ url, title }) => {
  const [copied, setCopied] = useState(false);

  // Map SPA client-side hash routes to server-side share handlers so crawlers/scrapers (Facebook, WhatsApp)
  // receive real Open Graph meta tags and dynamic preview images.
  let sharePath = url;
  if (url.startsWith("/polls/")) {
    sharePath = url.replace("/polls/", "/api/share/poll/");
  } else if (url.startsWith("/news/")) {
    sharePath = url.replace("/news/", "/api/share/news/");
  }

  const fullUrl = `${window.location.origin}${sharePath}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTwitter = () => {
    const text = encodeURIComponent(`🗳 Vote in this GovTrack poll: "${title}" - ${fullUrl}`);
    window.open(`https://twitter.com/intent/tweet?text=${text}`, "_blank");
  };

  const handleWhatsApp = () => {
    const text = encodeURIComponent(`👉 *GovTrack*: ${title}\nCast your official vote here: ${fullUrl}`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
  };

  const handleFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(fullUrl)}`, "_blank");
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button 
        onClick={handleCopy}
        className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold px-2.5 py-1.5 rounded-md transition-colors"
      >
        <Share2 className="w-3.5 h-3.5" />
        {copied ? "Copied!" : "Copy Link"}
      </button>

      <button 
        onClick={handleTwitter}
        className="inline-flex items-center gap-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-semibold px-2.5 py-1.5 rounded-md transition-colors"
      >
        <Twitter className="w-3.5 h-3.5" />
        X / Twitter
      </button>

      <button 
        onClick={handleFacebook}
        className="inline-flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold px-2.5 py-1.5 rounded-md transition-colors"
      >
        <Facebook className="w-3.5 h-3.5" />
        Facebook
      </button>

      <button 
        onClick={handleWhatsApp}
        className="inline-flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold px-2.5 py-1.5 rounded-md transition-colors"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        WhatsApp
      </button>

      <button 
        onClick={() => {
          const code = `<iframe src="${fullUrl}?embed=true" width="100%" height="450" style="border:1px solid #e2e8f0;border-radius:8px;"></iframe>`;
          navigator.clipboard.writeText(code);
          alert("Embed Code snippet copied to clipboard!");
        }}
        className="inline-flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-semibold px-2.5 py-1.5 rounded-md border border-slate-200 transition-colors"
      >
        <span>&lt;/&gt; Embed</span>
      </button>
    </div>
  );
};

// 7. PollCard Component (Grid / List formats)
interface PollCardProps {
  poll: Poll;
  size?: "sm" | "md" | "lg";
  onSelect?: (id: number) => void;
  showVoteButton?: boolean;
}

export const PollCard: React.FC<PollCardProps> = ({ 
  poll, 
  size = "md", 
  onSelect,
  showVoteButton = true
}) => {
  const isClosed = poll.status === "closed" || (poll.closes_at && new Date(poll.closes_at).getTime() < Date.now());
  const optionsToShow = poll.options.slice(0, 3);
  const remainingCount = poll.options.length - 3;

  // Find leading option
  let leadingOption: PollOption | null = null;
  if (poll.total_votes > 0) {
    leadingOption = poll.options.reduce((prev, curr) => (curr.vote_count > prev.vote_count ? curr : prev));
  }

  const handleCardClick = () => {
    if (onSelect) onSelect(poll.id);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden flex flex-col h-full hover:shadow-md hover:border-slate-200/80 transition-all duration-200">
      {/* Top Header Row */}
      <div className="p-4 pb-2 flex items-center justify-between flex-wrap gap-2 border-b border-dashed border-slate-50">
        <CategoryBadge category={poll.category} />
        <div className="flex items-center gap-2">
          {poll.country && (
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
              🇳🇵 {poll.country}
            </span>
          )}
          <CountdownTimer closes_at={poll.closes_at} status={isClosed ? "closed" : poll.status} />
        </div>
      </div>

      {/* Main Body */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div className="mb-4">
          <h3 
            onClick={handleCardClick}
            className="font-extrabold text-[#0A1628] leading-tight text-md mb-2 cursor-pointer hover:text-brand-gold transition-colors line-clamp-2"
          >
            {poll.title}
          </h3>
          <p className="text-xs text-slate-500 line-clamp-2 mb-4">
            {poll.description}
          </p>

          {/* Overlapping Candidate Circles */}
          <div className="flex items-center gap-2 mb-4">
            <div className="flex -space-x-2.5 overflow-hidden py-1">
              {poll.options.slice(0, 4).map((opt) => (
                <div key={opt.id} className="w-9 h-9 rounded-full ring-2 ring-white overflow-hidden bg-slate-200">
                  <img 
                    src={getPerfectPoliticianImage(opt.label, opt.photo_url)} 
                    alt={opt.label} 
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(opt.label)}&background=0a1628&color=ffffff&size=256&bold=true`;
                    }}
                    className="w-full h-full object-cover" 
                    referrerPolicy="no-referrer"
                  />
                </div>
              ))}
              {poll.options.length > 4 && (
                <div className="w-9 h-9 rounded-full ring-2 ring-white overflow-hidden bg-slate-800 text-white text-[10px] font-bold flex items-center justify-center">
                  +{poll.options.length - 4}
                </div>
              )}
            </div>
            <div className="text-left">
              <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Candidates</span>
              <span className="text-xs font-semibold text-slate-700">
                {poll.options.map(o => o.label).slice(0, 2).join(" vs ")}
                {poll.options.length > 2 && " & others"}
              </span>
            </div>
          </div>

          {/* Quick Mini stand-out progress */}
          {poll.total_votes > 0 && leadingOption && (
            <div className="bg-slate-50/50 rounded-lg p-2.5 border border-slate-100 flex items-center justify-between text-xs mb-2">
              <span className="text-slate-500 font-medium truncate flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-[#F5A623]" />
                Lead: <strong className="text-slate-800 font-extrabold">{leadingOption.label}</strong>
              </span>
              <span className="font-mono font-bold text-slate-900 bg-brand-gold/10 px-1.5 py-0.5 rounded text-[10px]">
                {((leadingOption.vote_count / poll.total_votes) * 100).toFixed(0)}%
              </span>
            </div>
          )}
        </div>

        {/* Footer info & CTA */}
        <div className="mt-2 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <span className="font-mono font-bold text-slate-500">
              {poll.total_votes.toLocaleString()} votes
            </span>
            <span className="flex items-center gap-1">
              <Eye className="w-3.5 h-3.5 text-slate-300" />
              {poll.view_count.toLocaleString()}
            </span>
          </div>

          {showVoteButton && (
            <button 
              onClick={handleCardClick}
              className={`flex items-center gap-1 font-bold px-3.5 py-1.5 rounded text-xs transition-all duration-200 shadow-sm ${
                isClosed 
                  ? "bg-slate-100 border border-slate-200 text-slate-600 hover:bg-slate-200"
                  : "bg-[#0A1628] text-white hover:bg-[#F5A623] hover:text-[#0A1628] hover:scale-[1.03]"
              }`}
            >
              <span>{isClosed ? "See Results" : "Vote Now"}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
