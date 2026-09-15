import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { isSupabaseConfigured, supabase } from './lib/supabase'

function EyeIcon({ hidden = false }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" />{hidden && <path d="m4 4 16 16" />}</svg>
}

function AuthBrand({ title, text }) {
  return <aside className="auth-brand"><div className="auth-shape auth-shape-main" /><div className="auth-shape auth-shape-small" /><div className="auth-brand-inner"><span className="eyebrow">ENGLISH ZONE</span><h1>{title}</h1><p>{text}</p><div className="auth-topic-list"><span>ABC</span><span>Grammar</span><span>Vocabulary</span><span>Speaking</span><span>Reading</span><span>Writing</span><span>Listening</span></div><div className="auth-illustration" aria-hidden="true"><div className="auth-book"><span>Read</span><strong>English</strong><i>✦</i></div><div className="auth-orbit orbit-one" /><div className="auth-orbit orbit-two" /></div></div></aside>
}

function AuthField({ label, name, type = 'text', value, onChange, placeholder, error, autoComplete }) {
  return <div className={`auth-field ${error ? 'has-error' : ''}`}><label htmlFor={name}>{label}</label><input id={name} name={name} type={type} value={value} onChange={onChange} placeholder={placeholder} autoComplete={autoComplete} aria-invalid={Boolean(error)} aria-describedby={error ? `${name}-error` : undefined} />{error && <small id={`${name}-error`} role="alert">{error}</small>}</div>
}

function AuthNotice({ status }) {
  return status.message ? <div className={`auth-notice ${status.type}`} role="alert">{status.message}</div> : null
}

export function StudentLoginPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState({ type: '', message: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [mode, setMode] = useState('password')
  const [otpSent, setOtpSent] = useState(false)
  const [code, setCode] = useState('')

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
    setErrors((current) => ({ ...current, [event.target.name]: '' }))
    setStatus({ type: '', message: '' })
  }

  function validateEmail() {
    const emailError = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) ? '' : 'Enter a valid email address.'
    setErrors((current) => ({ ...current, email: emailError }))
    return !emailError
  }

  function changeMode(nextMode) {
    setMode(nextMode)
    setOtpSent(false)
    setCode('')
    setErrors({})
    setStatus({ type: '', message: '' })
  }

  async function completeLogin(user) {
    const { data: roleRecord, error: roleError } = await supabase.from('platform_roles').select('role').eq('auth_user_id', user.id).maybeSingle()
    if (roleError) throw new Error('Unable to verify your account right now. Please try again.')
    if (roleRecord?.role === 'teacher') {
      await supabase.auth.signOut()
      navigate('/teacher/dashboard', { replace: true })
      return
    }
    if (roleRecord?.role !== 'student') throw new Error('This account is not available through student login.')
    const { data: profile, error: profileError } = await supabase.from('student_profiles').select('account_status, subscription_status').eq('auth_user_id', user.id).maybeSingle()
    if (profileError || !profile) throw new Error('Unable to load your student profile. Please try again.')
    if (profile.account_status === 'suspended') {
      await supabase.auth.signOut()
      throw new Error('Your account is currently suspended. Please contact your teacher for assistance.')
    }
    if (profile.account_status === 'pending') {
      await supabase.auth.signOut()
      throw new Error('Your account is still pending approval. Please contact your teacher for assistance.')
    }
    navigate('/student/dashboard', { replace: true })
  }

  async function verifyCode() {
    if (!/^EZ-[A-Z0-9]{8}$/i.test(code.trim())) return setErrors((current) => ({ ...current, code: 'Enter your valid student code, for example EZ-AB12CD34.' }))
    if (!isSupabaseConfigured || !supabase) return setStatus({ type: 'error', message: 'Login is not connected yet. Add the Supabase environment variables before signing in.' })
    setSubmitting(true)
    setStatus({ type: '', message: '' })
    try {
      const { data: sessionData, error: functionError } = await supabase.functions.invoke('student-code-login', { body: { code: code.trim().toUpperCase() } })
      if (functionError || !sessionData?.token_hash) throw new Error('Invalid student code. Please check it and try again.')
      const { data, error } = await supabase.auth.verifyOtp({ token_hash: sessionData.token_hash, type: 'magiclink' })
      if (error || !data.user) throw new Error('That code is invalid or expired. Request a new code and try again.')
      await completeLogin(data.user)
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to verify the code right now. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  async function login(event) {
    event.preventDefault()
    const nextErrors = {}
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) nextErrors.email = 'Enter a valid email address.'
    if (!form.password) nextErrors.password = 'Enter your password.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length || !isSupabaseConfigured || !supabase) {
      if (!Object.keys(nextErrors).length) setStatus({ type: 'error', message: 'Login is not connected yet. Add the Supabase environment variables before signing in.' })
      return
    }
    setSubmitting(true)
    setStatus({ type: '', message: '' })
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: form.email.trim().toLowerCase(), password: form.password })
      if (error || !data.user) throw new Error('Incorrect email or password.')
      await completeLogin(data.user)
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to log in right now. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="auth-page"><div className="auth-layout"><AuthBrand title="Welcome Back!" text="Continue your English learning journey." /><main className="auth-main"><div className="auth-topbar"><Link to="/">← Back to home</Link><span>New here? <Link to="/register">Create Account</Link></span></div><section className="auth-card"><div className="auth-heading"><span className="eyebrow">STUDENT LOGIN</span><h2>Welcome Back</h2><p>Log in to continue your learning journey.</p></div>{!isSupabaseConfigured && <div className="auth-setup">Login is ready for Supabase. Add the environment variables before signing in.</div>}<div className="auth-mode-switch" role="tablist" aria-label="Choose a login method"><button type="button" className={mode === 'password' ? 'active' : ''} onClick={() => changeMode('password')} role="tab" aria-selected={mode === 'password'}>Password</button><button type="button" className={mode === 'code' ? 'active' : ''} onClick={() => changeMode('code')} role="tab" aria-selected={mode === 'code'}>Code</button></div><AuthNotice status={status} /><form onSubmit={(event) => { event.preventDefault(); mode === 'password' ? login(event) : verifyCode() }} noValidate>{mode === 'password' ? <><AuthField label="Email Address" name="email" type="email" value={form.email} onChange={updateField} placeholder="Enter your email address" error={errors.email} autoComplete="email" /><div className="auth-field"><label htmlFor="password">Password</label><div className="auth-password"><input id="password" name="password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={updateField} placeholder="Enter your password" autoComplete="current-password" aria-invalid={Boolean(errors.password)} /> <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}><EyeIcon hidden={showPassword} /></button></div>{errors.password && <small role="alert">{errors.password}</small>}</div><div className="auth-options"><Link to="/student/forgot-password">Forgot Password?</Link><span>Secure provider session</span></div><button className="auth-submit" disabled={submitting} type="submit">{submitting ? <><span className="spinner" /> Logging in...</> : <>Login <span>→</span></>}</button></> : <><AuthField label="Student Code" name="studentCode" value={code} onChange={(event) => { setCode(event.target.value.toUpperCase()); setErrors((current) => ({ ...current, code: '' })) }} placeholder="Enter your student code" error={errors.code} autoComplete="off" /><div className="code-help">Use the permanent code created for your account.</div><button className="auth-submit" disabled={submitting} type="submit">{submitting ? <><span className="spinner" /> Logging in...</> : <>Login with Code <span>→</span></>}</button></>}</form><div className="auth-bottom"><span>Don&apos;t have an account? <Link to="/register">Create Account</Link></span><span>Are you a teacher? <Link to="/teacher/login">Teacher Login</Link></span></div></section></main></div></div>
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState({ type: '', message: '' })
  const [submitting, setSubmitting] = useState(false)

  async function requestReset(event) {
    event.preventDefault()
    setError('')
    setStatus({ type: '', message: '' })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Enter a valid email address.')
    if (!isSupabaseConfigured || !supabase) return setStatus({ type: 'error', message: 'Password reset is not connected yet. Add the Supabase environment variables first.' })
    setSubmitting(true)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: `${window.location.origin}/student/reset-password` })
    setSubmitting(false)
    if (resetError) return setStatus({ type: 'error', message: 'Unable to send the reset email right now. Please try again.' })
    setStatus({ type: 'success', message: 'If an account uses this email, you will receive a password reset link shortly.' })
  }

  return <div className="auth-page"><div className="auth-layout"><AuthBrand title="Find Your Way Back" text="Reset your password and continue learning with confidence." /><main className="auth-main"><div className="auth-topbar"><Link to="/student/login">← Back to login</Link><Link to="/">Home</Link></div><section className="auth-card"><div className="auth-heading"><span className="eyebrow">ACCOUNT RECOVERY</span><h2>Forgot Password?</h2><p>Enter your email and we&apos;ll send a secure reset link.</p></div><AuthNotice status={status} /><form onSubmit={requestReset} noValidate><AuthField label="Email Address" name="resetEmail" type="email" value={email} onChange={(event) => { setEmail(event.target.value); setError('') }} placeholder="Enter your email address" error={error} autoComplete="email" /><button className="auth-submit" disabled={submitting} type="submit">{submitting ? <><span className="spinner" /> Sending...</> : <>Send Reset Link <span>→</span></>}</button></form><div className="auth-bottom"><span>Remember your password? <Link to="/student/login">Student Login</Link></span></div></section></main></div></div>
}

