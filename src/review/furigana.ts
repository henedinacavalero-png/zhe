const KANA_RE = /^[\u3040-\u309f\u30a0-\u30ff\u30fc\u3005\u301c\uff5e]+$/
const HAS_KANJI_RE = /[\u3400-\u9faf]/

export interface FuriganaPart { text: string; rt?: string; mark?: boolean }

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

/**
 * 例句整句读音对齐（锚点法）：把句子切成假名/非假名交替段，假名段在读音中顺序定位作锚点，
 * 相邻锚点之间的读音片段归属其前的汉字段（组级注音）。锚点找不到（送り仮名不一致等）时
 * 该汉字段不注音，后续照常。
 */
export function alignSentenceReading(sentence: string, reading: string): FuriganaPart[] {
  const r = reading.trim()
  if (!r || !HAS_KANJI_RE.test(sentence)) return [{ text: sentence }]

  // 切交替段
  const segs: { text: string; kana: boolean }[] = []
  for (const ch of sentence) {
    const kana = KANA_RE.test(ch)
    const last = segs[segs.length - 1]
    if (last && last.kana === kana) last.text += ch
    else segs.push({ text: ch, kana })
  }

  const parts: FuriganaPart[] = []
  let pending = ''
  let pointer = 0
  const flush = (rt?: string) => {
    if (!pending) return
    parts.push(rt ? { text: pending, rt } : { text: pending })
    pending = ''
  }
  for (const seg of segs) {
    if (!seg.kana) { pending += seg.text; continue }
    const idx = r.indexOf(seg.text, pointer)
    if (idx >= 0) {
      flush(r.slice(pointer, idx))
      parts.push({ text: seg.text })
      pointer = idx + seg.text.length
    } else {
      flush()
      parts.push({ text: seg.text })
    }
  }
  flush()
  return parts.length ? parts : [{ text: sentence }]
}

const BRACKET_RE = /([\u3400-\u9faf々]+)\[([^\]]+)\]/

/** Anki"汉字[かな]"格式检测（妹[いもうと]は…），<b> 标目标词 */
export function isBracketFurigana(rt: string): boolean {
  const withBracket = rt.split(/<b>|<\/b>/i).filter((s) => !/^<\/?$|^b$/i.test(s)).filter((s) => s.trim())
  const hit = withBracket.filter((s) => BRACKET_RE.test(s)).length
  return withBracket.length > 0 && hit / withBracket.length >= 0.5
}

/** 解析"漢字[かな]"格式（含 <b> 高亮、<br> 换行）为 ruby 分段，<b> 段标 mark */
export function parseBracketFurigana(rt: string): FuriganaPart[] {
  const parts: FuriganaPart[] = []
  let mark = false
  for (const piece of rt.replace(/<br\s*\/?>/gi, ' ').split(/(<b>|<\/b>)/i)) {
    if (/^<b>$/i.test(piece)) { mark = true; continue }
    if (/^<\/b>$/i.test(piece)) { mark = false; continue }
    let last = 0
    for (const m of piece.matchAll(new RegExp(BRACKET_RE.source, 'g'))) {
      const plain = piece.slice(last, m.index)
      if (plain) parts.push(mark ? { text: plain, mark: true } : { text: plain })
      parts.push(mark ? { text: m[1], rt: m[2], mark: true } : { text: m[1], rt: m[2] })
      last = m.index + m[0].length
    }
    const rest = piece.slice(last)
    if (rest) parts.push(mark ? { text: rest, mark: true } : { text: rest })
  }
  return parts.filter((p) => p.text.length > 0)
}
