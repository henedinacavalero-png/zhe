import { Link } from 'react-router-dom'

export default function TodayPage() {
  return (
    <div className="p-4">
      <div>今天（占位）</div>
      <Link to="/review" className="mt-4 block rounded-lg bg-[#3b6ef5] py-3 text-center font-bold text-white">开始背诵</Link>
    </div>
  )
}
