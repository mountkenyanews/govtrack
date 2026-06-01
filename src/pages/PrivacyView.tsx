/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Shield, Eye, Lock, FileText, Scale, Mail, Info } from "lucide-react";

export const PrivacyView: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8 text-left">
      
      {/* Page Header */}
      <div className="border-b border-slate-100 pb-4">
        <h1 className="text-3xl font-black text-[#0A1628] tracking-tight">Citizen Data Protection & Privacy Rights</h1>
        <p className="text-xs text-slate-500 font-medium font-mono uppercase">Compliance with the Kenya Data Protection Act, 2019</p>
      </div>

      {/* Compliance Hero Alert */}
      <section className="bg-[#0A1628] text-white p-6 md:p-8 rounded-2xl border border-slate-800 space-y-3 relative overflow-hidden shadow">
        <div className="flex items-center gap-2">
          <span className="p-1 rounded bg-[#F5A623] text-[#0A1628] inline-block">
            <Shield className="w-4 h-4" />
          </span>
          <span className="text-[#F5A623] font-bold font-mono tracking-widest text-[10px] uppercase">Legal Compliance Status</span>
        </div>
        <h2 className="text-xl md:text-2xl font-black leading-tight">Your Voice is Private. Your Data is Protected.</h2>
        <p className="text-xs text-slate-350 leading-relaxed font-medium">
          GovTrack operates as an independent civic platform. We are strictly aligned with the <strong>Kenya Data Protection Act, 2019</strong> and global privacy standards. We process citizen data under the core principles of lawfulness, minimization, mathematical integrity, and absolute transparency.
        </p>
      </section>

      {/* Key Rights Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { 
            label: "1. Data Minimization", 
            val: "We collect only what is strictly necessary to verify voting eligibility and prevent duplicate ballots.", 
            icon: Eye 
          },
          { 
            label: "2. No Third-Party Sharing", 
            val: "Your personal data is never sold, shared, or disclosed to political campaigns, parties, or advertisers.", 
            icon: Lock 
          },
          { 
            label: "3. Right to Be Forgotten", 
            val: "You have the full right to delete your profile. Deletion immediately purges your personal info and anonymizes votes.", 
            icon: Scale 
          }
        ].map((item, idx) => {
          const Icon = item.icon;
          return (
            <div key={idx} className="bg-white border border-slate-150 rounded-xl p-5 shadow-sm space-y-2">
              <span className="p-2.5 rounded-lg bg-slate-50 text-[#F5A623] inline-block">
                <Icon className="w-5 h-5" />
              </span>
              <h3 className="font-extrabold text-slate-900 text-xs font-mono uppercase tracking-wider">{item.label}</h3>
              <p className="text-xs text-slate-500 leading-normal">{item.val}</p>
            </div>
          );
        })}
      </div>

      {/* Detailed Legal Disclosures */}
      <div className="space-y-6 bg-white border border-slate-150 rounded-xl p-6 md:p-8 shadow-sm">
        
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[#0A1628]">
            <FileText className="w-4 h-4" />
            <h3 className="font-extrabold text-xs uppercase font-mono tracking-wider">Detailed Privacy Disclosures & Consent Framework</h3>
          </div>
          <div className="w-full h-px bg-slate-100"></div>
        </div>

        <div className="space-y-6 text-xs text-slate-600 leading-relaxed">
          {/* Section 1 */}
          <div className="space-y-1">
            <h4 className="font-black text-slate-800 text-[11px] uppercase tracking-wide">A. Personal Data We Collect</h4>
            <ul className="list-disc list-inside pl-2 space-y-1">
              <li><strong>For Registered Citizens:</strong> Username, email address, password hashes, regional location, and verified voting log histories.</li>
              <li><strong>For Guest Voters (Anonymous):</strong> Cryptographically-hashed IP addresses and browser user-agent tokens.</li>
            </ul>
          </div>

          {/* Section 2 */}
          <div className="space-y-1">
            <h4 className="font-black text-slate-800 text-[11px] uppercase tracking-wide">B. Lawful Basis for Processing</h4>
            <p>
              We process your personal information under two distinct legal justifications defined by the Act:
            </p>
            <ul className="list-disc list-inside pl-2 space-y-1">
              <li><strong>Consent:</strong> When you voluntarily register an account or intentionally cast an opinion ballot.</li>
              <li><strong>Legitimate Interests:</strong> Temporary hashing of client IP addresses is processed to defend against coordinate sybil attacks (duplicate voting spam) to maintain fair statistical poll outcomes.</li>
            </ul>
          </div>

          {/* Section 3 */}
          <div className="space-y-1">
            <h4 className="font-black text-slate-800 text-[11px] uppercase tracking-wide">C. Your Legal Rights & Choices</h4>
            <p>
              Under the Data Protection Act, you possess explicit, enforceable rights regarding your files:
            </p>
            <ul className="list-disc list-inside pl-2 space-y-1">
              <li><strong>Right of Access & Rectification:</strong> You can download or edit your profile metadata directly from your dashboard at any time.</li>
              <li><strong>Right of Erasure (Deletion):</strong> You can trigger a permanent account deletion request. Upon activation, your account profile is permanently deleted, and your votes are fully anonymized.</li>
              <li><strong>Right to Object to Processing:</strong> You can choose to withdraw your consent instantly by closing your account.</li>
            </ul>
          </div>

          {/* Section 4 */}
          <div className="space-y-1">
            <h4 className="font-black text-slate-800 text-[11px] uppercase tracking-wide">D. Cookies & Browser Storage</h4>
            <p>
              We utilize browser cookies and local storage (such as <code>govtrack_guest_votes</code>) to persist session authentication and to store local guest voting records. We do not use third-party tracking, profiling, or behavioral advertising cookies.
            </p>
          </div>
        </div>
      </div>

      {/* DPO / Action banner */}
      <section className="bg-slate-50 p-6 rounded-xl border border-slate-150 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
        <div className="space-y-1.5 max-w-xl text-left">
          <div className="flex items-center gap-1.5 text-slate-900 font-bold font-mono text-[11px] uppercase">
            <Mail className="w-4 h-4 text-[#F5A623]" />
            <span>Contact Our Data Protection Officer (DPO)</span>
          </div>
          <p className="text-slate-500 leading-normal">
            For questions regarding your data, to submit a data rectification request, or to raise a compliance query under the Office of the Data Protection Commissioner (ODPC) of Kenya, contact our dedicated legal desk.
          </p>
        </div>
        <a 
          href="mailto:privacy@govtrack.co.ke"
          className="bg-[#0A1628] hover:bg-[#F5A623] text-white hover:text-[#0A1628] font-bold text-[11px] font-mono uppercase tracking-wider py-3 px-5 rounded-lg inline-flex items-center justify-center gap-1.5 transition whitespace-nowrap self-start md:self-center"
        >
          Email privacy@govtrack.co.ke
        </a>
      </section>

    </div>
  );
};
