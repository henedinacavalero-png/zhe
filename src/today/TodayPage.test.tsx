import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TodayPage from './TodayPage'
import { db } from '../db/db'
import { newProgress } from '../scheduler/scheduler'
import type { Word } from '../db/types'

// 同文件用例共享 fake-indexeddb 单例 DB——每个用例前删库重建，避免顺序依赖
beforeEach(async () => {
  await db.delete()
  await db.open()
})

const W = (id: number, term = '', level = '', freq = ''): Word =>
  ({ id, deckId: 1, term, reading: '', meaning: '', pos: '', examples: [], audio: null, tags: [], lesson: null, level, freq, related: [] })

test('显示今日待背数量（2 复习 + 1 新词，限量 15）', async () => {
  await db.words.bulkAdd([W(1), W(2), W(3)])
  await db.progress.bulkPut([
    { ...newProgress(1), isNew: false, due: Date.now() - 1000 },
    { ...newProgress(2), isNew: false, due: Date.now() + 86_400_000 }, // 明天才到期
    newProgress(3),
  ])
  render(<MemoryRouter><TodayPage /></MemoryRouter>)
  expect(await screen.findByText(/1 个新词/)).toBeInTheDocument()
  expect(await screen.findByText(/1 个待复习/)).toBeInTheDocument()
})

test('有打卡记录时显示连续打卡天数', async () => {
  await db.settings.put({ key: 'streak', days: 3, lastStudyDate: '2026-08-29' })
  render(<MemoryRouter><TodayPage /></MemoryRouter>)
  expect(await screen.findByText(/连续打卡 3 天/)).toBeInTheDocument()
})

test('级别 chips 带词数；选 N3 后频率行出现且队列只含 N3', async () => {
  await db.words.bulkAdd([W(1, 'a', 'N5'), W(2, 'b', 'N5'), W(3, 'c', 'N3', '高频'), W(4, 'd', 'N3', '低频')])
  await db.progress.bulkPut([newProgress(1), newProgress(2), newProgress(3), newProgress(4)])
  render(<MemoryRouter><TodayPage /></MemoryRouter>)

  const n5 = await screen.findByText('N5', { selector: 'button' })
  await waitFor(() => expect(n5.textContent).toContain('2'))
  await waitFor(() => expect(screen.getByText(/个新词/).textContent).toMatch(/^4 个新词$/))

  fireEvent.click(screen.getByText('N3', { selector: 'button' }))
  expect(await screen.findByText('高频', { selector: 'button' })).toBeInTheDocument()
  await waitFor(() => expect(screen.getByText(/个新词/).textContent).toMatch(/^2 个新词$/))

  fireEvent.click(screen.getByText('低频', { selector: 'button' }))
  await waitFor(() => expect(screen.getByText(/个新词/).textContent).toMatch(/^1 个新词$/))
  fireEvent.click(screen.getByText('高频', { selector: 'button' }))
  await waitFor(() => expect(screen.getByText(/个新词/).textContent).toMatch(/^1 个新词$/))

  // 选没有词的 N2 → 空态
  fireEvent.click(screen.getByText('N2', { selector: 'button' }))
  await waitFor(() => expect(screen.getByText(/背完了/)).toBeInTheDocument())
})

test('N5 无频率档：不出现频率行，队列只含 N5', async () => {
  await db.words.bulkAdd([W(1, 'a', 'N5'), W(2, 'b', 'N5'), W(3, 'c', 'N3', '高频')])
  await db.progress.bulkPut([newProgress(1), newProgress(2), newProgress(3)])
  render(<MemoryRouter><TodayPage /></MemoryRouter>)
  fireEvent.click(await screen.findByText('N5', { selector: 'button' }))
  await waitFor(() => expect(screen.getByText(/个新词/).textContent).toMatch(/^2 个新词$/))
  expect(screen.queryByText('高频', { selector: 'button' })).not.toBeInTheDocument()
})