export function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState({ type: '', message: '' })
  const [submitting, setSubmitting] = useState(false)

  async function updatePassword(event) {
    event.preventDefault()
    if (password.length < 8) return setStatus({ type: 'error', message: 'Password must be at least 8 characters.' })
    if (password !== confirmPassword) return setStatus({ type: 'error', message: 'Passwords do not match.' })
    if (!isSupabaseConfigured || !supabase) return setStatus({ type: 'error', message: 'Password reset is not connected yet.' })
    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSubmitting(false)
    setStatus(error ? { type: 'error', message: 'This reset link is invalid or expired. Request a new one.' } : { type: 'success', message: 'Your password has been updated. You can now log in.' })
  }

  return <div className="auth-page"><div className="auth-layout"><AuthBrand title="A Fresh Start" text="Choose a secure password for your English Zone account." /><main className="auth-main"><div className="auth-topbar"><Link to="/student/login">← Back to login</Link><Link to="/">Home</Link></div><section className="auth-card"><div className="auth-heading"><span className="eyebrow">SECURE PASSWORD RESET</span><h2>Choose a New Password</h2><p>Create a new password to secure your account.</p></div><AuthNotice status={status} /><form onSubmit={updatePassword}><div className="auth-field"><label htmlFor="newPassword">New Password</label><div className="auth-password"><input id="newPassword" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" autoComplete="new-password" /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}><EyeIcon hidden={showPassword} /></button></div></div><AuthField label="Confirm Password" name="resetConfirmPassword" type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat your password" autoComplete="new-password" /><button className="auth-submit" disabled={submitting} type="submit">{submitting ? <><span className="spinner" /> Updating...</> : <>Update Password <span>→</span></>}</button></form></section></main></div></div>
}