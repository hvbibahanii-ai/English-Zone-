import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return json({ error: 'unauthorized' }, 401)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anon = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: `Bearer ${token}` } } })
    const { data: auth } = await anon.auth.getUser(token)
    if (!auth.user) return json({ error: 'unauthorized' }, 401)
    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: role } = await admin.from('platform_roles').select('role').eq('auth_user_id', auth.user.id).maybeSingle()
    if (role?.role !== 'teacher') return json({ error: 'forbidden' }, 403)
    const body = await request.json()
    if (body.action === 'create') {
      if (!body.email || !body.password || body.password.length < 8) return json({ error: 'invalid_credentials' }, 400)
      const { data: created, error: createError } = await admin.auth.admin.createUser({ email: body.email.trim().toLowerCase(), password: body.password, email_confirm: true, user_metadata: { full_name: body.full_name, phone: body.phone, parent_phone: body.parent_phone, grade: body.grade, educational_system: body.educational_system } })
      if (createError || !created.user) return json({ error: createError?.message.includes('already') ? 'duplicate_email' : 'create_failed' }, 400)
      const profile = { full_name: body.full_name.trim(), email: body.email.trim().toLowerCase(), phone: body.phone.trim(), parent_phone: body.parent_phone.trim(), grade: body.grade, educational_system: body.educational_system, student_code: body.student_code?.trim() || undefined, account_status: body.account_status || 'pending', subscription_status: body.subscription_status || 'no_subscription' }
      const { data: student, error: profileError } = await admin.from('student_profiles').update(profile).eq('auth_user_id', created.user.id).select().single()
      if (profileError) { await admin.auth.admin.deleteUser(created.user.id); return json({ error: profileError.code === '23505' ? 'duplicate_student_code' : 'create_failed' }, 400) }
      await admin.from('audit_logs').insert({ action: 'student_created', teacher_id: auth.user.id, related_table: 'student_profiles', related_record_id: student.id })
      return json({ student })
    }
    if (!body.student_id) return json({ error: 'student_required' }, 400)
    if (body.action === 'update') {
      const allowed = ['full_name', 'phone', 'parent_phone', 'grade', 'educational_system', 'student_code', 'photo_url', 'account_status']
      const updates = Object.fromEntries(Object.entries(body).filter(([key, value]) => allowed.includes(key) && value !== undefined))
      const { data: student, error } = await admin.from('student_profiles').update(updates).eq('id', body.student_id).select().single()
      if (error) return json({ error: error.code === '23505' ? 'duplicate_student_code' : 'update_failed' }, 400)
      await admin.from('audit_logs').insert({ action: 'student_updated', teacher_id: auth.user.id, related_table: 'student_profiles', related_record_id: student.id, metadata: { fields: Object.keys(updates) } })
      return json({ student })
    }
    if (body.action === 'status') {
      if (!['active', 'pending', 'suspended'].includes(body.account_status)) return json({ error: 'invalid_status' }, 400)
      const { data: student, error } = await admin.from('student_profiles').update({ account_status: body.account_status }).eq('id', body.student_id).select().single()
      if (error) return json({ error: 'status_update_failed' }, 400)
      await admin.from('audit_logs').insert({ action: `student_${body.account_status}`, teacher_id: auth.user.id, related_table: 'student_profiles', related_record_id: student.id })
      return json({ student })
    }
    return json({ error: 'unknown_action' }, 400)
  } catch { return json({ error: 'request_failed' }, 500) }
})