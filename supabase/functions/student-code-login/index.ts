import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { code } = await request.json()
    const normalizedCode = String(code || '').trim().toUpperCase()
    if (!/^EZ-[A-Z0-9]{8}$/.test(normalizedCode)) {
      return new Response(JSON.stringify({ error: 'Invalid code' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: profile, error: profileError } = await admin.from('student_profiles').select('email, account_status').eq('student_code', normalizedCode).maybeSingle()
    if (profileError || !profile || profile.account_status !== 'active') {
      return new Response(JSON.stringify({ error: 'Invalid code' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email: profile.email })
    if (linkError || !link?.properties?.hashed_token) throw new Error('Unable to create a session')
    return new Response(JSON.stringify({ token_hash: link.properties.hashed_token }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch {
    return new Response(JSON.stringify({ error: 'Unable to log in right now' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})