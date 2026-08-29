import { HashRouter, Routes, Route, NavLink, Outlet } from 'react-router-dom'
import TodayPage from './today/TodayPage'
import LibraryPage from './library/LibraryPage'
import WordListPage from './library/WordListPage'
import WordDetailPage from './library/WordDetailPage'
import SettingsPage from './settings/SettingsPage'
import ImportPage from './importer/ImportPage'
import ReviewPage from './review/ReviewPage'

const TABS = [
  { to: '/', label: '今天', icon: '🏠' },
  { to: '/library', label: '词库', icon: '📚' },
  { to: '/settings', label: '设置', icon: '⚙️' },
]

function Shell() {
  return (
    <div className="relative mx-auto flex h-screen max-w-md flex-col">
      {/* 页面基座：浅蓝渐变 + 光斑（子页面透明浮在上面） */}
      <div className="page-bg fixed inset-0 -z-10" />
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="page-blob -top-10 -right-10 h-40 w-40 bg-[radial-gradient(circle,#c7d8ff66,transparent_70%)]" />
        <div className="page-blob -bottom-14 -left-8 h-52 w-52 bg-[radial-gradient(circle,#f3d1ff44,transparent_70%)]" />
      </div>

      <main className="flex-1 overflow-y-auto"><Outlet /></main>

      <nav className="flex border-t border-white/60 bg-white/75 text-center text-xs font-bold backdrop-blur-md dark:border-zinc-700/60 dark:bg-zinc-900/75">
        {/* isActive 动态高亮：当前 Tab 蓝色，其余灰色（子路由下 NavLink 默认 isActive，如 /library/deck/1 高亮「词库」） */}
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === '/'}
            className={({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 py-2 ${isActive ? 'text-[#3b6ef5]' : 'text-zinc-400'}`}>
            {({ isActive }) => (<>
              <span className={`text-base leading-none transition-transform ${isActive ? 'scale-110' : ''}`}>{t.icon}</span>
              {t.label}
            </>)}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<TodayPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/library/deck/:deckId" element={<WordListPage />} />
          <Route path="/word/:wordId" element={<WordDetailPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
