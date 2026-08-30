import type { FieldSnap, RelatedType, Word } from '../db/types'
import { playBlob } from '../audio'
import { alignFurigana, alignSentenceReading, isBracketFurigana, parseBracketFurigana } from './furigana'
import { AnkiText, WordImages } from '../anki-text'
import { visibleFields } from './fieldFilter'

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

/** 例句渲染：优先按整句读音对齐（锚点法）；例句自带"漢字[かな]"时直接解析；否则仅高亮目标词 */
function Highlight({ sentence, term, reading }: { sentence: string; term: string; reading?: string }) {
  const HL = 'rounded-sm bg-[linear-gradient(transparent_55%,#c9dcff_55%)] font-bold dark:bg-[linear-gradient(transparent_55%,#3730a3aa_55%)]'
  if (reading && isBracketFurigana(reading)) {
    return (<>
      {parseBracketFurigana(reading).map((p, i) => {
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

/** 字段名 → 中文区块标题；数字后缀剥离，连续同名字段归入同一区块 */
const FIELD_LABEL: Record<string, string> = {
  Word: '语法点 / 单词', Example: '例句', Chinese: '译文', Explain: '解説', Note: '注意',
  Connective: '接续', GakkoConnective: '接续', Level: '级别', SentenceTag: '例句标签',
  Honorific: '敬语', Pitch: '声调', PoS: '词性', Furigana: '读音', Audio: '音频', Kanji: '汉字',
  Source: '出处', Image: '图片', References: '参考', RemarksFront: '注解', Remarks: '注解',
  Translation: '翻译', Meaning: '释义', Back: '背面',
}

interface Section { label: string; items: string[] }

function groupFields(fields: FieldSnap[]): Section[] {
  const sections: Section[] = []
  for (const f of fields) {
    const base = f.name.replace(/\d+$/, '')
    // 牌组自带前缀（如 Jlab-Translation）剥掉后再查一次表
    const label = FIELD_LABEL[base] ?? FIELD_LABEL[base.slice(base.lastIndexOf('-') + 1)] ?? base
    const last = sections[sections.length - 1]
    if (last && last.label === label) last.items.push(f.value)
    else sections.push({ label, items: [f.value] })
  }
  return sections
}

export default function CardBack({ word, wordsById, onJump }: {
  word: Word
  wordsById: Map<number, Word>
  onJump?: (wordId: number) => void
}) {
  const resolve = {
    media: word.media ?? null,
    images: word.images ?? null,
    audio: word.audio && word.audioName ? { name: word.audioName, blob: word.audio } : null,
  }
  const sections = groupFields(visibleFields(word))
  const related = GROUPS
    .map((g) => ({ ...g, items: word.related.filter((r) => r.type === g.type && wordsById.has(r.wordId)) }))
    .filter((g) => g.items.length)

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
        <div className="mt-1 text-lg"><strong className="text-slate-800 dark:text-zinc-100"><AnkiText text={word.meaning} resolve={resolve} /></strong></div>
        <WordImages images={word.images} />
      </div>

      {word.examples.length > 0 && (
        <div className="rounded-r-xl rounded-l-sm border-l-[3px] border-[#3b6ef5] bg-[#f6f8ff] p-3 text-left dark:bg-zinc-700/50">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-zinc-400">例句</div>
          {word.examples[0].rt
            ? <p className="text-base leading-loose"><Highlight sentence={word.examples[0].ja} term={word.term} reading={word.examples[0].rt} /></p>
            : <p className="text-base leading-loose"><AnkiText text={word.examples[0].ja} resolve={resolve} term={word.term} ruby /></p>}
          {word.examples[0].zh && <p className="mt-1 text-sm text-zinc-500">{word.examples[0].zh}</p>}
        </div>
      )}

      {/* 全字段完整展示：这张卡的所有内容按原模板区块列出 */}
      {sections.map((s, i) => (
        <div key={i} className="rounded-r-xl rounded-l-sm border-l-[3px] border-indigo-200 bg-zinc-50 p-3 text-left dark:border-zinc-600 dark:bg-zinc-700/40">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-zinc-400">{s.label}</div>
          {s.items.map((v, j) => (
            <p key={j} className="text-base leading-loose">
              <AnkiText text={v} resolve={resolve} ruby />
            </p>
          ))}
        </div>
      ))}

      {related.length > 0 && (
        <details className="text-left">
          <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wide text-zinc-400">相关单词 · 点击跳转</summary>
          <div className="mt-2">
            {related.map((g) => (
              <div key={g.type} className="mb-2">
                <div className="text-xs text-zinc-400">{g.label}</div>
                {g.items.map((r) => {
                  const w = wordsById.get(r.wordId)!
                  const label = g.items.indexOf(r) === 0 ? `${g.label} · ${w.term}` : w.term
                  return (
                    <button key={r.wordId} onClick={() => onJump?.(r.wordId)}
                      className={`mr-1 mt-1 inline-block max-w-full truncate rounded-full px-2.5 py-1 text-sm ${g.cls}`}>
                      {label}{w.reading && <span className="ml-1 opacity-60">〈{w.reading}〉</span>}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
