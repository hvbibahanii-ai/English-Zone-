import { useState } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import RegisterPage from './RegisterPage'
import PaymentPage from './PaymentPage'
import StudentArea from './StudentArea'
import { ForgotPasswordPage, ResetPasswordPage, StudentLoginPage } from './StudentAuthPages'
import { TeacherDashboardPage, TeacherLoginPage } from './TeacherAuthPages'
import TeacherDashboard from './TeacherDashboard'
import { StudentCardPage, StudentEditPage, StudentProfilePage, StudentsManagementPage, VerifyStudentPage } from './StudentsManagement'
import { CourseOverviewPage, CoursesManagementPage } from './CoursesManagement'
import { ExamDetailPage, ExamResultsPage, ExamsManagementPage, GradesManagementPage, StudentGradesPage } from './ExamsManagement'
import { AttendanceManagementPage } from './AttendanceManagement'
import { PaymentsManagementPage } from './PaymentsManagement'
import { ExpensesManagementPage } from './ExpensesManagement'
import { AnnouncementsManagementPage } from './AnnouncementsManagement'
import StudentAnnouncementsPage from './StudentAnnouncements'
import { StudentCodesManagementPage } from './StudentCodesManagement'
import { ReportsManagementPage } from './ReportsManagement'
import { TeacherSettingsPage } from './TeacherSettings'
import { TeacherNotificationsPage } from './TeacherNotificationsCenter'

const icons = {
  book: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" /><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20M8 7h8M8 10h6" /></svg>,
  spark: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" /></svg>,
  chart: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5M4 19h16M8 16v-3M12 16V8M16 16v-6M20 16V4" /></svg>,
  shield: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 6v5c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V6l8-3Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></svg>,
  arrow: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" /></svg>,
  menu: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>,
  close: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>,
  headphones: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v5H5a1 1 0 0 1-1-1v-4ZM20 14h-3v5h2a1 1 0 0 0 1-1v-4Z" /></svg>,
}

function Logo() {
  return <Link className="brand" to="/" aria-label="English Zone home"><span className="brand-mark">AM<span>{icons.book}</span></span><span><strong>Mr Abdelrahman Mohamed</strong><small>English Learning Platform</small></span></Link>
}

function Button({ children, to, variant = 'primary', className = '' }) {
  return <Link className={`button button-${variant} ${className}`} to={to}>{children}{variant !== 'text' && <span className="button-arrow">{icons.arrow}</span>}</Link>
}

function Navbar() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const links = [['Home', '/'], ['Courses', '/courses'], ['About', '/about'], ['Contact', '/contact']]
  return <header className="site-header"><div className="container nav-wrap"><Logo /><button className="menu-button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? 'Close navigation' : 'Open navigation'}>{open ? icons.close : icons.menu}</button><nav className={`nav-panel ${open ? 'is-open' : ''}`} aria-label="Main navigation"><div className="nav-links">{links.map(([label, path]) => <Link className={location.pathname === path ? 'active' : ''} onClick={() => setOpen(false)} to={path} key={path}>{label}</Link>)}</div><div className="nav-actions"><Button to="/student/login" variant="text" className="login-link">Student Login</Button><Button to="/teacher/login" variant="text" className="login-link">Teacher Login</Button><Button to="/register" className="nav-cta">Create Account</Button></div></nav></div></header>
}

function TeacherVisual({ compact = false }) {
  return <div className={`teacher-visual ${compact ? 'teacher-visual-compact' : ''}`}><div className="visual-glow" /><div className="story-art" role="img" aria-label="An English story scene rising from an open book"><div className="story-sky"><span className="story-moon" /><span className="story-star star-one">✦</span><span className="story-star star-two">✦</span><span className="story-cloud cloud-one" /><span className="story-cloud cloud-two" /></div><div className="story-path" /><div className="story-character"><span className="character-head" /><span className="character-body" /></div><div className="story-book"><span className="story-page story-page-left"><b>Once</b><i>upon a time</i></span><span className="story-page story-page-right"><b>there was</b><i>a new word...</i></span><span className="story-book-spine" /></div><span className="story-word word-one">Hello!</span><span className="story-word word-two">Imagine</span><span className="story-word word-three">Read</span></div><span className="floating-tag tag-abc">ABC</span><span className="floating-tag tag-grammar">Grammar</span><span className="floating-tag tag-vocab">Vocabulary</span><span className="floating-tag tag-speak">Speaking</span><span className="floating-tag tag-read">Reading</span><span className="floating-tag tag-write">Writing</span><span className="floating-tag tag-listen">{icons.headphones} Listening</span><div className="speech-bubble">Let&apos;s Learn English! <i /></div><span className="dot dot-one" /><span className="dot dot-two" /></div>
}

