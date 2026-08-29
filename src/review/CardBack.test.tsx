import { render, screen } from '@testing-library/react'
import CardBack from './CardBack'
import type { Word } from '../db/types'

const word: Word = {
  id: 1, deckId: 1, term: '食べる', reading: 'たべる', meaning: '吃', pos: '動・一段',
  examples: [{ ja: '朝ごはんを食べる。', zh: '没有吃早饭的时间。' }], audio: null, tags: [], lesson: null,
  related: [
    { wordId: 2, type: 'kanji', score: 1 }, { wordId: 3, type: 'stem', score: 2 }, { wordId: 4, type: 'lesson', score: 0 },
  ],
}

test('例句高亮目标词', () => {
  render(<CardBack word={word} wordsById={new Map()} onJump={undefined as never} />)
  const hl = screen.getByText('食べる', { selector: 'mark' })
  expect(hl).toBeInTheDocument()
})

test('关联词按类型分组渲染为三组', () => {
  render(<CardBack word={word} wordsById={new Map([[2, { ...word, id: 2, term: '食事' }], [3, { ...word, id: 3, term: '食べ物' }], [4, { ...word, id: 4, term: '山' }]])} onJump={() => {}} />)
  expect(screen.getByText('同汉字')).toBeInTheDocument()
  expect(screen.getByText('同词根')).toBeInTheDocument()
  expect(screen.getByText('同课')).toBeInTheDocument()
  expect(screen.getByText('食事')).toBeInTheDocument()
})
