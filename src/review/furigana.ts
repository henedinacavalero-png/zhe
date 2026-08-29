const KANA_RE = /^[\u3040-\u309f\u30a0-\u30ff\u30fc\u3005\u301c\uff5e]+$/
const HAS_KANJI_RE = /[\u3400-\u9faf]/

export interface FuriganaPart { text: string; rt?: string }

/**
 * 把读音对齐到单词，返回分段：汉字中段整段加注音（组级 ruby，读音居中显示在汉字串上方——
 * 组级标注对不规则读音如 今日/きょう 也安全）。前后假名与读音直接比对切出来；无汉字/无读音不分段。
 */
export function alignFurigana(term: string, reading: string): FuriganaPart[] {
  const r = reading.trim()
  if (!r || !HAS_KANJI_RE.test(term)) return [{ text: term }]

  let start = 0
  while (start < term.length && start < r.length && KANA_RE.test(term[start]) && term[start] === r[start]) start++
  let suffixLen = 0
  while (suffixLen < term.length - start && KANA_RE.test(term[term.length - 1 - suffixLen])
    && r[r.length - 1 - suffixLen] === term[term.length - 1 - suffixLen]) suffixLen++

  const prefix = term.slice(0, start)
  const suffix = term.slice(term.length - suffixLen)
  const middle = term.slice(start, term.length - suffixLen)
  const middleReading = r.slice(start, r.length - suffixLen)
  if (!middle || !middleReading) return [{ text: term }]

  const parts: FuriganaPart[] = []
  if (prefix) parts.push({ text: prefix })
  parts.push({ text: middle, rt: middleReading })
  if (suffix) parts.push({ text: suffix })
  return parts
}
