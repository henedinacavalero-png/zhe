export function playBlob(blob: Blob): void {
  const u = URL.createObjectURL(blob)
  new Audio(u).play().catch(() => {/* 无声环境忽略 */ })
  setTimeout(() => URL.revokeObjectURL(u), 5000)
}
