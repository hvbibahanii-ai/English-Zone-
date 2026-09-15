import { supabase } from './supabase'

const PAGE_SIZE = 20
function requireSupabase() { if (!supabase) throw new Error('supabase_not_configured') }

export async function loadStudentCodes({ page, search, filters, sort }) {
  requireSupabase()
  let query = supabase.from('student_profiles').select('id,full_name,student_code,grade,educational_system,phone,subscription_status,account_status,photo_url,created_at', { count: 'exact' }).eq('role', 'student')
  const term = search.trim()
  if (term) query = query.or(`full_name.ilike.%${term}%,student_code.ilike.%${term}%,phone.ilike.%${term}%`)
  Object.entries(filters).forEach(([key, value]) => { if (value) query = query.eq(key, value) })
  const { data, error, count } = await query.order(sort.field, { ascending: sort.direction === 'asc' }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
  if (error) throw error
  return { students: data || [], total: count || 0, pages: Math.max(1, Math.ceil((count || 0) / PAGE_SIZE)) }
}

export async function loadStudentsWithoutCodes() {
  requireSupabase()
  const { data, error } = await supabase.from('student_profiles').select('id,full_name,student_code,grade').eq('role', 'student').is('student_code', null).order('full_name')
  if (error) throw error
  return data || []
}

export async function assignStudentCode(studentId) {
  requireSupabase()
  const { data, error } = await supabase.rpc('assign_student_code', { requested_student_id: studentId })
  if (error) throw error
  return data
}

export async function recordCodeAction(action, studentId, metadata = {}) {
  requireSupabase()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('not_authenticated')
  const { error } = await supabase.from('audit_logs').insert({ action, teacher_id: auth.user.id, related_table: 'student_profiles', related_record_id: studentId, metadata })
  if (error) throw error
}

export function downloadCodesCsv(rows) {
  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
  const csv = [['Student Name', 'Student Code', 'Grade', 'Educational System', 'Phone', 'Subscription Status', 'Account Status', 'Created Date'], ...rows.map((row) => [row.full_name, row.student_code, row.grade, row.educational_system, row.phone, row.subscription_status, row.account_status, row.created_at])].map((line) => line.map(escape).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = `english-zone-student-codes-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url)
}
