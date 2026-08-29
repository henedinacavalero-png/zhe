# 単語帳（TangoChou）MVP 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 纯前端日语背单词 PWA——浏览器内导入 Anki .apkg，翻卡+三键自评复习，例句+智能关联词联动记忆，完全离线。

**架构：** 单向数据流 `.apkg → importer(浏览器内解析) → Worker(linker 预计算关联) → IndexedDB(Dexie) → scheduler 生成今日队列 → review UI`。无后端，静态部署。

**技术栈：** Vite + React 18 + TypeScript + Tailwind CSS + Dexie.js + react-router-dom + zustand（仅设置缓存）+ JSZip + sql.js + vite-plugin-pwa + Vitest + fake-indexeddb。

**规格：** `docs/superpowers/specs/2026-08-29-japanese-vocab-pwa-design.md`（用户已批准）。

**测试约定：** 所有测试放 `src/**/*.test.ts(x)`（与源码同目录）；`vitest.config.ts` 里 `environment: 'jsdom'`、`setupFiles: ['src/test-setup.ts']`（引入 fake-indexeddb）。纯函数测试不需要 DOM。运行单测命令统一为 `npx vitest run <file>`。

---

## 文件结构

```
tangochou/
├── index.html                          # 挂载点 + PWA meta
├── vite.config.ts                      # react + tailwind(v4 插件) + VitePWA
├── vitest.config.ts                    # jsdom + setupFiles
├── public/icon.svg                     # 应用图标
├── src/
│   ├── main.tsx                        # 入口：Router + 主题初始化
│   ├── App.tsx                         # 底部三 Tab 框架 + 路由表
│   ├── test-setup.ts                   # fake-indexeddb 注入
│   ├── db/
│   │   ├── types.ts                    # Deck/Word/Progress/AppSettings/Streak 类型（全项目唯一类型源）
│   │   ├── db.ts                       # Dexie schema + db 单例 + streak 读写
│   │   ├── db.test.ts
│   │   ├── backup.ts                   # 导出/导入 JSON 备份（音频 Blob↔base64）
│   │   └── backup.test.ts
│   ├── importer/
│   │   ├── apkg.ts                     # 解压 .apkg → RawModel/RawNote/媒体 Blob（纯解析，无 UI）
│   │   ├── apkg.test.ts
│   │   ├── guess.ts                    # 字段自动猜测（纯函数）
│   │   ├── guess.test.ts
│   │   ├── runImport.ts                # 词条构建+音频提取+批量入库（Worker 内跑的管线，纯函数可测）
│   │   ├── runImport.test.ts
│   │   ├── worker.ts                   # Web Worker 薄胶水：收消息→runImport→回报进度
│   │   └── ImportPage.tsx              # 选文件→映射确认→进度条→完成跳转
│   ├── linker/
│   │   ├── linker.ts                   # buildLinks 纯函数：同汉字/同词根/同课兜底
│   │   └── linker.test.ts
│   ├── scheduler/
│   │   ├── scheduler.ts                # review() 三键 + pickDailyQueue() + nextStreak()
│   │   └── scheduler.test.ts
│   ├── audio.ts                        # Blob 播放 helper
│   ├── today/TodayPage.tsx             # 今日任务卡 + 开始按钮 + 打卡天数
│   ├── review/
│   │   ├── CardBack.tsx                # 卡片背面（例句高亮 + 关联词分组）——Review 与详情共用
│   │   ├── CardBack.test.tsx           # 高亮与分组渲染测试
│   │   └── ReviewPage.tsx              # 翻卡流程 + 三键自评 + 进度持久化
│   ├── library/
│   │   ├── LibraryPage.tsx             # 牌组列表
│   │   ├── WordListPage.tsx            # 单词列表 + 搜索
│   │   ├── WordListPage.test.tsx       # filterWords 纯函数测试
│   │   └── WordDetailPage.tsx          # 词详情（复用 CardBack 只读）
│   └── settings/
│       ├── SettingsPage.tsx            # 新词上限/主题/备份/删除词库
│       └── useSettings.ts              # zustand：启动时从 db 读入，写穿回 db
```

职责边界：`db/` 是唯一允许直接读写 IndexedDB 的模块（`runImport.ts` 除外——它在 Worker 内批量写库，走同一 db.ts）；`linker`、`scheduler`、`guess`、`runImport` 全部是纯函数（不 import React、不碰 DOM），UI 组件只做渲染和调用。

---

## 数据类型（全计划统一引用 `src/db/types.ts`）

```ts
export interface Deck { id?: number; name: string; importedAt: number; wordCount: number }
export interface Example { ja: string; zh: string }
export type RelatedType = 'kanji' | 'stem' | 'lesson'
export interface RelatedWord { wordId: number; type: RelatedType; score: number }
export interface Word {
  id?: number; deckId: number; term: string; reading: string; meaning: string; pos: string;
  examples: Example[]; audio: Blob | null; tags: string[]; lesson: string | null;
  related: RelatedWord[];
}
export interface Progress {
  wordId: number; ease: number; interval: number; due: number;
  reps: number; lapses: number; lastReviewed: number | null; isNew: boolean;
}
export interface AppSettings { key: 'app'; dailyNewLimit: number; theme: 'light' | 'dark' | 'auto' }
export interface Streak { key: 'streak'; days: number; lastStudyDate: string } // YYYY-MM-DD
export const DAY = 86_400_000
export const MINUTE = 60_000
```

---

### 任务 1：项目脚手架 + 三 Tab 框架

**文件：** 创建 `package.json`、`vite.config.ts`、`vitest.config.ts`、`tsconfig.json`、`index.html`、`src/main.tsx`、`src/App.tsx`、`src/test-setup.ts`、`public/icon.svg`、`src/App.test.tsx`

- [ ] **步骤 1：初始化项目**

```bash
cd C:/Users/zhe/Documents/工作空间/tangochou
npm create vite@latest . -- --template react-ts
npm i dexie react-router-dom zustand jszip sql.js
npm i -D vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom fake-indexeddb tailwindcss @tailwindcss/vite vite-plugin-pwa @types/sql.js
```

- [ ] **步骤 2：配置文件**

`vite.config.ts`：

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(), tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '単語帳', short_name: '単語帳', start_url: '/',
        display: 'standalone', background_color: '#ffffff', theme_color: '#3b6ef5',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: { navigateFallback: '/index.html' },
    }),
  ],
})
```

`vitest.config.ts`：

```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { environment: 'jsdom', setupFiles: ['src/test-setup.ts'], globals: true },
})
```

`src/test-setup.ts`：

```ts
import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
```

`src/index.css`：`@import "tailwindcss";`，`public/icon.svg` 为任意简洁图形（如赤色圆 + 白字"単"）。

- [ ] **步骤 3：编写失败的测试** `src/App.test.tsx`

```tsx
import { render, screen } from '@testing-library/react'
import App from './App'

test('渲染底部三个 Tab', () => {
  render(<App />)
  expect(screen.getByText('今天')).toBeInTheDocument()
  expect(screen.getByText('词库')).toBeInTheDocument()
  expect(screen.getByText('设置')).toBeInTheDocument()
})
```

- [ ] **步骤 4：运行验证失败** — `npx vitest run src/App.test.tsx`，预期 FAIL（App.tsx 还是 Vite 默认内容）

- [ ] **步骤 5：实现 App 框架** `src/App.tsx`

```tsx
import { HashRouter, Routes, Route, NavLink, Outlet } from 'react-router-dom'
import TodayPage from './today/TodayPage'
import LibraryPage from './library/LibraryPage'
import SettingsPage from './settings/SettingsPage'

