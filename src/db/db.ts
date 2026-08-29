import Dexie, { type Table } from 'dexie'
import { DAY, type AppSettings, type Deck, type Progress, type Streak, type Word } from './types'

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
  }
}
export const db = new TangoDB()

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
  return (await db.settings.get('app') as AppSettings | undefined) ?? { key: 'app', dailyNewLimit: 15, theme: 'auto' }
}
