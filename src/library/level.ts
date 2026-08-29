export type Level = 'N5' | 'N4' | 'N3' | 'N2' | 'N1'
export type Freq = '高频' | '中频' | '低频'
export interface LevelInfo { level: Level; freq: Freq | null }

const LEVEL_RE = /::\d-(N[1-5])(?:::N\d(高频|中频|低频))?/

/** 从"课"标签（Anki 首标签，如 eggrolls…::3-N3::N3低频）解析 JLPT 级别与频率；解析失败返回 null */
export function parseLevel(lesson: string | null | undefined): LevelInfo | null {
  const m = (lesson ?? '').match(LEVEL_RE)
  if (!m) return null
  return { level: m[1] as Level, freq: (m[2] as Freq) ?? null }
}
