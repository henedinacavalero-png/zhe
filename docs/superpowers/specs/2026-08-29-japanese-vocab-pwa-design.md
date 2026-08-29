# 単語帳（TangoChou）— 日语背单词 PWA 设计文档

日期：2026-08-29 · 状态：已经用户确认

## 1. 概述

一个只给自己用的日语背单词 PWA（网页应用）。核心价值是**联动记忆**：背一个单词时，同步展示牌组自带的例句（目标词高亮）和智能关联的相关单词（同汉字、同词根分组着色，可点击跳转）。数据完全存在本地浏览器，支持完全离线使用。

**成功标准**

- 导入一个含例句/音频的 .apkg 后，5 分钟内能开始背第一张卡
- 断网全程可用（通勤、飞机场景）
- 每张卡翻开都有例句 + 至少 3 个关联词（同课兜底保证）
- 手机浏览器翻卡流畅，可加到主屏当 App 用

**非目标（明确不做）**：账号/云同步、选择题/听写等测验模式、统计图表（只保留连续打卡天数）、手动编辑单词、多用户。

## 2. 技术选型

| 项 | 选择 | 理由 |
|---|---|---|
| 构建 | Vite + React 18 + TypeScript | 主流、类型安全、生态成熟 |
| 状态 | Zustand | 轻量，无样板代码 |
| 本地存储 | Dexie.js（IndexedDB） | 结构化存储 + Blob 音频，容量远超 localStorage |
| PWA | vite-plugin-pwa（Workbox） | 静态资源预缓存，断网可用 |
| 样式 | Tailwind CSS | 快速实现现代简洁界面，支持暗色模式 |
| Anki 解析 | JSZip + sql.js | 浏览器内解压 .apkg 并读取内嵌 SQLite |
| 测试 | Vitest | 与 Vite 原生集成 |

部署形态：纯静态站点（`vite build` 产物可托管到任意静态服务），无后端、无账号。

## 3. 架构与模块

```
.apkg → importer（浏览器内解析+字段映射）→ Worker: linker（关联计算）+ 音频提取
      → IndexedDB → scheduler（生成今日队列）→ review UI 翻卡
```

模块边界（每个可独立理解和测试）：

- `importer` — .apkg 解压、SQLite 读取、字段自动猜测与手动映射、媒体提取。输出：词库记录。对外只暴露 `importApkg(file, mapping): Progress`。
- `linker` — 纯函数关联算法，输入词表，输出每词的关联列表。在 Web Worker 中运行，不碰 UI。
- `scheduler` — 纯函数调度，输入复习状态+自评结果，输出新状态；输入词库，输出今日队列。不碰存储。
- `store` — Dexie 表访问层，唯一允许读写 IndexedDB 的模块。
- `review` / `library` / `settings` — 三个页面级 UI 模块。

## 4. 数据模型（IndexedDB via Dexie）

```
decks      { id, name, importedAt, wordCount }
words      { id, deckId, term, reading, meaning, pos,
             examples: [{ ja, zh }],        // 牌组自带，可空
             audio: Blob?,                   // [sound:xxx] 提取，可空
             tags: string[], lesson: string?,
             related: [{ wordId, type: 'kanji'|'stem'|'lesson', score }]  // 导入时预计算
           }
progress   { wordId, ease: 2.5, interval: 0, due: Date,
             reps: 0, lapses: 0, lastReviewed: Date?, isNew: true }
settings   { key: 'app', dailyNewLimit: 15, theme: 'auto' }
streak     { key: 'streak', days: 0, lastStudyDate: date }
```

备份：一键导出以上全部为单个 JSON 文件（音频 Blob 转 base64），支持导入恢复。换设备/清缓存前先导出。

## 5. Anki 导入流程（importer）

1. 用户选择 .apkg 文件（手机/电脑均可）
2. JSZip 解压 → `collection.anki2` 交给 sql.js → 读出 notes、字段定义
3. **字段映射页**：自动猜测各列含义（含假名/汉字特征判定单词列、全假名列判定读音、含"。/！"的长日文列判定例句、含中文的列判定释义），用户可手动调整后确认
4. Web Worker 内执行：建词条 → linker 计算关联 → 解析 `[sound:xxx]` 从 media 清单提取音频 Blob → 分批写入 IndexedDB，前端显示进度条
5. 完成 → 跳转词库页

