import { supabase } from './supabase'

export const reportTabs = [['overview', 'Overview'], ['students', 'Student Reports'], ['courses', 'Course Reports'], ['attendance', 'Attendance'], ['exams', 'Exams & Grades'], ['payments', 'Payments & Revenue'], ['expenses', 'Expenses'], ['announcements', 'Announcements']]
function requireSupabase() { if (!supabase) throw new Error('supabase_not_configured') }
export function dateRange(filters) { if (filters.period === 'custom') return { from: filters.from || '', to: filters.to || '' }; const now = new Date(); const to = now.toISOString().slice(0, 10); if (filters.period === 'today') return { from: to, to }; if (filters.period === 'week') now.setDate(now.getDate() - 6); if (filters.period === 'month') now.setDate(1); if (filters.period === 'year') { now.setMonth(0); now.setDate(1) } return filters.period ? { from: now.toISOString().slice(0, 10), to } : { from: '', to: '' } }
function applyDate(query, field, range) { if (range.from) query = query.gte(field, range.from); if (range.to) query = query.lte(field, range.to); return query }

export async function loadReportData(filters) {
  requireSupabase(); const range = dateRange(filters)
  const [students, courses, enrollments, attendance, exams, attempts, grades, payments, expenses, announcements, reads] = await Promise.all([
    supabase.from('student_profiles').select('id,full_name,student_code,grade,educational_system,account_status,subscription_status,created_at').eq('role', 'student').order('full_name').limit(2000),
    supabase.from('courses').select('id,name,status,is_published,price,duration_days').order('name'),
    supabase.from('course_enrollments').select('id,student_id,course_id,status,starts_at,expires_at'),
    applyDate(supabase.from('attendance_records').select('id,student_id,course_id,lesson_id,attendance_date,status,student_profiles(full_name,student_code,grade),courses(name)').order('attendance_date', { ascending: false }).limit(5000), 'attendance_date', range),
    supabase.from('exams').select('id,name,course_id,exam_date,status,courses(name)').order('exam_date', { ascending: false }),
    applyDate(supabase.from('exam_attempts').select('id,exam_id,student_id,status,score,maximum_score,percentage,passed,submitted_at'), 'submitted_at', range),
    applyDate(supabase.from('grades').select('id,student_id,exam_id,score,maximum_score,percentage,passed,graded_at,exams(name,course_id,courses(name))'), 'graded_at', range),
    applyDate(supabase.from('payment_requests').select('id,student_id,course_id,amount,status,created_at,student_profiles(full_name,student_code),courses(name)'), 'created_at', range),
    applyDate(supabase.from('expenses').select('id,name,category,amount,expense_date,notes,created_at').is('deleted_at', null), 'expense_date', range),
    supabase.from('announcements').select('id,title,status,published_at,scheduled_at,created_at,announcement_targets(target_type,grade,educational_system,course_id,student_id)'),
    supabase.from('announcement_reads').select('announcement_id,student_id,read_at'),
  ])
  const failed = [students, courses, enrollments, attendance, exams, attempts, grades, payments, expenses, announcements, reads].find((result) => result.error)
  if (failed) throw failed.error
  return { students: students.data || [], courses: courses.data || [], enrollments: enrollments.data || [], attendance: attendance.data || [], exams: exams.data || [], attempts: attempts.data || [], grades: grades.data || [], payments: payments.data || [], expenses: expenses.data || [], announcements: announcements.data || [], reads: reads.data || [], range }
}

export async function recordReportAction(action, metadata) { requireSupabase(); const { data: auth } = await supabase.auth.getUser(); if (!auth.user) throw new Error('not_authenticated'); const { error } = await supabase.from('audit_logs').insert({ action, teacher_id: auth.user.id, related_table: 'reports', metadata }); if (error) throw error }
export function reportCsv(name, headers, rows) { const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}` + '"'; const csv = [headers, ...rows].map((row) => row.map(escape).join(',')).join('\n'); const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = `english-zone-${name}-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url) }
export function average(rows, field) { return rows.length ? Math.round(rows.reduce((sum, row) => sum + Number(row[field] || 0), 0) / rows.length) : 0 }
