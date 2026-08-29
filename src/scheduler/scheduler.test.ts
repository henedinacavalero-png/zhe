import { describe, expect, test } from 'vitest'
import { pickDailyQueue, review } from './scheduler'
import type { Progress, Word } from '../db/types'

const P = (over: Partial<Progress>): Progress => ({
  wordId: 1, ease: 2.5, interval: 0, due: 0, reps: 0, lapses: 0, lastReviewed: null, isNew: true, ...over,
})
const W = (id: number): Word => ({
  id, deckId: 1, term: `t${id}`, reading: '', meaning: '', pos: '',
  examples: [], audio: null, tags: [], lesson: null, related: [],
})

describe('review 三键', () => {
  const now = 1_000_000_000
  test('不认识：10 分钟后重现，lapses+1，ease 下降', () => {
    const p = review(P({ ease: 2.5, interval: 10, due: 0, lapses: 1 }), 'again', now)
    expect(p.interval).toBe(0)
    expect(p.due).toBe(now + 10 * 60_000)
    expect(p.lapses).toBe(2)
    expect(p.ease).toBeCloseTo(2.35)
  })
  test('不认识：ease 不低于 1.3', () => {
    expect(review(P({ ease: 1.35 }), 'again', now).ease).toBe(1.3)
  })
  test('模糊：已有间隔 ×1.2；新词 1 小时后重现', () => {
    expect(review(P({ interval: 10, isNew: false }), 'hard', now).interval).toBe(12)
    expect(review(P({ interval: 0 }), 'hard', now).due).toBe(now + 60 * 60_000)
  })
  test('认识：0→1 天→3 天→×ease，ease 上限 2.8', () => {
    expect(review(P({ interval: 0 }), 'good', now).interval).toBe(1)
    expect(review(P({ interval: 1, isNew: false }), 'good', now).interval).toBe(3)
    expect(review(P({ interval: 3, ease: 2.5, isNew: false }), 'good', now).interval).toBe(8) // 3×2.55
    expect(review(P({ ease: 2.78, interval: 3, isNew: false }), 'good', now).ease).toBe(2.8)
  })
})

describe('pickDailyQueue', () => {
  test('到期复习按 due 升序在前，新词限量补后', () => {
    const now = 1_000_000
    const words = [1, 2, 3, 4, 5].map(W)
    const prog = new Map<number, Progress>([
      [1, P({ wordId: 1, isNew: false, due: now + 100 })],
      [2, P({ wordId: 2, isNew: false, due: now - 100 })],
      [3, P({ wordId: 3, isNew: true })],
      [4, P({ wordId: 4, isNew: true })],
      [5, P({ wordId: 5, isNew: true })],
    ])
    expect(pickDailyQueue(words, prog, 2, now)).toEqual([2, 3, 4]) // 复习 2(已过期)；新词 3、4 命中限量 2；1 未到期排除；5 超限量排除
  })
})
