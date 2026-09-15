import { supabase } from './supabase'

export const blankExam = { name: '', description: '', course_id: '', grade: '3rd_preparatory', educational_system: 'general_secondary', exam_date: '', start_time: '', end_time: '', duration_minutes: '60', maximum_attempts: '1', passing_percentage: '50', randomize_questions: false, randomize_answers: false, show_results: true, allow_review: true, status: 'draft' }
export const blankQuestion = { question_text: '', question_type: 'multiple_choice', points: '1', question_order: '1', options: [{ option_text: '', is_correct: true }, { option_text: '', is_correct: false }, { option_text: '', is_correct: false }, { option_text: '', is_correct: false }] }

function examPayload(form, courses) { const course = courses.find((item) => item.id === form.course_id); return { name: form.name.trim(), description: form.description.trim(), course_id: form.course_id, grade: form.grade || course?.grade, educational_system: form.educational_system || course?.educational_system, exam_date: form.exam_date || null, start_time: form.start_time || null, end_time: form.end_time || null, duration_minutes: Number(form.duration_minutes), maximum_attempts: Number(form.maximum_attempts), passing_percentage: Number(form.passing_percentage), randomize_questions: form.randomize_questions, randomize_answers: form.randomize_answers, show_results: form.show_results, allow_review: form.allow_review, status: form.status, is_published: form.status === 'published' } }

export async function loadExamList({ search = '', filters = {} } = {}) {
  let query = supabase.from('exams').select('id, name, description, course_id, grade, educational_system, exam_date, start_time, end_time, duration_minutes, maximum_attempts, passing_percentage, status, is_published, created_at, courses(id, name, grade), exam_questions(count), exam_attempts(count)')
  if (search.trim()) query = query.ilike('name', `%${search.trim()}%`)
  if (filters.courseId) query = query.eq('course_id', filters.courseId)
  if (filters.grade) query = query.eq('grade', filters.grade)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.date) query = query.eq('exam_date', filters.date)
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function loadExamDetail(examId) {
  const [exam, questions, attempts, courses] = await Promise.all([
    supabase.from('exams').select('*, courses(id, name, grade, educational_system)').eq('id', examId).single(),
    supabase.from('exam_questions').select('*, exam_options(*)').eq('exam_id', examId).order('question_order', { ascending: true }),
    supabase.from('exam_attempts').select('id, student_id, attempt_number, score, maximum_score, percentage, passed, status, started_at, submitted_at, student_profiles(full_name, student_code)').eq('exam_id', examId).order('submitted_at', { ascending: false }),
    supabase.from('courses').select('id, name, grade, educational_system').order('name'),
  ])
  const failed = [exam, questions, attempts, courses].find((result) => result.error)
  if (failed) throw failed.error
  return { exam: exam.data, questions: questions.data || [], attempts: attempts.data || [], courses: courses.data || [] }
}

