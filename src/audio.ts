export function playBlob(blob: Blob): void {
  // JSZip 解出的媒体 Blob 无 MIME 类型，部分浏览器内核拒播无类型的音频源——补 mp3 类型
  const typed = blob.type ? blob : new Blob([blob], { type: 'audio/mpeg' })
  const u = URL.createObjectURL(typed)
  new Audio(u).play().catch((err) => console.warn('音频播放失败', err))
  setTimeout(() => URL.revokeObjectURL(u), 8000)
}
