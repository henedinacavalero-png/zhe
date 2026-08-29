import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db, bumpStreak, getStreak, getAppSettings } from '../db/db'
import { pickDailyQueue, review, type Rating } from '../scheduler/scheduler'
import CardBack from './CardBack'
import { playBlob } from '../audio'
import type { Word } from '../db/types'

const BUTTONS: { rating: Rating; label: string; cls: string }[] = [
  { rating: 'again', label: '😭 不认识', cls: 'bg-red-50 text-red-600' },
  { rating: 'hard', label: '😐 模糊', cls: 'bg-amber-50 text-amber-600' },
  { rating: 'good', label: '😊 认识', cls: 'bg-emerald-50 text-emerald-600' },
]

export default function ReviewPage() {
  const nav = useNavigate()
  const [session, setSession] = useState<{ ids: number[]; idx: number; revealed: boolean } | null>(null)
  const [wordsById, setWordsById] = useState<Map<number, Word>>(new Map())

  async function loadWords(ids: number[]) {
    const m = new Map<number, Word>()
    for (const id of ids) { const w = await db.words.get(id); if (w) m.set(id, w) }
    return m
  }

  useEffect(() => {
    (async () => {
      const settings = await getAppSettings()
      const [words, prog] = await Promise.all([db.words.toArray(), db.progress.toArray()])
      const map = new Map(prog.map((p) => [p.wordId, p]))
      const ids = pickDailyQueue(words, map, settings.dailyNewLimit)
      setWordsById(await loadWords(ids))
      setSession({ ids, idx: 0, revealed: false })
    })()
  }, [])

  async function onRate(rating: Rating) {
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
