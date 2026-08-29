import { expect, test } from 'vitest'
import { filterWords } from './WordListPage'
import type { Word } from '../db/types'

const W = (over: Partial<Word>): Word => ({
  id: 1, deckId: 1, term: '', reading: '', meaning: '', pos: '', examples: [], audio: null, tags: [], lesson: null, related: [], ...over,
} as Word)

test('按单词/读音/释义前缀搜索', () => {
  const words = [W({ id: 1, term: '食べる', reading: 'たべる', meaning: '吃' }), W({ id: 2, term: '飲む', reading: 'のむ', meaning: '喝' })]
  expect(filterWords(words, 'たべ').map((w) => w.id)).toEqual([1])
  expect(filterWords(words, '喝').map((w) => w.id)).toEqual([2])
  expect(filterWords(words, '')).toHaveLength(2)
})
