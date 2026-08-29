import JSZip from 'jszip'
import initSqlJs from 'sql.js'

export interface RawModel { id: number; name: string; fieldNames: string[] }
export interface RawNote { mid: number; fields: string[]; tags: string[] }
export interface RawApkg { models: RawModel[]; notes: RawNote[]; mediaFiles: Map<string, Blob> }

const FIELD_SEP = '\x1f'

export async function parseApkg(file: Blob): Promise<RawApkg> {
  let zip: JSZip
  try { zip = await JSZip.loadAsync(file) } catch { throw new Error('不是有效的 .apkg 文件（无法解压）') }

  if (zip.file('collection.anki21b')) {
    throw new Error('该 .apkg 使用新版加密格式，请用 Anki 桌面版重新导出并勾选"支持旧版本 Anki"')
  }
  const collection = zip.file('collection.anki2') ?? zip.file('collection.anki21')
  if (!collection) throw new Error('不是有效的 .apkg 文件（缺少牌组数据库）')

  const SQL = await initSqlJs()
  const db = new SQL.Database(new Uint8Array(await collection.async('arraybuffer')))
  const modelsJson = db.exec('SELECT models FROM col')[0]?.values[0]?.[0] as string
  if (!modelsJson) throw new Error('牌组数据库为空或已损坏')

  interface AnkiModel { id: number; name: string; flds: { name: string }[] }
  const models: RawModel[] = (JSON.parse(modelsJson) as AnkiModel[])
    .map((m) => ({ id: m.id, name: m.name, fieldNames: m.flds.map((f) => f.name) }))

  const notes: RawNote[] = []
  for (const row of db.exec('SELECT mid, flds, tags FROM notes')[0]?.values ?? []) {
    notes.push({
      mid: row[0] as number,
      fields: String(row[1]).split(FIELD_SEP),
      tags: String(row[2] ?? '').split(' ').filter(Boolean),
    })
  }

  const mediaFiles = new Map<string, Blob>()
  const mediaManifest = zip.file('media')
  if (mediaManifest) {
    const entries = Object.entries(JSON.parse(await mediaManifest.async('string')) as Record<string, string>)
    for (const [idx, filename] of entries) {
      const f = zip.file(idx)
      if (f) mediaFiles.set(filename, await f.async('blob'))
    }
  }
  return { models, notes, mediaFiles }
}
