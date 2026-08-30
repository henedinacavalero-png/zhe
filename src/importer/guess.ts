export interface FieldGuess {
  term: number; reading: number | null; meaning: number;
  example: number | null; exampleZh: number | null; exampleRt: number | null
}

const KANA_RE = /^[\u3040-\u309f\u30a0-\u30ff\u30fc\u3005\u301c\uff5e]+$/ // 平/片假名 + 长音符 + 〆 + 波浪号（〜やすい 类）
const HAS_KANA_RE = /[\u3040-\u309f\u30a0-\u30ff]/
const HAS_KANJI_RE = /[\u3400-\u9faf]/
const SOUND_TAG_RE = /\[sound:[^\]]*\]/g

function column(samples: string[][], col: number): string[] {
  return samples.map((f) => f[col] ?? '').filter((s) => s !== '')
}

/** 读音列：≥8 成采样行非空，非空值里 ≥85 成纯假名且 ≥9 成是短值（≤8 字）——容忍少量 〜转写/外来语行 */
function looksLikeReading(vals: string[], sampleCount: number): boolean {
  if (vals.length < sampleCount * 0.8) return false
  const kana = vals.filter((v) => KANA_RE.test(v)).length
  const short = vals.filter((v) => v.length <= 8).length
  return kana / vals.length >= 0.85 && short / vals.length >= 0.9
}

/** 例句列：≥8 成采样行非空，过半非空值是"假名+汉字混合、长度≥6"的日文句（无句号也算） */
function looksLikeSentence(vals: string[], sampleCount: number): boolean {
  if (vals.length < sampleCount * 0.8) return false
  const sentence = vals.filter((v) => {
    const clean = v.replace(SOUND_TAG_RE, '').trim()
    return clean.length >= 6 && HAS_KANA_RE.test(clean) && HAS_KANJI_RE.test(clean)
  }).length
  return sentence / vals.length >= 0.5
}

/** 中文列：有汉字且整列无假名（简繁释义/例句翻译的特征） */
function looksLikeChinese(vals: string[]): boolean {
  if (!vals.length) return false
  return vals.some((v) => HAS_KANJI_RE.test(v)) && vals.every((v) => !HAS_KANA_RE.test(v))
}

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 元数据列：全部采样值相同（如书名/级别的常量列）或全为 GUID——绝不能当单词/释义 */
function isMetaColumn(vals: string[]): boolean {
  if (vals.length < 2) return false
  if (vals.every((v) => GUID_RE.test(v))) return true
  return vals.every((v) => v === vals[0])
}

/** 例句注音列："漢字[かな]"内嵌注音格式（<b> 标目标词），或 ≥9 成纯假名的整句假名列 */
function looksLikeSentenceRt(vals: string[], sampleCount: number): boolean {
  if (vals.length < sampleCount * 0.8) return false
  const bracket = vals.filter((v) => /[\u3400-\u9faf]\[[^\]]*\]/.test(v)).length
  if (bracket / vals.length >= 0.5) return true
  const kana = vals.filter((v) => KANA_RE.test(v)).length
  return kana / vals.length >= 0.9 && vals.reduce((s, v) => s + v.length, 0) / vals.length > 7
}

function avgLen(vals: string[]): number {
  return vals.reduce((s, v) => s + v.trim().length, 0) / (vals.length || 1)
}

/** 字段名语义提示：按顺序认领槽位（名字就是说明书，比内容特征可靠得多） */
const NAME_HINTS: { slot: keyof FieldGuess; re: RegExp }[] = [
  { slot: 'term', re: /^(word|term|front|expression|vocab|単語|单词)/i },
  { slot: 'reading', re: /(reading|furigana|kana|よみ|读音)/i },
  { slot: 'example', re: /(example|sentkanji|sentence|例文|例句)/i },
  { slot: 'meaning', re: /(explain|meaning|back|释义|def|意味)/i },
  { slot: 'exampleZh', re: /(chinese|翻译|译|中文)/i },
]

export function guessMapping(fieldNames: string[], samples: string[][]): FieldGuess {
  const n = fieldNames.length
  const valsOf = (c: number) => column(samples, c)
  const uniqueRatio = (c: number) => new Set(valsOf(c)).size / Math.max(samples.length, 1)
  const out: FieldGuess = { term: -1, reading: null, meaning: -1, example: null, exampleZh: null, exampleRt: null }
  const claimed = new Set<number>()

  // —— 第一遍：字段名语义匹配 ——
  // 守卫：认列的列非空占比须 ≥5 成（排除 SentenceTag/VocabPlus 之类的稀疏标注列）且非元数据列
  for (const h of NAME_HINTS) {
    for (let c = 0; c < n; c++) {
      if (claimed.has(c) || isMetaColumn(valsOf(c))) continue
      const vals = valsOf(c)
      if (vals.length < samples.length * 0.5) continue
      if (h.re.test(fieldNames[c])) { out[h.slot] = c as never; claimed.add(c); break }
    }
  }

  // —— 第二遍：内容特征兜底，只填名字没认出的槽位 ——
  const avail = [...Array(n).keys()].filter((c) => !claimed.has(c))
  if (out.reading === null) {
    out.reading = avail.find((c) => looksLikeReading(valsOf(c), samples.length)) ?? null
  }
  if (out.example === null) {
    out.example = avail.find((c) => looksLikeSentence(valsOf(c), samples.length)) ?? null
  }
  if (out.term === -1) {
    // 含汉字、非常量/GUID 的候选列里取唯一值率最高的（词汇列每行不同，元数据列大量重复）；
    // 候选全被占时放宽到"非读音、非元数据"的列（可与释义共列，如只有兩列的小牌组）
    out.term = avail.filter((c) =>
      !isMetaColumn(valsOf(c)) && valsOf(c).some((v) => HAS_KANJI_RE.test(v) && !KANA_RE.test(v)))
      .sort((a, b) => uniqueRatio(b) - uniqueRatio(a))[0]
      ?? [...Array(n).keys()].filter((c) => c !== out.reading && !isMetaColumn(valsOf(c)))
          .sort((a, b) => uniqueRatio(b) - uniqueRatio(a))[0]
      ?? 0
  }
  // 释义：例句前的中文列取平均最长（释义列比词性列长）；兜底取第一个非常量候选
  const hanNoKana = avail.filter((c) => c !== out.term && looksLikeChinese(valsOf(c)))
  if (out.meaning === -1 || out.meaning === out.term) {
    const before = out.example === null ? hanNoKana : hanNoKana.filter((c) => c < out.example!)
    out.meaning = [...before].sort((a, b) => avgLen(valsOf(b)) - avgLen(valsOf(a)))[0]
      ?? avail.find((c) => c !== out.term && !isMetaColumn(valsOf(c))) ?? out.term
  }
  // 例句翻译：例句之后的第一个中文列；例句注音：其后的"漢字[かな]"列或长假名列
  if (out.example !== null) {
    if (out.exampleZh === null) out.exampleZh = hanNoKana.find((c) => c > out.example!) ?? null
    if (out.exampleRt === null) {
      out.exampleRt = avail.find((c) =>
        c > out.example! && c !== out.exampleZh && looksLikeSentenceRt(valsOf(c), samples.length)) ?? null
    }
  }
  return out
}
