// 全功能真实文件验证：导入 egg_rolls JLPT → 词库 → 背卡 → 自评 → 持久化 → 备份
import { chromium } from 'playwright'
import fs from 'node:fs'

const DECK = 'D:/浏览器下载/egg_rollsJLPT_N1N5__v35NO_ENGLISH.apkg'
const BASE = 'http://localhost:5173'
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

;(async () => {
  // 用系统已装的 Edge / Chrome（不走 Playwright 下载的浏览器）
  let browser
  try { browser = await chromium.launch({ channel: 'msedge', headless: true }) }
  catch { browser = await chromium.launch({ channel: 'chrome', headless: true }) }
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
  page.on('worker', (w) => {
    log('[worker] 启动:', w.url())
    w.on('console', (m) => log('[worker]', m.type(), m.text()))
  })

  try {
    // 0. 若上一次运行已导入成功则跳过导入（避免重复建牌组）
    await page.goto(`${BASE}/#/library`)
    const already = await page.waitForSelector('text=10635 词', { timeout: 5_000 }).then(() => true).catch(() => false)
    if (already) {
      log('[0] 检测到已有 10635 词牌组，跳过导入')
    } else {
      await page.goto(`${BASE}/#/import`)
      log('[1] 导入页已打开，选择文件…')
      await page.setInputFiles('input[type=file]', DECK)
      await page.waitForSelector('button:has-text("开始导入")', { timeout: 180_000 })
      log('[2] 映射页出现')

      const rows = await page.$$eval('label', (ls) => ls.map((l) => ({
        name: l.querySelector('span')?.textContent,
        value: l.querySelector('select')?.selectedOptions[0]?.textContent,
      })))
      log('[3] 猜测结果:', JSON.stringify(rows))
      const byName = Object.fromEntries(rows.map((r) => [r.name, r.value]))
      if (byName['单词'] !== 'VocabKanji') throw new Error('单词列猜测错误: ' + byName['单词'])
      if (byName['释义'] !== 'VocabDefSC') throw new Error('释义列猜测错误: ' + byName['释义'])

      await page.$$eval('label', (ls) => {
        const l = ls.find((x) => x.querySelector('span')?.textContent === '读音')
        if (l) {
          const sel = l.querySelector('select')
          const opt = [...sel.options].find((o) => o.textContent === 'VocabFurigana')
          if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })) }
        }
      })
      log('[4] 读音已手动选 VocabFurigana')

      log('[5] 点击开始导入，等待完成…')
      await page.click('button:has-text("开始导入")')
      await page.waitForTimeout(60_000)
      const workers = page.workers().map((w) => w.url())
      log('[5a] 60s 诊断: workers=', JSON.stringify(workers), '| 浏览器错误:', JSON.stringify(errors))
      await page.waitForURL(/\/library\/deck\/\d+/, { timeout: 20 * 60_000 })
      log('[6] 导入完成，URL:', page.url())
    }

    // 词库列表页确认总数（牌组详情页只显示牌组名，不显示词数）
    await page.goto(`${BASE}/#/library`)
    await page.waitForSelector('text=10635 词', { timeout: 30_000 })
    log('[7] 词库页确认：10635 词 ✓')

    // 5. 今天页 → 开始背诵
    await page.goto(`${BASE}/#/`)
    await page.waitForFunction(() => document.body.innerText.includes('15 个新词'), { timeout: 30_000 })
    const todayText = await page.textContent('body')
    if (!/15 个新词/.test(todayText)) throw new Error('今天页未显示 15 个新词: ' + todayText.slice(0, 200))
    log('[8] 今天页：15 个新词 ✓')
    await page.click('a:has-text("开始背诵")')
    await page.waitForSelector('text=点击卡片显示答案', { timeout: 60_000 })
    log('[9] 背卡页出现，卡面渲染 ✓')

    // 6. 翻卡：验证背面（振假名/例句标音/相关词胶囊）
    await page.click('main >> text=点击卡片显示答案')
    await page.waitForSelector('button:has-text("认识")', { timeout: 30_000 })
    const chipCount = await page.locator('.rounded-full').count()
    const exampleRuby = await page.locator('div.rounded-lg ruby').count()
    const termText = (await page.locator('div.text-4xl').first().innerText()).replace('▶', '').trim()
    const termHasKanji = /[\u3400-\u9faf]/.test(termText)
    const termRuby = await page.locator('div.text-4xl ruby').count()
    log(`[10] 卡片背面：振假名 ${termHasKanji ? (termRuby > 0 ? '✓' : '✗ 缺失') : '本卡无汉字跳过'} | 例句标音 ${exampleRuby > 0 ? '✓' : '✗ 缺失'} | 相关词胶囊 ${chipCount} 个${chipCount > 0 ? ' ✓' : ' ✗ 缺失'} | 当前词: ${termText}`)
    if (termHasKanji && termRuby === 0) throw new Error('单词振假名缺失')
    if (chipCount === 0) throw new Error('相关词胶囊缺失')

    // 7. 自评两张：认识
    await page.click('button:has-text("认识")')
    await page.waitForSelector('text=2 / 15', { timeout: 30_000 })
    log('[11] 自评后进度 2/15 ✓')
    await page.click('main >> text=点击卡片显示答案')
    await page.waitForSelector('button:has-text("不认识")', { timeout: 30_000 })
    await page.click('button:has-text("不认识")')
    await page.waitForSelector('text=3 / 15', { timeout: 30_000 })
    log('[12] 三键之二（不认识）✓')

    // 8. 重新进今天页验证持久化（queue 自动补满 15；streak 写入 IndexedDB 后跨页面仍在）
    await page.goto(`${BASE}/#/`)
    await page.waitForFunction(() => document.body.innerText.includes('15 个新词'), { timeout: 30_000 })
    const afterReload = await page.textContent('body')
    if (!/15 个新词/.test(afterReload)) throw new Error('未显示 15 个新词: ' + afterReload.slice(0, 200))
    if (!/连续打卡 1 天/.test(afterReload)) throw new Error('打卡未持久化（无"连续打卡 1 天"）')
    log('[13] 持久化 ✓（队列补满 15 + 连续打卡 1 天写入 IndexedDB）')

    // 9. 设置页 → 导出备份
    await page.goto(`${BASE}/#/settings`)
    await page.waitForSelector('button:has-text("导出备份")', { timeout: 30_000 })
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 300_000 }),
      page.click('button:has-text("导出备份")'),
    ])
    const path = await download.path()
    const backup = JSON.parse(fs.readFileSync(path, 'utf8'))
    if (!backup.words || backup.words.length !== 10635) throw new Error('备份数不对: ' + (backup.words || []).length)
    const withAudio = backup.words.filter((w) => backup.audioByWordId[String(w.id)]).length
    log(`[15] 备份导出 ✓：${backup.words.length} 词，含音频 ${withAudio} 个，进度记录 ${backup.progress.length} 条`)
    fs.renameSync(path, 'C:/Users/zhe/Documents/工作空间/tangochou/e2e-backup.json')

    if (errors.length) { console.log('⚠ 浏览器错误:', errors.slice(0, 5)); process.exit(3) }
    log('=== 全部功能验证通过 ===')
    process.exit(0)
  } catch (e) {
    console.error('FAIL:', e.message)
    console.error('浏览器错误收集:', JSON.stringify(errors, null, 2))
    await page.screenshot({ path: 'C:/Users/zhe/Documents/工作空间/tangochou/e2e-fail.png' }).catch(() => {})
    process.exit(1)
  } finally {
    await browser.close()
  }
})()
