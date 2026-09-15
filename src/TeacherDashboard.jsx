import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { formatDate, formatMoney, loadTeacherDashboard } from './lib/teacherDashboard'

const navItems = [['Dashboard', '/teacher/dashboard', '▦'], ['Students', '/teacher/students', '♙'], ['Courses & Lessons', '/teacher/courses', '▤'], ['Exams', '/teacher/exams', '✓'], ['Grades', '/teacher/grades', '◈'], ['Attendance', '/teacher/attendance', '◷'], ['Payments', '/teacher/payments', '$'], ['Expenses', '/teacher/expenses', '−'], ['Announcements', '/teacher/announcements', '◆'], ['Student Codes', '/teacher/student-codes', '#'], ['Reports', '/teacher/reports', '▥'], ['Notifications', '/teacher/notifications', '🔔'], ['Settings', '/teacher/settings', '⚙']]
const quickActions = [['Add Student', '/teacher/students/new', '+'], ['Create Course', '/teacher/courses/new', '+'], ['Add Lesson', '/teacher/lessons/new', '+'], ['Create Exam', '/teacher/exams/new', '+'], ['Add Announcement', '/teacher/announcements/new', '+'], ['Review Payments', '/teacher/payments?status=pending', '→']]

function StatCard({ label, value, tone }) { return <article className={`teacher-stat teacher-stat-${tone}`}><span>{label}</span><strong>{value}</strong><small>Live database value</small></article> }
function Empty({ children }) { return <div className="teacher-empty">{children}</div> }
function Panel({ title, action, children, className = '' }) { return <section className={`teacher-panel ${className}`}><div className="teacher-panel-heading"><h2>{title}</h2>{action}</div>{children}</section> }
function Skeletons() { return <div className="teacher-skeleton-grid">{Array.from({ length: 8 }, (_, index) => <div className="teacher-skeleton" key={index} />)}</div> }

export default function TeacherDashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [state, setState] = useState('loading')
  const [drawer, setDrawer] = useState(false)
  const [search, setSearch] = useState('')
  const [range, setRange] = useState('month')
  useEffect(() => {
    let mounted = true
    async function load() {
      if (!isSupabaseConfigured || !supabase) return navigate('/teacher/login', { replace: true })
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) return navigate('/teacher/login', { replace: true })
      const { data: role } = await supabase.from('platform_roles').select('role').eq('auth_user_id', auth.user.id).maybeSingle()
      if (role?.role !== 'teacher') { await supabase.auth.signOut(); return navigate('/teacher/login', { replace: true }) }
      try { const result = await loadTeacherDashboard(auth.user.id); if (mounted) { setData(result); setState('ready') } } catch { if (mounted) setState('error') }
    }
    load()
    return () => { mounted = false }
  }, [navigate])
  async function logout() { await supabase?.auth.signOut(); navigate('/teacher/login', { replace: true }) }
  if (state === 'loading') return <div className="teacher-loading"><div className="teacher-loading-inner"><span className="payment-loader" /><p>Loading your teacher dashboard...</p><Skeletons /></div></div>
  if (state === 'error') return <div className="teacher-error-page"><div><span className="eyebrow">ENGLISH ZONE / TEACHER AREA</span><h1>Unable to load this information right now.</h1><p>Check your connection and try again.</p><button className="teacher-primary-button" onClick={() => window.location.reload()}>Try Again</button></div></div>
  const { stats, studentMap, courseMap } = data
  const rangeStart = new Date()
  if (range === 'week') rangeStart.setDate(rangeStart.getDate() - 7)
  if (range === 'month') rangeStart.setMonth(rangeStart.getMonth() - 1)
  if (range === 'year') rangeStart.setFullYear(rangeStart.getFullYear() - 1)
  const rangeStartDate = rangeStart.toISOString().slice(0, 10)
  const rangePayments = data.finance.payments.filter((payment) => payment.status === 'approved' && payment.created_at.slice(0, 10) >= rangeStartDate)
  const rangeExpenses = data.finance.expenseRows.filter((expense) => expense.expense_date >= rangeStartDate)
  const rangeRevenue = rangePayments.reduce((total, payment) => total + Number(payment.amount || 0), 0)
  const rangeExpensesTotal = rangeExpenses.reduce((total, expense) => total + Number(expense.amount || 0), 0)
  const searchResults = search.trim() ? [...data.students.filter((item) => item.full_name.toLowerCase().includes(search.toLowerCase()) || item.student_code.toLowerCase().includes(search.toLowerCase())), ...data.courses.filter((item) => item.name.toLowerCase().includes(search.toLowerCase())), ...data.exams.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()))].slice(0, 6) : []
}
