import { supabase } from './supabase'

const today = new Date().toISOString().slice(0, 10)

export async function loadTeacherDashboard(teacherId) {
  if (!supabase) throw new Error('supabase_not_configured')
  const [students, courses, enrollments, payments, pendingStudents, activeStudents, pendingPaymentRows, allPayments, exams, results, attendance, expenses, announcements, codes, support, notifications] = await Promise.all([
    supabase.from('student_profiles').select('id, full_name, student_code, grade, account_status, created_at, photo_url', { count: 'exact' }).order('created_at', { ascending: false }).limit(6),
    supabase.from('courses').select('id, name, price, is_published, created_at'),
    supabase.from('course_enrollments').select('id, student_id, course_id, status'),
    supabase.from('payment_requests').select('id, student_id, course_id, amount, payment_method, status, created_at', { count: 'exact' }).order('created_at', { ascending: false }).limit(6),
    supabase.from('student_profiles').select('id', { count: 'exact', head: true }).eq('account_status', 'pending'),
    supabase.from('student_profiles').select('id', { count: 'exact', head: true }).eq('account_status', 'active'),
    supabase.from('payment_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('payment_requests').select('amount, status'),
    supabase.from('exams').select('id, name, course_id, exam_date, is_published').order('exam_date', { ascending: true }),
    supabase.from('exam_results').select('id, exam_id, student_id'),
    supabase.from('attendance_records').select('id, status, class_date'),
    supabase.from('expenses').select('id, name, category, amount, expense_date, created_at').is('deleted_at', null).order('expense_date', { ascending: false }),
    supabase.from('announcements').select('id, title, status, published_at, scheduled_at, announcement_targets(target_type)').order('created_at', { ascending: false }).limit(5),
    supabase.from('student_profiles').select('id, student_code, created_at').eq('role', 'student').not('student_code', 'is', null).order('created_at', { ascending: false }).limit(5),
    supabase.from('support_requests').select('id, status').in('status', ['open', 'in_progress']),
    supabase.from('teacher_notifications').select('id, title, message, event_type, read_at, created_at').eq('teacher_id', teacherId).order('created_at', { ascending: false }).limit(8),
  ])
  const failed = [students, courses, enrollments, payments, pendingStudents, activeStudents, pendingPaymentRows, allPayments, exams, results, attendance, expenses, announcements, codes, support, notifications].find((result) => result.error)
  if (failed) throw failed.error
  const values = [students, courses, enrollments, payments, exams, results, attendance, expenses, announcements, codes, support, notifications].map((result) => result.data || [])
  const [studentRows, courseRows, enrollmentRows, paymentRows, examRows, resultRows, attendanceRows, expenseRows, announcementRows, codeRows, supportRows, notificationRows] = values
  const dashboardAnnouncements = announcementRows.map((announcement) => ({ ...announcement, target_type: announcement.announcement_targets?.[0]?.target_type || announcement.status }))
  const pendingRegistrations = pendingStudents.count || 0
  const pendingPayments = pendingPaymentRows.count || 0
  const activeStudentCount = activeStudents.count || 0
  const courseMap = Object.fromEntries(courseRows.map((course) => [course.id, course.name]))
  const studentMap = Object.fromEntries(studentRows.map((student) => [student.id, student]))
  const approvedRevenue = (allPayments.data || []).filter((payment) => payment.status === 'approved').reduce((total, payment) => total + Number(payment.amount || 0), 0)
  const totalExpenses = expenseRows.reduce((total, expense) => total + Number(expense.amount || 0), 0)
  const todayAttendance = attendanceRows.filter((record) => record.class_date === today)
  const upcomingExams = examRows.filter((exam) => exam.exam_date && exam.exam_date >= today)
  return {
    students: studentRows, courses: courseRows, enrollments: enrollmentRows, payments: paymentRows, exams: examRows, expenses: expenseRows,
    announcements: dashboardAnnouncements, codes: codeRows.map((row) => ({ ...row, code: row.student_code, is_active: true })), notifications: notificationRows, studentMap, courseMap,
    stats: {
      totalStudents: students.count || 0, activeStudents: activeStudentCount,
      pendingRegistrations, pendingPayments, activeCourses: courseRows.filter((course) => course.is_published).length,
      totalExams: examRows.length, todayAttendance: todayAttendance.length, totalRevenue: approvedRevenue,
    },
    courseOverview: { active: courseRows.filter((course) => course.is_published).length, free: courseRows.filter((course) => Number(course.price) === 0).length, paid: courseRows.filter((course) => Number(course.price) > 0).length, enrollments: enrollmentRows.filter((row) => row.status === 'active').length },
    attendance: { present: todayAttendance.filter((row) => row.status === 'present').length, absent: todayAttendance.filter((row) => row.status === 'absent').length, late: todayAttendance.filter((row) => row.status === 'late').length },
    finance: { revenue: approvedRevenue, expenses: totalExpenses, net: approvedRevenue - totalExpenses, payments: paymentRows, expenseRows },
    examsOverview: { upcoming: upcomingExams, completed: examRows.filter((exam) => exam.exam_date && exam.exam_date < today).length, pendingGrading: examRows.filter((exam) => resultRows.some((result) => result.exam_id === exam.id)).length },
    pending: { registrations: pendingRegistrations, payments: pendingPayments, support: supportRows.length, exams: upcomingExams.length },
    meta: { today, now: new Date() },
  }
}

export function formatDate(value) { return value ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) : '—' }
export function formatMoney(value) { return `${new Intl.NumberFormat('en-EG', { maximumFractionDigits: 0 }).format(Number(value || 0))} EGP` }