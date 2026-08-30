import type { ReactNode } from 'react'
import { playBlob } from './audio'

/** Blob → objectURL 会话级缓存（同一 Blob 只创建一次） */
const urlCache = new WeakMap<Blob, string>()
export function blobUrl(blob: Blob): string {
  let u = urlCache.get(blob)
  if (!u) { u = URL.createObjectURL(blob); urlCache.set(blob, u) }
  return u
}

export interface MediaResolver {
  /** 文件名 → Blob（含图片与例句音频等非主音频媒体） */
  media?: Record<string, Blob> | null
  /** 主音频兜底（word.audio + audioName） */
  audio?: { name: string; blob: Blob } | null
  /** 字段 <img> 图片表 */
  images?: Record<string, Blob> | null
}

const TOKEN_RE = /<img[^>]*?src="([^"]*)"[^>]*>|<br\s*\/?>|\[sound:([^\]]*)\]|<[^>]+>|\[sound:[^\]]*\]/gi
const BRACKET_PART_RE = /([\u3400-\u9faf々]+)\[([^\]]+)\]/
const BRACKET_PART_G = /([\u3400-\u9faf々]+)\[([^\]]+)\]/g

/**
 * Anki 字段文本渲染：<img> 显示图片、[sound:x] 渲染 🔊 按钮、<br> 换行、
 * 其余 HTML 标签剥离、漢字[かな] 转 ruby；term 出现的文本段加下划线高亮。
 */
export function AnkiText({ text, resolve, term, ruby }: {
  text: string
  resolve?: MediaResolver
  term?: string
  ruby?: boolean
}): ReactNode {
  const HL = 'rounded-sm bg-[linear-gradient(transparent_55%,#c9dcff_55%)] font-bold dark:bg-[linear-gradient(transparent_55%,#3730a3aa_55%)]'
  const blobByName = (name: string): Blob | undefined =>
    resolve?.media?.[name] ?? (resolve?.audio?.name === name ? resolve.audio.blob : undefined)
  const nodes: ReactNode[] = []
  let last = 0
  let key = 0
  let bold = false // <b>…</b> 之间的高亮段（蓝宝书等牌组用它标注语法点位置）
  const marked = (chunk: string): ReactNode => {
    if (term && chunk.includes(term)) {
      const idx = chunk.indexOf(term)
      return (<>
        {chunk.slice(0, idx)}
        <mark key={key++} className={HL}>{term}</mark>
        {chunk.slice(idx + term.length)}
      </>)
    }
    return chunk
  }
  const pushText = (chunk: string) => {
    if (!chunk) return
    let node: ReactNode
    if (ruby && BRACKET_PART_RE.test(chunk)) {
      const parts: ReactNode[] = []
      let pos = 0
      for (const m of chunk.matchAll(BRACKET_PART_G)) {
        if (m.index > pos) parts.push(marked(chunk.slice(pos, m.index)))
        parts.push(
          <ruby key={`r${key++}`}>{m[1]}<rt className="text-[0.55em] font-normal text-zinc-400">{m[2]}</rt></ruby>,
        )
        pos = m.index + m[0].length
      }
      parts.push(marked(chunk.slice(pos)))
      node = <>{parts}</>
    } else {
      node = marked(chunk)
    }
    nodes.push(bold ? <mark key={key++} className={HL}>{node}</mark> : node)
  }

  for (const m of text.matchAll(TOKEN_RE)) {
    const plain = text.slice(last, m.index)
    pushText(plain)
    last = m.index + m[0].length
    const tag = m[0]
    if (/^<img/i.test(tag)) {
      const src = m[1]
      const blob = resolve?.images?.[src] ?? resolve?.media?.[src]
      if (blob) nodes.push(<img key={key++} src={blobUrl(blob)} className="mx-auto my-1 max-h-48 rounded-lg" />)
    } else if (/^<br/i.test(tag)) {
      nodes.push(<br key={key++} />)
    } else if (/^<\/?b(?:\s[^>]*)?>$/i.test(tag)) {
      bold = !tag.startsWith('</') // <b> 开启高亮、</b> 结束
    } else if (/^\[sound:/i.test(tag)) {
      const name = tag.slice(7, -1)
      const blob = blobByName(name)
      if (blob) {
        nodes.push(
          <button key={key++} aria-label="播放音频"
            className="mx-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#eef2ff] text-sm text-[#3b6ef5] align-middle"
            onClick={() => playBlob(blob)}>🔊</button>,
        )
      }
    }
    // 其余标签（<i> 等）剥离
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
