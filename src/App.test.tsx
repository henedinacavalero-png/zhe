import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

test('渲染底部三个 Tab', () => {
  render(<App />)
  // TodayPage 也有“今天”标题——Tab 断言限定在底部导航内，避免歧义匹配
  const nav = within(screen.getByRole('navigation'))
  expect(nav.getByText('今天')).toBeInTheDocument()
  expect(nav.getByText('词库')).toBeInTheDocument()
  expect(nav.getByText('设置')).toBeInTheDocument()
})

test('Tab 高亮跟随当前路由：点「词库」后高亮转移', async () => {
  render(<App />)
  const nav = within(screen.getByRole('navigation'))
  // 起始路由为 /：「今天」active（高亮色 + aria-current）
  expect(nav.getByText('今天').className).toContain('text-[#3b6ef5]')
  expect(nav.getByText('今天')).toHaveAttribute('aria-current', 'page')
  expect(nav.getByText('词库').className).not.toContain('text-[#3b6ef5]')
  // 切到词库后：高亮应转移到「词库」，「今天」退为灰色（动态 className，静态写法时此断言失败）
  await userEvent.click(nav.getByText('词库'))
  expect(nav.getByText('词库').className).toContain('text-[#3b6ef5]')
  expect(nav.getByText('词库')).toHaveAttribute('aria-current', 'page')
  expect(nav.getByText('今天').className).not.toContain('text-[#3b6ef5]')
})
