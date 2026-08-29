import type { RelatedType, RelatedWord } from '../db/types'

export interface WordSeed { id: number; term: string; reading: string; deckId: number; lesson: string | null }
const KANJI_RE = /[\u3400-\u9faf]/g
const MIN_RELATED = 3
const MAX_RELATED = 8
const MIN_STEM = 2 // 词干最短共享假名数

function kanjiOf(term: string): string[] { return term.match(KANJI_RE) ?? [] }

function commonPrefixLen(a: string, b: string): number {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i
}

export function buildLinks(words: WordSeed[]): Map<number, RelatedWord[]> {
  // 汉字稀有度：在词库中出现次数越少权重越高
  const freq = new Map<string, number>()
  for (const w of words) for (const k of new Set(kanjiOf(w.term))) freq.set(k, (freq.get(k) ?? 0) + 1)

  const best = new Map<number, Map<number, RelatedWord>>() // wordId → (otherId → 关联)
  const add = (a: number, b: number, type: RelatedType, score: number) => {
    const m = best.get(a) ?? new Map()
    const cur = m.get(b)
    if (!cur || score > cur.score) m.set(b, { wordId: b, type, score })
    best.set(a, m)
  }

  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j < words.length; j++) {
      const a = words[i], b = words[j]
      // 信号 1：同汉字（生僻字加权的共享数）
      const ka = new Set(kanjiOf(a.term))
      let kanjiScore = 0
      for (const k of ka) if ((freq.get(k) ?? 0) > 0 && b.term.includes(k)) kanjiScore += 1 / (freq.get(k) ?? 1)
      if (kanjiScore > 0) { add(a.id, b.id, 'kanji', kanjiScore); add(b.id, a.id, 'kanji', kanjiScore) }
      // 信号 2：同词根（假名公共前缀 ≥2 且双方都有剩余部分，如 たべる/たべもの）
      const L = commonPrefixLen(a.reading, b.reading)
      if (L >= MIN_STEM && L < Math.min(a.reading.length, b.reading.length)) {
        add(a.id, b.id, 'stem', L); add(b.id, a.id, 'stem', L)
      }
    }
  }

  // 组装 + 同课兜底
  const result = new Map<number, RelatedWord[]>()
  for (const w of words) {
    const list = [...(best.get(w.id)?.values() ?? [])].sort((x, y) => y.score - x.score).slice(0, MAX_RELATED)
    if (list.length < MIN_RELATED) {
      const chosen = new Set(list.map((r) => r.wordId))
      const fill = words.filter((o) =>
        o.id !== w.id && o.deckId === w.deckId && o.lesson !== null && o.lesson === w.lesson && !chosen.has(o.id))
      for (const o of fill) {
        if (list.length >= MIN_RELATED) break
        list.push({ wordId: o.id, type: 'lesson', score: 0 })
      }
    }
    result.set(w.id, list)
  }
  return result
}
