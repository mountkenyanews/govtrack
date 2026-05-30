/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { HelpCircle, ChevronDown, ChevronUp } from "lucide-react";

export const HowItWorksView: React.FC = () => {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const faqs = [
    {
      q: "How does GovTrack secure surveys against duplicate voting?",
      a: "Our system combines browser cookies with unique IP hash tracking identifiers. This blocks double submissions instantly on the backend database level while never recording your personal address or compromising voting anonymity."
    },
    {
      q: "What defines a 'Verified' Blue Ribbon status on representative cards?",
      a: "Registered representatives, parliamentary researchers, or certified civic journalists can submit official credential records. Once verified, their profile lists a verify-badge and their drafted polls are published directly bypassing moderator scheduled queues."
    },
    {
      q: "Am I permitted to embed GovTrack polling widgets onto external websites?",
      a: "Absolutely! Under every active poll, we specify a visual 'Embed' option containing pre-formed iframe code snippets. You are free to copy these into news articles, forums, or community sheets."
    },
    {
      q: "How often do active stands refresh during heated elections?",
      a: "Our dashboard schedules 5-second recurring micro-queries. Active page sessions sync in real time automatically so you see standings adjust instantly during televised leadership debates."
    }
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6 text-left">
      
      <div className="border-b border-slate-100 pb-4 flex items-center gap-2">
        <HelpCircle className="w-8 h-8 text-brand-gold shrink-0" />
        <div>
          <h1 className="text-3xl font-black text-[#0A1628] tracking-tight">How It Works</h1>
          <p className="text-xs text-slate-550 font-medium font-mono uppercase">Mechanisms of aggregate public opinion</p>
        </div>
      </div>

      <div className="space-y-4">
        {faqs.map((faq, idx) => {
          const isOpen = openIdx === idx;
          return (
            <div 
              key={idx}
              className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden"
            >
              <button
                onClick={() => setOpenIdx(isOpen ? null : idx)}
                className="w-full p-4 text-left font-bold text-slate-900 text-xs md:text-sm flex items-center justify-between hover:bg-slate-50/50"
              >
                <span>{faq.q}</span>
                {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4" /> }
              </button>
              {isOpen && (
                <div className="px-4 pb-4 text-xs text-slate-500 leading-relaxed border-t border-slate-50 pt-2.5">
                  {faq.a}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
