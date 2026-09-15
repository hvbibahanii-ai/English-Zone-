import { supabase } from './supabase'

export const PAGE_SIZE = 20

export async function loadStudentList({ page, search, filters, sort }) {
  if (!supabase) throw new Error('supabase_not_configured')
  let query = supabase.from('student_profiles').select('id, full_name, email, phone, photo_url, student_code, grade, educational_system, account_status, subscription_status, subscription_start, subscription_expiration, created_at', { count: 'exact' })
  const term = search.trim()
  if (term) query = query.or(`full_name.ilike.%${term}%,student_code.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`)
  if (filters.grade) query = query.eq('grade', filters.grade)
  if (filters.educationalSystem) query = query.eq('educational_system', filters.educationalSystem)
  if (filters.accountStatus) query = query.eq('account_status', filters.accountStatus)
  if (filters.subscriptionStatus) query = query.eq('subscription_status', filters.subscriptionStatus)
  const { data, error, count } = await query.order(sort.field, { ascending: sort.direction === 'asc' }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
  if (error) throw error
  return { students: data || [], total: count || 0, pages: Math.max(1, Math.ceil((count || 0) / PAGE_SIZE)) }
}

export async function loadStudentSummary() {
  if (!supabase) throw new Error('supabase_not_configured')
  const [total, active, pending, suspended, subscriptions, payments] = await Promise.all([
    supabase.from('student_profiles').select('id', { count: 'exact', head: true }),
    supabase.from('student_profiles').select('id', { count: 'exact', head: true }).eq('account_status', 'active'),
    supabase.from('student_profiles').select('id', { count: 'exact', head: true }).eq('account_status', 'pending'),
    supabase.from('student_profiles').select('id', { count: 'exact', head: true }).eq('account_status', 'suspended'),
    supabase.from('student_profiles').select('id', { count: 'exact', head: true }).eq('subscription_status', 'active'),
    supabase.from('payment_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ])
  const failed = [total, active, pending, suspended, subscriptions, payments].find((result) => result.error)
  if (failed) throw failed.error
  return { total: total.count || 0, active: active.count || 0, pending: pending.count || 0, suspended: suspended.count || 0, subscriptions: subscriptions.count || 0, pendingPayments: payments.count || 0 }
}

export async function loadStudentProfile(studentId) {
  if (!supabase) throw new Error('supabase_not_configured')
  const [profile, enrollments, results, attendance, payments, announcements] = await Promise.all([
    supabase.from('student_profiles').select('id, auth_user_id, full_name, email, phone, parent_phone, photo_url, student_code, grade, educational_system, account_status, subscription_status, subscription_start, subscription_expiration, created_at').eq('id', studentId).single(),
    supabase.from('course_enrollments').select('id, status, starts_at, expires_at, course:courses(id, name, grade)').eq('student_id', studentId).order('created_at', { ascending: false }),
    supabase.from('exam_results').select('id, score, total, passed, created_at, exam:exams(name, course:courses(name))').eq('student_id', studentId).order('created_at', { ascending: false }).limit(10),
    supabase.from('attendance_records').select('id, status, attendance_date, notes, course:courses(name), lesson:lessons(title)').eq('student_id', studentId).order('attendance_date', { ascending: false }).limit(60),
    supabase.from('payment_requests').select('id, amount, currency, payment_method, transferred_from, transaction_reference, screenshot_path, note, status, rejection_reason, reviewed_at, created_at, course:courses(name)').eq('student_id', studentId).order('created_at', { ascending: false }).limit(10),
    supabase.from('announcements').select('id, title, content, published_at, announcement_targets(target_type,grade,educational_system,course_id,student_id)').order('published_at', { ascending: false }).limit(5),
  ])
  const failed = [profile, enrollments, results, attendance, payments, announcements].find((result) => result.error)
  if (failed) throw failed.error
  return { profile: profile.data, enrollments: enrollments.data || [], results: results.data || [], attendance: attendance.data || [], payments: payments.data || [], announcements: announcements.data || [] }
}

export async function teacherStudentAction(action, payload) {
  if (!supabase) throw new Error('supabase_not_configured')
  const { data, error } = await supabase.functions.invoke('teacher-student-admin', { body: { action, ...payload } })
  if (error || data?.error) throw new Error(data?.error || error?.message || 'request_failed')
  return data.student
}

export function gradeLabel(value) { return value.replaceAll('_', ' ') }
export function subscriptionLabel(value) { return value.replaceAll('_', ' ') }
export function percentage(score, total) { return total ? Math.round(Number(score) / Number(total) * 100) : 0 }
