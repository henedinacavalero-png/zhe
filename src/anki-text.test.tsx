import { render, screen } from '@testing-library/react'
import { AnkiText } from './anki-text'

// 蓝宝书文法卡实测：例句原文用 <b>语法点</b> 标记考点位置，渲染器必须保留成高亮
test('例句里的 <b>语法点</b> 渲染成高亮 mark', () => {
  render(<AnkiText text="監督<b>あっての</b>ことです" />)
  expect(screen.getByText('あっての', { selector: 'mark' })).toBeInTheDocument()
  expect(screen.getByText(/監督/)).toBeInTheDocument()
})

test('多个 <b> 段各自高亮，普通文本不受影响', () => {
  render(<AnkiText text="A<b>甲</b>B<b>乙</b>C" />)
  const marks = screen.getAllByText(/甲|乙/, { selector: 'mark' })
  expect(marks).toHaveLength(2)
  expect(screen.getByText(/ABC/).textContent).toContain('A')
})

test('ruby 模式下 <b> 与 漢字[かな] 注音共存', () => {
  render(<AnkiText text="私の恩[おん]人<b>あっての</b>ことです" ruby />)
  expect(screen.getByText('あっての', { selector: 'mark' })).toBeInTheDocument()
  expect(screen.getByText('恩', { selector: 'ruby' })).toBeInTheDocument()
})

test('其余 HTML 标签仍然剥离，不出现字面 <b> 文本', () => {
  const { container } = render(<AnkiText text="<i>斜体</i><b>重点</b>" />)
  expect(container.innerHTML).not.toContain('<i>')
  expect(container.innerHTML).not.toContain('&lt;b&gt;')
})
