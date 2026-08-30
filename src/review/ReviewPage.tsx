import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db, bumpStreak, getStreak, getAppSettings, candidateKeys, DEFAULT_FILTER } from '../db/db'
import { pickDailyQueue, review, type Rating } from '../scheduler/scheduler'
import CardBack from './CardBack'
import { WordImages } from '../anki-text'
import { playBlob } from '../audio'
import type { Word } from '../db/types'

const BUTTONS: { rating: Rating; label: string; cls: string }[] = [
  { rating: 'again', label: '😤 不认识', cls: 'bg-[#feecec] text-[#dc2626] shadow-[0_3px_10px_rgba(220,38,38,0.12)] dark:bg-red-900/30 dark:text-red-300' },
  { rating: 'hard', label: '😐 模糊', cls: 'bg-[#fef6e0] text-[#d97706] shadow-[0_3px_10px_rgba(217,119,6,0.12)] dark:bg-amber-900/30 dark:text-amber-300' },
  { rating: 'good', label: '😊 认识', cls: 'bg-[#e5f3eb] text-[#059669] shadow-[0_3px_10px_rgba(5,150,105,0.12)] dark:bg-emerald-900/30 dark:text-emerald-300' },
]

export default function ReviewPage() {
  const nav = useNavigate()
  const [session, setSession] = useState<{ ids: number[]; idx: number; revealed: boolean } | null>(null)
  const [wordsById, setWordsById] = useState<Map<number, Word>>(new Map())

  async function loadWords(ids: number[]) {
    // 全词库轻量副本（剥音频防内存膨胀）供相关词胶囊查词；当日队列词再覆盖为完整版（含音频/例句）
    const m = new Map<number, Word>()
    await db.words.each((w) => { if (w.id != null) m.set(w.id, { ...w, audio: null }) })
    for (const id of ids) { const w = await db.words.get(id); if (w) m.set(id, w) }
    return m
  }

  useEffect(() => {
    (async () => {
      const settings = await getAppSettings()
      // 队列只需要主键：按背词范围索引直取（避免整行加载），新词随机顺序
      const [keys, prog] = await Promise.all([candidateKeys(settings.studyFilter ?? DEFAULT_FILTER), db.progress.toArray()])
      const stubs = keys.map((id) => ({ id })) as unknown as Word[]
      const map = new Map(prog.map((p) => [p.wordId, p]))
      const ids = pickDailyQueue(stubs, map, settings.dailyNewLimit, { shuffle: true })
      setWordsById(await loadWords(ids))
      setSession({ ids, idx: 0, revealed: false })
    })()
  }, [])

  async function onRate(rating: Rating) {
    if (!session) return
    const wordId = session.ids[session.idx]
    const p = await db.progress.get(wordId)
    if (p) await db.progress.put(review(p, rating))
    // 每次评分即打卡（规格 §7：当日完成 ≥1 张即计），bumpStreak 同日幂等（db.ts），中途退出也计入当天
    await bumpStreak(new Date().toISOString().slice(0, 10))
    if (session.idx + 1 >= session.ids.length) {
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
    <div className="flex min-h-full flex-col p-4">
      <div className="mb-2 flex items-center gap-3">
        <span className="text-xs font-bold text-zinc-400">{session.idx + 1} / {session.ids.length}</span>
        {/* 分段进度：每张卡一格 */}
        <div className="flex flex-1 gap-1">
          {session.ids.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${
              i < session.idx ? 'bg-[#3b6ef5]' : i === session.idx ? 'bg-[#3b6ef5]/50' : 'bg-zinc-200 dark:bg-zinc-700'}`} />
          ))}
        </div>
      </div>
      <div className="flex flex-1 cursor-pointer flex-col items-center justify-center"
        onClick={() => setSession({ ...session, revealed: true })}>
        {!session.revealed ? (
          <div key={session.idx} className="animate-pop w-full rounded-3xl bg-white py-14 text-center shadow-[0_8px_24px_rgba(15,23,42,0.08)] dark:bg-zinc-800">
            <div className="text-5xl font-bold text-slate-800 dark:text-zinc-100">{word.term}</div>
            {word.images && <WordImages images={word.images} />}
            {word.audio && (
              <button aria-label="播放发音"
                className="mt-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#eef2ff] text-xl text-[#3b6ef5] shadow-[0_4px_12px_rgba(59,110,245,0.2)]"
                onClick={(e) => { e.stopPropagation(); playBlob(word.audio!) }}>▶</button>
            )}
            <div className="mt-8 text-sm text-zinc-400">点击卡片显示答案</div>
          </div>
        ) : (
          <div key={session.idx} className="animate-fade-up w-full">
            <CardBack word={word} wordsById={wordsById} onJump={(id) => nav(`/word/${id}`)} />
          </div>
        )}
      </div>
      {session.revealed && (
        <div className="flex gap-2 pb-2">
          {BUTTONS.map((b) => (
            <button key={b.rating} className={`flex-1 rounded-xl py-3 font-bold ${b.cls}`} onClick={() => onRate(b.rating)}>{b.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}
