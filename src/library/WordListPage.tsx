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
