/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { User, Poll, Vote, AppNotification } from "../types";
import { api, getSavedUser } from "../utils/api";
import { PollCard } from "../components/Shared";
import { 
  User as UserIcon, 
  Settings, 
  Database, 
  History, 
  Plus, 
  LogOut, 
  Bookmark, 
  Award,
  Globe,
  Bell,
  MessageSquare,
  TrendingUp,
  Check,
  CheckCheck
} from "lucide-react";

interface DashboardViewProps {
  onNavigate: (path: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(getSavedUser());
  const [loading, setLoading] = useState(true);
  const [myCreatedPolls, setMyCreatedPolls] = useState<Poll[]>([]);
  const [myVotesHistory, setMyVotesHistory] = useState<Vote[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [activeTab, setActiveTab] = useState<"history" | "created" | "notifications">("history");

  useEffect(() => {
    if (!currentUser) {
      onNavigate("/login");
      return;
    }

    const loadDashboard = async () => {
      try {
        setLoading(true);
        // Load polls
        const list = await api.getPolls();
        const myPolls = list.filter(p => p.created_by === currentUser.id);
        setMyCreatedPolls(myPolls);

        // Load votes history
        const votes = await api.getUserVotesHistory(currentUser.id);
        setMyVotesHistory(votes);

        // Load notifications
        const notifsRes = await api.getNotifications();
        setNotifications(notifsRes.notifications || []);
      } catch (err) {
        console.error("Dashboard database list error", err);
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, [currentUser?.id]);

  const handleMarkAsRead = async (id: number) => {
    try {
      await api.markNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (err) {
      console.error("Failed to mark read", err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (err) {
      console.error("Failed to mark all read", err);
    }
  };

  const handleLogout = () => {
    api.logout();
    onNavigate("/");
  };

  if (!currentUser) return null;

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 text-left">
      
      {/* Banner card */}
      <section className="bg-gradient-to-r from-[#031124] to-[#0D2446] rounded-2xl p-6 md:p-8 text-white flex flex-col sm:flex-row items-center justify-between gap-6 border border-slate-850 shadow">
        <div className="flex items-center gap-4">
          <img src={currentUser.avatar_url} className="w-16 h-16 rounded-full border-2 border-brand-gold bg-slate-800 object-cover" referrerPolicy="no-referrer" />
          <div className="space-y-1">
            <span className="text-[10px] text-brand-gold uppercase tracking-widest font-mono font-black">Registered Citizen Hub</span>
            <h1 className="text-xl md:text-2xl font-black flex items-center gap-1.5 leading-none">
              {currentUser.display_name}
              {currentUser.verified && (
                <span className="text-blue-400 bg-white/10 rounded-full p-0.5 truncate text-[10px] font-bold">
                  Verified Blue Badge
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-350">{currentUser.email} · <span className="capitalize">{currentUser.role} Account</span></p>
          </div>
        </div>

        <div className="flex gap-2">
          <button 
            onClick={() => onNavigate("/create")}
            className="bg-[#F5A623] hover:bg-[#F5A623]/90 text-black font-black text-xs px-5 py-2.5 rounded shadow flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> Launch Poll
          </button>
          <button 
            onClick={handleLogout}
            className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-bold px-4 py-2.5 rounded hover:border-red-500"
          >
            Sign Out
          </button>
        </div>
      </section>

      {/* Tabs list widgets */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-4">
          {[
            { id: "history", label: `Ballots Cast (${myVotesHistory.length})`, icon: History },
            { id: "created", label: `Drafted Polls (${myCreatedPolls.length})`, icon: Database },
            { id: "notifications", label: `Alerts Inbox (${unreadCount})`, icon: Bell },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`pb-3 text-xs font-bold tracking-wide border-b-2 transition flex items-center gap-1.5 relative ${
                  active 
                    ? "border-[#0A1628] text-[#0A1628]" 
                    : "border-transparent text-slate-400 hover:text-slate-600"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {tab.id === "notifications" && unreadCount > 0 && (
                  <span className="bg-red-500 text-white font-mono text-[9px] px-1.5 py-0.5 rounded-full font-bold ml-1">
                    {unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <main className="min-h-[200px]">
        {loading ? (
          <div className="p-12 text-center animate-pulse text-xs font-mono text-slate-400">Loading directory history ledger...</div>
        ) : activeTab === "history" ? (
          myVotesHistory.length > 0 ? (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-[#0A1628] font-black uppercase font-mono border-b">
                  <tr>
                    <th className="p-4">Poll Title / Question</th>
                    <th className="p-4">Choice Selection</th>
                    <th className="p-4">Tracking Tag Code</th>
                    <th className="p-4">Date Voted</th>
                    <th className="p-4 text-right">Ballot Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-750">
                  {myVotesHistory.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-55/30">
                      <td className="p-4">
                        <button 
                          onClick={() => onNavigate(`/polls/${v.poll_id}`)}
                          className="font-bold text-slate-900 hover:underline hover:text-brand-gold text-left block max-w-sm truncate"
                        >
                          {v.poll_title}
                        </button>
                      </td>
                      <td className="p-4 font-semibold text-slate-600">
                        🗳 {v.voted_option_label}
                      </td>
                      <td className="p-4 font-mono text-[10px] text-slate-400">
                        {v.ip_hash_identifier}
                      </td>
                      <td className="p-4 text-slate-450 font-mono">
                        {new Date(v.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => onNavigate(`/polls/${v.poll_id}`)}
                          className="bg-slate-50 hover:bg-slate-100 text-[#0A1628] border font-bold text-[10px] px-2.5 py-1 rounded"
                        >
                          Analyze Stands
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-slate-50 p-12 text-center rounded-xl border border-dashed border-slate-250">
              <History className="w-8 h-8 text-slate-400 mx-auto" strokeWidth="1.5" />
              <h3 className="font-bold text-slate-700 mt-2">No ballot opinion casting recorded</h3>
              <p className="text-xs text-slate-450 mt-1">Browse active debates to make your vote count with transparency.</p>
              <button onClick={() => onNavigate("/polls")} className="mt-4 bg-[#0A1628] text-white text-xs font-bold px-4 py-2 rounded">
                Vote Dynamic Polls
              </button>
            </div>
          )
        ) : activeTab === "created" ? (
          /* Drafted Polls list */
          myCreatedPolls.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {myCreatedPolls.map((poll) => (
                <PollCard 
                  key={poll.id} 
                  poll={poll} 
                  onSelect={(id) => onNavigate(`/polls/${id}`)} 
                />
              ))}
            </div>
          ) : (
            <div className="bg-slate-50 p-12 text-center rounded-xl border border-dashed border-slate-250">
              <Database className="w-8 h-8 text-slate-400 mx-auto" strokeWidth="1.5" />
              <h3 className="font-bold text-slate-700 mt-2">You haven't drafted any debate directories</h3>
              <p className="text-xs text-slate-450 mt-1">Any clean, authorized citizen level account can draft referendums.</p>
              <button onClick={() => onNavigate("/create")} className="mt-4 bg-[#0A1628] text-white text-xs font-bold px-4 py-2 rounded flex items-center gap-1 mx-auto">
                <Plus className="w-3.5 h-3.5" /> Create a Poll
              </button>
            </div>
          )
        ) : (
          /* Notifications Inbox Feed */
          <div className="space-y-4 text-left">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-50 p-4 rounded-xl border border-slate-100 gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Alerts Inbox</h3>
                <p className="text-xs text-slate-450">Review real-time metrics tracking and commenting feedback for polls you launched.</p>
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="bg-white hover:bg-slate-100 border text-[#0A1628] font-bold text-xs px-3 py-1.5 rounded shadow-sm flex items-center gap-1 transition"
                >
                  <CheckCheck className="w-4 h-4 text-slate-500" />
                  Mark all as read
                </button>
              )}
            </div>

            {notifications.length > 0 ? (
              <div className="divide-y divide-slate-100 bg-white rounded-xl border border-slate-150 overflow-hidden shadow-sm">
                {notifications.map((n) => {
                  const Icon = n.type === "comment" ? MessageSquare : TrendingUp;
                  const iconColor = n.type === "comment" ? "text-blue-500 bg-blue-50/60" : "text-amber-500 bg-amber-50/60";
                  return (
                    <div 
                      key={n.id} 
                      className={`p-4 flex items-start gap-4 hover:bg-slate-50/80 transition cursor-pointer relative ${
                        !n.is_read ? "bg-amber-50/15 border-l-4 border-[#F5A623]" : "pl-[19px]"
                      }`}
                      onClick={async () => {
                        if (!n.is_read) {
                          await handleMarkAsRead(n.id);
                        }
                        onNavigate(`/polls/${n.poll_id}`);
                      }}
                    >
                      <div className={`p-2.5 rounded-lg shrink-0 ${iconColor}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 space-y-1 min-w-0">
                        <div className="flex items-center gap-2 justify-between">
                          <span className="text-xs font-bold text-slate-900 truncate uppercase tracking-wide">
                            {n.type === "comment" ? "New Comment Feedback" : "Voter Milestone Event"}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {new Date(n.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-xs text-slate-650 font-medium leading-relaxed">
                          {n.message}
                        </p>
                        <div className="text-[10px] text-[#0A1628] hover:text-[#0A1628]/80 font-bold underline mt-1 flex items-center gap-1">
                          View details inside referendum page &rarr;
                        </div>
                      </div>
                      {!n.is_read && (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            await handleMarkAsRead(n.id);
                          }}
                          className="text-slate-400 hover:text-slate-700 p-1 bg-white hover:bg-slate-100 border rounded shadow-sm transition"
                          title="Mark read"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-slate-50 p-12 text-center rounded-xl border border-dashed border-slate-250">
                <Bell className="w-8 h-8 text-slate-400 mx-auto" strokeWidth="1.5" />
                <h3 className="font-bold text-slate-700 mt-2">No active alerts inside your registry</h3>
                <p className="text-xs text-slate-450 mt-1">Deploy voter engagement campaigns on your reference ballots to spark active feedback lists.</p>
              </div>
            )}
          </div>
        )}
      </main>

    </div>
  );
};
