/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Poll } from "../types";
import { api } from "../utils/api";
import { PollCard, CategoryBadge, CountdownTimer } from "../components/Shared";
import { Search, Grid, List, Sliders, X, CheckSquare, Square, Globe } from "lucide-react";

interface BrowsePollsViewProps {
  onNavigate: (path: string) => void;
}

export const BrowsePollsView: React.FC<BrowsePollsViewProps> = ({ onNavigate }) => {
  const [loading, setLoading] = useState(true);
  const [polls, setPolls] = useState<Poll[]>([]);
  
  // Filters State
  const [search, setSearch] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string[]>(["active"]); // Default active is nice!
  const [selectedCountry, setSelectedCountry] = useState("All");
  const [selectedType, setSelectedType] = useState("All");
  const [sortField, setSortField] = useState("Most Votes");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const categoriesList = [
    "Election", "Approval Rating", "Policy", "Leadership", "Referendum", "International", "Local Government", "Party Politics", "Breaking News Poll"
  ];

  const countriesList = ["All", "Kenya", "USA", "UK", "South Africa", "Nigeria", "France", "Germany", "Global"];
  const typesList = [
    { value: "All", label: "All Formats" },
    { value: "single_choice", label: "Single Choice" },
    { value: "multiple_choice", label: "Multiple Choice" },
    { value: "yes_no", label: "Yes / No" },
    { value: "approval_rating", label: "Approval Slider" }
  ];

  useEffect(() => {
    const fetchFilteredPolls = async () => {
      try {
        setLoading(true);
        const filters = {
          search,
          category: selectedCategories.join(","),
          status: selectedStatus.join(","),
          country: selectedCountry,
          poll_type: selectedType === "All" ? "" : selectedType,
          sort: sortField
        };
        const list = await api.getPolls(filters);
        setPolls(list);
      } catch (err) {
        console.error("Browse loading lost integration", err);
      } finally {
        setLoading(false);
      }
    };

    const delayDebounce = setTimeout(() => {
      fetchFilteredPolls();
    }, 400); // Debounce search

    return () => clearTimeout(delayDebounce);
  }, [search, selectedCategories, selectedStatus, selectedCountry, selectedType, sortField]);

  const handleCategoryToggle = (cat: string) => {
    if (selectedCategories.includes(cat)) {
      setSelectedCategories(selectedCategories.filter(c => c !== cat));
    } else {
      setSelectedCategories([...selectedCategories, cat]);
    }
  };

  const handleStatusToggle = (status: string) => {
    if (selectedStatus.includes(status)) {
      setSelectedStatus(selectedStatus.filter(s => s !== status));
    } else {
      setSelectedStatus([...selectedStatus, status]);
    }
  };

  const clearAllFilters = () => {
    setSearch("");
    setSelectedCategories([]);
    setSelectedStatus(["active"]);
    setSelectedCountry("All");
    setSelectedType("All");
    setSortField("Most Votes");
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="border-b border-slate-100 pb-4">
        <h1 className="text-3xl font-black text-[#0A1628] tracking-tight">Browse Public Opinion Polls</h1>
        <p className="text-xs text-slate-500">Trace worldwide policy alignments, party directions, and leader approval indexes.</p>
      </div>

      {/* Control bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
        {/* Search Input bar */}
        <div className="relative flex-1 min-w-[280px]">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search polls by title or issue keyword..."
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-[#F5A623] text-slate-800 font-medium"
          />
          {search && (
            <button 
              onClick={() => setSearch("")}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Action controllers */}
        <div className="flex items-center gap-3">
          {/* Mobile Filter toggle */}
          <button
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className="lg:hidden bg-slate-100 hover:bg-slate-200 text-slate-700 px-3.5 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5"
          >
            <Sliders className="w-4 h-4 text-brand-gold" /> Filters
          </button>

          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-lg p-2 font-bold focus:outline-none"
          >
            <option value="Most Votes">Sort: Most Votes</option>
            <option value="Most Recent">Sort: Most Recent</option>
            <option value="Closing Soon">Sort: Closing Soon</option>
            <option value="Trending">Sort: Trending</option>
          </select>

          {/* View Modes */}
          <div className="hidden sm:flex items-center border border-slate-200 rounded-lg overflow-hidden bg-slate-50 p-0.5">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded ${viewMode === "grid" ? "bg-white shadow text-[#0A1628]" : "text-slate-400 hover:text-slate-600"}`}
              title="Grid Layout"
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded ${viewMode === "list" ? "bg-white shadow text-[#0A1628]" : "text-slate-400 hover:text-slate-600"}`}
              title="Table Layout"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar Filter Area (desktop) */}
        <aside className="hidden lg:block space-y-6 bg-white p-5 rounded-xl border border-slate-100 shadow-sm self-start">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <h3 className="font-extrabold text-sm text-[#0A1628] uppercase tracking-wider font-mono">Filter Directory</h3>
            <button 
              onClick={clearAllFilters}
              className="text-[10px] font-bold text-red-500 hover:underline"
            >
              Reset
            </button>
          </div>

          {/* Status filter */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase text-slate-400 tracking-wider">Status</label>
            <div className="space-y-1.5">
              {[
                { value: "active", label: "Live / In Progress" },
                { value: "closed", label: "Archive / Closed Polls" },
                { value: "scheduled", label: "Pending Assessment" }
              ].map((st) => {
                const checked = selectedStatus.includes(st.value);
                return (
                  <button
                    key={st.value}
                    onClick={() => handleStatusToggle(st.value)}
                    className="w-full flex items-center justify-between text-left text-xs font-semibold py-1 text-slate-600 hover:text-slate-900"
                  >
                    <span>{st.label}</span>
                    <span className="text-[#F5A623]">
                      {checked ? <CheckSquare className="w-4 h-4 fill-brand-blue" /> : <Square className="w-4 h-4" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Category checklist */}
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <label className="block text-xs font-bold uppercase text-slate-400 tracking-wider">Poll Category</label>
            <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
              {categoriesList.map((cat) => {
                const checked = selectedCategories.includes(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => handleCategoryToggle(cat)}
                    className="w-full flex items-center justify-between text-left text-xs font-semibold py-1 text-slate-600 hover:text-slate-900"
                  >
                    <span>{cat}</span>
                    <span className="text-[#F5A623]">
                      {checked ? <CheckSquare className="w-4 h-4 fill-brand-blue" /> : <Square className="w-4 h-4" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Country filter */}
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <label className="block text-xs font-bold uppercase text-slate-400 tracking-wider">Target Nation</label>
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded p-2 focus:outline-none"
            >
              {countriesList.map((cnt) => (
                <option key={cnt} value={cnt}>{cnt === "All" ? "🌐 All Countries" : `🇳🇵 ${cnt}`}</option>
              ))}
            </select>
          </div>

          {/* Format selection */}
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <label className="block text-xs font-bold uppercase text-slate-400 tracking-wider">Layout Format</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded p-2 focus:outline-none"
            >
              {typesList.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </aside>

        {/* Main layout contents */}
        <main className="lg:col-span-3 space-y-6">
          <div className="text-xs text-slate-500 font-mono flex items-center justify-between">
            <span>SHOWING {polls.length} CORRESPONDING DEBATES</span>
            {selectedCategories.length > 0 && (
              <button onClick={() => setSelectedCategories([])} className="text-brand-gold font-bold hover:underline">
                Clear Category Filters
              </button>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="bg-white border border-slate-100 rounded-xl p-6 space-y-4 animate-pulse-slow">
                  <div className="h-4 bg-slate-200 rounded w-1/4"></div>
                  <div className="h-6 bg-slate-200 rounded w-3/4"></div>
                  <div className="h-3 bg-slate-200 rounded w-full"></div>
                  <div className="h-10 bg-slate-100 rounded-lg"></div>
                </div>
              ))}
            </div>
          ) : polls.length > 0 ? (
            viewMode === "grid" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {polls.map((poll) => (
                  <PollCard
                    key={poll.id}
                    poll={poll}
                    onSelect={(id) => onNavigate(`/polls/${id}`)}
                  />
                ))}
              </div>
            ) : (
              /* List View Table layout */
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 text-[#0A1628] font-black uppercase tracking-wider font-mono border-b border-slate-100">
                    <tr>
                      <th className="p-4">Poll Title</th>
                      <th className="p-4">Category</th>
                      <th className="p-4">Total Votes</th>
                      <th className="p-4">Nation</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Deadline</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {polls.map((p) => {
                      const closDate = p.closes_at ? new Date(p.closes_at).toLocaleDateString() : "Ongoing";
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/50">
                          <td className="p-4">
                            <button
                              onClick={() => onNavigate(`/polls/${p.id}`)}
                              className="font-bold text-slate-900 hover:text-brand-gold text-left max-w-[280px] block truncate"
                            >
                              {p.title}
                            </button>
                            <span className="text-[10px] text-slate-400 block truncate max-w-[280px]">
                              {p.description}
                            </span>
                          </td>
                          <td className="p-4">
                            <CategoryBadge category={p.category} />
                          </td>
                          <td className="p-4 font-mono font-semibold">
                            {p.total_votes.toLocaleString()}
                          </td>
                          <td className="p-4">
                            🇳🇵 {p.country}
                          </td>
                          <td className="p-4">
                            <CountdownTimer closes_at={p.closes_at} status={p.status} />
                          </td>
                          <td className="p-4 text-slate-400 font-mono">{closDate}</td>
                          <td className="p-4 text-right">
                            <button
                              onClick={() => onNavigate(`/polls/${p.id}`)}
                              className="text-xs bg-[#0A1628] hover:bg-[#F5A623] hover:text-[#0A1628] text-white font-bold px-3 py-1.5 rounded"
                            >
                              Inspect
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <div className="bg-slate-50 rounded-xl p-16 text-center border border-dashed border-slate-200">
              <span className="text-4xl text-slate-300 block mb-3">🗳</span>
              <h3 className="font-extrabold text-slate-700">No matches found</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                We couldn`t locate matching polls with your specified searching criteria. Try adjusting filters or searching tags.
              </p>
              <button 
                onClick={clearAllFilters}
                className="mt-4 bg-[#0A1628] text-white text-xs font-bold px-4 py-2 rounded"
              >
                Clear Filters
              </button>
            </div>
          )}
        </main>
      </div>

      {/* Mobile Collapsible sidebar Drawer */}
      {showMobileFilters && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex justify-end">
          <div className="w-80 bg-white h-full p-6 overflow-y-auto flex flex-col justify-between">
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-extrabold text-[#0A1628]">Select Filters</h3>
                <button onClick={() => setShowMobileFilters(false)}>
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              {/* Status */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-slate-400">Status</label>
                <div className="space-y-1.5">
                  {["active", "closed", "scheduled"].map((st) => (
                    <button
                      key={st}
                      onClick={() => handleStatusToggle(st)}
                      className="w-full flex items-center justify-between text-left text-xs text-slate-600"
                    >
                      <span className="capitalize">{st === "scheduled" ? "Pending Review" : st === "closed" ? "Archive / Closed Polls" : st}</span>
                      <span className="text-[#F5A623]">
                        {selectedStatus.includes(st) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Category */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-slate-400">Categories</label>
                <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
                  {categoriesList.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => handleCategoryToggle(cat)}
                      className="w-full flex items-center justify-between text-left text-xs text-slate-600"
                    >
                      <span>{cat}</span>
                      <span className="text-[#F5A623]">
                        {selectedCategories.includes(cat) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Country */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-slate-400">Target Nation</label>
                <select
                  value={selectedCountry}
                  onChange={(e) => setSelectedCountry(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-xs rounded p-2 text-slate-700"
                >
                  {countriesList.map((cnt) => (
                    <option key={cnt} value={cnt}>{cnt}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100 space-y-2">
              <button 
                onClick={() => {
                  clearAllFilters();
                  setShowMobileFilters(false);
                }}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded text-xs font-bold"
              >
                Reset Filters
              </button>
              <button 
                onClick={() => setShowMobileFilters(false)}
                className="w-full bg-[#0A1628] text-white py-2.5 rounded text-xs font-bold"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