export async function loadExamCourses() { const { data, error } = await supabase.from('courses').select('id, name, grade, educational_system').eq('status', 'published').order('name'); if (error) throw error; return data || [] }
export async function createExam(form, courses) { const { data, error } = await supabase.from('exams').insert(examPayload(form, courses)).select().single(); if (error) throw error; return data }
export async function updateExam(examId, form, courses) { const { data, error } = await supabase.from('exams').update(examPayload(form, courses)).eq('id', examId).select().single(); if (error) throw error; return data }
export async function updateExamStatus(examId, status) { const { error } = await supabase.from('exams').update({ status, is_published: status === 'published' }).eq('id', examId); if (error) throw error }
export async function saveQuestion(examId, question, questionId) { const questionPayload = { exam_id: examId, question_text: question.question_text.trim(), question_type: question.question_type, points: Number(question.points), question_order: Number(question.question_order) }; const request = questionId ? supabase.from('exam_questions').update(questionPayload).eq('id', questionId) : supabase.from('exam_questions').insert(questionPayload); const { data, error } = await request.select().single(); if (error) throw error; const { error: deleteError } = await supabase.from('exam_options').delete().eq('question_id', data.id); if (deleteError) throw deleteError; const options = question.question_type === 'true_false' ? [{ option_text: 'True', is_correct: question.options?.[0]?.is_correct === true }, { option_text: 'False', is_correct: question.options?.[1]?.is_correct === true }] : question.options.map((option, index) => ({ question_id: data.id, option_text: option.option_text.trim(), option_order: index + 1, is_correct: option.is_correct }))
  const { error: optionsError } = await supabase.from('exam_options').insert(options.map((option, index) => ({ ...option, question_id: data.id, option_order: index + 1 })))
  if (optionsError) throw optionsError
  return data
}
export async function deleteQuestion(questionId) { const { error } = await supabase.from('exam_questions').delete().eq('id', questionId); if (error) throw error }
export async function saveGrade({ gradeId, studentId, examId, attemptId, score, maximumScore, feedback }) { const maximum = Number(maximumScore); const numericScore = Number(score); const percentage = maximum ? numericScore / maximum * 100 : 0; const { data: exam } = await supabase.from('exams').select('passing_percentage').eq('id', examId).single(); const payload = { student_id: studentId, exam_id: examId, attempt_id: attemptId || null, score: numericScore, maximum_score: maximum, percentage, passed: percentage >= Number(exam?.passing_percentage || 50), feedback: feedback || '', graded_by: (await supabase.auth.getUser()).data.user?.id, graded_at: new Date().toISOString() }; const request = gradeId ? supabase.from('grades').update(payload).eq('id', gradeId) : supabase.from('grades').insert(payload); const { data, error } = await request.select().single(); if (error) throw error; if (attemptId) await supabase.from('exam_attempts').update({ score: numericScore, maximum_score: maximum, percentage, passed: payload.passed, status: 'graded' }).eq('id', attemptId); return data }
export async function loadGrades({ search = '', filters = {} } = {}) { let query = supabase.from('grades').select('id, student_id, exam_id, attempt_id, score, maximum_score, percentage, passed, feedback, graded_at, created_at, student:student_profiles(id, full_name, student_code, grade), exam:exams(id, name, grade, course:courses(id, name))').order('created_at', { ascending: false }); if (filters.courseId) query = query.eq('exam.course_id', filters.courseId); if (filters.examId) query = query.eq('exam_id', filters.examId); if (filters.result === 'passed') query = query.eq('passed', true); if (filters.result === 'failed') query = query.eq('passed', false); const { data, error } = await query; if (error) throw error; const rows = data || []; if (!search.trim()) return rows; const term = search.toLowerCase(); return rows.filter((row) => [row.student?.full_name, row.student?.student_code, row.exam?.name].some((value) => value?.toLowerCase().includes(term))) }
export async function loadGradeSummary() { const [grades, attempts] = await Promise.all([supabase.from('grades').select('score, maximum_score, percentage, passed'), supabase.from('exam_attempts').select('id', { count: 'exact', head: true }).eq('status', 'submitted')]); if (grades.error || attempts.error) throw grades.error || attempts.error; const rows = grades.data || []; return { total: rows.length, pending: attempts.count || 0, average: rows.length ? rows.reduce((sum, row) => sum + Number(row.percentage), 0) / rows.length : 0, highest: rows.length ? Math.max(...rows.map((row) => Number(row.percentage))) : 0, lowest: rows.length ? Math.min(...rows.map((row) => Number(row.percentage))) : 0, passRate: rows.length ? rows.filter((row) => row.passed).length / rows.length * 100 : 0 } }
export async function loadStudentGrades(studentId) { const { data, error } = await supabase.from('grades').select('id, score, maximum_score, percentage, passed, feedback, graded_at, exam:exams(name, grade, course:courses(name))').eq('student_id', studentId).order('created_at', { ascending: false }); if (error) throw error; return data || [] }
