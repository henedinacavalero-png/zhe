import Dexie, { type Table } from 'dexie'
import { DAY, type AppSettings, type Deck, type Progress, type Streak, type Word } from './types'
import { parseLevel } from '../library/level'

export class TangoDB extends Dexie {
  decks!: Table<Deck, number>
  words!: Table<Word, number>
  progress!: Table<Progress, number>
  settings!: Table<AppSettings | Streak, string>
  constructor(name = 'tangochou') {
    super(name)
    this.version(1).stores({
      decks: '++id, name',
      words: '++id, deckId, term, lesson',
      progress: 'wordId, due, isNew',
      settings: 'key',
    })
    // v2：级别/频率成为索引字段（供按 N5-N1、频率筛选背词）；升级时从 lesson 标签回填存量数据
    this.version(2).stores({
      words: '++id, deckId, term, lesson, level, freq, [level+freq]',
    }).upgrade(async (tx) => {
      await tx.table('words').toCollection().modify((w: Word) => {
        const p = parseLevel(w.lesson)
        w.level = p?.level ?? ''
        w.freq = p?.freq ?? ''
      })
    })
  }
}
export const db = new TangoDB()

export interface StudyFilter { level: string; freq: string; deckId?: number | 'all' } // level: 'all'|'N5'…; freq: 'all'|'高频'…; deckId: 'all'|牌组 id

export const DEFAULT_FILTER: StudyFilter = { level: 'all', freq: 'all', deckId: 'all' }

export async function getStreak(): Promise<Streak> {
  return (await db.settings.get('streak') as Streak | undefined) ?? { key: 'streak', days: 0, lastStudyDate: '' }
}

export async function bumpStreak(today: string): Promise<void> {
  const s = await getStreak()
  if (s.lastStudyDate === today) return
  const yesterday = new Date(Date.parse(today) - DAY).toISOString().slice(0, 10)
  const days = s.lastStudyDate === yesterday ? s.days + 1 : 1
  await db.settings.put({ key: 'streak', days, lastStudyDate: today })
}

export async function getAppSettings(): Promise<AppSettings> {
  return (await db.settings.get('app') as AppSettings | undefined)
    ?? { key: 'app', dailyNewLimit: 15, theme: 'auto', studyFilter: DEFAULT_FILTER }
}

/** 按筛选条件取候选词主键（index 查询，不整行加载） */
export async function candidateKeys(f: StudyFilter, database: TangoDB = db): Promise<number[]> {
  if (f.deckId !== undefined && f.deckId !== 'all') {
    const deckKeys = await database.words.where('deckId').equals(f.deckId).primaryKeys()
    if (f.level === 'all') return deckKeys
    const deckSet = new Set(deckKeys)
    const byLevel = f.freq !== 'all'
      ? await database.words.where('[level+freq]').equals([f.level, f.freq]).primaryKeys()
      : await database.words.where('level').equals(f.level).primaryKeys()
    return byLevel.filter((id) => deckSet.has(id))
  }
  if (f.level === 'all') return database.words.toCollection().primaryKeys()
  if (f.freq !== 'all') return database.words.where('[level+freq]').equals([f.level, f.freq]).primaryKeys()
  return database.words.where('level').equals(f.level).primaryKeys()
}
