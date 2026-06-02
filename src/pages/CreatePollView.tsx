/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { User, Politician } from "../types";
import { api, getSavedUser } from "../utils/api";
import { getPerfectPoliticianImage } from "../components/Shared";
import { 
  Plus, 
  Trash, 
  ChevronRight, 
  ChevronLeft, 
  Eye, 
  Sparkles, 
  Upload, 
  Lock, 
  FileText, 
  UserPlus, 
  Search,
  CheckCircle2,
  AlertCircle
} from "lucide-react";

interface CreatePollViewProps {
  onNavigate: (path: string) => void;
}

export const CreatePollView: React.FC<CreatePollViewProps> = ({ onNavigate }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(getSavedUser());
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Step 1: Poll Configuration
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Election");
  const [pollType, setPollType] = useState("single_choice");
  const [country, setCountry] = useState("Kenya");
  const [closesAt, setClosesAt] = useState("");
  const [allowComments, setAllowComments] = useState(true);
  const [allowAnonymous, setAllowAnonymous] = useState(true);

  // Step 2: Options
  const [options, setOptions] = useState<Array<{
    label: string;
    description: string;
    party: string;
    party_color: string;
    photo_url: string;
  }>>([
    { label: "", description: "", party: "", party_color: "#3b82f6", photo_url: "" },
    { label: "", description: "", party: "", party_color: "#e11d48", photo_url: "" }
  ]);

  // Politicians search pre-fill
  const [politicians, setPoliticians] = useState<Politician[]>([]);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchTargetIdx, setSearchTargetIdx] = useState<number | null>(null);
  const [polSearchQuery, setPolSearchQuery] = useState("");

  useEffect(() => {
    if (!currentUser) {
      onNavigate("/login");
    }

    const loadPoliticians = async () => {
      try {
        const list = await api.getPoliticians();
        setPoliticians(list);
      } catch (err) {
        console.error(err);
      }
    };
    loadPoliticians();
  }, [currentUser?.id]);

  const handleAddField = () => {
    if (options.length >= 10) return;
    setOptions([...options, { label: "", description: "", party: "", party_color: "#10b981", photo_url: "" }]);
  };

  const handleRemoveField = (idx: number) => {
    if (options.length <= 2) return;
    setOptions(options.filter((_, i) => i !== idx));
  };

  const handleOptionChange = (idx: number, field: string, value: string) => {
    setOptions(options.map((opt, i) => {
      if (i === idx) {
        return { ...opt, [field]: value };
      }
      return opt;
    }));
  };

  const handlePhotoUpload = async (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const url = await api.uploadFile(file);
      handleOptionChange(idx, "photo_url", url);
    } catch (err: any) {
      setErrorMsg(err.message || "File upload failed.");
    }
  };

  const openSearchModal = (idx: number) => {
    setSearchTargetIdx(idx);
    setShowSearchModal(true);
  };

  const selectPoliticianToPreFill = (pol: Politician) => {
    if (searchTargetIdx === null) return;
    setOptions(options.map((opt, i) => {
      if (i === searchTargetIdx) {
        return {
          label: pol.full_name,
          description: pol.title,
          party: pol.party,
          party_color: pol.party_color || "#3b82f6",
          photo_url: pol.photo_url
        };
      }
      return opt;
    }));
    setShowSearchModal(false);
    setSearchTargetIdx(null);
  };

  const handleNextStep = () => {
    setErrorMsg("");
    if (step === 1) {
      if (!title.trim() || title.trim().length < 8) {
        setErrorMsg("Please formulate a descriptive title of at least 8 characters.");
        return;
      }
      setStep(2);
    } else if (step === 2) {
      const emptyLabel = options.some(opt => !opt.label.trim());
      if (emptyLabel) {
        setErrorMsg("Please populate the label titles for all available options.");
        return;
      }
      setStep(3);
    }
  };

  const handlePublishPoll = async () => {
    setErrorMsg("");
    setLoading(true);

    try {
      const payload = {
        title,
        description,
        category,
        poll_type: pollType,
        country,
        closes_at: closesAt || undefined,
        allow_comments: allowComments,
        is_anonymous: allowAnonymous,
        options,
        tags: [category, country].filter(Boolean),
      };

      const res = await api.createPoll(payload);
      setSuccessMsg("Your debate poll has been constructed! Citizens can now voice insights.");
      setTimeout(() => {
        onNavigate(`/polls/${res.poll.id}`);
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err.message || "Poll publishing failed. Check parameters and try again.");
      setLoading(false);
    }
  };

  const filteredPoliticians = politicians.filter(p => 
    p.full_name.toLowerCase().includes(polSearchQuery.toLowerCase()) || p.party.toLowerCase().includes(polSearchQuery.toLowerCase())
  );

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      
      {/* Step progress bar */}
      <section className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm space-y-4">
        <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-400">
          <span>CREATOR WIZARD ASSISTANT</span>
          <span className="text-[#F5A623]">STAGE {step} OF 3</span>
        </div>
        <div className="flex gap-2">
          {[1,2,3].map(n => (
            <div 
              key={n} 
              className={`h-2.5 flex-1 rounded-full transition-colors ${
                step >= n ? "bg-[#0A1628]" : "bg-slate-100"
              }`}
            ></div>
          ))}
        </div>
      </section>

      {errorMsg && (
        <div className="bg-red-50 text-red-700 p-3.5 text-xs font-bold rounded-lg border border-red-150 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-50 text-emerald-850 p-3.5 text-xs font-bold rounded-lg border border-emerald-150 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* STEP 1: SETUP */}
      {step === 1 && (
        <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-100 shadow-sm space-y-5 text-left">
          <h2 className="text-xl font-extrabold text-[#0A1628] flex items-center gap-1.5 border-b border-slate-50 pb-3">
            <FileText className="w-5 h-5 text-[#F5A623]" />
            Step 1: Define Poll Core Focus
          </h2>

          <div className="space-y-4">
            <div className="space-y-1">
              <label className="block text-xs font-bold uppercase text-slate-500 font-mono tracking-wider">Poll Question / Title</label>
              <input
                type="text"
                placeholder="e.g., Do you support the proposed regional health service staffing budget reforms?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={150}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs font-semibold focus:outline-none focus:border-brand-gold text-slate-800"
              />
              <span className="text-[10px] text-slate-400 font-mono text-right block">{title.length}/150 Chars</span>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold uppercase text-slate-500 font-mono tracking-wider">Background Context / Description</label>
              <textarea
                placeholder="Provide helpful non-partisan factual details summarizing the bill, election margins, or executive decisions..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={4}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs font-medium focus:outline-none focus:border-brand-gold text-slate-800"
              />
              <span className="text-[10px] text-slate-400 font-mono text-right block">{description.length}/500 Chars</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-xs font-bold uppercase text-slate-500 font-mono tracking-wider">Category Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-xs rounded-lg p-2.5 font-bold focus:outline-none"
                >
                  {["Election", "Approval Rating", "Policy", "Leadership", "Referendum", "International", "Local Government"].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold uppercase text-slate-500 font-mono tracking-wider">Poll format choice</label>
                <select
                  value={pollType}
                  onChange={(e) => setPollType(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-xs rounded-lg p-2.5 font-bold focus:outline-none"
                >
                  <option value="single_choice">Single Candidate Choice</option>
                  <option value="yes_no">Yes / No Panel options</option>
                  <option value="multiple_choice">Multiple Choice Selections</option>
                  <option value="approval_rating">Aggregate approval score range</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-xs font-bold uppercase text-slate-500 font-mono tracking-wider">Target Nation</label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-xs rounded-lg p-2.5 font-bold focus:outline-none"
                >
                  {["Global", "Kenya", "USA", "UK", "South Africa", "Nigeria", "France", "Germany"].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold uppercase text-slate-500 font-mono tracking-wider">Deadline Closes At (Optional)</label>
                <input
                  type="date"
                  value={closesAt}
                  onChange={(e) => setClosesAt(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-xs rounded-lg p-2.5 font-bold focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              onClick={handleNextStep}
              className="bg-[#0A1628] hover:bg-brand-gold hover:text-[#0A1628] text-white font-black text-xs px-6 py-2.5 rounded shadow inline-flex items-center gap-1"
            >
              <span>Add Options</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: ADD OPTIONS */}
      {step === 2 && (
        <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-100 shadow-sm space-y-6 text-left">
          <div className="flex items-center justify-between border-b border-slate-50 pb-3">
            <h2 className="text-xl font-extrabold text-[#0A1628] flex items-center gap-1.5">
              <UserPlus className="w-5 h-5 text-[#F5A623]" />
              Step 2: Candidate & Choice Formations
            </h2>
            <button
              onClick={handleAddField}
              disabled={options.length >= 10}
              className="bg-slate-50 hover:bg-slate-100 border text-slate-700 font-bold text-xs px-3 py-1.5 rounded flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Option Field
            </button>
          </div>

          <div className="space-y-4">
            {options.map((opt, idx) => (
              <div key={idx} className="p-4 bg-slate-50/50 rounded-xl border border-slate-100 relative space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-slate-400 text-xs">Ballots Choice Option #0{idx + 1}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openSearchModal(idx)}
                      className="bg-[#0A1628] hover:bg-slate-800 text-white font-bold text-[10px] px-2.5 py-1 rounded inline-flex items-center gap-1"
                    >
                      <Search className="w-3 h-3 text-brand-gold" /> Auto-fill Leader
                    </button>
                    {options.length > 2 && (
                      <button
                        onClick={() => handleRemoveField(idx)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded transition"
                      >
                        <Trash className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-[10px] uppercase font-bold text-slate-400">Option Label / Name</label>
                    <input
                      type="text"
                      placeholder="e.g., President John Doe"
                      value={opt.label}
                      onChange={(e) => handleOptionChange(idx, "label", e.target.value)}
                      className="w-full bg-white border border-slate-200 text-xs rounded p-2 text-slate-800 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] uppercase font-bold text-slate-400">Legislative Party Affiliation (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g., Conservative Party"
                      value={opt.party}
                      onChange={(e) => handleOptionChange(idx, "party", e.target.value)}
                      className="w-full bg-white border border-slate-200 text-xs rounded p-2 text-slate-805 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-[10px] uppercase font-bold text-slate-400">Brief Statement/Role Description</label>
                    <input
                      type="text"
                      placeholder="e.g., Incumbent Prime Minister advocating tax subsidization reviews"
                      value={opt.description}
                      onChange={(e) => handleOptionChange(idx, "description", e.target.value)}
                      className="w-full bg-white border border-slate-200 text-xs rounded p-2 text-slate-805"
                    />
                  </div>

                  <div className="space-y-1 flex items-center gap-3">
                    <div className="flex-1">
                      <label className="block text-[10px] uppercase font-bold text-slate-400">Choice Profile Pic</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handlePhotoUpload(idx, e)}
                        className="w-full text-slate-500 text-[10px] file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[10px] file:font-semibold file:bg-slate-100 file:text-slate-800"
                      />
                    </div>
                    {opt.photo_url && (
                      <img src={getPerfectPoliticianImage(opt.label || "Option", opt.photo_url)} className="w-10 h-10 rounded-full border border-slate-200 object-cover" />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-4 flex items-center justify-between border-t border-slate-50">
            <button
              onClick={() => setStep(1)}
              className="bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs px-5 py-2 rounded inline-flex items-center gap-1 border"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
            <button
              onClick={handleNextStep}
              className="bg-[#0A1628] hover:bg-brand-gold hover:text-[#0A1628] text-white font-black text-xs px-6 py-2 rounded shadow inline-flex items-center gap-1"
            >
              <span>Preview Poll</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: PREVIEW & PUBLISH */}
      {step === 3 && (
        <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-100 shadow-sm space-y-6 text-left">
          <div className="border-b border-slate-50 pb-3">
            <h2 className="text-xl font-extrabold text-[#0A1628] flex items-center gap-1.5 font-heading">
              <Sparkles className="w-5 h-5 text-[#F5A623] fill-brand-gold" />
              Step 3: Verification & Broadcast Release
            </h2>
            <p className="text-[11px] text-slate-550 mt-1">
              Verify your questions, constraints and candidates list prior to worldwide publishing. 
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-[#0A1628] text-white space-y-3 shadow">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="bg-[#F5A623] text-black font-mono font-black border uppercase px-2 py-0.5 rounded text-[9px]">
                {category}
              </span>
              <span>Nation: {country}</span>
            </div>
            <h3 className="font-extrabold text-lg md:text-xl">{title || "Untitled Poll Question"}</h3>
            <p className="text-xs text-slate-300">{description || "No factual description parameters offered."}</p>
            <div className="pt-3 border-t border-white/5 space-y-1">
              <span className="block text-[8px] font-bold uppercase text-slate-400 font-mono tracking-wider">Ballot options list</span>
              <div className="space-y-2">
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2.5 bg-white/5 p-2 rounded text-xs border border-white/5">
                    {opt.photo_url ? (
                      <img src={getPerfectPoliticianImage(opt.label || "Option", opt.photo_url)} className="w-8 h-8 rounded-full border border-white/10 object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center font-bold font-mono">
                        #
                      </div>
                    )}
                    <div>
                      <span className="font-black text-slate-100 block">{opt.label || `Option #${i+1}`}</span>
                      <span className="text-[10px] text-slate-400 block">{opt.description || "No sub-caption provided"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-4 flex items-center justify-between border-t border-slate-50">
            <button
              onClick={() => setStep(2)}
              className="bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs px-5 py-2 rounded inline-flex items-center gap-1 border"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back Adjust</span>
            </button>
            <button
              onClick={handlePublishPoll}
              disabled={loading}
              className="bg-[#F5A623] hover:bg-[#F5A623]/90 text-[#0A1628] font-black text-xs px-8 py-3 rounded-lg shadow-md transition transform hover:scale-[1.03] inline-flex items-center gap-1"
            >
              <span>{loading ? "Releasing..." : "Publish Live Poll Now"}</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* AUTOFILL MODAL SELECTIONS */}
      {showSearchModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden border p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-extrabold text-[#0A1628] text-sm font-mono uppercase tracking-wider">Select Pre-Seeded Representative</h3>
              <button onClick={() => setShowSearchModal(false)} className="text-slate-400 hover:text-slate-750 font-bold text-xs">
                Close
              </button>
            </div>

            <input
              type="text"
              placeholder="Search leaders by spelling..."
              value={polSearchQuery}
              onChange={(e) => setPolSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs focus:outline-none"
            />

            <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
              {filteredPoliticians.map((pol) => (
                <div
                  key={pol.id}
                  onClick={() => selectPoliticianToPreFill(pol)}
                  className="p-2.5 bg-slate-50 hover:bg-brand-gold/15 rounded-lg border border-slate-150 cursor-pointer flex items-center gap-3 transition text-left"
                >
                  <img src={getPerfectPoliticianImage(pol.full_name, pol.photo_url)} className="w-8 h-8 rounded-full border shrink-0 object-cover" />
                  <div>
                    <span className="font-black text-xs text-slate-800 block">{pol.full_name}</span>
                    <span className="text-[10px] text-slate-500 block">{pol.title} · {pol.party}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
