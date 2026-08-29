export interface Deck { id?: number; name: string; importedAt: number; wordCount: number }
export interface Example { ja: string; zh: string }
export type RelatedType = 'kanji' | 'stem' | 'lesson'
export interface RelatedWord { wordId: number; type: RelatedType; score: number }
export interface Word {
  id?: number; deckId: number; term: string; reading: string; meaning: string; pos: string;
  examples: Example[]; audio: Blob | null; tags: string[]; lesson: string | null;
  related: RelatedWord[];
}
export interface Progress {
  wordId: number; ease: number; interval: number; due: number;
  reps: number; lapses: number; lastReviewed: number | null; isNew: boolean;
}
export interface AppSettings { key: 'app'; dailyNewLimit: number; theme: 'light' | 'dark' | 'auto' }
export interface Streak { key: 'streak'; days: number; lastStudyDate: string } // YYYY-MM-DD
export const DAY = 86_400_000
export const MINUTE = 60_000