错误处理：文件损坏/非 .apkg → 中文报错；个别词缺例句 → `examples` 为空，卡片不显示例句区；音频缺失 → 只隐藏播放按钮；存储配额不足 → 中止导入并提示先备份/删除旧词库。

## 6. 联动记忆算法（linker）

对每个词，从同库其余词中按三种信号打分，取前 5-8 个：

1. **同汉字**（绿色分组）：共享汉字数计分，汉字稀有度加权（在词库中越少见的汉字权重越高）
2. **同词根**（橙色分组）：假名词干前缀匹配 + 基本动词变形规则（五段/一段/サ変/カ変的未然形、连用形等词干抽取），如 食べる ↔ 食べ物
3. **同课兜底**（蓝色分组）：上述关联不足 3 个时，从同 deck/同 lesson 的词中按顺序补齐

过滤：排除自身；排除含义列完全相同的重复词。输出按 `score` 降序，每项带 `type` 供 UI 分组着色。

## 7. 复习调度（scheduler，简化 SM-2）

三键自评：

| 自评 | 行为 |
|---|---|
| 😭 不认识 | interval 归零（10 分钟后重现），ease −0.15（下限 1.3），lapses +1 |
| 😐 模糊 | interval ×1.2，ease 不变 |
| 😊 认识 | 首次 1 天 → 3 天 → ×ease，ease +0.05 |

- 每日队列 = 全部到期复习卡 + 新词（上限 `dailyNewLimit`，默认 15，可改）
- 复习优先于新词；打卡：当日完成 ≥1 张即计连续天数

## 8. UI 设计（已确认布局 A · 底部标签栏）

**导航**：底部三个 Tab —— 今天 / 词库 / 设置。移动优先，暗色模式跟随系统。

**今天页**：今日任务卡片（N 新词 / M 待复习）+ 大按钮「开始背诵」+ 连续打卡天数。

**背卡页**（核心界面，原型已确认）：
- 正面：单词（大字）+ 音频播放按钮。不显示释义（防止"看到读音就想起"的干扰——读音放在背面）
- 翻开（点卡片或空格键）：读音 + 词性 + 释义 → 例句区（日文原文**高亮目标词** + 中文翻译）→ 相关单词区（按 同汉字=绿 / 同词根=橙 / 同课=蓝 分组的胶囊标签，点击直接跳到该词的详情）→ 底部三键自评
- 顶部进度条 i/n，中途退出自动保存进度

**词库页**：牌组列表（词数、进度）→ 点开单词列表（搜索框）→ 词详情（与卡片背面同布局的只读视图）。

**设置页**：每日新词上限、主题（亮/暗/跟随系统）、导出备份、导入备份、删除词库。

## 9. 测试策略

- **单元测试（Vitest）**：
  - importer：用内置的小型真实 .apkg fixture 断言解析结果（字段、音频、损坏文件报错）
  - linker：给定固定词表，断言分组与排序（含不足 3 个时的同课兜底）
  - scheduler：三键自评后的 ease/interval/due 断言
- **手动冒烟清单**（发布前跑一遍）：导入 → 背卡 → 翻卡 → 自评 → 刷新页面记录仍在 → 断网模式可用 → 导出再导入备份一致

## 10. 里程碑

1. **M1 骨架**：Vite+React+Tailwind 项目、底部 Tab 框架、今天页静态版、PWA 基础配置
2. **M2 导入**：importer 全流程（含字段映射页、进度条、音频提取）+ 词库页浏览
3. **M3 背卡**：scheduler + 背卡页完整交互 + progress/streak 持久化
4. **M4 联动**：linker Worker + 相关词分组展示 + 点击跳转
5. **M5 收尾**：备份导出/导入、设置页、暗色模式、冒烟清单全绿

每个里程碑独立可验证；实现计划由 writing-plans 技能另行产出。
