import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, candidateKeys, getAppSettings, getStreak, DEFAULT_FILTER, type StudyFilter } from '../db/db'
import { pickDailyQueue } from '../scheduler/scheduler'
import { useEffect, useState } from 'react'
import type { Word } from '../db/types'
import { useSettings } from '../settings/useSettings'

const LEVELS: { key: string; label: string }[] = [
  { key: 'all', label: '全部' }, { key: 'N5', label: 'N5' }, { key: 'N4', label: 'N4' },
  { key: 'N3', label: 'N3' }, { key: 'N2', label: 'N2' }, { key: 'N1', label: 'N1' },
  { key: '', label: '未分级' }, // 无 JLPT 课标签的牌组（如 Tae Kim 动漫句卡）也纳入按条件背诵
]
const FREQS: { key: string; label: string }[] = [
  { key: 'all', label: '全部频率' }, { key: '高频', label: '高频' }, { key: '中频', label: '中频' }, { key: '低频', label: '低频' },
]

function Chip({ active, label, count, onClick }: { active: boolean; label: string; count?: number; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
        active
          ? 'bg-[#3b6ef5] font-bold text-white shadow-[0_4px_12px_rgba(59,110,245,.35)]'
          : 'border border-zinc-200/80 bg-white text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'}`}>
      {label}{count !== undefined && <span className="ml-1 opacity-70">{count}</span>}
    </button>
  )
}

const today = new Date()
const DATE_STR = `${today.getMonth() + 1}月${today.getDate()}日`

export default function TodayPage() {
  const { settings, setStudyFilter } = useSettings()
  const filter: StudyFilter = settings?.studyFilter ?? DEFAULT_FILTER
  const progress = useLiveQuery(() => db.progress.toArray(), [])
  const decks = useLiveQuery(() => db.decks.toArray(), [])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [info, setInfo] = useState({ news: 0, due: 0, scopeTotal: 0, streakDays: 0, ready: false })

  // 筛选变化 → 重算各 chip 计数。口径与背诵队列一致（candidateKeys）：
  // 每个 chip 的数字 = 点选它之后会得到的词数，且只统计当前范围（选了牌组就只算该牌组）
  useEffect(() => {
    (async () => {
      if (!decks) return
      const c: Record<string, number> = {
        'deck:all': (await candidateKeys({ ...filter, deckId: 'all' })).length,
        'level:all': (await candidateKeys({ ...filter, level: 'all' })).length,
      }
      for (const d of decks) c[`deck:${d.id}`] = (await candidateKeys({ ...filter, deckId: d.id! })).length
      for (const lv of ['N5', 'N4', 'N3', 'N2', 'N1', '']) {
        c[lv === '' ? 'none' : lv] = (await candidateKeys({ ...filter, level: lv, freq: 'all' })).length
      }
      if (filter.level !== 'all' && filter.level !== '') {
        for (const f of FREQS) {
          if (f.key === 'all') continue
          c[`freq:${f.key}`] = (await candidateKeys({ ...filter, freq: f.key })).length
        }
      }
      setCounts(c)
    })()
  }, [filter, decks])

  // 今日队列（按筛选范围，新词随机）
  useEffect(() => {
    (async () => {
      if (progress === undefined) return
      const s = await getStreak()
      const appSettings = await getAppSettings()
      const keys = await candidateKeys(filter)
      const stubs = keys.map((id) => ({ id })) as unknown as Word[]
      const progressMap = new Map(progress.map((p) => [p.wordId, p]))
      const q = pickDailyQueue(stubs, progressMap, appSettings.dailyNewLimit, { shuffle: true })
      const news = q.filter((id) => progressMap.get(id)?.isNew).length
      setInfo({ news, due: q.length - news, scopeTotal: keys.length, streakDays: s.days, ready: true })
    })()
  }, [filter, progress])

  const levelLabel = filter.level === 'all' ? '全部范围' : filter.level + (filter.freq !== 'all' ? ` · ${filter.freq}` : '')
  const deckLabel = (() => {
    if (filter.deckId === undefined || filter.deckId === 'all') return ''
    const d = decks?.find((x) => x.id === filter.deckId)
    return d ? `《${d.name}》` : ''
  })()
  const scopeLabel = [deckLabel, levelLabel].filter(Boolean).join(' · ')
  // 空范围（如「无级别牌组 + N5」）≠ 今天背完了；0 词的 chip 隐藏，除非它正是当前选中项
  const scopeEmpty = info.ready && info.scopeTotal === 0
  const hasLevelData = ['N5', 'N4', 'N3', 'N2', 'N1', 'none'].some((k) => (counts[k] ?? 0) > 0)
  const showFreqRow = filter.level !== 'all' && filter.level !== '' && FREQS.some((f) => f.key !== 'all' && (counts[`freq:${f.key}`] ?? 0) > 0)

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-4">
      <div className="w-full max-w-sm text-center">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-lg font-extrabold text-slate-700 dark:text-zinc-100">今天 <span className="text-xs font-normal text-zinc-400">{DATE_STR}</span></div>
          {info.streakDays > 0 && (
            <span className="rounded-full bg-[#fff3e8] px-2.5 py-1 text-xs font-bold text-[#ea7c30] dark:bg-orange-900/40 dark:text-orange-300">
              🔥 连续 {info.streakDays} 天
            </span>
          )}
        </div>

        <div className="animate-pop rounded-3xl bg-white p-5 shadow-[0_6px_18px_rgba(59,110,245,0.10)] dark:bg-zinc-800">
          <div className="text-xs text-zinc-400">{scopeLabel} · 今天的任务</div>
          <div className="text-5xl font-black leading-tight text-[#3b6ef5]">{info.ready ? info.news : '…'}</div>
          <div className="-mt-1 text-xs text-zinc-500">个新词待认</div>
          <div className="mt-3 flex justify-around rounded-xl bg-[#f1f5fd] px-2 py-2 text-xs text-slate-600 dark:bg-zinc-700/60 dark:text-zinc-300">
            <span>📖 复习 <b>{info.ready ? info.due : '…'}</b></span>
            <span>✨ 新词 <b>{info.ready ? info.news : '…'}</b></span>
          </div>
        </div>
      </div>

      <div className="w-full max-w-sm space-y-2">
        {decks && decks.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {decks.map((d) => {
              const count = counts[`deck:${d.id}`]
              const active = filter.deckId === d.id
              if (count === 0 && !active) return null
              return (
                <Chip key={d.id} label={d.name.length > 10 ? d.name.slice(0, 10) + '…' : d.name}
                  count={count} active={active}
                  onClick={() => setStudyFilter({ ...filter, deckId: d.id! })} />
              )
            })}
            {(() => {
              const allCount = counts['deck:all']
              const allActive = filter.deckId === undefined || filter.deckId === 'all'
              if (allCount === 0 && !allActive) return null
              return <Chip label="全部词库" count={allCount} active={allActive}
                onClick={() => setStudyFilter({ ...filter, deckId: 'all' })} />
            })()}
          </div>
        )}
        {(hasLevelData || filter.level !== 'all') && (
          <div className="flex flex-wrap justify-center gap-2">
            {LEVELS.map((lv) => {
              const count = lv.key === 'all' ? counts['level:all'] : lv.key === '' ? counts.none : counts[lv.key]
              const active = filter.level === lv.key
              if (count === 0 && !active) return null
              return (
                <Chip key={lv.key} label={lv.label} count={count} active={active}
                  onClick={() => setStudyFilter({ ...filter, level: lv.key, freq: 'all' })} />
              )
            })}
          </div>
        )}
        {showFreqRow && (
          <div className="flex flex-wrap justify-center gap-2">
            {FREQS.map((f) => {
              const count = f.key === 'all' ? counts[filter.level] : counts[`freq:${f.key}`]
              const active = filter.freq === f.key
              if (count === 0 && !active) return null
              return (
                <Chip key={f.key} label={f.label} count={count} active={active}
                  onClick={() => setStudyFilter({ ...filter, freq: f.key })} />
              )
            })}
          </div>
        )}
      </div>

      <Link to="/review"
        className="w-full max-w-sm rounded-full bg-gradient-to-r from-[#3b6ef5] to-[#6366f1] py-3 text-center font-bold text-white shadow-[0_8px_20px_rgba(59,110,245,0.35)]">
        {!info.ready ? '…' : scopeEmpty ? '这个范围没有单词' : info.news + info.due > 0 ? '开始背诵 →' : '这个范围今天背完了 🎉'}
      </Link>
    </div>
  )
}