function Hero() {
  return <section className="hero"><div className="hero-shape hero-shape-one" /><div className="hero-shape hero-shape-two" /><div className="container hero-grid"><div className="hero-copy"><span className="eyebrow">WELCOME TO <i /></span><h1>ENGLISH <em>ZONE</em></h1><p className="hero-tagline">Master English. Unlock Opportunities.</p><p className="hero-description">Learn English with a clear, practical and engaging learning experience designed to help you understand, practice and improve with confidence.</p><div className="hero-actions"><Button to="/register">Create Account</Button><Button to="/courses" variant="secondary">Explore Courses</Button></div><div className="trust-list"><span><b>✓</b> Structured Learning</span><span><b>✓</b> Practice &amp; Exams</span><span><b>✓</b> Track Your Progress</span></div></div><TeacherVisual /></div></section>
}

const features = [{ icon: icons.book, title: 'Learn Clearly', text: 'Simple and organized English lessons designed to make difficult concepts easier to understand.' }, { icon: icons.spark, title: 'Practice More', text: 'Exercises and exams that help students turn knowledge into real skills.' }, { icon: icons.chart, title: 'Track Your Progress', text: 'Follow lessons, exams, grades and learning progress from one place.' }, { icon: icons.shield, title: 'Learn With Confidence', text: 'Build stronger English skills through structured learning and continuous practice.' }]

function SectionIntro({ eyebrow, title, text }) {
  return <div className="section-intro"><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{text && <p>{text}</p>}</div>
}

function Features() {
  return <section className="section features-section"><div className="container"><SectionIntro eyebrow="THE ENGLISH ZONE METHOD" title="Why Learn With Us?" text="A focused learning environment built around the habits that make progress last." /><div className="feature-grid">{features.map((feature) => <article className="feature-card" key={feature.title}><div className="feature-icon">{feature.icon}</div><h3>{feature.title}</h3><p>{feature.text}</p><span className="card-line" /></article>)}</div></div></section>
}

function Journey() {
  const steps = [['01', 'Create Your Account'], ['02', 'Choose Your Course'], ['03', 'Learn & Practice'], ['04', 'Track Your Progress']]
  return <section className="section journey-section"><div className="container"><SectionIntro eyebrow="A CLEAR PATH FORWARD" title="Your Learning Journey" text="Every step is designed to move you from understanding to confident use." /><div className="journey-grid">{steps.map(([number, title], index) => <article className="journey-step" key={number}><div className="step-number">{number}</div><div><span>STEP {index + 1}</span><h3>{title}</h3></div></article>)}</div></div></section>
}

function CoursesPreview() {
  return <section className="section courses-section"><div className="container"><div className="course-heading"><SectionIntro eyebrow="LEARNING, YOUR WAY" title="Explore Our Courses" text="Our course library will grow with your learning goals." /><Button to="/courses" variant="secondary">View All Courses</Button></div><div className="empty-course"><div className="empty-icon">{icons.book}</div><div><h3>Courses are coming soon.</h3><p>New learning experiences are being prepared for the English Zone community.</p></div><span className="empty-mark">+</span></div></div></section>
}

function TeacherSection() {
  return <section className="section teacher-section"><div className="container teacher-grid"><TeacherVisual compact /><div className="teacher-copy"><SectionIntro eyebrow="MEET YOUR TEACHER" title="Mr Abdelrahman Mohamed" text="A dedicated English teacher focused on helping students understand English clearly, practice effectively and achieve better results." /><div className="highlight-list"><span>Structured Lessons</span><span>Practical Practice</span><span>Regular Exams</span><span>Student Progress Tracking</span></div></div></div></section>
}

function CTA() {
  return <section className="container cta-section"><div className="cta-inner"><div><span className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</span><h2>Ready to Improve Your English?</h2><p>Start your learning journey today and take your English skills to the next level.</p></div><div className="cta-actions"><Button to="/register" variant="light">Create Account</Button><Button to="/courses" variant="outline-light">Explore Courses</Button></div></div></section>
}

function Footer() {
  return <footer className="site-footer"><div className="container footer-grid"><div className="footer-brand"><Logo /><p>Clear, practical English learning for your next opportunity.</p><strong>ENGLISH ZONE</strong></div><div><h3>Navigation</h3><Link to="/">Home</Link><Link to="/courses">Courses</Link><Link to="/about">About</Link><Link to="/contact">Contact</Link></div><div><h3>Account</h3><Link to="/student/login">Student Login</Link><Link to="/teacher/login">Teacher Login</Link><Link to="/register">Create Account</Link></div></div><div className="container footer-bottom"><span>© {new Date().getFullYear()} Mr Abdelrahman Mohamed. All rights reserved.</span><span>ENGLISH ZONE</span></div></footer>
}

