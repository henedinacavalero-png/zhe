import { describe, expect, test } from 'vitest'
import { buildLinks } from './linker'
import type { WordSeed } from './linker'

const S = (id: number, term: string, reading: string, lesson: string | null = null): WordSeed =>
  ({ id, term, reading, deckId: 1, lesson })

describe('buildLinks', () => {
  test('同汉字：食べる ↔ 食事/和食（共享「食」，稀有字加权）；同词根：食べる ↔ 食べ物（词干 たべ）', () => {
    const words = [
      S(1, '食べる', 'たべる'), S(2, '食事', 'しょくじ'),
      S(3, '和食', 'わしょく'), S(4, '食べ物', 'たべもの'),
      S(5, '飲む', 'のむ'),
    ]
    const links = buildLinks(words)
    const typesOf = (id: number) => links.get(id)!.map((r) => r.type)
    expect(typesOf(1)).toContain('kanji')   // 食事/和食
    expect(typesOf(1)).toContain('stem')    // 食べ物
    expect(typesOf(5)).not.toContain('kanji') // 飲む 与本组无共享汉字
    // 关联是双向的
    expect(links.get(2)!.some((r) => r.wordId === 1)).toBe(true)
  })

  test('同课兜底：无共享信号时用同 lesson 词补齐到 3 个；总量不超过 8', () => {
    const words = [
      S(1, '山', 'やま', 'L1'), S(2, '川', 'かわ', 'L1'),
      S(3, '海', 'うみ', 'L1'), S(4, '空', 'そら', 'L1'),
      S(6, '犬', 'いぬ', 'L2'), S(7, '猫', 'ねこ', 'L2'),
    ]
    const links = buildLinks(words)
    expect(links.get(1)!.length).toBeGreaterThanOrEqual(3)
    expect(links.get(1)!.every((r) => r.wordId !== 6 && r.wordId !== 7)).toBe(true) // 不跨课兜底
    expect(links.get(1)!.length).toBeLessThanOrEqual(8)
  })

  test('排除自身', () => {
    const links = buildLinks([S(1, '山', 'やま', 'L1'), S(2, '山', 'やま', 'L1')])
    expect(links.get(1)!.every((r) => r.wordId !== 1)).toBe(true)
  })
})
