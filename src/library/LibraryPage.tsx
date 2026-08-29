import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'

/** 牌组完成度圆环（conic-gradient） */
function Ring({ pct }: { pct: number }) {
  return (
    <div className="h-12 w-12 shrink-0 rounded-full"
      style={{ background: `conic-gradient(#3b6ef5 0 ${pct}%, #e2e8f0 ${pct}% 100%)` }}>
      <div className="flex h-full w-full items-center justify-center">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-[10px] font-bold text-[#3b6ef5] dark:bg-zinc-800">
          {pct}%
        </div>
      </div>
    </div>
  )
}

export default function LibraryPage() {
  const decks = useLiveQuery(() => db.decks.toArray())
  // 每个牌组的已学进度：轻量遍历（不保留音频引用）
  const stats = useLiveQuery(async () => {
    const learned = new Set<number>()
    await db.progress.each((p) => { if (!p.isNew) learned.add(p.wordId) })
    const byDeck: Record<number, { total: number; learned: number }> = {}
    await db.words.each((w) => {
      if (w.deckId == null) return
      const s = (byDeck[w.deckId] ??= { total: 0, learned: 0 })
      s.total++
      if (w.id != null && learned.has(w.id)) s.learned++
    })
    return byDeck
  }, [])

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-slate-700 dark:text-zinc-100">词库</h1>
        <Link to="/import"
          className="rounded-full bg-gradient-to-r from-[#3b6ef5] to-[#6366f1] px-4 py-1.5 text-sm font-bold text-white shadow-[0_6px_16px_rgba(59,110,245,0.3)]">
          ＋ 导入牌组
        </Link>
      </div>
      {!decks ? (
        <p className="text-sm text-zinc-500">加载中…</p>
      ) : decks.length === 0 ? (
        <p className="mt-8 text-center text-sm text-zinc-500">还没有牌组，点右上角「导入牌组」开始。</p>
      ) : (
        <ul className="space-y-3">
          {decks.map((d) => {
            const s = stats?.[d.id!]
            const pct = s && s.total > 0 ? Math.round((s.learned / s.total) * 100) : 0
            return (
              <li key={d.id}>
                <Link to={`/library/deck/${d.id}`}
                  className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-[0_4px_14px_rgba(15,23,42,0.06)] dark:bg-zinc-800">
                  <div>
                    <div className="font-bold text-slate-700 dark:text-zinc-100">{d.name}</div>
                    <div className="mt-1 text-xs text-zinc-400">{d.wordCount} 词 · 已学 {s?.learned ?? 0}</div>
                  </div>
                  <Ring pct={pct} />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
