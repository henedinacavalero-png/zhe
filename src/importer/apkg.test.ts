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

  test('新版加密格式 anki21b：提示重新导出', async () => {
    const zip = new JSZip(); zip.file('collection.anki21b', new Uint8Array([1]))
    await expect(parseApkg(await zip.generateAsync({ type: 'blob' }))).rejects.toThrow(/重新导出/)
  })
})
