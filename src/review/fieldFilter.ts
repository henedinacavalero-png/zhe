import type { FieldSnap, Word } from '../db/types'

const TAG_RE = /<[^>]+>/g
// 模板内部字段：听力/填空练习的备用卡面（romaji 转写、挖空变体）与外链跳转按钮，不是卡的内容
const TEMPLATE_FIELD_RE = /(^|[-_. ])(listening|cloze)[-_. ]?(front|back)$|^questionlink$/i

/** 归一化用于内容比对：去标签、去媒体引用、去"漢字[かな]"注音括号、去空白、忽略大小写 */
function norm(s: string): string {
  return s
    .replace(/\[sound:[^\]]*\]/g, '')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(TAG_RE, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

/**
 * 背面字段过滤：Anki 模板/处理用字段和重复内容不给学生看。
 * - 听力/填空正反面、QuestionLink 等模板字段整列剔除
 * - 纯媒体引用（[sound:] / <img>）且媒体已在卡面挂载（主音频 / word.images）的整段剔除；
 *   未挂载时保留——那可能是这张卡唯一出图/出声的地方
 * - 内容与 单词/读音/释义 重复、或与已保留字段重复的剔除（JLab 的 Kanji/Lemma/Cloze 变体全是同一句话）
 */
export function visibleFields(word: Word): FieldSnap[] {
  const out: FieldSnap[] = []
  const seen = new Set<string>()
  const normTerm = norm(word.term)
  const normReading = norm(word.reading)
  const normMeaning = norm(word.meaning)
  for (const f of word.fields ?? []) {
    if (TEMPLATE_FIELD_RE.test(f.name)) continue
    const text = norm(f.value)
    if (!text) {
      // 整段只是媒体引用：全部已挂载（主音频 / 卡面图片区）才隐藏；
      // 未挂载时保留——那可能是这张卡唯一出图/出声的地方
      const audioOk = [...f.value.matchAll(/\[sound:([^\]]+)\]/g)].every((m) => m[1] === word.audioName)
      const imgOk = [...f.value.matchAll(/<img[^>]+src="([^"]+)"/gi)].every((m) => !!word.images?.[m[1]])
      if (audioOk && imgOk) continue
      out.push(f)
      continue
    }
    if (text === normTerm || text === normReading || text === normMeaning) continue
    if (seen.has(text)) continue
    seen.add(text)
    out.push(f)
  }
  return out
}
