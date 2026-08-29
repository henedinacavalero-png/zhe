import JSZip from 'jszip'
import initSqlJs from 'sql.js'
import sqlWasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url'

export interface RawModel { id: number; name: string; fieldNames: string[] }
export interface RawNote { mid: number; fields: string[]; tags: string[] }
export interface RawApkg { models: RawModel[]; notes: RawNote[]; mediaFiles: Map<string, Blob> }

const FIELD_SEP = '\x1f'

// 打包后 emscripten 胶水按"脚本目录"推 wasm 路径，必然 404；浏览器改用 Vite 发行的资产 URL。
// node/jsdom（vitest）走默认路径：node 版胶水用 fs 按包内路径读 wasm，测试不引入变量。
const IS_NODE = typeof process !== 'undefined' && process.versions?.node != null

export async function parseApkg(file: Blob): Promise<RawApkg> {
  let zip: JSZip
  try { zip = await JSZip.loadAsync(file) } catch { throw new Error('不是有效的 .apkg 文件（无法解压）') }

  if (zip.file('collection.anki21b')) {
    throw new Error('该 .apkg 使用新版加密格式，请用 Anki 桌面版重新导出并勾选"支持旧版本 Anki"')
  }
  const collection = zip.file('collection.anki2') ?? zip.file('collection.anki21')
  if (!collection) throw new Error('不是有效的 .apkg 文件（缺少牌组数据库）')

  const SQL = await initSqlJs(IS_NODE ? undefined : { locateFile: () => sqlWasmUrl })

  const mediaFiles = new Map<string, Blob>()
  const mediaManifest = zip.file('media')
  if (mediaManifest) {
    let entries: [string, string][] = []
    try {
      entries = Object.entries(JSON.parse(await mediaManifest.async('string')) as Record<string, string>)
    } catch { /* 媒体清单损坏：按无媒体处理，不阻断词条导入 */ }
    for (const [idx, filename] of entries) {
      const f = zip.file(idx)
      if (f) mediaFiles.set(filename, await f.async('blob'))
    }
  }

  let db: InstanceType<typeof SQL.Database> | null = null
  try {
    db = new SQL.Database(new Uint8Array(await collection.async('arraybuffer')))
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
    return { models, notes, mediaFiles }
  } catch {
    throw new Error('牌组数据库为空或已损坏')
  } finally {
    db?.close()
  }
}
