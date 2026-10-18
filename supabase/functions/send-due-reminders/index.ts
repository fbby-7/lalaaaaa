// Optional scheduled email reminder function. Deploy only after configuring the secrets below.
// This runs server-side; NEVER put SUPABASE_SERVICE_ROLE_KEY or RESEND_API_KEY in assets/app.js.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-reminder-secret' }
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const secret = Deno.env.get('REMINDER_CRON_SECRET')
  if (!secret || req.headers.get('x-reminder-secret') !== secret) return new Response('Unauthorized', { status: 401, headers: corsHeaders })
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('REMINDER_FROM_EMAIL')
  if (!resendKey || !fromEmail) return new Response('Missing RESEND_API_KEY or REMINDER_FROM_EMAIL secret', { status: 500, headers: corsHeaders })
  const admin = createClient(supabaseUrl, serviceKey)
  const today = new Date().toISOString().slice(0, 10)
  const plusTwo = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)
  const { data: rows, error } = await admin.from('borrowings')
    .select('borrowing_id,status,expected_return_date,borrower:users!borrowings_borrower_id_fkey(email,first_name,last_name)')
    .in('status', ['Approved', 'Active', 'Partially Returned'])
    .lte('expected_return_date', plusTwo)
  if (error) return new Response(error.message, { status: 500, headers: corsHeaders })
  let sent = 0
  for (const row of rows ?? []) {
    const borrower = Array.isArray(row.borrower) ? row.borrower[0] : row.borrower
    if (!borrower?.email) continue
    const overdue = row.expected_return_date < today
    const type = overdue ? 'overdue' : 'due_soon'
    const { data: prior } = await admin.from('email_reminder_log').select('reminder_log_id')
      .eq('borrowing_id', row.borrowing_id).eq('reminder_type', type).eq('reminder_date', today).maybeSingle()
    if (prior) continue
    const subject = overdue ? `Overdue equipment return — Request #${row.borrowing_id}` : `Equipment return reminder — Request #${row.borrowing_id}`
    const body = overdue
      ? `Hello ${borrower.first_name || 'student'}, your equipment borrowing request #${row.borrowing_id} was due on ${row.expected_return_date}. Please contact the Equipment Office and arrange the return. This reminder is sent daily while the item remains overdue.`
      : `Hello ${borrower.first_name || 'student'}, your equipment borrowing request #${row.borrowing_id} is due on ${row.expected_return_date}. Please return the equipment on time.`
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromEmail, to: [borrower.email], subject, text: body })
    })
    if (!response.ok) continue
    const { error: logError } = await admin.from('email_reminder_log').insert({ borrowing_id: row.borrowing_id, reminder_type: type, reminder_date: today })
    if (!logError) sent++
  }
  return new Response(JSON.stringify({ checked: rows?.length ?? 0, sent }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
