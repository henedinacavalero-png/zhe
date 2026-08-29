export interface FieldGuess { term: number; reading: number | null; meaning: number; example: number | null; exampleZh: number | null }

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

/** 例句列：≥8 成采样行非空，过半非空值是"假名+汉字混合、长度≥6"的日文句（无句号也算，如"妹は高校に通っています"） */
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

export function guessMapping(fieldNames: string[], samples: string[][]): FieldGuess {
  const n = fieldNames.length
  let term = 0, reading: number | null = null, meaning = n > 1 ? 1 : 0
  let example: number | null = null, exampleZh: number | null = null

  for (let c = 0; c < n; c++) {
    if (reading === null && looksLikeReading(column(samples, c), samples.length)) reading = c
  }
  for (let c = 0; c < n; c++) {
    if (c === reading) continue
    if (example === null && looksLikeSentence(column(samples, c), samples.length)) example = c
  }
  // 单词：第一个含汉字、非整列假名的候选列（默认 0 已满足多数 Anki 模板）
  const used = new Set([reading, example].filter((x): x is number => x !== null))
  const candidates = [...Array(n).keys()].filter((c) => !used.has(c))
  term = candidates.find((c) => column(samples, c).some((v) => HAS_KANJI_RE.test(v) && !KANA_RE.test(v)))
    ?? candidates[0] ?? 0
  // 释义/例句翻译（规格 §5"含中文的列"）：中文列按位置分两组——例句列**之前**的是释义
  // （取平均文本最长的，释义列比词性列长；跳过单词列），例句列**之后**的第一个是例句翻译
  const hanNoKana = candidates.filter((c) => c !== term && looksLikeChinese(column(samples, c)))
  const before = example === null ? hanNoKana : hanNoKana.filter((c) => c < example!)
  meaning = [...before].sort((a, b) => avgLen(column(samples, b)) - avgLen(column(samples, a)))[0]
    ?? candidates.find((c) => c !== term) ?? term
  if (example !== null) exampleZh = hanNoKana.find((c) => c > example!) ?? null
  return { term, reading, meaning, example, exampleZh }
}

function avgLen(vals: string[]): number {
  return vals.reduce((s, v) => s + v.trim().length, 0) / (vals.length || 1)
}
