import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TodayPage from './TodayPage'
import { db } from '../db/db'
import { newProgress } from '../scheduler/scheduler'
import { useSettings } from '../settings/useSettings'
import type { Word } from '../db/types'

// 同文件用例共享 fake-indexeddb 单例 DB——每个用例前删库重建，避免顺序依赖
beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 30)) // 让上一用例组件里未落地的 Dexie 查询先完成，避免删库时撞 DatabaseClosedError
  await db.delete()
  await db.open()
  useSettings.setState({ settings: null }) // zustand 是模块单例，防止筛选条件跨用例泄漏
})

const W = (id: number, term = '', level = '', freq = ''): Word =>
  ({ id, deckId: 1, term, reading: '', meaning: '', pos: '', examples: [], audio: null, tags: [], lesson: null, level, freq, related: [] })

// 新版今天页把大数字单独渲染在 .text-5xl 元素里
const bigNum = (n: string) => expect(screen.getByText(n, { selector: '.text-5xl' })).toBeInTheDocument()

test('显示今日待背数量（2 复习 + 1 新词，限量 15）', async () => {
  await db.words.bulkAdd([W(1), W(2), W(3)])
  await db.progress.bulkPut([
    { ...newProgress(1), isNew: false, due: Date.now() - 1000 },
    { ...newProgress(2), isNew: false, due: Date.now() + 86_400_000 }, // 明天才到期
    newProgress(3),
  ])
  render(<MemoryRouter><TodayPage /></MemoryRouter>)
  await waitFor(() => bigNum('1'))
  expect(screen.getByText('个新词待认')).toBeInTheDocument()
  expect(screen.getByText('复习', { exact: false })).toBeInTheDocument()
})

test('有打卡记录时显示连续打卡天数', async () => {
  await db.settings.put({ key: 'streak', days: 3, lastStudyDate: '2026-08-29' })
  render(<MemoryRouter><TodayPage /></MemoryRouter>)
  expect(await screen.findByText(/连续 3 天/)).toBeInTheDocument()
})

test('级别 chips 带词数；选 N3 后频率行出现且队列只含 N3', async () => {
  await db.words.bulkAdd([W(1, 'a', 'N5'), W(2, 'b', 'N5'), W(3, 'c', 'N3', '高频'), W(4, 'd', 'N3', '低频')])
  await db.progress.bulkPut([newProgress(1), newProgress(2), newProgress(3), newProgress(4)])
  render(<MemoryRouter><TodayPage /></MemoryRouter>)

  const n5 = await screen.findByText('N5', { selector: 'button' })
  await waitFor(() => expect(n5.textContent).toContain('2'))
  await waitFor(() => bigNum('4'))

  fireEvent.click(screen.getByText('N3', { selector: 'button' }))
  expect(await screen.findByText('高频', { selector: 'button' })).toBeInTheDocument()
  await waitFor(() => bigNum('2'))

  fireEvent.click(screen.getByText('低频', { selector: 'button' }))
  await waitFor(() => bigNum('1'))
  fireEvent.click(screen.getByText('高频', { selector: 'button' }))
  await waitFor(() => bigNum('1'))

  // 该范围（当前牌组=全部、全部词库）没有 N2 词 → N2 chip 直接隐藏，不再能选出空范围
  await waitFor(() => expect(screen.queryByText('N2', { selector: 'button' })).not.toBeInTheDocument())
})

test('N5 无频率档：不出现频率行，队列只含 N5', async () => {
  await db.words.bulkAdd([W(1, 'a', 'N5'), W(2, 'b', 'N5'), W(3, 'c', 'N3', '高频')])
  await db.progress.bulkPut([newProgress(1), newProgress(2), newProgress(3)])
  render(<MemoryRouter><TodayPage /></MemoryRouter>)
  fireEvent.click(await screen.findByText('N5', { selector: 'button' }))
  await waitFor(() => bigNum('2'))
  expect(screen.queryByText('高频', { selector: 'button' })).not.toBeInTheDocument()
})

// 复现线上 bug：Tae Kim 牌组的词无 JLPT 标签（level=''），选「该牌组 + N5」队列必为空
const seedTwoDecks = async () => {
  const tk = await db.decks.add({ name: 'TaeKim动漫', importedAt: 1, wordCount: 0 })
  const egg = await db.decks.add({ name: 'eggrollsN1N5', importedAt: 2, wordCount: 0 })
  await db.words.bulkAdd([
    { ...W(1), deckId: tk, level: '', freq: '' },
    { ...W(2), deckId: tk, level: '', freq: '' },
    { ...W(3), deckId: egg, level: 'N5', freq: '' },
  ])
  await db.progress.bulkPut([newProgress(1), newProgress(2), newProgress(3)])
  return { tk, egg }
}

test('级别计数只统计当前牌组：选无级别牌组后 N5 档隐藏、未分级档出现', async () => {
  const { tk } = await seedTwoDecks()
  render(<MemoryRouter><TodayPage /></MemoryRouter>)

  // 初始（全部词库）：N5=1，未分级=2
  const n5 = await screen.findByText('N5', { selector: 'button' })
  await waitFor(() => expect(n5.textContent).toContain('1'))
  await waitFor(() => expect(screen.getByText('未分级', { selector: 'button' }).textContent).toContain('2'))

  // 选中 TaeKim 牌组 → 该牌组没有 N5 词：N5 chip 隐藏，未分级 chip 仍为 2
  fireEvent.click(screen.getByText('TaeKim动漫', { selector: 'button' }))
  await waitFor(() => expect(screen.queryByText('N5', { selector: 'button' })).not.toBeInTheDocument())
  expect(screen.getByText('未分级', { selector: 'button' }).textContent).toContain('2')
  // 级别"全部"chip = 该牌组词数 2；未选中（0 词）的 eggrolls 牌组 chip 隐藏
  expect(screen.getByText('全部', { selector: 'button' }).textContent).toContain('2')
  expect(screen.queryByText('eggrollsN1N5', { selector: 'button' })).not.toBeInTheDocument()
  expect(tk).toBeDefined()
})

test('选中范围没有单词时提示"这个范围没有单词"，不误报背完了', async () => {
  const { tk } = await seedTwoDecks()
  // 直接把筛选条件写成「无级别牌组 + N5」（旧版 UI 能选出这种空组合）
  useSettings.setState({
    settings: { key: 'app', dailyNewLimit: 15, theme: 'auto', studyFilter: { level: 'N5', freq: 'all', deckId: tk } },
  })
  render(<MemoryRouter><TodayPage /></MemoryRouter>)
  expect(await screen.findByText(/这个范围没有单词/)).toBeInTheDocument()
  expect(screen.queryByText(/背完了/)).not.toBeInTheDocument()
})

test('chip 计数不串位：切走级别后"全部词库"恢复为所选组合的真实词数', async () => {
  await seedTwoDecks()
  render(<MemoryRouter><TodayPage /></MemoryRouter>)

  await waitFor(() => expect(screen.getByText('全部词库', { selector: 'button' }).textContent).toContain('3'))
  // 点 N5（全局 1 个）→ "全部词库"chip 如实显示 N5 组合下的 1
  fireEvent.click(screen.getByText('N5', { selector: 'button' }))
  await waitFor(() => expect(screen.getByText('全部词库', { selector: 'button' }).textContent).toContain('1'))
  // 切回级别"全部"→ "全部词库"chip 回到 3（旧代码会把 1 残留下来）
  fireEvent.click(screen.getByText('全部', { selector: 'button' }))
  await waitFor(() => expect(screen.getByText('全部词库', { selector: 'button' }).textContent).toContain('3'))
})
