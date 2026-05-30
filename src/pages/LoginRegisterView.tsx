/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { api } from "../utils/api";
import { User } from "../types";
import { Lock, Mail, User as UserIcon, CheckCircle, Shield, Upload, AlertCircle } from "lucide-react";

interface LoginRegisterViewProps {
  onNavigate: (path: string) => void;
}

export const LoginRegisterView: React.FC<LoginRegisterViewProps> = ({ onNavigate }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const url = await api.uploadFile(file);
      setAvatarUrl(url);
    } catch (err: any) {
      setErrorMsg(err.message || "Avatar filing failed.");
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setLoading(true);

    try {
      if (isLogin) {
        // Sign In
        const res = await api.login({ email, password });
        setSuccessMsg(`Welcome back, ${res.user.display_name}!`);
        setTimeout(() => {
          onNavigate("/dashboard");
        }, 1200);
      } else {
        // Sign Up
        if (!displayName.trim() || displayName.length < 3) {
          setErrorMsg("Display name must consist of 3 or more characters.");
          setLoading(false);
          return;
        }
        const res = await api.register({
          email,
          password,
          display_name: displayName,
          avatar_url: avatarUrl || undefined
        });
        setSuccessMsg(`Account successfully generated! Welcome, ${res.user.display_name}.`);
        setTimeout(() => {
          onNavigate("/dashboard");
        }, 1200);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Credentials authentication check failed.");
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16 text-left">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-md overflow-hidden p-6 md:p-8 space-y-6">
        
        {/* Toggle selectors */}
        <div className="flex border-b">
          <button
            onClick={() => {
              setIsLogin(true);
              setErrorMsg("");
            }}
            className={`flex-1 pb-3 text-xs font-black uppercase tracking-wider ${
              isLogin ? "border-b-2 border-[#0A1628] text-slate-900" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => {
              setIsLogin(false);
              setErrorMsg("");
            }}
            className={`flex-1 pb-3 text-xs font-black uppercase tracking-wider ${
              !isLogin ? "border-b-2 border-[#0A1628] text-slate-900" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            Create Account
          </button>
        </div>

        <div className="text-center space-y-1">
          <h2 className="text-xl font-black text-[#0A1628]">GovTrack Citizen Registry</h2>
          <p className="text-[10px] text-slate-450 font-bold uppercase tracking-wide">
            {isLogin ? "Enter your accounts metadata" : "Sign up for non-partisan opinion tracking"}
          </p>
        </div>

        {errorMsg && (
          <div className="bg-red-50 text-red-700 p-3 text-xs font-bold rounded-lg border border-red-150 flex items-center gap-1.5">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-50 text-emerald-800 p-3 text-xs font-bold rounded-lg border border-emerald-150 flex items-center gap-1.5">
            <CheckCircle className="w-5 h-5 shrink-0 text-emerald-500" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Input forms */}
        <form onSubmit={handleAuthSubmit} className="space-y-4">
          {!isLogin && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="block text-[10px] uppercase font-bold text-slate-400 font-mono">Full Surname / Username</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <UserIcon className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Jane Doe"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-brand-gold text-slate-800 font-semibold"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] uppercase font-bold text-slate-400 font-mono">Citizen Profile Photo</label>
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="text-slate-500 text-[10px] file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[10px] file:font-semibold file:bg-slate-100 file:text-slate-800"
                  />
                  {avatarUrl && (
                    <img src={avatarUrl} className="w-8 h-8 rounded-full border border-slate-200 object-cover" />
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-[10px] uppercase font-bold text-slate-400 font-mono">Citizen E-Mail Address</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Mail className="w-4 h-4" />
              </span>
              <input
                type="email"
                required
                placeholder="e.g. citizen@govtrack.org"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-brand-gold text-slate-800 font-semibold"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-[10px] uppercase font-bold text-slate-400 font-mono">Authentication Password</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </span>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-brand-gold text-slate-800 font-semibold"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#0A1628] hover:bg-brand-gold hover:text-[#0A1628] text-white font-black text-xs py-2.5 rounded-lg shadow transition"
          >
            {loading ? "Authenticating ledger..." : isLogin ? "Authenticate Access" : "Generate Free Profile"}
          </button>
        </form>

        <div className="pt-4 border-t border-slate-100 flex items-center gap-2 text-[10px] text-slate-400 justify-center">
          <Shield className="w-4 h-4 text-brand-gold" />
          <span>Anonymous vote hashing protocol active.</span>
        </div>
      </div>
    </div>
  );
};
