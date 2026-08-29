import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'

export default function LibraryPage() {
  const decks = useLiveQuery(() => db.decks.toArray())
  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">词库</h1>
        <Link to="/import" className="rounded bg-[#3b6ef5] px-3 py-1.5 text-sm font-bold text-white">导入牌组</Link>
      </div>
      {!decks ? (
        <p className="text-sm text-zinc-500">加载中…</p>
      ) : decks.length === 0 ? (
        <p className="text-sm text-zinc-500">还没有牌组，点右上角「导入牌组」开始。</p>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-700">
          {decks.map((d) => (
            <li key={d.id}>
              <Link to={`/library/deck/${d.id}`} className="flex items-center justify-between py-3">
                <span>{d.name}</span>
                <span className="text-sm text-zinc-500">{d.wordCount} 词</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
