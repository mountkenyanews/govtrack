/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { User, Poll, Politician, Comment, NewsItem, PlatformStats, AppNotification, Party } from "../types";

const API_BASE = ""; // Relative paths fit our setup perfectly!

// Token helpers
export function getSavedToken(): string | null {
  return sessionStorage.getItem("govtrack_token");
}

export function getSavedUser(): User | null {
  const data = sessionStorage.getItem("govtrack_user");
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function saveSession(user: User, token: string) {
  sessionStorage.setItem("govtrack_token", token);
  sessionStorage.setItem("govtrack_user", JSON.stringify(user));
}

export function clearSession() {
  sessionStorage.removeItem("govtrack_token");
  sessionStorage.removeItem("govtrack_user");
}

// Global Custom Event to broadcast session changes to components instantly!
export function broadcastSessionChange() {
  window.dispatchEvent(new Event("govtrack_session_change"));
}

// Global Custom Event to broadcast platform settings changes instantly!
export function broadcastSettingsChange() {
  window.dispatchEvent(new Event("govtrack_settings_change"));
}

async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = getSavedToken();
  const headers = {
    "Content-Type": "application/json",
    "Pragma": "no-cache",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Expires": "0",
    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  } as HeadersInit;

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}

export const api = {
  // Auth
  async register(data: any): Promise<{ user: User; token: string }> {
    const res = await apiFetch("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
    saveSession(res.user, res.token);
    broadcastSessionChange();
    return res;
  },

  async login(data: any): Promise<{ user: User; token: string }> {
    const res = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    });
    saveSession(res.user, res.token);
    broadcastSessionChange();
    return res;
  },

  async getMe(): Promise<User> {
    const res = await apiFetch("/api/auth/me");
    sessionStorage.setItem("govtrack_user", JSON.stringify(res.user));
    broadcastSessionChange();
    return res.user;
  },

  async updateProfile(data: any): Promise<User> {
    const res = await apiFetch("/api/auth/profile", {
      method: "PUT",
      body: JSON.stringify(data),
    });
    sessionStorage.setItem("govtrack_user", JSON.stringify(res.user));
    broadcastSessionChange();
    return res.user;
  },

  // Polls
  async getPolls(filters: {
    search?: string;
    category?: string;
    status?: string;
    country?: string;
    poll_type?: string;
    sort?: string;
  } = {}): Promise<Poll[]> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params.append(k, v);
    });
    const query = params.toString() ? `?${params.toString()}` : "";
    return apiFetch(`/api/polls${query}`);
  },

  async getPoll(id: number): Promise<Poll> {
    return apiFetch(`/api/polls/${id}`);
  },

  async getUserVotedState(pollId: number, userId?: number): Promise<{ voted: boolean; option_ids?: number[] }> {
    const query = userId ? `?user_id=${userId}` : "";
    return apiFetch(`/api/polls/${pollId}/user_voted${query}`);
  },

  async castVote(pollId: number, option_ids: number[], user_id?: number, device_type?: string): Promise<{ success: boolean; poll: Poll }> {
    return apiFetch(`/api/polls/${pollId}/vote`, {
      method: "POST",
      body: JSON.stringify({ option_ids, user_id, device_type: device_type || "Desktop" }),
    });
  },

  // Comments
  async getComments(pollId: number): Promise<Comment[]> {
    return apiFetch(`/api/polls/${pollId}/comments`);
  },

  async postComment(pollId: number, user_id: number, content: string, parent_id?: number | null): Promise<Comment> {
    return apiFetch(`/api/polls/${pollId}/comments`, {
      method: "POST",
      body: JSON.stringify({ user_id, content, parent_id }),
    });
  },

  async likeComment(commentId: number): Promise<Comment> {
    return apiFetch(`/api/comments/${commentId}/like`, { method: "POST" });
  },

  // Politicians
  async getPoliticians(filters: {
    search?: string;
    country?: string;
    party?: string;
    sort?: string;
  } = {}): Promise<Politician[]> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params.append(k, v);
    });
    const query = params.toString() ? `?${params.toString()}` : "";
    return apiFetch(`/api/politicians${query}`);
  },

  async getPoliticianDetail(id: number): Promise<{ politician: Politician; polls: Poll[] }> {
    return apiFetch(`/api/politicians/${id}`);
  },

  // Parties
  async getParties(filters: { country?: string } = {}): Promise<Party[]> {
    const params = new URLSearchParams();
    if (filters.country) params.append("country", filters.country);
    const query = params.toString() ? `?${params.toString()}` : "";
    return apiFetch(`/api/parties${query}`);
  },

  async getPartyDetail(id: number): Promise<{ party: Party; politicians: Politician[] }> {
    return apiFetch(`/api/parties/${id}`);
  },

  // Developments
  async getDevelopments(politicianId: number, includePending: boolean = false): Promise<any[]> {
    return apiFetch(`/api/politicians/${politicianId}/developments?include_pending=${includePending}`);
  },
  
  async suggestDevelopment(politicianId: number, data: any): Promise<any> {
    return apiFetch(`/api/politicians/${politicianId}/developments/suggest`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async adminDraftDevelopments(politicianId: number, context: string): Promise<any> {
    return apiFetch(`/api/admin/politicians/${politicianId}/draft_developments`, {
      method: "POST",
      body: JSON.stringify({ context }),
    });
  },

  async adminSaveBulkDevelopments(politicianId: number, developments: any[]): Promise<any> {
    return apiFetch(`/api/admin/politicians/${politicianId}/developments/bulk`, {
      method: "POST",
      body: JSON.stringify({ developments }),
    });
  },

  async adminAddDevelopment(politicianId: number, data: any): Promise<any> {
    return apiFetch(`/api/admin/politicians/${politicianId}/developments`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async adminGetPendingDevelopments(): Promise<any[]> {
    return apiFetch(`/api/admin/developments/pending`);
  },

  async adminApproveDevelopment(id: number): Promise<any> {
    return apiFetch(`/api/admin/developments/${id}/approve`, {
      method: "PUT",
    });
  },

  async adminRejectDevelopment(id: number): Promise<any> {
    return apiFetch(`/api/admin/developments/${id}`, {
      method: "DELETE",
    });
  },

  async adminEditDevelopment(id: number, data: any): Promise<any> {
    return apiFetch(`/api/admin/developments/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  // News
  async getNews(filters: { country?: string; tag?: string } = {}): Promise<NewsItem[]> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params.append(k, v);
    });
    const query = params.toString() ? `?${params.toString()}` : "";
    return apiFetch(`/api/news${query}`);
  },

  // Wizard Creation
  async createPoll(data: any): Promise<{ poll: Poll }> {
    return apiFetch("/api/polls/create", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  // Custom File Uploader helper - converts files to Base64 in UI and transmits safely
  async uploadFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        try {
          const res = await apiFetch("/api/upload", {
            method: "POST",
            body: JSON.stringify({
              fileName: file.name,
              fileContent: reader.result,
            }),
          });
          resolve(res.url);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = error => reject(error);
    });
  },

  async getUserVotesHistory(userId: number): Promise<any[]> {
    return apiFetch(`/api/users/${userId}/votes`);
  },

  logout() {
    clearSession();
    broadcastSessionChange();
  },

  // Admin Actions
  async getAdminStats(): Promise<any> {
    return apiFetch("/api/admin/stats");
  },

  async featurePoll(pollId: number): Promise<any> {
    return apiFetch(`/api/admin/polls/${pollId}/feature`, { method: "POST" });
  },

  async updatePollStatus(pollId: number, status: string): Promise<any> {
    return apiFetch(`/api/admin/polls/${pollId}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    });
  },

  async deletePoll(pollId: number): Promise<any> {
    return apiFetch(`/api/admin/polls/${pollId}`, { method: "DELETE" });
  },

  async createPolitician(data: any): Promise<Politician> {
    return apiFetch("/api/admin/politicians", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updatePolitician(id: number, data: any): Promise<Politician> {
    return apiFetch(`/api/admin/politicians/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  async deletePolitician(id: number): Promise<any> {
    return apiFetch(`/api/admin/politicians/${id}`, {
      method: "DELETE",
    });
  },

  async autofillPolitician(name: string): Promise<any> {
    return apiFetch(`/api/admin/politician/autofill`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },

  async createPoliticiansBulk(politicians: any[]): Promise<any> {
    return apiFetch(`/api/admin/politicians/bulk`, {
      method: "POST",
      body: JSON.stringify({ politicians }),
    });
  },

  async autofillPoll(prompt: string): Promise<any> {
    return apiFetch(`/api/admin/poll/autofill`, {
      method: "POST",
      body: JSON.stringify({ prompt }),
    });
  },

  async updatePoll(id: number, data: any): Promise<Poll> {
    return apiFetch(`/api/admin/polls/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  async createNewsItem(data: any): Promise<NewsItem> {
    return apiFetch("/api/admin/news", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateNewsItem(id: number, data: any): Promise<NewsItem> {
    return apiFetch(`/api/admin/news/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  async deleteNewsItem(id: number): Promise<any> {
    return apiFetch(`/api/admin/news/${id}`, {
      method: "DELETE",
    });
  },

  async getAdminComments(): Promise<any[]> {
    return apiFetch("/api/admin/comments");
  },

  async deleteComment(id: number): Promise<any> {
    return apiFetch(`/api/admin/comments/${id}`, {
      method: "DELETE",
    });
  },

  async getNotifications(): Promise<{ notifications: AppNotification[] }> {
    return apiFetch("/api/notifications");
  },

  async markNotificationRead(id: number): Promise<any> {
    return apiFetch(`/api/notifications/${id}/read`, {
      method: "POST",
    });
  },

  async markAllNotificationsRead(): Promise<any> {
    return apiFetch("/api/notifications/mark-all-read", {
      method: "POST",
    });
  },

  async getPollDeviceMetrics(pollId: number): Promise<any> {
    return apiFetch(`/api/polls/${pollId}/device-metrics`);
  },

  async createParty(data: any): Promise<Party> {
    return apiFetch("/api/admin/parties", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateParty(id: number, data: any): Promise<Party> {
    return apiFetch(`/api/admin/parties/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  async deleteParty(id: number): Promise<any> {
    return apiFetch(`/api/admin/parties/${id}`, {
      method: "DELETE",
    });
  },

  async autofillParty(name: string): Promise<any> {
    return apiFetch("/api/admin/party/autofill", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },

  async getSettings(): Promise<{ hero_image_url: string }> {
    return apiFetch("/api/settings");
  },

  async updateSettings(data: { hero_image_url: string }): Promise<any> {
    const res = await apiFetch("/api/admin/settings", {
      method: "POST",
      body: JSON.stringify(data),
    });
    broadcastSettingsChange();
    return res;
  }
};
