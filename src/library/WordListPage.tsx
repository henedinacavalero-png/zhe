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
  // 按级别分组（N5→N1），无级别的归"其他"
  const groups = new Map<string, Word[]>()
  for (const w of shown) {
    const key = w.level || '其他'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(w)
  }
  const ordered = ['N5', 'N4', 'N3', 'N2', 'N1'].filter((lv) => groups.has(lv))
  if (groups.has('其他')) ordered.push('其他')

  return (
    <div className="p-4">
      <h1 className="mb-3 text-xl font-extrabold text-slate-700 dark:text-zinc-100">{deck?.name ?? '词库'}</h1>
      <input className="mb-4 w-full rounded-full border border-zinc-200/80 bg-white px-4 py-2 text-sm shadow-sm outline-none focus:border-[#3b6ef5] dark:border-zinc-700 dark:bg-zinc-800"
        placeholder="搜索单词/读音/释义"
        value={q} onChange={(e) => setQ(e.target.value)} />
      {ordered.map((lv) => (
        <div key={lv} className="mb-4">
          <div className="mb-2">
            <span className="rounded-full bg-[#eaf1ff] px-2.5 py-0.5 text-xs font-bold text-[#3b6ef5] dark:bg-indigo-900/40 dark:text-indigo-300">{lv}</span>
            <span className="ml-2 text-xs text-zinc-400">{groups.get(lv)!.length} 词</span>
          </div>
          <ul className="divide-y divide-zinc-100 rounded-2xl bg-white px-4 shadow-[0_4px_14px_rgba(15,23,42,0.05)] dark:divide-zinc-700/60 dark:bg-zinc-800">
            {groups.get(lv)!.map((w) => (
              <li key={w.id}>
                <Link to={`/word/${w.id}`} className="flex items-center justify-between py-3">
                  <span className="font-bold text-slate-700 dark:text-zinc-100">{w.term}</span>
                  <span className="text-sm text-zinc-400">{w.reading} · {w.meaning}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {words && words.length === 0 && <p className="mt-8 text-center text-zinc-400">这个牌组还没有单词</p>}
    </div>
  )
}
