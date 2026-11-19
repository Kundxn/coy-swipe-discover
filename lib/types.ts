export const CURRENT_USER_ID = 'me' as const;

export const ME_AVATAR_URL = '/src/assets/images/avatar_me_user_1795067729010.jpg';

export type SwipeAction = 'like' | 'pass' | 'superlike';

export type ReportReason =
  | 'inappropriate_content'
  | 'harassment'
  | 'spam_or_fake'
  | 'other';

export interface ProfilePrompt {
  question: string;
  answer: string;
}

export interface Profile {
  id: string;
  name: string;
  age: number;
  photo_url: string;
  photos: string[];
  bio: string;
  city_or_college: string;
  job_or_major: string;
  distance_miles: number;
  verified: boolean;
  verification_photo_url?: string | null;
  verified_at?: string | null;
  looking_for: string;
  interests: string[];
  prompts: ProfilePrompt[];
}

export interface ChatMessage {
  id: number;
  sender_id: string;
  recipient_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

export interface MatchProfile extends Profile {
  matched_at: string;
  is_super_match: boolean;
  unread_count: number;
  last_message: {
    body: string;
    sender_id: string;
    created_at: string;
  } | null;
}

export interface DiscoveryPreferences {
  min_age: number;
  max_age: number;
  max_distance: number;
  verified_only: boolean;
}

export interface SwipeRequest {
  targetId: string;
  action: SwipeAction;
}

export interface SwipeResponse {
  match: boolean;
  isSuperMatch?: boolean;
  profile?: Profile;
}

export interface FeedResponse {
  profiles: Profile[];
  canRewind?: boolean;
}

export interface MatchesResponse {
  matches: MatchProfile[];
}

export interface UndoSwipeResponse {
  restored: Profile;
  hasMore?: boolean;
}

export interface MessagesResponse {
  match: Profile;
  messages: ChatMessage[];
}

export interface ProfileUpdatePayload {
  name?: string;
  age?: number;
  bio?: string;
  city_or_college?: string;
  job_or_major?: string;
  looking_for?: string;
  photos?: string[];
  interests?: string[];
  prompts?: ProfilePrompt[];
}

export interface VerifyProfileResponse {
  profile: Profile;
}
