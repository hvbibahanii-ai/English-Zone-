import { supabase } from './supabase'

export const courseStatuses = ['draft', 'published', 'archived']
export const lessonTypes = ['video', 'pdf', 'text', 'mixed']

function coursePayload(form) {
  const isFree = form.pricing_type === 'free'
  return { name: form.name.trim(), description: form.description.trim(), image_url: form.image_url.trim() || null, grade: form.grade, educational_system: form.educational_system, price: isFree ? 0 : Number(form.price), duration_days: form.duration_type === 'custom' ? Number(form.duration_days) : Number(form.duration_type), start_date: form.start_date || null, end_date: form.end_date || null, status: form.status, is_published: form.status === 'published' }
}

export async function loadCourses({ search = '', filters = {}, sort = 'newest' } = {}) {
  if (!supabase) throw new Error('supabase_not_configured')
  let query = supabase.from('courses').select('id, name, description, image_url, grade, educational_system, price, currency, duration_days, start_date, end_date, status, is_published, created_at, updated_at, lessons(count), course_enrollments(count)')
  if (search.trim()) query = query.ilike('name', `%${search.trim()}%`)
  if (filters.grade) query = query.eq('grade', filters.grade)
  if (filters.educationalSystem) query = query.eq('educational_system', filters.educationalSystem)
  if (filters.pricingType) query = filters.pricingType === 'free' ? query.eq('price', 0) : query.gt('price', 0)
  if (filters.status) query = query.eq('status', filters.status)
  const ordering = sort === 'oldest' ? { column: 'created_at', ascending: true } : sort === 'name' ? { column: 'name', ascending: true } : { column: 'created_at', ascending: false }
  const { data, error } = await query.order(ordering.column, { ascending: ordering.ascending })
  if (error) throw error
  return data || []
}

export async function loadCourseDetail(courseId) {
  if (!supabase) throw new Error('supabase_not_configured')
  const [course, lessons, enrollments, completions] = await Promise.all([
    supabase.from('courses').select('*').eq('id', courseId).single(),
    supabase.from('lessons').select('*').eq('course_id', courseId).order('lesson_order', { ascending: true }),
    supabase.from('course_enrollments').select('id, status, starts_at, expires_at, created_at, student:student_profiles(id, full_name, student_code, subscription_status, photo_url)').eq('course_id', courseId).order('created_at', { ascending: false }),
    supabase.from('lesson_completions').select('student_id, lesson_id, completed_at, lesson:lessons!inner(course_id)').eq('lesson.course_id', courseId),
  ])
  const failed = [course, lessons, enrollments, completions].find((result) => result.error)
  if (failed) throw failed.error
  const lessonRows = lessons.data || []
  const completionRows = completions.data || []
  const totalLessons = lessonRows.length
  const students = (enrollments.data || []).map((enrollment) => { const completed = completionRows.filter((item) => item.student_id === enrollment.student?.id).length; return { ...enrollment, progress: totalLessons ? Math.round(completed / totalLessons * 100) : 0 } })
  const completedLessons = new Set(completionRows.map((item) => item.lesson_id)).size
  return { course: course.data, lessons: lessonRows, students, completedLessons, averageProgress: students.length ? Math.round(students.reduce((total, student) => total + student.progress, 0) / students.length) : 0 }
}

export async function createCourse(form) { const { data, error } = await supabase.from('courses').insert(coursePayload(form)).select().single(); if (error) throw error; return data }
export async function updateCourse(courseId, form) { const { data, error } = await supabase.from('courses').update(coursePayload(form)).eq('id', courseId).select().single(); if (error) throw error; return data }
export async function archiveCourse(courseId) { const { error } = await supabase.from('courses').update({ status: 'archived', is_published: false }).eq('id', courseId); if (error) throw error }
export async function saveLesson(courseId, form, lessonId) { const payload = { course_id: courseId, title: form.title.trim(), description: form.description.trim(), content_type: form.content_type, video_url: form.video_url.trim() || null, youtube_url: form.youtube_url.trim() || null, thumbnail_url: form.thumbnail_url.trim() || null, material_url: form.material_url.trim() || null, duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null, lesson_date: form.lesson_date || null, availability: form.availability, is_published: form.availability === 'published', lesson_order: Number(form.lesson_order) }; const request = lessonId ? supabase.from('lessons').update(payload).eq('id', lessonId) : supabase.from('lessons').insert(payload); const { data, error } = await request.select().single(); if (error) throw error; return data }
export async function removeLesson(lessonId) { const { error } = await supabase.from('lessons').update({ availability: 'archived', is_published: false }).eq('id', lessonId); if (error) throw error }
export async function reorderLessons(lessons) { for (const [index, lesson] of lessons.entries()) { const { error } = await supabase.from('lessons').update({ lesson_order: -(index + 1) }).eq('id', lesson.id); if (error) throw error } for (const [index, lesson] of lessons.entries()) { const { error } = await supabase.from('lessons').update({ lesson_order: index + 1 }).eq('id', lesson.id); if (error) throw error } }

export function formFromCourse(course) { return { name: course?.name || '', description: course?.description || '', image_url: course?.image_url || '', grade: course?.grade || '3rd_preparatory', educational_system: course?.educational_system || 'general_secondary', pricing_type: Number(course?.price || 0) === 0 ? 'free' : 'paid', price: course?.price || '', duration_type: [30, 60, 90].includes(Number(course?.duration_days)) ? String(course.duration_days) : 'custom', duration_days: course?.duration_days || '', start_date: course?.start_date || '', end_date: course?.end_date || '', status: course?.status || (course?.is_published ? 'published' : 'draft') } }
export const blankCourse = { name: '', description: '', image_url: '', grade: '3rd_preparatory', educational_system: 'general_secondary', pricing_type: 'free', price: '', duration_type: '30', duration_days: '30', start_date: '', end_date: '', status: 'draft' }
export const blankLesson = { title: '', description: '', content_type: 'mixed', video_url: '', youtube_url: '', thumbnail_url: '', material_url: '', duration_minutes: '', lesson_date: '', availability: 'draft', lesson_order: '1' }