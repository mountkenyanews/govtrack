/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Party, Politician } from "../types";
import { api } from "../utils/api";
import { PoliticianAvatar, ApprovalRingChart } from "../components/Shared";
import { 
  ArrowLeft, 
  MapPin, 
  Calendar, 
  Award, 
  ShieldAlert, 
  Flame, 
  ChevronRight,
  Sparkles,
  Users
} from "lucide-react";

interface PartyProfileViewProps {
  partyId: number;
  onNavigate: (path: string) => void;
}

export const PartyProfileView: React.FC<PartyProfileViewProps> = ({ 
  partyId, 
  onNavigate 
}) => {
  const [loading, setLoading] = useState(true);
  const [party, setParty] = useState<Party | null>(null);
  const [associatedPoliticians, setAssociatedPoliticians] = useState<Politician[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const fetchPartyProfile = async () => {
      try {
        setLoading(true);
        const res = await api.getPartyDetail(partyId);
        setParty(res.party);
        setAssociatedPoliticians(res.politicians);
      } catch (err) {
        console.error("Party profile load failed", err);
        setErrorMsg("The requested political party profile record could not be found.");
      } finally {
        setLoading(false);
      }
    };

    fetchPartyProfile();
  }, [partyId]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center space-y-4">
        <div className="w-12 h-12 border-4 border-[#F5A623] border-t-[#0A1628] rounded-full animate-spin mx-auto"></div>
        <p className="font-bold text-slate-500 font-mono animate-pulse">Syncing political coalition charter files...</p>
      </div>
    );
  }

  if (!party) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <h3 className="font-extrabold text-slate-800">Party Profile Not Found</h3>
        <p className="text-xs text-slate-500">{errorMsg || "The political organization records could not be resolved."}</p>
        <button onClick={() => onNavigate("/politicians")} className="bg-[#0A1628] text-white text-xs font-bold px-4 py-2 rounded">
          Back to Directory
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      
      {/* Back CTA */}
      <button 
        onClick={() => onNavigate("/politicians")}
        className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-[#0A1628] font-bold transition-colors mb-2"
        id="party-back-btn"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Directory
      </button>

      {/* Main Party Profile Header Card */}
      <section 
        className="text-white p-6 md:p-8 rounded-2xl flex flex-col md:flex-row items-center md:items-start gap-6 relative shadow-md overflow-hidden border border-slate-800"
        style={{ 
          backgroundColor: "#0A1628",
          boxShadow: `0 8px 30px -5px ${party.color}25`
        }}
      >
        {/* Glow Ambient Corner */}
        <div 
          className="absolute -top-12 -right-12 w-64 h-64 rounded-full blur-[100px] pointer-events-none opacity-25"
          style={{ backgroundColor: party.color || "#3b82f6" }}
        />

        {/* Emblem Representation Container */}
        <div className="relative">
          <img 
            src={party.logo_url} 
            alt={`${party.name} Emblem`}
            className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl border-4 border-white/10 bg-slate-900 object-cover shadow-lg"
            onError={(e) => {
              // fallback if network block
              const target = e.target as HTMLImageElement;
              target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(party.abbreviation)}&background=${party.color.replace("#", "")}&color=ffffff&bold=true&size=128`;
            }}
          />
          <span 
            className="absolute -bottom-2 -right-2 px-2.5 py-0.5 rounded text-[10px] font-black font-mono tracking-wider shadow-sm uppercase text-white border border-white/10"
            style={{ backgroundColor: party.color || "#3b82f6" }}
          >
            {party.abbreviation}
          </span>
        </div>

        {/* Info Column */}
        <div className="text-center md:text-left flex-1 space-y-4">
          <div>
            <span className="text-xs text-brand-gold uppercase tracking-widest font-mono font-black flex items-center justify-center md:justify-start gap-1">
              <Sparkles className="w-3.5 h-3.5" /> Certified Political Organization Profile
            </span>
            <h1 className="text-2xl md:text-4.5xl font-black tracking-tight leading-none mt-1">
              {party.name}
            </h1>
            <p className="text-sm text-slate-350 font-bold mt-2">
              National Alliance Code: <span className="font-mono text-white tracking-wider font-extrabold">{party.abbreviation}</span> · Action Jurisdiction: <span className="text-brand-gold">{party.country}</span>
            </p>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
            {party.description}
          </p>

          {/* Bullet points dashboard */}
          <div className="grid grid-cols-1 gap-y-2.5 pt-2 text-xs border-t border-white/5 max-w-2xl">
            <div className="flex items-start gap-2 text-slate-300">
              <Calendar className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <span>Founded: <strong className="text-white">{party.founded_year || "2013"}</strong></span>
            </div>
            <div className="flex items-start gap-2 text-slate-300">
              <Award className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <span className="leading-tight">Ideology: <strong className="text-white">{party.ideology || "Advocacy"}</strong></span>
            </div>
            <div className="flex items-start gap-2 text-slate-300">
              <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <span className="leading-tight">Headquarters: <strong className="text-white">{party.headquarters || "Registered HQ Offices"}</strong></span>
            </div>
            <div className="flex items-start gap-2 text-slate-300">
              <Users className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <span className="leading-tight">President/Chair: <strong className="text-white">{party.chairperson || "Party Secretariat Panel"}</strong></span>
            </div>
          </div>
        </div>

        {/* High-Contrast Indicators */}
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center shadow-lg w-full md:w-36 text-center select-none shrink-0 self-center">
          <span className="text-3xl font-black font-mono" style={{ color: party.color }}>
            {associatedPoliticians.length}
          </span>
          <span className="block text-[8px] uppercase font-bold text-slate-400 font-mono tracking-wider mt-1 leading-none">
            Monitored Members
          </span>
          <div 
            className="w-12 h-1 rounded-full mt-3 block"
            style={{ backgroundColor: party.color }}
          />
        </div>
      </section>

      {/* Associated Members Section */}
      <div className="space-y-4 pt-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-1.5">
              <Users className="w-5 h-5 text-slate-500" /> Member Representatives Directory
            </h2>
            <p className="text-[11px] text-slate-400">Tracked general approval metrics and profiles of public officers representing this coalition.</p>
          </div>
          <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
            Count: {associatedPoliticians.length}
          </span>
        </div>

        {associatedPoliticians.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {associatedPoliticians.map((pol) => (
              <div 
                key={pol.id}
                onClick={() => onNavigate(`/politicians/${pol.id}`)}
                className="bg-white rounded-xl border border-slate-100 p-5 shadow-xs flex flex-col justify-between h-full items-center text-center hover:shadow-md hover:border-slate-200/80 transition cursor-pointer relative group"
              >
                {/* Visual Party Accent Strip */}
                <div 
                  className="absolute top-0 left-0 right-0 h-1 rounded-t-xl"
                  style={{ backgroundColor: party.color }}
                />

                <div className="flex flex-col items-center">
                  <div className="relative mt-2">
                    <PoliticianAvatar 
                      name={pol.full_name} 
                      photo_url={pol.photo_url} 
                      party_color={pol.party_color} 
                      size="lg" 
                      showTooltip={false} 
                    />
                  </div>

                  {/* Body labels */}
                  <div className="mt-4">
                    <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 font-mono">
                      {pol.country}
                    </span>
                    <h3 className="font-extrabold text-slate-905 leading-tight text-sm mt-0.5 group-hover:text-[#0A1628] transition-colors">
                      {pol.full_name}
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-1 font-semibold truncate max-w-[170px]" title={pol.title}>
                      {pol.title}
                    </p>
                    <span 
                      className="inline-block text-[9px] font-bold px-2 py-0.25 rounded mt-2 text-white/95"
                      style={{ backgroundColor: party.color }}
                    >
                      {party.abbreviation}
                    </span>
                  </div>
                </div>

                {/* Performance indicators */}
                <div className="mt-5 pt-4 border-t border-slate-50 w-full flex items-center justify-around">
                  <div className="flex items-center gap-1.5 text-left">
                    <ApprovalRingChart approvalPercent={pol.approval_rating} size={36} />
                    <div>
                      <span className="block text-[8px] text-slate-400 font-bold uppercase tracking-widest font-mono">Approval</span>
                      <span className="text-xs font-black font-mono text-slate-800">{pol.approval_rating}%</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="block text-[8px] text-slate-400 font-bold uppercase tracking-widest font-mono">Appearances</span>
                    <span className="text-[11px] font-mono font-bold text-slate-700 inline-flex items-center gap-0.5">
                      <Flame className="w-3 h-3 text-orange-500" />
                      {pol.total_poll_appearances} Polls
                    </span>
                  </div>
                </div>

                <div className="mt-4 w-full">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigate(`/politicians/${pol.id}`);
                    }}
                    className="w-full bg-slate-50 hover:bg-[#0A1628] hover:text-white text-slate-700 font-bold text-xs py-1.5 rounded border border-slate-250/60 transition flex items-center justify-center gap-1"
                  >
                    <span>View Dossier</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-slate-50 rounded-xl p-16 border border-dashed text-center border-slate-200">
            <span className="text-3xl text-slate-300 block">👤</span>
            <h3 className="font-extrabold text-slate-705 mt-2">No Member Legislators Tracked</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">There are currently no representative records matching this organization.</p>
            <button 
              onClick={() => onNavigate("/politicians")}
              className="mt-4 text-xs font-bold text-white bg-[#0A1628] px-4 py-2 rounded shadow-sm hover:underline"
            >
              Browse Directory
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
