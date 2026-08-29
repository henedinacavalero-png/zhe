import { render, screen } from '@testing-library/react'
import App from './App'

test('渲染底部三个 Tab', () => {
  render(<App />)
  expect(screen.getByText('今天')).toBeInTheDocument()
  expect(screen.getByText('词库')).toBeInTheDocument()
  expect(screen.getByText('设置')).toBeInTheDocument()
})
