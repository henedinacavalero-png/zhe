export interface FieldGuess { term: number; reading: number | null; meaning: number; example: number | null }

const KANA_RE = /^[\u3040-\u309f\u30a0-\u30ff\u30fc\u3005]+$/ // 含平假名 + 片假名 + 长音符 + 〆
const HAS_KANA_RE = /[\u3040-\u309f\u30a0-\u30ff]/
const HAS_KANJI_RE = /[\u3400-\u9faf]/
const SENTENCE_END_RE = /[。！？.]$/

const SOUND_TAG_RE = /\[sound:[^\]]*\]/g

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
    // 例句：以句号结尾且含假名的长文本（真实导出常把 [sound:] 音频缀在句尾，判定前剥掉）
    if (example === null && vals.some((v) => {
      const clean = v.replace(SOUND_TAG_RE, '').trim()
      return clean.length > 8 && HAS_KANA_RE.test(clean) && SENTENCE_END_RE.test(clean)
    })) {
      example = c; continue
    }
  }
  // 单词：含汉字、不含假名整列特征最弱的第一个非读音/例句列（默认 0 已满足多数 Anki 模板）
  const used = new Set([reading, example].filter((x): x is number => x !== null))
  const candidates = [...Array(n).keys()].filter((c) => !used.has(c))
  term = candidates.find((c) => column(samples, c).some((v) => HAS_KANJI_RE.test(v) && !KANA_RE.test(v)))
    ?? candidates[0] ?? 0
  // 释义（规格 §5"含中文的列"）：优先有汉字且整列无假名的列（中文释义特征，如 VocabDefSC），
  // 跳过单词列本身——否则会落到 NoteID 之类的编号列
  const hanNoKana = candidates.find((c) => {
    if (c === term) return false
    const vals = column(samples, c)
    if (!vals.length) return false
    return vals.some((v) => HAS_KANJI_RE.test(v)) && vals.every((v) => !HAS_KANA_RE.test(v))
  })
  meaning = hanNoKana ?? candidates.find((c) => c !== term) ?? term
  return { term, reading, meaning, example }
}
