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
  expect(screen.getAllByText(/同汉字/).length).toBeGreaterThan(0)
  expect(screen.getAllByText(/同词根/).length).toBeGreaterThan(0)
  expect(screen.getAllByText(/同课/).length).toBeGreaterThan(0)
  expect(screen.getAllByText(/同汉字 · 食事/).length).toBeGreaterThan(0)
})

test('汉字上方显示假名注音（ruby），纯假名单词不加注音', () => {
  render(<CardBack word={word} wordsById={new Map()} onJump={undefined as never} />)
  const ruby = screen.getByText('食', { selector: 'ruby' })
  expect(ruby).toBeInTheDocument()
  expect(ruby.querySelector('rt')?.textContent).toBe('た')
})

test('有音频时显示播放按钮', () => {
  render(<CardBack word={{ ...word, audio: new Blob(['x']) }} wordsById={new Map()} onJump={undefined as never} />)
  expect(screen.getByLabelText('播放发音')).toBeInTheDocument()
})

// JLab（Tae Kim 动漫句）牌组实测：25 个字段大半是模板内部字段，背面只该留有内容的部分
const jlab: Word = {
  ...word, term: '今日[きょう] も', reading: 'きょうも', meaning: '[You go there] today, too?<br><br>注释文本',
  audio: new Blob(['x']), audioName: 'a.mp3',
  images: null, // 用户现网数据：word.images 为空，Image 字段是唯一出图处 → 必须保留
  fields: [
    { name: 'Source', value: 'Code Geass R1 (JP Eng)' },
    { name: 'Audio', value: '[sound:a.mp3]' },
    { name: 'Image', value: '<img src="pic.jpg">' },
    { name: 'RemarksFront', value: 'Pay attention to the intonation.' },
    { name: 'QuestionLink', value: '<a href="x">link</a>' },
    { name: 'Jlab-Kanji', value: '今日も' },
    { name: 'Jlab-KanjiSpaced', value: '今日 も' },
    { name: 'Jlab-HiraganaCloze', value: 'きょう も' },
    { name: 'Jlab-ListeningFront', value: 'kyou mo' },
    { name: 'Jlab-ClozeBack', value: 'kyou mo' },
    { name: 'References', value: 'http://x<br>Tae Kim chapter 3.3.3' },
  ],
  media: { 'pic.jpg': new Blob(['IMG']) },
}

test('字段区过滤：模板字段、与卡面重复的内容、已挂载的纯媒体引用不显示', () => {
  render(<CardBack word={jlab} wordsById={new Map()} onJump={undefined as never} />)
  expect(screen.getByText('出处')).toBeInTheDocument()
  expect(screen.getByText('注解')).toBeInTheDocument()
  expect(screen.getByText('参考')).toBeInTheDocument()
  expect(screen.getByText('图片')).toBeInTheDocument()
  expect(screen.queryByText('音频')).not.toBeInTheDocument()
  expect(screen.queryByText('QuestionLink')).not.toBeInTheDocument()
  expect(screen.queryByText('Jlab-Kanji')).not.toBeInTheDocument()
  expect(screen.queryByText('Jlab-ListeningFront')).not.toBeInTheDocument()
  expect(screen.queryByText('Jlab-ClozeBack')).not.toBeInTheDocument()
  // 内容去重：与 term/reading 相同（仅空格差异）的 Jlab-KanjiSpaced / HiraganaCloze 不出现
  expect(screen.queryByText('今日 も')).not.toBeInTheDocument()
  expect(screen.queryByText('きょう も')).not.toBeInTheDocument()
})

test('图片已挂载 word.images 时 Image 字段隐藏，改由卡面图片区渲染', () => {
  render(<CardBack word={{ ...jlab, images: { 'pic.jpg': new Blob(['IMG']) } }} wordsById={new Map()} onJump={undefined as never} />)
  expect(screen.queryByText('图片')).not.toBeInTheDocument()
})

test('meaning 里的 <br> 渲染成换行而不是字面文本', () => {
  const { container } = render(<CardBack word={jlab} wordsById={new Map()} onJump={undefined as never} />)
  const strong = container.querySelector('strong')!
  expect(strong.textContent).toContain('[You go there] today, too?')
  expect(strong.innerHTML).toContain('<br')
})
