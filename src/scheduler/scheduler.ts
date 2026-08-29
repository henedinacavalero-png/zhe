import { DAY, MINUTE, type Progress, type Word } from '../db/types'

export type Rating = 'again' | 'hard' | 'good'
const MIN_EASE = 1.3
const MAX_EASE = 2.8

export function newProgress(wordId: number): Progress {
  return { wordId, ease: 2.5, interval: 0, due: 0, reps: 0, lapses: 0, lastReviewed: null, isNew: true }
}

export function review(p: Progress, rating: Rating, now = Date.now()): Progress {
  const next = { ...p, isNew: false }
  if (rating === 'again') {
    return { ...next, ease: Math.max(MIN_EASE, p.ease - 0.15), interval: 0,
      due: now + 10 * MINUTE, lapses: p.lapses + 1, lastReviewed: now }
  }
  if (rating === 'hard') {
    const interval = p.interval === 0 ? 0 : Math.max(1, Math.round(p.interval * 1.2))
    return { ...next, interval, due: p.interval === 0 ? now + 60 * MINUTE : now + interval * DAY,
      reps: p.reps + 1, lastReviewed: now }
  }
  const ease = Math.min(MAX_EASE, p.ease + 0.05)
  const interval = p.interval === 0 ? 1 : p.interval === 1 ? 3 : Math.round(p.interval * ease)
  return { ...next, ease, interval, due: now + interval * DAY, reps: p.reps + 1, lastReviewed: now }
}

export function pickDailyQueue(
  words: Word[], progress: Map<number, Progress>, dailyNewLimit: number,
  opts?: { shuffle?: boolean; rng?: () => number; now?: number },
): number[] {
  const now = opts?.now ?? Date.now()
  const due = words
    .filter((w) => { const p = progress.get(w.id!); return p && !p.isNew && p.due <= now })
    .sort((a, b) => progress.get(a.id!)!.due - progress.get(b.id!)!.due)
  const fresh = words.filter((w) => progress.get(w.id!)?.isNew)
  if (opts?.shuffle) {
    // Fisher-Yates：新词随机顺序（复习仍按到期时间先后），rng 可注入便于测试
    const rng = opts.rng ?? Math.random
    for (let i = fresh.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[fresh[i], fresh[j]] = [fresh[j], fresh[i]]
    }
  }
  return [...due, ...fresh.slice(0, dailyNewLimit)].map((w) => w.id!)
}
