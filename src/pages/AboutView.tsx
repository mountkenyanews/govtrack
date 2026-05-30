/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Shield, Eye, Flame, Award, Globe, Users } from "lucide-react";

export const AboutView: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8 text-left">
      
      <div className="border-b border-slate-100 pb-4">
        <h1 className="text-3xl font-black text-[#0A1628] tracking-tight">Neutral Democratic Transparency</h1>
        <p className="text-xs text-slate-500 font-medium font-mono uppercase">Platform values and editorial standards</p>
      </div>

      <section className="bg-[#0A1628] text-white p-6 md:p-8 rounded-2xl border border-slate-800 space-y-3 relative overflow-hidden shadow">
        <span className="text-brand-gold font-bold font-mono tracking-widest text-[10px] uppercase">About GovTrack</span>
        <h2 className="text-xl md:text-2.5xl font-black leading-tight">"Your Voice. Their Accountability."</h2>
        <p className="text-xs text-slate-350 leading-relaxed font-semibold">
          GovTrack is an aggregate citizen opinion tracking indexed directory, delivering granular datasets on ongoing debates, bills, leadership ratings, and candidate stands. We serve no political interests. Our only mission is structural, mathematical transparency.
        </p>
      </section>

      {/* Grid of values */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: "Aggregate Neutrality", val: "We formulate opinions without bias. No editorial changes block natural balance ratios.", icon: Shield },
          { label: "IP Anti-Spam Blacklists", val: "Automatic duplicate checking maps IP parameters anonymously to avoid ballot manipulation.", icon: Users },
          { label: "Real Profile Avatars", val: "Mandatory official photo references let constituents inspect candidates quickly.", icon: Award }
        ].map((item, idx) => {
          const Icon = item.icon;
          return (
            <div key={idx} className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm space-y-2">
              <span className="p-2.5 rounded-lg bg-slate-50 text-brand-gold inline-block">
                <Icon className="w-5 h-5" />
              </span>
              <h3 className="font-extrabold text-slate-900 text-xs font-mono uppercase tracking-wider">{item.label}</h3>
              <p className="text-xs text-slate-500 leading-normal">{item.val}</p>
            </div>
          );
        })}
      </div>

      <section className="bg-slate-50 p-5 rounded-xl border border-slate-150 space-y-3 text-xs leading-relaxed text-slate-600">
        <h3 className="font-bold text-[#0A1628] uppercase font-mono tracking-wider text-[11px]">Constituent Editorial Integrity Code</h3>
        <p>
          Unlike standard internet platforms, any citizen can draft state-level debates. Once produced, our system moderators review parameters merely to prevent defamatory or abusive content. We track and log all audit events transparently in our public directory.
        </p>
      </section>

    </div>
  );
};
