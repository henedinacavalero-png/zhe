import { HashRouter, Routes, Route, NavLink, Outlet } from 'react-router-dom'
import TodayPage from './today/TodayPage'
import LibraryPage from './library/LibraryPage'
import SettingsPage from './settings/SettingsPage'
import ImportPage from './importer/ImportPage'

function Shell() {
  return (
    <div className="mx-auto flex h-screen max-w-md flex-col bg-white dark:bg-zinc-900 dark:text-zinc-100">
      <main className="flex-1 overflow-y-auto"><Outlet /></main>
      <nav className="flex border-t border-zinc-200 text-center text-sm dark:border-zinc-700">
        <NavLink to="/" className="flex-1 py-3 font-bold text-[#3b6ef5]">今天</NavLink>
        <NavLink to="/library" className="flex-1 py-3 text-zinc-500">词库</NavLink>
        <NavLink to="/settings" className="flex-1 py-3 text-zinc-500">设置</NavLink>
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
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/library/deck/:deckId" element={<LibraryPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
