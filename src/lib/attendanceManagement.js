import { supabase } from './supabase'

function requireSupabase() { if (!supabase) throw new Error('supabase_not_configured') }

export async function loadAttendanceData() {
  requireSupabase()
  const [courses, lessons, students, enrollments, records] = await Promise.all([
    supabase.from('courses').select('id,name').order('name'),
    supabase.from('lessons').select('id,course_id,title,lesson_order,lesson_date').order('lesson_order'),
    supabase.from('student_profiles').select('id,full_name,student_code,grade').eq('role', 'student').order('full_name'),
    supabase.from('course_enrollments').select('student_id,course_id,status').eq('status', 'active'),
    supabase.from('attendance_records').select('id,student_id,course_id,lesson_id,attendance_date,status,notes,created_at,updated_at,courses(name),lessons(title,lesson_order),student_profiles(full_name,student_code,grade)').order('attendance_date', { ascending: false }).order('created_at', { ascending: false }),
  ])
  const failed = [courses, lessons, students, enrollments, records].find((result) => result.error)
  if (failed) throw failed.error
  return { courses: courses.data || [], lessons: lessons.data || [], students: students.data || [], enrollments: enrollments.data || [], records: records.data || [] }
}

export async function saveAttendance({ courseId, lessonId, date, entries }) {
  requireSupabase()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('not_authenticated')
  const rows = entries.map((entry) => ({ student_id: entry.student_id, course_id: courseId, lesson_id: lessonId, attendance_date: date, status: entry.status, notes: entry.notes || '', recorded_by: auth.user.id }))
  const { data, error } = await supabase.from('attendance_records').upsert(rows, { onConflict: 'student_id,course_id,lesson_id,attendance_date' }).select('id')
  if (error) throw error
  return data || []
}

export function attendanceSummary(records, today = new Date().toISOString().slice(0, 10)) {
  const todayRows = records.filter((record) => record.attendance_date === today)
  const present = todayRows.filter((record) => record.status === 'present').length
  const absent = todayRows.filter((record) => record.status === 'absent').length
  const late = todayRows.filter((record) => record.status === 'late').length
  return { totalStudents: new Set(records.map((record) => record.student_id)).size, present, absent, late, rate: records.length ? Math.round((records.filter((record) => record.status !== 'absent').length / records.length) * 100) : 0 }
}

export function profileSummary(records, studentId) {
  const rows = records.filter((record) => record.student_id === studentId)
  const present = rows.filter((record) => record.status === 'present').length
  const late = rows.filter((record) => record.status === 'late').length
  return { rows, total: rows.length, present, absent: rows.filter((record) => record.status === 'absent').length, late, percentage: rows.length ? Math.round(present / rows.length * 100) : 0 }
}