function Shell() {
  return (
    <div className="mx-auto flex h-screen max-w-md flex-col bg-white dark:bg-zinc-900 dark:text-zinc-100">
      <main className="flex-1 overflow-y-auto"><Outlet /></main>
      <nav className="flex border-t border-zinc-200 text-center text-sm dark:border-zinc-700">
        <NavLink to="/" className="flex-1 py-3 font-bold text-[#3b6ef5]">今天</NavLink>
        <NavLink to="/library" className="flex-1 py-3 text-zinc-500">词库</NavLink>
        <NavLink to="/settings" className="flex-1 py-3 text-zinc-500">设置</NavLink>
      </nav>
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<TodayPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/library/deck/:deckId" element={<LibraryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
```

`src/main.tsx` 渲染 `<App />` 并引入 `index.css`。同任务先建三个占位页（`TodayPage`/`LibraryPage`/`SettingsPage` 各返回 `<div>页面名</div>`，后续任务替换）。

- [ ] **步骤 6：运行验证通过** — `npx vitest run src/App.test.tsx`，预期 PASS

- [ ] **步骤 7：Commit** — `git add -A && git commit -m "chore: Vite+React+Tailwind 脚手架与三 Tab 框架"`

---

### 任务 2：Dexie 数据层

**文件：** 创建 `src/db/types.ts`（见上文"数据类型"，原样拷贝）、`src/db/db.ts`、`src/db/db.test.ts`

- [ ] **步骤 1：编写失败的测试** `src/db/db.test.ts`

```ts
import { db, getStreak, bumpStreak } from './db'
import type { Word } from './types'

test('写入并读回 Word', async () => {
  const w: Word = {
    deckId: 1, term: '食べる', reading: 'たべる', meaning: '吃', pos: '動・一段',
    examples: [{ ja: '朝ごはんを食べる。', zh: '吃早饭。' }], audio: null,
    tags: [], lesson: null, related: [],
  }
  const id = await db.words.add(w)
  expect((await db.words.get(id))?.term).toBe('食べる')
})

test('streak：同日不重复计，隔天断签重置为 1', async () => {
  await bumpStreak('2026-08-29')
  await bumpStreak('2026-08-29')
  expect((await getStreak()).days).toBe(1)
  await bumpStreak('2026-08-31')
  expect((await getStreak()).days).toBe(1)
})
```

- [ ] **步骤 2：运行验证失败** — `npx vitest run src/db/db.test.ts`，预期 FAIL（模块不存在）

- [ ] **步骤 3：实现** `src/db/db.ts`

```ts
import Dexie, { type Table } from 'dexie'
import { DAY, type AppSettings, type Deck, type Progress, type Streak, type Word } from './types'

export class TangoDB extends Dexie {
  decks!: Table<Deck, number>
  words!: Table<Word, number>
  progress!: Table<Progress, number>
  settings!: Table<AppSettings | Streak, string>
  constructor(name = 'tangochou') {
    super(name)
    this.version(1).stores({
      decks: '++id, name',
      words: '++id, deckId, term, lesson',
      progress: 'wordId, due, isNew',
      settings: 'key',
    })
  }
}
export const db = new TangoDB()

export async function getStreak(): Promise<Streak> {
  return (await db.settings.get('streak')) ?? { key: 'streak', days: 0, lastStudyDate: '' }
}

export async function bumpStreak(today: string): Promise<void> {
  const s = await getStreak()
  if (s.lastStudyDate === today) return
  const yesterday = new Date(Date.parse(today) - DAY).toISOString().slice(0, 10)
  const days = s.lastStudyDate === yesterday ? s.days + 1 : 1
  await db.settings.put({ key: 'streak', days, lastStudyDate: today })
}

export async function getAppSettings(): Promise<AppSettings> {
  return (await db.settings.get('app')) ?? { key: 'app', dailyNewLimit: 15, theme: 'auto' }
}
```

- [ ] **步骤 4：运行验证通过** — `npx vitest run src/db/db.test.ts`，预期 PASS

- [ ] **步骤 5：Commit** — `git add src/db && git commit -m "feat: Dexie 数据层（words/decks/progress/settings/streak）"`

---

### 任务 3：调度器（纯函数）

**文件：** 创建 `src/scheduler/scheduler.ts`、`src/scheduler/scheduler.test.ts`

- [ ] **步骤 1：编写失败的测试** `src/scheduler/scheduler.test.ts`

```ts
import { describe, expect, test } from 'vitest'
import { newProgress, pickDailyQueue, review } from './scheduler'
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
    expect(pickDailyQueue(words, prog, 2, now)).toEqual([2, 1, 3, 4]) // 复习2(过期)→1(未到期?见下)
  })
})
```

注意上面最后一行断言的语义：`due <= now` 才进复习队列——`1` 号词 due 在未来，**不**应出现。最终断言写 `expect(...).toEqual([2, 3, 4])`（复习：2；新词：3、4 达上限 2；1 未到期；5 超出限量）。请按此修正测试后再跑。

- [ ] **步骤 2：运行验证失败** — `npx vitest run src/scheduler/scheduler.test.ts`，预期 FAIL

- [ ] **步骤 3：实现** `src/scheduler/scheduler.ts`

```ts
import { DAY, MINUTE, type Progress, type Word } from '../db/types'

export type Rating = 'again' | 'hard' | 'good'
const MIN_EASE = 1.3
const MAX_EASE = 2.8

export function newProgress(wordId: number): Progress {
  return { wordId, ease: 2.5, interval: 0, due: 0, reps: 0, lapses: 0, lastReviewed: null, isNew: true }
}

export function review(p: Progress, rating: Rating, now = Date.now()): Progress {
  const next = { ...p, isNew: false }
  if (rating === 'again') {
    return { ...next, ease: Math.max(MIN_EASE, p.ease - 0.15), interval: 0,
      due: now + 10 * MINUTE, lapses: p.lapses + 1, lastReviewed: now }
  }
  if (rating === 'hard') {
    const interval = p.interval === 0 ? 0 : Math.max(1, Math.round(p.interval * 1.2))
    return { ...next, interval, due: p.interval === 0 ? now + 60 * MINUTE : now + interval * DAY,
      reps: p.reps + 1, lastReviewed: now }
  }
  const ease = Math.min(MAX_EASE, p.ease + 0.05)
  const interval = p.interval === 0 ? 1 : p.interval === 1 ? 3 : Math.round(p.interval * ease)
  return { ...next, ease, interval, due: now + interval * DAY, reps: p.reps + 1, lastReviewed: now }
}

