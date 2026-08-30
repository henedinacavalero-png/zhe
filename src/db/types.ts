export interface Deck { id?: number; name: string; importedAt: number; wordCount: number }
export interface Example { ja: string; zh: string; rt?: string; audioName?: string } // rt = 例句整句读音（假名）；audioName = 例句自带音频在媒体清单里的文件名
export type RelatedType = 'kanji' | 'stem' | 'lesson'
export interface RelatedWord { wordId: number; type: RelatedType; score: number }
export interface FieldSnap { name: string; value: string }
export interface Word {
  id?: number; deckId: number; term: string; reading: string; meaning: string; pos: string;
  examples: Example[]; audio: Blob | null; audioName?: string; tags: string[]; lesson: string | null;
  related: RelatedWord[];
  level?: string; freq?: string; // v2 迁移/导入时从 lesson 解析（'' = 无级别）
  images?: Record<string, Blob> | null; // 字段 <img> 引用的图片（文件名 → Blob）
  fields?: FieldSnap[] | null; // 全部非空字段快照（背面完整展示用，含 [sound:]/<img>/漢字[かな] 原文）
  media?: Record<string, Blob> | null; // 字段引用的其余媒体（文件名 → Blob）
}
export interface Progress {
  wordId: number; ease: number; interval: number; due: number;
  reps: number; lapses: number; lastReviewed: number | null; isNew: boolean;
}
export interface AppSettings {
  key: 'app'; dailyNewLimit: number; theme: 'light' | 'dark' | 'auto';
  studyFilter?: { level: string; freq: string; deckId?: number | 'all' } // 背词范围（'all' = 不限）
}
export interface Streak { key: 'streak'; days: number; lastStudyDate: string } // YYYY-MM-DD
export const DAY = 86_400_000
export const MINUTE = 60_000
