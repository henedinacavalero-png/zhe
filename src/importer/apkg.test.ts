import { describe, expect, test } from 'vitest'
import JSZip from 'jszip'
import initSqlJs from 'sql.js'
import { parseApkg } from './apkg'

async function buildApkg(): Promise<Blob> {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  db.run(`CREATE TABLE col (id INTEGER PRIMARY KEY, models TEXT); CREATE TABLE notes (id INTEGER PRIMARY KEY, mid INTEGER, flds TEXT, tags TEXT);`)
  const models = JSON.stringify([{ id: 1607392319001, name: 'Basic', flds: [{ name: '単語' }, { name: 'よみ' }, { name: '意味' }, { name: '例文' }] }])
  db.run('INSERT INTO col (id, models) VALUES (1, ?)', [models])
  db.run('INSERT INTO notes (id, mid, flds, tags) VALUES (1, 1607392319001, ?, ?)',
    ['食べる\x1fたべる\x1f吃\x1f朝ごはんを食べる。', 'JLPT::N4 教材::みんな'])
  const zip = new JSZip()
  zip.file('collection.anki2', new Uint8Array(db.export()))
  zip.file('media', JSON.stringify({ 0: 'pop.mp3' }))
  zip.file('0', new Blob(['MP3DATA']))
  return zip.generateAsync({ type: 'blob' })
}

describe('parseApkg', () => {
  test('解析出字段定义、笔记（\\x1f 分列、tags）、媒体', async () => {
    const raw = await parseApkg(await buildApkg())
    expect(raw.models[0].fieldNames).toEqual(['単語', 'よみ', '意味', '例文'])
    expect(raw.notes[0].fields).toEqual(['食べる', 'たべる', '吃', '朝ごはんを食べる。'])
    expect(raw.notes[0].tags).toEqual(['JLPT::N4', '教材::みんな'])
    const mp3 = raw.mediaFiles.get('pop.mp3')!
    expect(await mp3.text()).toBe('MP3DATA')
  })

  test('损坏文件：友好中文报错', async () => {
    await expect(parseApkg(new Blob(['not a zip']))).rejects.toThrow(/不是有效的/)
  })

  test('collection.anki2 存在但内容非法：报已损坏', async () => {
    const zip = new JSZip(); zip.file('collection.anki2', 'not a sqlite database')
    await expect(parseApkg(await zip.generateAsync({ type: 'blob' }))).rejects.toThrow(/已损坏/)
  })

  test('新版加密格式 anki21b：提示重新导出', async () => {
    const zip = new JSZip(); zip.file('collection.anki21b', new Uint8Array([1]))
    await expect(parseApkg(await zip.generateAsync({ type: 'blob' }))).rejects.toThrow(/重新导出/)
  })

  // 真实 World Anki（2.1.50+）导出格式：collection.anki2 是只含提示笔记的兼容存根，
  // 完整数据在 collection.anki21；col.models 是 {mid: model} 对象映射而非数组。
  async function buildModernApkg(): Promise<Blob> {
    const SQL = await initSqlJs()
    const zip = new JSZip()
    const schema = `CREATE TABLE col (id INTEGER PRIMARY KEY, models TEXT); CREATE TABLE notes (id INTEGER PRIMARY KEY, mid INTEGER, flds TEXT, tags TEXT);`
    const modelMap = JSON.stringify({
      1607392319001: { id: 1607392319001, name: 'Basic', flds: [{ name: '単語' }, { name: 'よみ' }, { name: '意味' }, { name: '例文' }] },
    })
    const stub = new SQL.Database()
    stub.run(schema)
    stub.run('INSERT INTO col (id, models) VALUES (1, ?)', [JSON.stringify({ 1: { id: 1, name: 'Basic', flds: [{ name: 'Front' }, { name: 'Back' }] } })])
    stub.run('INSERT INTO notes (id, mid, flds, tags) VALUES (1, 1, ?, \'\')', ['Please update to the latest Anki version, then import the .colpkg/.apkg file again.'])
    zip.file('collection.anki2', new Uint8Array(stub.export()))
    const full = new SQL.Database()
    full.run(schema)
    full.run('INSERT INTO col (id, models) VALUES (1, ?)', [modelMap])
    full.run('INSERT INTO notes (id, mid, flds, tags) VALUES (1, 1607392319001, ?, ?)',
      ['食べる\x1fたべる\x1f吃\x1f朝ごはんを食べる。', 'JLPT::N4'])
    full.run('INSERT INTO notes (id, mid, flds, tags) VALUES (2, 1607392319001, ?, \'\')', ['飲む\x1fのむ\x1f喝\x1fコーヒーを飲む。'])
    zip.file('collection.anki21', new Uint8Array(full.export()))
    return zip.generateAsync({ type: 'blob' })
  }

  test('新版导出：anki2 为存根时读 anki21 的完整数据；models 为对象映射格式', async () => {
    const raw = await parseApkg(await buildModernApkg())
    expect(raw.models).toHaveLength(1)
    expect(raw.models[0]).toMatchObject({ id: 1607392319001, name: 'Basic' })
    expect(raw.models[0].fieldNames).toEqual(['単語', 'よみ', '意味', '例文'])
    expect(raw.notes).toHaveLength(2)
    expect(raw.notes[0].fields[0]).toBe('食べる')
  })

  test('media:false 时跳过媒体提取（大文件预览不卡主线程）', async () => {
    const raw = await parseApkg(await buildApkg(), { media: false })
    expect(raw.mediaFiles.size).toBe(0)
    expect(raw.notes).toHaveLength(1)
  })
})
