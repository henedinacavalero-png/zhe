import type { ReactNode } from 'react'

/** Blob → objectURL 会话级缓存（同一 Blob 只创建一次） */
const urlCache = new WeakMap<Blob, string>()
export function blobUrl(blob: Blob): string {
  let u = urlCache.get(blob)
  if (!u) { u = URL.createObjectURL(blob); urlCache.set(blob, u) }
  return u
}

const TOKEN_RE = /<img[^>]*?src="([^"]*)"[^>]*>|<br\s*\/?>|<[^>]+>|\[sound:[^\]]*\]/gi
const BRACKET_PART_RE = /([\u3400-\u9faf々]+)\[([^\]]+)\]/
const BRACKET_PART_G = /([\u3400-\u9faf々]+)\[([^\]]+)\]/g

/**
 * Anki 字段文本渲染：<img> 显示图片（images 里找不到就跳过）、<br> 换行、
 * 其余 HTML 标签剥离、[sound:] 剥离（音频由播放按钮承担）、
 * 漢字[かな] 转 ruby；term 出现的文本段加下划线高亮。
 */
export function AnkiText({ text, images, term, ruby }: {
  text: string
  images?: Record<string, Blob> | null
  term?: string
  ruby?: boolean
}): ReactNode {
  const HL = 'rounded-sm bg-[linear-gradient(transparent_55%,#c9dcff_55%)] font-bold dark:bg-[linear-gradient(transparent_55%,#3730a3aa_55%)]'
  const nodes: ReactNode[] = []
  let last = 0
  let key = 0
  const pushText = (chunk: string) => {
    if (!chunk) return
    // 漢字[かな] → ruby；否则普通文本（term 高亮）
    if (ruby && BRACKET_PART_RE.test(chunk)) {
      let pos = 0
      for (const m of chunk.matchAll(BRACKET_PART_G)) {
        if (m.index > pos) nodes.push(marked(chunk.slice(pos, m.index)))
        nodes.push(
          <ruby key={key++}>{m[1]}<rt className="text-[0.55em] font-normal text-zinc-400">{m[2]}</rt></ruby>,
        )
        pos = m.index + m[0].length
      }
      nodes.push(marked(chunk.slice(pos)))
    } else {
      nodes.push(marked(chunk))
    }
  }
  const marked = (chunk: string): ReactNode => {
    if (term && chunk.includes(term)) {
      // 只高亮 term 子串，前后文保持普通文本
      const idx = chunk.indexOf(term)
      return (<>
        {chunk.slice(0, idx)}
        <mark key={key++} className={HL}>{term}</mark>
        {chunk.slice(idx + term.length)}
      </>)
    }
    return chunk
  }

  for (const m of text.matchAll(TOKEN_RE)) {
    const plain = text.slice(last, m.index)
    pushText(plain)
    last = m.index + m[0].length
    const tag = m[0]
    if (/^<img/i.test(tag)) {
      const src = m[1]
      const blob = images?.[src]
      if (blob) nodes.push(<img key={key++} src={blobUrl(blob)} className="mx-auto my-1 max-h-48 rounded-lg" />)
    } else if (/^<br/i.test(tag)) {
      nodes.push(<br key={key++} />)
    }
    // 其余标签（<b> 等）剥离
  }
  pushText(text.slice(last))
  return <>{nodes}</>
}

/** 词卡图片画廊 */
export function WordImages({ images }: { images?: Record<string, Blob> | null }) {
  if (!images) return null
  const blobs = Object.values(images)
  if (!blobs.length) return null
  return (
    <div className="my-2 flex flex-wrap justify-center gap-2">
      {blobs.map((b, i) => (
        <img key={i} src={blobUrl(b)} className="max-h-44 rounded-xl" />
      ))}
    </div>
  )
}
