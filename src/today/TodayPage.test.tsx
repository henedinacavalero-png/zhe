import { render, screen } from '@testing-library/react'
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

test('显示今日待背数量（2 复习 + 1 新词，限量 15）', async () => {
  const W = (id: number): Word => ({ id, deckId: 1, term: `t${id}`, reading: '', meaning: '', pos: '', examples: [], audio: null, tags: [], lesson: null, related: [] })
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
