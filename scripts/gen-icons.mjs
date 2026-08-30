// 用系统 Edge 把 SVG 图标栅格化成 PWA/APK 打包所需的 PNG（一次性工具）
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const FONT = 'font-family="\'Microsoft YaHei\',\'Noto Sans SC\',sans-serif" font-size="52" font-weight="bold" fill="#ffffff"'
const circled = (s) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${s}" height="${s}">
  <circle cx="50" cy="50" r="50" fill="#d43c33"/>
  <text x="50" y="54" text-anchor="middle" dominant-baseline="middle" ${FONT}>単</text>
</svg>`
// maskable：内容必须落在中心 80% 安全区内，背景全出血
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="512" height="512">
  <rect width="100" height="100" fill="#d43c33"/>
  <text x="50" y="55" text-anchor="middle" dominant-baseline="middle" font-family="'Microsoft YaHei','Noto Sans SC',sans-serif" font-size="40" font-weight="bold" fill="#ffffff">単</text>
</svg>`

mkdirSync('public/icons', { recursive: true })
const browser = await chromium.launch({ channel: 'msedge' })
for (const s of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: s, height: s }, deviceScaleFactor: 1 })
  await page.setContent(`<body style="margin:0">${circled(s)}</body>`)
  await page.locator('svg').screenshot({ path: `public/icons/icon-${s}.png`, omitBackground: true })
  await page.close()
}
{
  const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 })
  await page.setContent(`<body style="margin:0">${maskable}</body>`)
  await page.locator('svg').screenshot({ path: 'public/icons/icon-maskable-512.png' })
  await page.close()
}
await browser.close()
console.log('icons generated')
