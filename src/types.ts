/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface User {
  id: number;
  display_name: string;
  email: string;
  avatar_url?: string;
  role: 'citizen' | 'journalist' | 'analyst' | 'admin';
  country: string;
  polls_created: number;
  polls_voted: number;
  joined_at: string;
  bio?: string;
  verified: boolean;
}

export interface PollOption {
  id: number;
  poll_id: number;
  label: string;
  description?: string;
  photo_url: string; // fallback if empty
  party?: string;
  party_color?: string; // e.g., #0033A0
  vote_count: number;
  order: number;
}

export interface Poll {
  id: number;
  title: string;
  description: string;
  category: 'Election' | 'Approval Rating' | 'Policy' | 'Leadership' | 'Referendum' | 'International' | 'Local Government' | 'Party Politics' | 'Breaking News Poll';
  status: 'active' | 'closed' | 'scheduled' | 'draft';
  poll_type: 'single_choice' | 'multiple_choice' | 'approval_rating' | 'ranked_choice' | 'yes_no';
  options: PollOption[];
  featured_image?: string;
  created_by: number; // User.id
  created_by_user?: { display_name: string; avatar_url?: string; role: string; verified: boolean };
  created_at: string;
  closes_at?: string;
  total_votes: number;
  is_featured: boolean;
  allow_comments: boolean;
  tags: string[];
  country: string;
  region?: string;
  view_count: number;
}

export interface Vote {
  id: number;
  poll_id: number;
  option_ids: number[];
  user_id?: number | null;
  ip_hash: string;
  voted_at: string;
  device_type: string;
}

export interface Politician {
  id: number;
  full_name: string;
  photo_url: string;
  title: string;
  country: string;
  party: string;
  party_color?: string;
  office: string;
  bio: string;
  date_of_birth: string;
  approval_rating: number; // computed from polls
  total_poll_appearances: number;
  social_twitter?: string;
  social_instagram?: string;
  is_active: boolean;
  tags: string[];
}

export interface Party {
  id: number;
  name: string;
  abbreviation: string;
  logo_url: string;
  color: string;
  description: string;
  country: string;
  founded_year?: number | string;
  ideology?: string;
  headquarters?: string;
  chairperson?: string;
}

export interface Comment {
  id: number;
  poll_id: number;
  user_id: number;
  user_name: string;
  user_avatar?: string;
  user_verified: boolean;
  user_role: string;
  content: string;
  created_at: string;
  likes: number;
  parent_id?: number | null; // threads
}

export interface NewsItem {
  id: number;
  title: string;
  summary: string;
  image_url: string;
  source_url: string;
  source_name: string;
  published_at: string;
  related_poll_id?: number | null;
  tags: string[];
  country: string;
}

export interface DevelopmentProgress {
  id: number;
  politician_id: number;
  title: string;
  description: string;
  timeline: "past" | "present" | "future";
  date?: string;
  is_approved: boolean; // admins insert as true, users suggest as false
  creator_type: "admin" | "ai" | "user";
  suggested_by_email?: string;
}

export interface PlatformStats {
  totalPolls: number;
  totalVotes: number;
  countriesCount: number;
  activePollsCount: number;
}

export interface AppNotification {
  id: number;
  user_id: number;
  poll_id: number;
  poll_title: string;
  type: 'comment' | 'milestone';
  message: string;
  is_read: boolean;
  created_at: string;
  metadata?: {
    comment_id?: number;
    comment_author?: string;
    vote_count?: number;
  };
}