export function pickDailyQueue(
  words: Word[], progress: Map<number, Progress>, dailyNewLimit: number, now = Date.now(),
): number[] {
  const due = words
    .filter((w) => { const p = progress.get(w.id!); return p && !p.isNew && p.due <= now })
    .sort((a, b) => progress.get(a.id!)!.due - progress.get(b.id!)!.due)
  const fresh = words.filter((w) => progress.get(w.id!)?.isNew)
  return [...due, ...fresh.slice(0, dailyNewLimit)].map((w) => w.id!)
}
```

- [ ] **步骤 4：运行验证通过** — `npx vitest run src/scheduler/scheduler.test.ts`，预期 PASS

- [ ] **步骤 5：Commit** — `git add src/scheduler && git commit -m "feat: SM-2 简化调度（三键自评/今日队列/新词限量）"`

---

### 任务 4：联动算法 linker（纯函数）

**文件：** 创建 `src/linker/linker.ts`、`src/linker/linker.test.ts`

- [ ] **步骤 1：编写失败的测试** `src/linker/linker.test.ts`

```ts
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
```

- [ ] **步骤 2：运行验证失败** — `npx vitest run src/linker/linker.test.ts`，预期 FAIL

- [ ] **步骤 3：实现** `src/linker/linker.ts`

```ts
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
```

- [ ] **步骤 4：运行验证通过** — `npx vitest run src/linker/linker.test.ts`，预期 PASS

- [ ] **步骤 5：Commit** — `git add src/linker && git commit -m "feat: 联动算法（同汉字加权/同词根前缀/同课兜底）"`

---

### 任务 5：Anki 解析器 apkg.ts

**文件：** 创建 `src/importer/apkg.ts`、`src/importer/apkg.test.ts`

- [ ] **步骤 1：编写失败的测试**（测试内用 sql.js 在内存中构建一个最小 .apkg，不提交二进制 fixture）`src/importer/apkg.test.ts`

```ts
import { describe, expect, test } from 'vitest'
import JSZip from 'jszip'
import initSqlJs from 'sql.js'
import { parseApkg } from './apkg'

async function buildApkg(): Promise<Blob> {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  db.run(`CREATE TABLE col (id INTEGER PRIMARY KEY, models TEXT); CREATE TABLE notes (id INTEGER PRIMARY KEY, mid INTEGER, flds TEXT, tags TEXT);`)
  const models = JSON.stringify([{ id: 1607392319001, name: 'Basic', flds: [{ name: '単語' }, { name: 'よみ' }, { name: '意味' }, { name: '例文' }] }])
  db.run('INSERT INTO col (id, models) VALUES (1, ?)', [models])
  db.run('INSERT INTO notes (id, mid, flds, tags) VALUES (1, 1607392319001, ?, ?)',
    ['食べる\x1fたべる\x1f吃\x1f朝ごはんを食べる。', 'JLPT::N4 教材::みんな'])
  const zip = new JSZip()
  zip.file('collection.anki2', new Uint8Array(db.export()))
  zip.file('media', JSON.stringify({ 0: 'pop.mp3' }))
  zip.file('0', new Blob(['MP3DATA']))
  return zip.generateAsync({ type: 'blob' })
}

describe('parseApkg', () => {
  test('解析出字段定义、笔记（\\x1f 分列、tags）、媒体', async () => {
    const raw = await parseApkg(await buildApkg())
    expect(raw.models[0].fieldNames).toEqual(['単語', 'よみ', '意味', '例文'])
    expect(raw.notes[0].fields).toEqual(['食べる', 'たべる', '吃', '朝ごはんを食べる。'])
    expect(raw.notes[0].tags).toEqual(['JLPT::N4', '教材::みんな'])
    const mp3 = raw.mediaFiles.get('pop.mp3')!
    expect(await mp3.text()).toBe('MP3DATA')
  })

  test('损坏文件：友好中文报错', async () => {
    await expect(parseApkg(new Blob(['not a zip']))).rejects.toThrow(/不是有效的/)
  })

  test('新版加密格式 anki21b：提示重新导出', async () => {
    const zip = new JSZip(); zip.file('collection.anki21b', new Uint8Array([1]))
    await expect(parseApkg(await zip.generateAsync({ type: 'blob' }))).rejects.toThrow(/重新导出/)
  })
})
```

- [ ] **步骤 2：运行验证失败** — `npx vitest run src/importer/apkg.test.ts`，预期 FAIL

- [ ] **步骤 3：实现** `src/importer/apkg.ts`

```ts
import JSZip from 'jszip'
import initSqlJs from 'sql.js'

export interface RawModel { id: number; name: string; fieldNames: string[] }
export interface RawNote { mid: number; fields: string[]; tags: string[] }
export interface RawApkg { models: RawModel[]; notes: RawNote[]; mediaFiles: Map<string, Blob> }

const FIELD_SEP = '\x1f'

export async function parseApkg(file: Blob): Promise<RawApkg> {
  let zip: JSZip
  try { zip = await JSZip.loadAsync(file) } catch { throw new Error('不是有效的 .apkg 文件（无法解压）') }

  if (zip.file('collection.anki21b')) {
    throw new Error('该 .apkg 使用新版加密格式，请用 Anki 桌面版重新导出并勾选"支持旧版本 Anki"')
  }
  const collection = zip.file('collection.anki2') ?? zip.file('collection.anki21')
  if (!collection) throw new Error('不是有效的 .apkg 文件（缺少牌组数据库）')

  const SQL = await initSqlJs()
  const db = new SQL.Database(new Uint8Array(await collection.async('arraybuffer')))
  const modelsJson = db.exec('SELECT models FROM col')[0]?.values[0]?.[0] as string
  if (!modelsJson) throw new Error('牌组数据库为空或已损坏')

  interface AnkiModel { id: number; name: string; flds: { name: string }[] }
  const models: RawModel[] = (JSON.parse(modelsJson) as AnkiModel[])
    .map((m) => ({ id: m.id, name: m.name, fieldNames: m.flds.map((f) => f.name) }))

  const notes: RawNote[] = []
  for (const row of db.exec('SELECT mid, flds, tags FROM notes')[0]?.values ?? []) {
    notes.push({
      mid: row[0] as number,
      fields: String(row[1]).split(FIELD_SEP),
      tags: String(row[2] ?? '').split(' ').filter(Boolean),
    })
  }

  const mediaFiles = new Map<string, Blob>()
  const mediaManifest = zip.file('media')
  if (mediaManifest) {
    const entries = Object.entries(JSON.parse(await mediaManifest.async('string')) as Record<string, string>)
    for (const [idx, filename] of entries) {
      const f = zip.file(idx)
      if (f) mediaFiles.set(filename, await f.async('blob'))
    }
  }
  return { models, notes, mediaFiles }
}
```

- [ ] **步骤 4：运行验证通过** — `npx vitest run src/importer/apkg.test.ts`，预期 PASS
- [ ] **步骤 5：Commit** — `git add src/importer && git commit -m "feat: .apkg 浏览器内解析（notes/models/媒体，友好报错）"`

---

### 任务 6：字段猜测 guess.ts

**文件：** 创建 `src/importer/guess.ts`、`src/importer/guess.test.ts`

- [ ] **步骤 1：编写失败的测试** `src/importer/guess.test.ts`

```ts
import { expect, test } from 'vitest'
import { guessMapping } from './guess'

test('按内容特征自动映射：单词/读音/释义/例句', () => {
  const fieldNames = ['Front', 'よみ', 'Back', '例文']
  const sample = [
    ['食べる', 'たべる', '吃', '朝ごはんを食べる。'],
    ['飲む', 'のむ', '喝', 'コーヒーを飲む。'],
    ['山', 'やま', '山', '山に登る。'],
  ]
  expect(guessMapping(fieldNames, sample)).toEqual({ term: 0, reading: 1, meaning: 2, example: 3 })
})

