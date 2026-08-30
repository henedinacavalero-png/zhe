import type { RelatedType, Word } from '../db/types'
import { playBlob } from '../audio'
import { alignFurigana, alignSentenceReading, isBracketFurigana, parseBracketFurigana } from './furigana'

const GROUPS: { type: RelatedType; label: string; cls: string }[] = [
  { type: 'kanji', label: '同汉字', cls: 'bg-[#e8f6ee] text-[#1e8e4e] dark:bg-emerald-900/30 dark:text-emerald-300' },
  { type: 'stem', label: '同词根', cls: 'bg-[#fff1e6] text-[#c96a1f] dark:bg-orange-900/30 dark:text-orange-300' },
  { type: 'lesson', label: '同课', cls: 'bg-[#eaf1ff] text-[#3b6ef5] dark:bg-indigo-900/30 dark:text-indigo-300' },
]

/** 汉字上方标注假名（ruby）；单词自带"漢字[かな]"注音时直接解析；无读音原样显示 */
function Furigana({ term, reading }: { term: string; reading: string }) {
  if (!reading && isBracketFurigana(term)) {
    return (<>
      {parseBracketFurigana(term).map((p, i) =>
        p.rt
          ? <ruby key={i}>{p.text}<rt className="text-[0.4em] font-normal text-zinc-400">{p.rt}</rt></ruby>
          : <span key={i}>{p.text}</span>,
      )}
    </>)
  }
  return (
    <>
      {alignFurigana(term, reading).map((p, i) =>
        p.rt
          ? <ruby key={i}>{p.text}<rt className="text-[0.4em] font-normal text-zinc-400">{p.rt}</rt></ruby>
          : <span key={i}>{p.text}</span>,
      )}
    </>
  )
}

/** 例句渲染："漢字[かな]"格式直接解析（<b> 即目标词）；纯假名整句读音走锚点对齐；
 *  都没有则仅高亮目标词。高亮用下划线式底色（比色块雅） */
function Highlight({ sentence, term, reading }: { sentence: string; term: string; reading?: string }) {
  const HL = 'rounded-sm bg-[linear-gradient(transparent_55%,#c9dcff_55%)] font-bold dark:bg-[linear-gradient(transparent_55%,#3730a3aa_55%)]'
  // 例句自身带"漢字[かな]"内嵌注音（如文法卡组）时直接解析例句
  const bracketSource = reading && isBracketFurigana(reading) ? reading : isBracketFurigana(sentence) ? sentence : null
  if (bracketSource) {
    return (<>
      {parseBracketFurigana(bracketSource).map((p, i) => {
        const inner = p.rt
          ? <ruby>{p.text}<rt className="text-[0.55em] font-normal text-zinc-400">{p.rt}</rt></ruby>
          : p.text
        return p.mark || p.text.includes(term)
          ? <mark key={i} className={HL}>{inner}</mark>
          : <span key={i}>{inner}</span>
      })}
    </>)
  }
  if (reading) {
    return (<>
      {alignSentenceReading(sentence, reading).map((p, i) => {
        const inner = p.rt
          ? <ruby>{p.text}<rt className="text-[0.55em] font-normal text-zinc-400">{p.rt}</rt></ruby>
          : p.text
        return p.text.includes(term)
          ? <mark key={i} className={HL}>{inner}</mark>
          : <span key={i}>{inner}</span>
      })}
    </>)
  }
  const idx = sentence.indexOf(term)
  if (idx < 0) return <>{sentence}</>
  return (<>
    {sentence.slice(0, idx)}<mark className={HL}>{term}</mark>{sentence.slice(idx + term.length)}
  </>)
}

export default function CardBack({ word, wordsById, onJump }: {
  word: Word
  wordsById: Map<number, Word>
  onJump?: (wordId: number) => void
}) {
  return (
    <div className="animate-pop space-y-4 rounded-3xl bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.08)] dark:bg-zinc-800">
      <div className="text-center">
        <div className="text-4xl font-bold text-slate-800 dark:text-zinc-100">
          <Furigana term={word.term} reading={word.reading} />
          {word.audio && (
            <button aria-label="播放发音" className="ml-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#eef2ff] text-base text-[#3b6ef5]"
              onClick={() => playBlob(word.audio!)}>▶</button>
          )}
        </div>
        {word.pos && <div className="mt-1"><span className="rounded-md bg-[#eef2ff] px-1.5 py-0.5 text-xs text-[#5b74e8] dark:bg-indigo-900/40 dark:text-indigo-300">{word.pos}</span></div>}
        <div className="mt-1 text-lg"><strong className="text-slate-800 dark:text-zinc-100">{word.meaning}</strong></div>
      </div>
      {word.examples.length > 0 && (
        <div className="rounded-r-xl rounded-l-sm border-l-[3px] border-[#3b6ef5] bg-[#f6f8ff] p-3 text-left dark:bg-zinc-700/50">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-zinc-400">例句</div>
          <p className="text-base leading-loose"><Highlight sentence={word.examples[0].ja} term={word.term} reading={word.examples[0].rt} /></p>
          {word.examples[0].zh && <p className="mt-1 text-sm text-zinc-500">{word.examples[0].zh}</p>}
        </div>
      )}
      <div className="text-left">
        <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-zinc-400">相关单词 · 点击跳转</div>
        {GROUPS.map((g) => {
          const items = word.related.filter((r) => r.type === g.type && wordsById.has(r.wordId))
          if (!items.length) return null
          return (
            <div key={g.type} className="mb-2">
              {items.map((r, idx) => {
                const w = wordsById.get(r.wordId)!
                const label = idx === 0 ? `${g.label} · ${w.term}` : w.term
                return (
                  <button key={r.wordId} onClick={() => onJump?.(r.wordId)}
                    className={`mr-1 mt-1 inline-block rounded-full px-2.5 py-1 text-sm ${g.cls}`}>
                    {label}{w.reading && <span className="ml-1 opacity-60">〈{w.reading}〉</span>}
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