function HomePage() {
  return <><Navbar /><main><Hero /><Features /><Journey /><CoursesPreview /><TeacherSection /><CTA /></main><Footer /></>
}

function PlaceholderPage() {
  const location = useLocation()
  const titles = { '/courses': 'Explore Our Courses', '/about': 'About English Zone', '/contact': 'Contact Us', '/student/login': 'Student Login', '/teacher/login': 'Teacher Login', '/terms': 'Terms of Service', '/privacy': 'Privacy Policy' }
  return <><Navbar /><main className="placeholder-page"><div className="container"><span className="eyebrow">ENGLISH ZONE</span><h1>{titles[location.pathname] || 'Page coming soon'}</h1><p>This page is ready for the next stage of the platform.</p><Button to="/">Back to Home</Button></div></main><Footer /></>
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/student/login" element={<StudentLoginPage />} />
      <Route path="/student/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/student/reset-password" element={<ResetPasswordPage />} />
      <Route path="/student/payment/:courseId" element={<PaymentPage />} />
      <Route path="/payment" element={<PaymentPage />} />
      <Route path="/student/dashboard" element={<StudentArea />} />
      <Route path="/student/courses" element={<StudentArea view="courses" />} />
      <Route path="/student/courses/:courseId" element={<StudentArea view="courses" />} />
      <Route path="/student/lessons/:lessonId" element={<StudentArea view="lesson" />} />
      <Route path="/student/exams" element={<StudentArea view="exams" />} />
      <Route path="/student/grades" element={<StudentArea view="grades" />} />
      <Route path="/student/attendance" element={<StudentArea view="attendance" />} />
      <Route path="/student/payments" element={<StudentArea view="payments" />} />
      <Route path="/student/announcements" element={<StudentAnnouncementsPage />} />
      <Route path="/student/notifications" element={<StudentArea view="notifications" />} />
      <Route path="/student/profile" element={<StudentArea view="profile" />} />
      <Route path="/student/card" element={<StudentArea view="card" />} />
      <Route path="/student/support" element={<StudentArea view="support" />} />
      <Route path="/verify/student/:studentCode" element={<VerifyStudentPage />} />
      <Route path="/teacher/login" element={<TeacherLoginPage />} />
      <Route path="/teacher/dashboard" element={<TeacherDashboardPage />} />
      <Route path="/teacher/students" element={<StudentsManagementPage />} />
      <Route path="/teacher/students/:studentId" element={<StudentProfilePage />} />
      <Route path="/teacher/students/:studentId/edit" element={<StudentEditPage />} />
      <Route path="/teacher/students/:studentId/card" element={<StudentCardPage />} />
      <Route path="/teacher/courses" element={<CoursesManagementPage />} />
      <Route path="/teacher/courses/:courseId" element={<CourseOverviewPage />} />
      <Route path="/teacher/courses/:courseId/edit" element={<CourseOverviewPage edit />} />
      <Route path="/teacher/exams" element={<ExamsManagementPage />} />
      <Route path="/teacher/exams/:examId" element={<ExamDetailPage />} />
      <Route path="/teacher/exams/:examId/results" element={<ExamResultsPage />} />
      <Route path="/teacher/grades" element={<GradesManagementPage />} />
      <Route path="/teacher/grades/:studentId" element={<StudentGradesPage />} />
      <Route path="/teacher/attendance" element={<AttendanceManagementPage />} />
      <Route path="/teacher/payments" element={<PaymentsManagementPage />} />
      <Route path="/teacher/student-codes" element={<StudentCodesManagementPage />} />
      <Route path="/teacher/codes" element={<StudentCodesManagementPage />} />
      <Route path="/teacher/reports" element={<ReportsManagementPage />} />
      <Route path="/teacher/expenses" element={<ExpensesManagementPage />} />
      <Route path="/teacher/announcements" element={<AnnouncementsManagementPage />} />
      <Route path="/teacher/settings" element={<TeacherSettingsPage />} />
      <Route path="/teacher/notifications" element={<TeacherNotificationsPage />} />
      <Route path="/teacher/audit-log" element={<TeacherNotificationsPage />} />
      <Route path="*" element={<PlaceholderPage />} />
    </Routes>
  )
}