test('没有例句列时 example 为 null；无假名列时 reading 为 null', () => {
  const sample = [['食べる', '吃'], ['飲む', '喝']]
  expect(guessMapping(['単語', '意味'], sample)).toEqual({ term: 0, reading: null, meaning: 1, example: null })
})
```

- [ ] **步骤 2：运行验证失败** — `npx vitest run src/importer/guess.test.ts`，预期 FAIL

- [ ] **步骤 3：实现** `src/importer/guess.ts`

```ts
export interface FieldGuess { term: number; reading: number | null; meaning: number; example: number | null }

const KANA_RE = /^[\u3040-\u309f\u30fc\u3005]+$/
const HAS_KANA_RE = /[\u3040-\u309f]/
const HAS_KANJI_RE = /[\u3400-\u9faf]/
const SENTENCE_END_RE = /[。！？.]$/

function column(samples: string[][], col: number): string[] {
  return samples.map((f) => f[col] ?? '').filter((s) => s !== '')
}

export function guessMapping(fieldNames: string[], samples: string[][]): FieldGuess {
  const n = fieldNames.length
  let term = 0, reading: number | null = null, meaning = n > 1 ? 1 : 0, example: number | null = null

  for (let c = 0; c < n; c++) {
    const vals = column(samples, c)
    if (!vals.length) continue
    if (reading === null && vals.every((v) => KANA_RE.test(v))) reading = c
  }
  for (let c = 0; c < n; c++) {
    if (c === reading) continue
    const vals = column(samples, c)
    if (!vals.length) continue
    // 例句：以句号结尾且含假名的长文本
    if (example === null && vals.some((v) => v.length > 8 && HAS_KANA_RE.test(v) && SENTENCE_END_RE.test(v.trim()))) {
      example = c; continue
    }
  }
  // 单词：含汉字、不含假名整列特征最弱的第一个非读音/例句列（默认 0 已满足多数 Anki 模板）
  const used = new Set([reading, example].filter((x): x is number => x !== null))
  const candidates = [...Array(n).keys()].filter((c) => !used.has(c))
  term = candidates.find((c) => column(samples, c).some((v) => HAS_KANJI_RE.test(v) && !KANA_RE.test(v)))
    ?? candidates[0] ?? 0
  meaning = candidates.find((c) => c !== term) ?? term
  return { term, reading, meaning, example }
}
```

- [ ] **步骤 4：运行验证通过** — `npx vitest run src/importer/guess.test.ts`，预期 PASS
- [ ] **步骤 5：Commit** — `git add src/importer/guess.ts src/importer/guess.test.ts && git commit -m "feat: 导入字段自动猜测"`

---

### 任务 7：导入管线 runImport + Worker + 导入页

**文件：** 创建 `src/importer/runImport.ts`、`src/importer/runImport.test.ts`、`src/importer/worker.ts`、`src/importer/ImportPage.tsx`、`src/audio.ts`；修改 `src/App.tsx`（加 `/import` 路由）、`src/library/LibraryPage.tsx`（加"导入牌组"入口）

- [ ] **步骤 1：编写失败的测试** `src/importer/runImport.test.ts`

```ts
import { describe, expect, test } from 'vitest'
import { buildWords, extractAudioName } from './runImport'
import type { RawNote } from './apkg'

const note: RawNote = { mid: 1, fields: ['食べる', 'たべる', '吃 [sound:pop.mp3]', '朝ごはんを食べる。'], tags: ['JLPT::N4'] }

describe('runImport 管线', () => {
  test('extractAudioName 从任意字段提取 [sound:xxx]', () => {
    expect(extractAudioName(note.fields)).toBe('pop.mp3')
    expect(extractAudioName(['a', 'b'])).toBeNull()
  })

  test('buildWords：映射成 Word 雏形（含 tags→lesson 线索、无例句时空数组）', () => {
    const words = buildWords(
      [note],
      { term: 0, reading: 1, meaning: 2, example: 3 },
      new Map([[1, { id: 1, name: 'Basic', fieldNames: ['単語', 'よみ', '意味', '例文'] }]]),
      7, // deckId
    )
    expect(words).toHaveLength(1)
    const w = words[0]
    expect(w).toMatchObject({ deckId: 7, term: '食べる', reading: 'たべる', meaning: '吃', lesson: 'JLPT::N4' })
    expect(w.examples).toEqual([{ ja: '朝ごはんを食べる。', zh: '' }]) // 无中文翻译列 → zh 为空串
  })
})
```

- [ ] **步骤 2：运行验证失败** — `npx vitest run src/importer/runImport.test.ts`，预期 FAIL

- [ ] **步骤 3：实现** `src/importer/runImport.ts`

```ts
import type { RawApkg, RawModel, RawNote } from './apkg'
import type { FieldGuess } from './guess'
import { buildLinks, type WordSeed } from '../linker/linker'
import { newProgress } from '../scheduler/scheduler'
import { db } from '../db/db'
import type { Word } from '../db/types'

const SOUND_RE = /\[sound:([^\]]+)\]/

export function extractAudioName(fields: string[]): string | null {
  for (const f of fields) { const m = f.match(SOUND_RE); if (m) return m[1] }
  return null
}

function cleanField(s: string): string { return s.replace(SOUND_RE, '').trim() }

export function buildWords(
  notes: RawNote[], guess: FieldGuess, models: Map<number, RawModel>, deckId: number,
): Word[] {
  return notes.map((n) => {
    const f = n.fields
    const example = guess.example !== null ? cleanField(f[guess.example] ?? '') : ''
    return {
      deckId,
      term: cleanField(f[guess.term] ?? ''),
      reading: guess.reading !== null ? cleanField(f[guess.reading] ?? '') : '',
      meaning: cleanField(f[guess.meaning] ?? ''),
      pos: n.tags.find((t) => /動|名|形|副|助|接/i.test(t)) ?? '',
      examples: example ? [{ ja: example, zh: '' }] : [],
      audio: null,
      tags: n.tags,
      lesson: n.tags[0] ?? null, // 首个 tag 作为课/分组线索
      related: [],
    }
  }).filter((w) => w.term !== '')
}

/** Worker 内执行：建 deck → 词条 → 关联 → 音频 → 全部入库。onProgress(已处理, 总数) */
export async function runImport(
  raw: RawApkg, guess: FieldGuess, deckName: string,
  onProgress: (done: number, total: number) => void,
): Promise<number> {
  const deckId = await db.decks.add({ name: deckName, importedAt: Date.now(), wordCount: 0 })
  const words = buildWords(raw.notes, guess, new Map(raw.models.map((m) => [m.id, m])), deckId)
  const seeds: WordSeed[] = words.map((w, i) => ({ id: i, term: w.term, reading: w.reading, deckId, lesson: w.lesson }))
  const links = buildLinks(seeds)
  const idMap = seeds.map((s) => s.id)
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    w.related = (links.get(i) ?? []).map((r) => ({ wordId: idMap[r.wordId] + 1, type: r.type, score: r.score }))
    const name = extractAudioName(raw.notes.filter((_, ni) => true)[i]?.fields ?? [])
    if (name && raw.mediaFiles.has(name)) w.audio = raw.mediaFiles.get(name)!
    w.audio = w.audio ?? null
  }
  // 分批入库：词条 id 自增后与 progress.wordId 对齐
  let done = 0
  const total = words.length
  for (let i = 0; i < total; i += 200) {
    const batch = words.slice(i, i + 200)
    const ids = await db.words.bulkAdd(batch, { allKeys: true }) as number[]
    await db.progress.bulkPut(ids.map((wid) => newProgress(wid)))
    done += batch.length
    onProgress(done, total)
  }
  await db.decks.update(deckId, { wordCount: total })
  return deckId
}
```

实现注意（给执行者的硬约束）：上面 `extractAudioName` 处用了 `raw.notes.filter(...)` 是错误味道——`raw.notes` 与 `words` 按 notes 过滤后索引**不再对齐**。正确做法：`buildWords` 返回时同时返回每词的源 note 引用（改为返回 `{ words, audioNames: (string|null)[] }`），`runImport` 直接用 `audioNames[i]`。执行本任务时按此重构并同步修正测试断言（`buildWords` 返回结构变化）。

- [ ] **步骤 4：运行验证通过** — `npx vitest run src/importer/runImport.test.ts`，预期 PASS

- [ ] **步骤 5：Worker 薄胶水** `src/importer/worker.ts`

```ts
/// <reference lib="webworker" />
import { parseApkg } from './apkg'
import { runImport } from './runImport'
import type { FieldGuess } from './guess'

