import { supabase } from './supabase'

export const expenseCategories = [['advertising', 'Advertising'], ['printing', 'Printing'], ['equipment', 'Equipment'], ['transportation', 'Transportation'], ['software', 'Software'], ['teaching_materials', 'Teaching Materials'], ['internet_technology', 'Internet / Technology'], ['other', 'Other']]
function requireSupabase() { if (!supabase) throw new Error('supabase_not_configured') }

export async function loadExpenseData() {
  requireSupabase()
  const [expenses, payments] = await Promise.all([
    supabase.from('expenses').select('id,name,category,amount,currency,expense_date,notes,created_by,created_at,updated_at,deleted_at').is('deleted_at', null).order('expense_date', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('payment_requests').select('id,amount,currency,created_at,status').eq('status', 'approved').order('created_at', { ascending: false }),
  ])
  const failed = [expenses, payments].find((result) => result.error)
  if (failed) throw failed.error
  return { expenses: expenses.data || [], payments: payments.data || [] }
}

export async function createExpense(form) {
  requireSupabase()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('not_authenticated')
  const { data, error } = await supabase.from('expenses').insert({ name: form.name.trim(), category: form.category, amount: Number(form.amount), currency: 'EGP', expense_date: form.expense_date, notes: form.notes.trim(), created_by: auth.user.id }).select().single()
  if (error) throw error
  return data
}

export async function updateExpense(id, form) {
  requireSupabase()
  const { data, error } = await supabase.from('expenses').update({ name: form.name.trim(), category: form.category, amount: Number(form.amount), expense_date: form.expense_date, notes: form.notes.trim() }).eq('id', id).is('deleted_at', null).select().single()
  if (error) throw error
  return data
}

export async function archiveExpense(id) {
  requireSupabase()
  const { data, error } = await supabase.from('expenses').update({ deleted_at: new Date().toISOString() }).eq('id', id).is('deleted_at', null).select().single()
  if (error) throw error
  return data
}

export function expenseTotals(expenses, payments, now = new Date()) {
  const month = now.toISOString().slice(0, 7); const year = String(now.getFullYear())
  const totalExpenses = expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const revenue = payments.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  return { totalExpenses, monthExpenses: expenses.filter((row) => row.expense_date.startsWith(month)).reduce((sum, row) => sum + Number(row.amount || 0), 0), yearExpenses: expenses.filter((row) => row.expense_date.startsWith(year)).reduce((sum, row) => sum + Number(row.amount || 0), 0), revenue, net: revenue - totalExpenses }
}

export function downloadExpensesCsv(rows) {
  const header = ['Expense Name', 'Category', 'Amount', 'Currency', 'Date', 'Notes', 'Created Date']
  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
  const csv = [header, ...rows.map((row) => [row.name, row.category, row.amount, row.currency, row.expense_date, row.notes, row.created_at])].map((line) => line.map(escape).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = `english-zone-expenses-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url)
}
