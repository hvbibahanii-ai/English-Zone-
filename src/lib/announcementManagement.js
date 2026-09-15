import { supabase } from './supabase'

export const audienceTypes = [['all', 'All Students'], ['grade', 'Specific Grade'], ['educational_system', 'Specific Educational System'], ['course', 'Specific Course'], ['student', 'Specific Student']]
function requireSupabase() { if (!supabase) throw new Error('supabase_not_configured') }

export async function loadAnnouncementData() {
  requireSupabase()
  await supabase.rpc('publish_due_announcements')
  const [announcements, courses, students, enrollments, reads] = await Promise.all([
    supabase.from('announcements').select('id,title,content,status,publish_type,scheduled_at,published_at,created_by,archived_at,created_at,updated_at,announcement_targets(id,target_type,grade,educational_system,course_id,student_id),announcement_attachments(id,storage_path,file_name,file_type,file_size)').order('created_at', { ascending: false }),
    supabase.from('courses').select('id,name').order('name'),
    supabase.from('student_profiles').select('id,full_name,student_code,grade,educational_system,account_status').eq('role', 'student').eq('account_status', 'active').order('full_name'),
    supabase.from('course_enrollments').select('student_id,course_id,status').eq('status', 'active'),
    supabase.from('announcement_reads').select('announcement_id,student_id,read_at'),
  ])
  const failed = [announcements, courses, students, enrollments, reads].find((result) => result.error)
  if (failed) throw failed.error
  return { announcements: announcements.data || [], courses: courses.data || [], students: students.data || [], enrollments: enrollments.data || [], reads: reads.data || [] }
}

export async function createAnnouncement(form) {
  requireSupabase(); const { data: auth } = await supabase.auth.getUser(); if (!auth.user) throw new Error('not_authenticated')
  const { data, error } = await supabase.from('announcements').insert({ title: form.title.trim(), content: form.content.trim(), status: form.publication === 'schedule' ? 'scheduled' : 'draft', publish_type: form.publication, scheduled_at: form.publication === 'schedule' ? form.scheduled_at : null, created_by: auth.user.id }).select().single()
  if (error) throw error
  try { await saveTarget(data.id, form) } catch (targetError) { await supabase.from('announcements').delete().eq('id', data.id); throw targetError }
  if (form.publication === 'now') return publishAnnouncement(data.id)
  return data
}

export async function updateAnnouncement(id, form) {
  requireSupabase()
  const { data, error } = await supabase.from('announcements').update({ title: form.title.trim(), content: form.content.trim(), status: form.publication === 'schedule' ? 'scheduled' : 'draft', publish_type: form.publication, scheduled_at: form.publication === 'schedule' ? form.scheduled_at : null }).eq('id', id).select().single()
  if (error) throw error
  await saveTarget(id, form)
  return form.publication === 'now' ? publishAnnouncement(id) : data
}

async function saveTarget(announcementId, form) {
  const { error: deleteError } = await supabase.from('announcement_targets').delete().eq('announcement_id', announcementId)
  if (deleteError) throw deleteError
  const target = { announcement_id: announcementId, target_type: form.target_type, grade: form.target_type === 'grade' ? form.grade : null, educational_system: form.target_type === 'educational_system' ? form.educational_system : null, course_id: form.target_type === 'course' ? form.course_id : null, student_id: form.target_type === 'student' ? form.student_id : null }
  const { error } = await supabase.from('announcement_targets').insert(target)
  if (error) throw error
}

export async function publishAnnouncement(id) { requireSupabase(); const { data, error } = await supabase.rpc('publish_announcement', { requested_announcement_id: id }); if (error) throw error; return data }
export async function archiveAnnouncement(id) { requireSupabase(); const { data, error } = await supabase.from('announcements').update({ status: 'archived', archived_at: new Date().toISOString() }).eq('id', id).select().single(); if (error) throw error; return data }
export async function createAnnouncementAttachment(announcementId, file) { requireSupabase(); const path = `${announcementId}/${crypto.randomUUID()}-${file.name.replace(/[^A-Za-z0-9_.-]/g, '-')}`; const upload = await supabase.storage.from('announcement-attachments').upload(path, file, { contentType: file.type, upsert: false }); if (upload.error) throw upload.error; const { data, error } = await supabase.from('announcement_attachments').insert({ announcement_id: announcementId, storage_path: path, file_name: file.name, file_type: file.type, file_size: file.size }).select().single(); if (error) { await supabase.storage.from('announcement-attachments').remove([path]); throw error } return data }
export async function signedAnnouncementUrl(path) { requireSupabase(); const { data, error } = await supabase.storage.from('announcement-attachments').createSignedUrl(path, 300); if (error) throw error; return data?.signedUrl }
export function audienceLabel(target, courses, students) { if (!target) return 'Unknown audience'; if (target.target_type === 'all') return 'All Students'; if (target.target_type === 'grade') return target.grade?.replaceAll('_', ' '); if (target.target_type === 'educational_system') return target.educational_system?.replaceAll('_', ' '); if (target.target_type === 'course') return courses.find((course) => course.id === target.course_id)?.name || 'Course'; return students.find((student) => student.id === target.student_id)?.full_name || 'Student' }