self.onmessage = async (e: MessageEvent<{ file: Blob; guess: FieldGuess; deckName: string }>) => {
  const { file, guess, deckName } = e.data
  try {
    const raw = await parseApkg(file)
    const deckId = await runImport(raw, guess, deckName, (done, total) =>
      self.postMessage({ type: 'progress', done, total }))
    self.postMessage({ type: 'done', deckId })
  } catch (err) {
    self.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
```

- [ ] **步骤 6：导入页** `src/importer/ImportPage.tsx`

```tsx
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { parseApkg } from './apkg'
import { guessMapping, type FieldGuess } from './guess'

const LABELS: Record<keyof FieldGuess, string> = { term: '单词', reading: '读音', meaning: '释义', example: '例句' }

export default function ImportPage() {
  const [guess, setGuess] = useState<FieldGuess | null>(null)
  const [fieldNames, setFieldNames] = useState<string[]>([])
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState('')
  const fileRef = useRef<File | null>(null)
  const navigate = useNavigate()

  async function onFile(f: File) {
    fileRef.current = f
    setError('')
    try {
      const raw = await parseApkg(f)
      const model = raw.models[0]
      setFieldNames(model.fieldNames)
      setGuess(guessMapping(model.fieldNames, raw.notes.slice(0, 30).map((n) => n.fields)))
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  function startImport() {
    if (!guess || !fileRef.current) return
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e) => {
      if (e.data.type === 'progress') setProgress(e.data)
      if (e.data.type === 'done') navigate(`/library/deck/${e.data.deckId}`)
      if (e.data.type === 'error') setError(e.data.message)
    }
    worker.postMessage({ file: fileRef.current, guess, deckName: fileRef.current.name.replace(/\.apkg$/i, '') })
  }

  function setPart(part: keyof FieldGuess, col: string) {
    setGuess((g) => g && { ...g, [part]: col === '' ? null : Number(col) })
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">导入 Anki 牌组</h1>
      <input type="file" accept=".apkg" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      {error && <p className="rounded bg-red-50 p-3 text-red-600">{error}</p>}
      {guess && !progress && (
        <div className="space-y-2">
          {(Object.keys(LABELS) as (keyof FieldGuess)[]).map((part) => (
            <label key={part} className="flex items-center gap-2">
              <span className="w-12">{LABELS[part]}</span>
              <select className="rounded border p-1" value={guess[part] ?? ''} onChange={(e) => setPart(part, e.target.value)}>
                <option value="">（无）</option>
                {fieldNames.map((f, i) => <option key={i} value={i}>{f}</option>)}
              </select>
            </label>
          ))}
          <button className="w-full rounded bg-[#3b6ef5] py-2 font-bold text-white" onClick={startImport}>开始导入</button>
        </div>
      )}
      {progress && (
        <div>
          <div className="h-2 rounded bg-zinc-200"><div className="h-2 rounded bg-[#3b6ef5]" style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
          <p className="mt-2 text-sm text-zinc-500">正在导入 {progress.done} / {progress.total}</p>
        </div>
      )}
    </div>
  )
}
```

App.tsx 路由表追加：`<Route path="/import" element={<ImportPage />} />`；LibraryPage 占位内容替换为牌组列表（`useLiveQuery(() => db.decks.toArray())`）+ 顶部「导入牌组」按钮（Link to `/import`）。

- [ ] **步骤 7：全量测试 + 手动冒烟** — `npx vitest run` 全绿；`npm run dev` 手动导入一个真实 .apkg 走通（解析→映射→进度→词库可见）
- [ ] **步骤 8：Commit** — `git add -A && git commit -m "feat: 导入管线+Worker+导入映射页"`

---

### 任务 8：卡片背面 CardBack（联动记忆展示）

**文件：** 创建 `src/review/CardBack.tsx`、`src/review/CardBack.test.tsx`

- [ ] **步骤 1：编写失败的测试** `src/review/CardBack.test.tsx`

```tsx
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
```

- [ ] **步骤 2：运行验证失败** — `npx vitest run src/review/CardBack.test.tsx`，预期 FAIL
- [ ] **步骤 3：实现** `src/review/CardBack.tsx`

```tsx
import type { RelatedType, Word } from '../db/types'

const GROUPS: { type: RelatedType; label: string; cls: string }[] = [
  { type: 'kanji', label: '同汉字', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { type: 'stem', label: '同词根', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  { type: 'lesson', label: '同课', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
]

function Highlight({ sentence, term }: { sentence: string; term: string }) {
  const idx = sentence.indexOf(term)
  if (idx < 0) return <>{sentence}</>
  return (<>
    {sentence.slice(0, idx)}<mark className="rounded bg-yellow-200 px-0.5 font-bold">{term}</mark>{sentence.slice(idx + term.length)}
  </>)
}

export default function CardBack({ word, wordsById, onJump }: {
  word: Word
  wordsById: Map<number, Word>
  onJump?: (wordId: number) => void
}) {
  return (
    <div className="space-y-4 text-center">
      <div>
        <div className="text-4xl font-bold">{word.term}</div>
        <div className="text-zinc-500">{word.reading} {word.pos && <span className="ml-1 rounded bg-indigo-50 px-1 text-xs text-indigo-600">{word.pos}</span>}</div>
        <div className="mt-1 text-lg"><strong>{word.meaning}</strong></div>
      </div>
      {word.examples.length > 0 && (
        <div className="rounded-lg bg-zinc-50 p-3 text-left dark:bg-zinc-800">
          <div className="mb-1 text-[11px] font-bold uppercase text-zinc-400">例句</div>
          <p className="text-base leading-relaxed"><Highlight sentence={word.examples[0].ja} term={word.term} /></p>
          {word.examples[0].zh && <p className="text-sm text-zinc-500">{word.examples[0].zh}</p>}
        </div>
      )}
      <div className="text-left">
        <div className="mb-1 text-[11px] font-bold uppercase text-zinc-400">相关单词 · 点击跳转</div>
        {GROUPS.map((g) => {
          const items = word.related.filter((r) => r.type === g.type && wordsById.has(r.wordId))
          if (!items.length) return null
          return (
            <div key={g.type} className="mb-2">
              <div className="text-xs text-zinc-400">{g.label}</div>
              {items.map((r) => {
                const w = wordsById.get(r.wordId)!
                return (
                  <button key={r.wordId} onClick={() => onJump?.(r.wordId)}
                    className={`mr-1 mt-1 inline-block rounded-full border px-2.5 py-1 text-sm ${g.cls}`}>
                    {w.term}{w.reading && <span className="ml-1 opacity-60">〈{w.reading}〉</span>}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **步骤 4：运行验证通过** — `npx vitest run src/review/CardBack.test.tsx`，预期 PASS
- [ ] **步骤 5：Commit** — `git add src/review && git commit -m "feat: 卡片背面（例句高亮+关联词三组分组）"`

---

### 任务 9：背卡页 ReviewPage

**文件：** 创建 `src/review/ReviewPage.tsx`、`src/audio.ts`；修改 `src/App.tsx`（加 `/review` 路由）

- [ ] **步骤 1：实现音频 helper** `src/audio.ts`

```ts
export function playBlob(blob: Blob): void {
  new Audio(URL.createObjectURL(blob)).play().catch(() => {/* 无声环境忽略 */ })
}
```

- [ ] **步骤 2：实现 ReviewPage** `src/review/ReviewPage.tsx`

```tsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db, bumpStreak, getStreak } from '../db/db'
import { pickDailyQueue, review, type Rating } from '../scheduler/scheduler'
import type { Rating as R } from '../scheduler/scheduler'
import CardBack from './CardBack'
import { playBlob } from '../audio'
import type { Rating } from '../scheduler/scheduler'

const BUTTONS: { rating: Rating; label: string; cls: string }[] = [
  { rating: 'again', label: '😭 不认识', cls: 'bg-red-50 text-red-600' },
  { rating: 'hard', label: '😐 模糊', cls: 'bg-amber-50 text-amber-600' },
  { rating: 'good', label: '😊 认识', cls: 'bg-emerald-50 text-emerald-600' },
]

export default function ReviewPage() {
  const nav = useNavigate()
  const [session, setSession] = useState<{ ids: number[]; idx: number; revealed: boolean } | null>(null)
  const [wordsById, setWordsById] = useState<Map<number, Awaited<ReturnType<typeof loadWords>>>>(new Map())

  async function loadWords(ids: number[]) {
    const m = new Map<number, NonNullable<Awaited<ReturnType<typeof db.words.get>>>>()
    for (const id of ids) { const w = await db.words.get(id); if (w) m.set(id, w) }
    return m
  }

  useEffect(() => {
    (async () => {
      const settings = await db.settings.get('app')
      const [words, prog] = await Promise.all([db.words.toArray(), db.progress.toArray()])
      const map = new Map(prog.map((p) => [p.wordId, p]))
      const ids = pickDailyQueue(words, map, settings?.dailyNewLimit ?? 15)
      setWordsById(await loadWords(ids))
      setSession({ ids, idx: 0, revealed: false })
    })()
  }, [])

  async function onRate(rating: R) {
    if (!session) return
    const wordId = session.ids[session.idx]
    const p = await db.progress.get(wordId)
    if (p) await db.progress.put(review(p, rating))
    if (session.idx + 1 >= session.ids.length) {
      await bumpStreak(new Date().toISOString().slice(0, 10))
      const s = await getStreak()
      nav('/', { state: { finished: true, streakDays: s.days } })
    } else {
      setSession({ ...session, idx: session.idx + 1, revealed: false })
    }
  }

  if (!session) return <div className="p-4">加载中…</div>
  if (session.ids.length === 0) return <div className="p-8 text-center text-zinc-500">今天没有要背的单词 🎉</div>

  const word = wordsById.get(session.ids[session.idx])
  if (!word) return null

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-2 text-center text-sm text-zinc-400">{session.idx + 1} / {session.ids.length}</div>
      <div className="h-1 rounded bg-zinc-200"><div className="h-1 rounded bg-[#3b6ef5]" style={{ width: `${((session.idx) / session.ids.length) * 100}%` }} /></div>
      <div className="flex flex-1 cursor-pointer flex-col items-center justify-center"
        onClick={() => setSession({ ...session, revealed: true })}>
        {!session.revealed ? (
          <div className="text-center">
            <div className="text-5xl font-bold">{word.term}</div>
            {word.audio && <button className="mt-3 text-2xl" onClick={(e) => { e.stopPropagation(); playBlob(word.audio!) }}>▶</button>}
            <div className="mt-6 text-sm text-zinc-400">点击卡片显示答案</div>
          </div>
        ) : (
          <div className="w-full">
            <CardBack word={word} wordsById={wordsById} onJump={undefined} />
          </div>
        )}
      </div>
      {session.revealed && (
        <div className="flex gap-2 pb-2">
          {BUTTONS.map((b) => (
            <button key={b.rating} className={`flex-1 rounded-lg py-3 font-bold ${b.cls}`} onClick={() => onRate(b.rating)}>{b.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}
```

（执行者注意：顶部 import 有重复的 `Rating`，只保留 `import { pickDailyQueue, review, type Rating } from '../scheduler/scheduler'` 一处。`wordsById` 的 state 类型直接写 `Map<number, Word>`，从 `../db/types` 引入。）

- [ ] **步骤 3：路由与入口** — App.tsx 加 `<Route path="/review" element={<ReviewPage />} />`；TodayPage（下一任务完善前先放一个 Link to `/review`）
- [ ] **步骤 4：全量测试 + 手动冒烟** — `npx vitest run` 全绿；`npm run dev`：导入 → 开始背诵 → 翻卡 → 三键 → 完成回首页；刷新页面后已评记录不重置（progress 表有值）
- [ ] **步骤 5：Commit** — `git add -A && git commit -m "feat: 背卡页（翻卡/三键自评/进度持久化/音频播放）"`

---

### 任务 10：今天页 + 打卡

**文件：** 修改 `src/today/TodayPage.tsx`；创建 `src/today/TodayPage.test.tsx`

- [ ] **步骤 1：编写失败的测试** `src/today/TodayPage.test.tsx`

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TodayPage from './TodayPage'
import { db } from '../db/db'
import { newProgress } from '../scheduler/scheduler'
import type { Word } from '../db/types'

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
```

- [ ] **步骤 2：运行验证失败** — `npx vitest run src/today/TodayPage.test.tsx`，预期 FAIL
- [ ] **步骤 3：实现 TodayPage**

```tsx
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getAppSettings, getStreak } from '../db/db'
import { pickDailyQueue } from '../scheduler/scheduler'
import { useEffect, useState } from 'react'

export default function TodayPage() {
  const words = useLiveQuery(() => db.words.toArray(), [])
  const progress = useLiveQuery(() => db.progress.toArray(), [])
  const [info, setInfo] = useState({ news: 0, due: 0, streakDays: 0 })
  useEffect(() => {
    (async () => {
      const s = await getStreak()
      const settings = await getAppSettings()
      if (words && progress) {
        const q = pickDailyQueue(words, new Map(progress.map((p) => [p.wordId, p])), settings.dailyNewLimit)
        const news = q.filter((id) => progress.find((p) => p.wordId === id)?.isNew).length
        setInfo({ news, due: q.length - news, streakDays: s.days })
      }
    })()
  }, [words, progress])

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <div className="text-sm text-zinc-400">今天</div>
        <div className="mt-2 rounded-2xl bg-indigo-50 px-10 py-6 dark:bg-zinc-800">
          <div className="text-4xl font-bold text-[#3b6ef5]">{info.news} <span className="text-base font-normal text-zinc-500">个新词</span></div>
          <div className="mt-1 text-sm text-zinc-500">{info.due} 个待复习</div>
        </div>
        {info.streakDays > 0 && <div className="mt-3 text-sm text-orange-500">🔥 连续打卡 {info.streakDays} 天</div>}
      </div>
      <Link to="/review" className="w-full max-w-xs rounded-full bg-[#3b6ef5] py-3 text-center font-bold text-white">
        {info.news + info.due > 0 ? '开始背诵 →' : '去复习 →'}
      </Link>
    </div>
  )
}
```

需要安装 `dexie-react-hooks`：`npm i dexie-react-hooks`。
- [ ] **步骤 4：运行验证通过** — `npx vitest run src/today/TodayPage.test.tsx`，预期 PASS
- [ ] **步骤 5：Commit** — `git add -A && git commit -m "feat: 今天页（今日队列统计/打卡天数/开始入口）"`

---

### 任务 11：词库页 + 词详情

**文件：** 创建 `src/library/WordListPage.tsx`、`src/library/WordListPage.test.tsx`、`src/library/WordDetailPage.tsx`；修改 `src/library/LibraryPage.tsx`、`src/App.tsx`

- [ ] **步骤 1：编写失败的测试**（搜索过滤纯函数）`src/library/WordListPage.test.tsx`

```ts
import { expect, test } from 'vitest'
import { filterWords } from './WordListPage'
import type { Word } from '../db/types'

const W = (over: Partial<Word>): Word => ({
  id: 1, deckId: 1, term: '', reading: '', meaning: '', pos: '', examples: [], audio: null, tags: [], lesson: null, related: [], ...over,
})

test('按单词/读音/释义前缀搜索', () => {
  const words = [W({ id: 1, term: '食べる', reading: 'たべる', meaning: '吃' }), W({ id: 2, term: '飲む', reading: 'のむ', meaning: '喝' })]
  expect(filterWords(words, 'たべ').map((w) => w.id)).toEqual([1])
  expect(filterWords(words, '喝').map((w) => w.id)).toEqual([2])
  expect(filterWords(words, '')).toHaveLength(2)
})
```

- [ ] **步骤 2：运行验证失败** — `npx vitest run src/library/WordListPage.test.tsx`，预期 FAIL
- [ ] **步骤 3：实现** WordListPage

```tsx
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Word } from '../db/types'

export function filterWords(words: Word[], q: string): Word[] {
  if (!q) return words
  const s = q.trim().toLowerCase()
  return words.filter((w) => w.term.includes(s) || w.reading.includes(s) || w.meaning.toLowerCase().includes(s))
}

export default function WordListPage() {
  const { deckId } = useParams()
  const [q, setQ] = useState('')
  const deck = useLiveQuery(() => db.decks.get(Number(deckId)), [deckId])
  const words = useLiveQuery(() => db.words.where('deckId').equals(Number(deckId)).toArray(), [deckId])
  const shown = filterWords(words ?? [], q)

  return (
    <div className="p-4">
      <h1 className="mb-3 text-xl font-bold">{deck?.name ?? '词库'}</h1>
      <input className="mb-3 w-full rounded-lg border p-2 dark:bg-zinc-800" placeholder="搜索单词/读音/释义"
        value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="divide-y">
        {shown.map((w) => (
          <li key={w.id}>
            <Link to={`/word/${w.id}`} className="flex items-center justify-between py-3">
              <span className="font-bold">{w.term}</span>
              <span className="text-sm text-zinc-400">{w.reading} · {w.meaning}</span>
            </Link>
          </li>
        ))}
      </ul>
      {words && words.length === 0 && <p className="mt-8 text-center text-zinc-400">这个牌组还没有单词</p>}
    </div>
  )
}
```

- [ ] **步骤 4：运行验证通过** — `npx vitest run src/library/WordListPage.test.tsx`，预期 PASS
- [ ] **步骤 5：词详情页 + 路由** `src/library/WordDetailPage.tsx`

```tsx
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import CardBack from '../review/CardBack'

export default function WordDetailPage() {
  const { wordId } = useParams()
  const word = useLiveQuery(() => db.words.get(Number(wordId)), [wordId])
  const deckWords = useLiveQuery(() => db.words.where('deckId').equals(word?.deckId ?? -1).toArray(), [word?.deckId])
  if (!word) return <div className="p-4">加载中…</div>
  const wordsById = new Map((deckWords ?? []).map((w) => [w.id!, w]))
  return (
    <div className="p-4">
      <Link to={`/library/deck/${word.deckId}`} className="text-sm text-[#3b6ef5]">← 返回列表</Link>
      <div className="mt-4"><CardBack word={word} wordsById={wordsById} onJump={(id) => location.assign(`#/word/${id}`)} /></div>
    </div>
  )
}
```

App.tsx 路由表追加：`<Route path="/word/:wordId" element={<WordDetailPage />} />`；LibraryPage 完整实现（替换占位）：

```tsx
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'

export default function LibraryPage() {
  const decks = useLiveQuery(() => db.decks.toArray(), [])
  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold">词库</h1>
        <Link to="/import" className="rounded-full bg-[#3b6ef5] px-4 py-1.5 text-sm font-bold text-white">导入牌组</Link>
      </div>
      <ul className="divide-y">
        {(decks ?? []).map((d) => (
          <li key={d.id}>
            <Link to={`/library/deck/${d.id}`} className="flex items-center justify-between py-3">
              <span className="font-bold">{d.name}</span>
              <span className="text-sm text-zinc-400">{d.wordCount} 词</span>
            </Link>
          </li>
        ))}
      </ul>
      {decks && decks.length === 0 && <p className="mt-8 text-center text-zinc-400">还没有牌组，先导入一个 .apkg 吧</p>}
    </div>
  )
}
```

- [ ] **步骤 6：全量测试 + 手动冒烟** — `npx vitest run` 全绿；手动：词库→牌组→列表→搜索→详情→关联词跳转
- [ ] **步骤 7：Commit** — `git add -A && git commit -m "feat: 词库浏览（牌组/列表搜索/词详情关联跳转）"`

---

### 任务 12：设置页 + 备份 + 主题 + 收尾

**文件：** 创建 `src/db/backup.ts`、`src/db/backup.test.ts`、`src/settings/useSettings.ts`；修改 `src/settings/SettingsPage.tsx`、`src/main.tsx`

- [ ] **步骤 1：编写失败的测试** `src/db/backup.test.ts`

```ts
import { expect, test } from 'vitest'
import { encodeAudio, decodeAudio } from './backup'

test('Blob ↔ base64 往返', async () => {
  const blob = new Blob(['MP3DATA'], { type: 'audio/mpeg' })
  const b64 = await encodeAudio(blob)
  const back = await decodeAudio(b64)
  expect(await back.text()).toBe('MP3DATA')
  expect(back.type).toBe('audio/mpeg')
})
```

- [ ] **步骤 2：运行验证失败** — `npx vitest run src/db/backup.test.ts`，预期 FAIL
- [ ] **步骤 3：实现** `src/db/backup.ts`

```ts
import { db } from './db'
import type { AppSettings, Deck, Progress, Streak, Word } from './types'

export async function encodeAudio(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < buf.length; i += 0x8000)
    bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return `data:${blob.type};base64,${btoa(bin)}`
}

export async function decodeAudio(dataUrl: string): Promise<Blob> {
  const [meta, b64] = dataUrl.split(',')
  const type = meta.slice(5).split(';')[0]
  const bin = atob(b64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return new Blob([buf], { type })
}

interface Backup { version: 1; decks: Deck[]; words: Omit<Word, 'audio'>[]; audioByWordId: Record<string, string | undefined>; progress: Progress[]; settings: (AppSettings | Streak)[] }

export async function exportBackup(): Promise<Blob> {
  const [decks, words, progress, settings] = await Promise.all([
    db.decks.toArray(), db.words.toArray(), db.progress.toArray(), db.settings.toArray(),
  ])
  const audioByWordId: Record<string, string | undefined> = {}
  const bareWords = []
  for (const w of words) {
    const { audio, ...rest } = w
    audioByWordId[String(w.id)] = audio ? await encodeAudio(audio) : undefined
    bareWords.push(rest)
  }
  const backup: Backup = { version: 1, decks, words: bareWords, audioByWordId, progress, settings }
  return new Blob([JSON.stringify(backup)], { type: 'application/json' })
}

export async function importBackup(file: Blob): Promise<void> {
  const backup = JSON.parse(await file.text()) as Backup
  if (backup.version !== 1) throw new Error('不支持的备份文件版本')
  await db.transaction('rw', [db.decks, db.words, db.progress, db.settings], async () => {
    await Promise.all([db.decks.clear(), db.words.clear(), db.progress.clear(), db.settings.clear()])
    const ids = await db.words.bulkAdd(backup.words as Word[], { allKeys: true }) as number[]
    await Promise.all(ids.map((id, i) => {
      const dataUrl = backup.audioByWordId[String(backup.words[i].id)]
      const audio = dataUrl ? decodeAudio(dataUrl) : Promise.resolve(null)
      return audio.then((b) => db.words.update(id, b ? { audio: b } : {}))
    }))
    await db.decks.bulkPut(backup.decks)
    await db.progress.bulkPut(backup.progress)
    await db.settings.bulkPut(backup.settings)
  })
}
```

- [ ] **步骤 4：运行验证通过** — `npx vitest run src/db/backup.test.ts`，预期 PASS

- [ ] **步骤 5：设置缓存 + 主题** `src/settings/useSettings.ts`

```ts
import { create } from 'zustand'
import { db, getAppSettings } from '../db/db'
import type { AppSettings } from '../db/types'

interface SettingsState { settings: AppSettings | null; setTheme: (t: AppSettings['theme']) => void; setDailyNewLimit: (n: number) => void }

export const useSettings = create<SettingsState>((set) => ({
  settings: null,
  setTheme: (theme) => {
    void db.settings.put({ key: 'app', dailyNewLimit: useSettings.getState().settings?.dailyNewLimit ?? 15, theme })
    set((s) => ({ settings: s.settings ? { ...s.settings, theme } : s.settings }))
  },
  setDailyNewLimit: (dailyNewLimit) => {
    void db.settings.put({ key: 'app', dailyNewLimit, theme: useSettings.getState().settings?.theme ?? 'auto' })
    set((s) => ({ settings: s.settings ? { ...s.settings, dailyNewLimit } : s.settings }))
  },
}))

export async function loadSettings(): Promise<void> {
  const settings = await getAppSettings()
  useSettings.setState({ settings })
}
```

`main.tsx` 启动时 `await loadSettings()` 后渲染，并订阅 `settings.theme`：`light` → 移除 html `dark`；`dark` → 加 `dark`；`auto` → 跟随 `matchMedia('(prefers-color-scheme: dark)')`。

- [ ] **步骤 6：设置页** `src/settings/SettingsPage.tsx`

```tsx
import { useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { exportBackup, importBackup } from '../db/backup'
import { useSettings } from './useSettings'

export default function SettingsPage() {
  const { settings, setTheme, setDailyNewLimit } = useSettings()
  const decks = useLiveQuery(() => db.decks.toArray(), [])
  const fileRef = useRef<HTMLInputElement>(null)

  async function onExport() {
    const blob = await exportBackup()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `tangochou-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
  }

  return (
    <div className="space-y-6 p-4">
      <h1 className="text-xl font-bold">设置</h1>
      <label className="flex items-center justify-between">
        <span>每日新词上限</span>
        <input type="number" min={5} max={100} className="w-20 rounded border p-1 dark:bg-zinc-800"
          value={settings?.dailyNewLimit ?? 15}
          onChange={(e) => setDailyNewLimit(Math.max(5, Number(e.target.value) || 15))} />
      </label>
      <label className="flex items-center justify-between">
        <span>主题</span>
        <select className="rounded border p-1 dark:bg-zinc-800" value={settings?.theme ?? 'auto'}
          onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'auto')}>
          <option value="auto">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option>
        </select>
      </label>
      <div className="space-y-2">
        <button className="w-full rounded border py-2" onClick={onExport}>导出备份（JSON）</button>
        <button className="w-full rounded border py-2" onClick={() => fileRef.current?.click()}>导入备份</button>
        <input ref={fileRef} type="file" accept=".json" hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (f) { try { await importBackup(f); alert('恢复完成') } catch (err) { alert(err instanceof Error ? err.message : '导入失败') } }
          }} />
      </div>
      <div>
        <h2 className="mb-2 font-bold">牌组管理</h2>
        {(decks ?? []).map((d) => (
          <div key={d.id} className="flex items-center justify-between border-b py-2">
            <span>{d.name}</span>
            <button className="text-sm text-red-500"
              onClick={async () => {
                if (!confirm(`删除「${d.name}」及其全部单词与进度？`)) return
                const words = await db.words.where('deckId').equals(d.id!).toArray()
                await db.transaction('rw', [db.words, db.progress, db.decks], async () => {
                  await db.progress.bulkDelete(words.map((w) => w.id!))
                  await db.words.bulkDelete(words.map((w) => w.id!))
                  await db.decks.delete(d.id!)
                })
              }}>删除</button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **步骤 7：全量测试 + 完整冒烟清单** — `npx vitest run` 全绿；`npm run build && npm run preview` 按 规格 §9 清单逐项过：导入→背卡→翻卡→自评→刷新记录仍在→断网（DevTools Offline）可用→备份导出再导入一致
- [ ] **步骤 8：Commit + 收尾** — `git add -A && git commit -m "feat: 设置页/备份恢复/主题切换，MVP 完成"`

---

## 自检记录（计划已完成）

1. **规格覆盖度**：导入（任务 5-7）、词库浏览（任务 11）、背卡+调度（任务 3、9）、联动（任务 4、8）、打卡（任务 2、10）、PWA 离线（任务 1）、备份+设置+主题（任务 12）、测试策略（各任务内嵌 + 任务 12 冒烟）。无遗漏。
2. **占位符扫描**：无 TODO/待定；任务 7 有一处**刻意标注**的实现陷阱说明（notes 与 words 索引对齐），属给执行者的明确重构指令而非占位符。
3. **类型一致性**：`Word/Progress/RelatedWord/WordSeed/FieldGuess/Rating` 全部在任务 1-4 中定义并在后续任务中按同名引用；`buildWords` 返回结构在任务 7 内自洽（按执行注意重构后）。
