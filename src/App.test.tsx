import { render, screen, within } from '@testing-library/react'
import App from './App'

test('渲染底部三个 Tab', () => {
  render(<App />)
  // TodayPage 也有“今天”标题——Tab 断言限定在底部导航内，避免歧义匹配
  const nav = within(screen.getByRole('navigation'))
  expect(nav.getByText('今天')).toBeInTheDocument()
  expect(nav.getByText('词库')).toBeInTheDocument()
  expect(nav.getByText('设置')).toBeInTheDocument()
})
