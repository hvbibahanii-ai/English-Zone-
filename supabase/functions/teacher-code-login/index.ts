import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { code } = await request.json()
    const expectedCode = Deno.env.get('TEACHER_ACCESS_CODE')
    const teacherEmail = Deno.env.get('TEACHER_AUTH_EMAIL')
    if (!expectedCode || !teacherEmail || code !== expectedCode) {
      return new Response(JSON.stringify({ error: 'Invalid teacher access code' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } })
    const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const teacher = users.data.users.find((user) => user.email?.toLowerCase() === teacherEmail.toLowerCase())
    if (!teacher) throw new Error('teacher_user_not_provisioned')
    const { error: roleError } = await admin.from('platform_roles').upsert({ auth_user_id: teacher.id, role: 'teacher' })
    if (roleError) throw new Error('teacher_role_setup_failed')
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email: teacherEmail })
    if (linkError || !link?.properties?.hashed_token) throw new Error('teacher_session_failed')
    return new Response(JSON.stringify({ token_hash: link.properties.hashed_token }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch {
    return new Response(JSON.stringify({ error: 'Unable to sign in right now' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})