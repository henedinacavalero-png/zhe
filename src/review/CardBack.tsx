import type { RelatedType, Word } from '../db/types'
import { playBlob } from '../audio'

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
        <div className="text-4xl font-bold">
          {word.term}
          {word.audio && (
            <button aria-label="播放发音" className="ml-2 align-middle text-2xl text-[#3b6ef5]" onClick={() => playBlob(word.audio!)}>▶</button>
          )}
        </div>
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
