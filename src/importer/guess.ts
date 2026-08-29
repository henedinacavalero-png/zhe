export interface FieldGuess { term: number; reading: number | null; meaning: number; example: number | null }

const KANA_RE = /^[\u3040-\u309f\u30a0-\u30ff\u30fc\u3005]+$/ // 含平假名 + 片假名 + 长音符 + 〆
const HAS_KANA_RE = /[\u3040-\u309f\u30a0-\u30ff]/
const HAS_KANJI_RE = /[\u3400-\u9faf]/
const SENTENCE_END_RE = /[。！？.]$/

function column(samples: string[][], col: number): string[] {
  return samples.map((f) => f[col] ?? '').filter((s) => s !== '')
}

export function guessMapping(fieldNames: string[], samples: string[][]): FieldGuess {
  const n = fieldNames.length
  let term = 0, reading: number | null = null, meaning = n > 1 ? 1 : 0, example: number | null = null

  for (let c = 0; c < n; c++) {
    const vals = column(samples, c)
    if (!vals.length) continue
    if (reading === null && vals.every((v) => KANA_RE.test(v))) reading = c
  }
  for (let c = 0; c < n; c++) {
    if (c === reading) continue
    const vals = column(samples, c)
    if (!vals.length) continue
    // 例句：以句号结尾且含假名的长文本
    if (example === null && vals.some((v) => v.length > 8 && HAS_KANA_RE.test(v) && SENTENCE_END_RE.test(v.trim()))) {
      example = c; continue
    }
  }
  // 单词：含汉字、不含假名整列特征最弱的第一个非读音/例句列（默认 0 已满足多数 Anki 模板）
  const used = new Set([reading, example].filter((x): x is number => x !== null))
  const candidates = [...Array(n).keys()].filter((c) => !used.has(c))
  term = candidates.find((c) => column(samples, c).some((v) => HAS_KANJI_RE.test(v) && !KANA_RE.test(v)))
    ?? candidates[0] ?? 0
  meaning = candidates.find((c) => c !== term) ?? term
  return { term, reading, meaning, example }
}
