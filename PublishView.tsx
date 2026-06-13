/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ScreenType = 'onboarding' | 'publish' | 'discovery' | 'chat';

export interface OnboardingState {
  email: string;
  locationStatus: 'idle' | 'detecting' | 'detected';
  locationText: string;
  selectedInterests: string[];
  progress: number;
}

export interface PhotoUpload {
  id: string;
  url: string;
  name: string;
  progress: number; // 0 to 100
  analyzed: boolean;
}

export interface PublishState {
  listingType: 'barter' | 'donation';
  photos: PhotoUpload[];
  title: string;
  description: string;
  exchangeSearch: string;
  selectedPreferences: string[];
  status: 'draft' | 'idle' | 'publishing' | 'live';
}

export interface FeedItem {
  id: string;
  title: string;
  category: string;
  type: 'barter' | 'donation';
  distance: number; // in km
  userName: string;
  userAvatar: string;
  image: string;
  tag?: string; // e.g. "RECIÉN PUBLICADO", "SMART MATCH"
  isSmartMatch?: boolean;
}

export interface ChatMessage {
  id: string;
  sender: 'self' | 'juan' | 'system';
  systemIcon?: string;
  text: string;
  time: string;
  specialBadge?: string;
}

export interface ChatState {
  dealStatus: 'propuesto' | 'aceptado' | 'cita' | 'completado';
  isTyping: boolean;
  messages: ChatMessage[];
  inputValue: string;
}
