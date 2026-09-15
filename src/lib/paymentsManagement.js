import { supabase } from './supabase'

function requireSupabase() { if (!supabase) throw new Error('supabase_not_configured') }

export async function loadPaymentsData() {
  requireSupabase()
  const [payments, courses, students] = await Promise.all([
    supabase.from('payment_requests').select('id,student_id,course_id,amount,currency,payment_method,transferred_from,transaction_reference,screenshot_path,note,status,reviewed_by,reviewed_at,rejection_reason,created_at,updated_at,student_profiles(id,full_name,student_code,grade),courses(id,name,duration_days)').order('created_at', { ascending: false }),
    supabase.from('courses').select('id,name,price,duration_days').order('name'),
    supabase.from('student_profiles').select('id,full_name,student_code').eq('role', 'student').order('full_name'),
  ])
  const failed = [payments, courses, students].find((result) => result.error)
  if (failed) throw failed.error
  return { payments: payments.data || [], courses: courses.data || [], students: students.data || [] }
}

export async function reviewPayment(paymentId, decision, rejectionReason) {
  requireSupabase()
  const { data, error } = await supabase.rpc('review_payment_request', { requested_payment_id: paymentId, decision, requested_rejection_reason: rejectionReason || null })
  if (error) throw error
  return data
}

export async function createPaymentScreenshotUrl(path) {
  requireSupabase()
  if (!path) return null
  const { data, error } = await supabase.storage.from('payment-screenshots').createSignedUrl(path, 300)
  if (error) throw error
  return data?.signedUrl || null
}

export function paymentSummary(payments, now = new Date()) {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const approved = payments.filter((payment) => payment.status === 'approved')
  return { totalRevenue: approved.reduce((sum, payment) => sum + Number(payment.amount || 0), 0), pending: payments.filter((payment) => payment.status === 'pending').length, approved: approved.length, rejected: payments.filter((payment) => payment.status === 'rejected').length, monthRevenue: approved.filter((payment) => payment.created_at >= monthStart).reduce((sum, payment) => sum + Number(payment.amount || 0), 0) }
}
