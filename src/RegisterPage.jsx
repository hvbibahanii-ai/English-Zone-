import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { isSupabaseConfigured, supabase } from './lib/supabase'

const initialForm = { fullName: '', email: '', phone: '', parentPhone: '', grade: '', educationalSystem: '', password: '', confirmPassword: '', terms: false }
const grades = [['3rd_preparatory', '3rd Preparatory'], ['1st_secondary', '1st Secondary'], ['2nd_secondary', '2nd Secondary'], ['3rd_secondary', '3rd Secondary']]
const systems = [['general_secondary', 'General Secondary'], ['baccalaureate', 'Baccalaureate']]

function normalizeEgyptPhone(value) {
  const digits = value.replace(/[^\d+]/g, '')
  if (digits.startsWith('+20')) return `0${digits.slice(3)}`
  if (digits.startsWith('0020')) return `0${digits.slice(4)}`
  return digits
}

function isEgyptPhone(value) {
  return /^(?:0)?1[0125]\d{8}$/.test(normalizeEgyptPhone(value))
}

function getPasswordStrength(password) {
  if (!password) return { label: 'Use at least 8 characters', level: 0 }
  const score = [password.length >= 8, /[a-z]/.test(password), /[A-Z]/.test(password), /\d/.test(password), /[^A-Za-z\d]/.test(password)].filter(Boolean).length
  if (score <= 2) return { label: 'Add uppercase letters, numbers or symbols', level: 1 }
  if (score <= 4) return { label: 'Good password', level: 2 }
  return { label: 'Strong password', level: 3 }
}

function validateForm(form) {
  const errors = {}
  if (form.fullName.trim().length < 2) errors.fullName = 'Enter your full name.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim().toLowerCase())) errors.email = 'Enter a valid email address.'
  if (!isEgyptPhone(form.phone)) errors.phone = 'Enter a valid Egyptian mobile number.'
  if (!isEgyptPhone(form.parentPhone)) errors.parentPhone = 'Enter a valid Egyptian mobile number.'
  if (!form.grade) errors.grade = 'Choose your grade.'
  if (!form.educationalSystem) errors.educationalSystem = 'Choose your educational system.'
  if (form.password.length < 8) errors.password = 'Password must be at least 8 characters.'
  if (form.password !== form.confirmPassword) errors.confirmPassword = 'Passwords do not match.'
  if (!form.terms) errors.terms = 'You must agree to continue.'
  return errors
}

function Field({ label, name, error, required = true, children }) {
  return <div className={`form-field ${error ? 'has-error' : ''}`}><label htmlFor={name}>{label}{required && <span aria-hidden="true"> *</span>}</label>{children}{error && <small className="field-error" role="alert">{error}</small>}</div>
}

function RegistrationBrand() {
  return <aside className="registration-brand"><div className="registration-orb orb-main" /><div className="registration-orb orb-small" /><div className="registration-brand-content"><span className="eyebrow">ENGLISH ZONE</span><h1>Create<br /><em>Account</em></h1><p>Start your English learning journey with a structured, professional learning experience.</p><div className="brand-learning-list"><span>ABC</span><span>Grammar</span><span>Vocabulary</span><span>Speaking</span><span>Reading</span><span>Writing</span><span>Listening</span></div><div className="registration-book" aria-hidden="true"><span>Learn</span><strong>English</strong><i>✦</i></div></div></aside>
}

function PhotoUpload({ file, preview, onChange, onRemove, error }) {
  return <div className={`photo-upload ${error ? 'has-error' : ''}`}><div className="photo-preview">{preview ? <img src={preview} alt="Selected profile preview" /> : <span>AM</span>}</div><div className="photo-copy"><strong>Upload Profile Photo</strong><small>Optional. JPG, PNG or WEBP up to 2 MB.</small><div className="photo-actions"><label className="upload-link" htmlFor="photo">{file ? 'Replace photo' : 'Choose photo'}</label>{file && <button type="button" className="remove-photo" onClick={onRemove}>Remove</button>}</div><input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={onChange} /></div>{error && <small className="field-error" role="alert">{error}</small>}</div>
}

export default function RegisterPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState(initialForm)
  const [errors, setErrors] = useState({})
  const [photo, setPhoto] = useState(null)
  const [preview, setPreview] = useState('')
  const [photoError, setPhotoError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState({ type: '', message: '' })
  const strength = getPasswordStrength(form.password)
  const availableSystems = useMemo(() => form.grade === '3rd_preparatory' ? [systems[0]] : systems, [form.grade])

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview])

  function updateField(event) {
    const { name, value, checked, type } = event.target
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }))
    setErrors((current) => ({ ...current, [name]: '' }))
    setStatus({ type: '', message: '' })
    if (name === 'grade' && value === '3rd_preparatory') setForm((current) => ({ ...current, grade: value, educationalSystem: 'general_secondary' }))
  }

  function selectPhoto(event) {
    const selected = event.target.files?.[0]
    setPhotoError('')
    if (!selected) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type)) return setPhotoError('Choose a JPG, PNG or WEBP image.')
    if (selected.size > 2 * 1024 * 1024) return setPhotoError('The image must be smaller than 2 MB.')
    if (preview) URL.revokeObjectURL(preview)
    setPhoto(selected)
    setPreview(URL.createObjectURL(selected))
  }

  function removePhoto() {
    if (preview) URL.revokeObjectURL(preview)
    setPhoto(null)
    setPreview('')
    setPhotoError('')
  }

  async function submitRegistration(event) {
    event.preventDefault()
    const nextErrors = validateForm(form)
    setErrors(nextErrors)
    setStatus({ type: '', message: '' })
    if (Object.keys(nextErrors).length) return
    if (!isSupabaseConfigured || !supabase) {
      setStatus({ type: 'error', message: 'Registration is not connected yet. Add the Supabase environment variables before creating accounts.' })
      return
    }
    setSubmitting(true)
    try {
      const { data, error } = await supabase.auth.signUp({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        options: { data: { full_name: form.fullName.trim(), phone: normalizeEgyptPhone(form.phone), parent_phone: normalizeEgyptPhone(form.parentPhone), grade: form.grade, educational_system: form.educationalSystem, role: 'student' } },
      })
      if (error) {
        const message = /already|registered|exists/i.test(error.message) ? 'An account with this email already exists.' : 'We could not create your account. Please check your details and try again.'
        throw new Error(message)
      }
      if (!data.user) throw new Error('We could not create your account. Please try again.')
      if (photo && data.session) {
        const extension = photo.name.split('.').pop().toLowerCase()
        const path = `${data.user.id}/profile.${extension}`
        const upload = await supabase.storage.from('student-photos').upload(path, photo, { upsert: true, contentType: photo.type })
        if (upload.error) throw new Error('Your account was created, but the photo could not be uploaded. Please sign in and add it later.')
        const photoUpdate = await supabase.from('student_profiles').update({ photo_url: path }).eq('auth_user_id', data.user.id)
        if (photoUpdate.error) throw new Error('Your account was created, but the photo could not be saved. Please sign in and add it later.')
      }
      setStatus({ type: 'success', message: data.session ? 'Your account has been created successfully. You can now continue to courses.' : 'Your account has been created. Check your email to confirm your address, then continue to courses.' })
      window.setTimeout(() => navigate('/courses'), 1800)
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Something went wrong. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="registration-page"><div className="registration-layout"><RegistrationBrand /><main className="registration-main"><div className="registration-topbar"><Link to="/" className="back-home">← Back to home</Link><span>Already have an account? <Link to="/student/login">Student Login</Link></span></div><div className="registration-card"><div className="registration-heading"><span className="eyebrow">STUDENT REGISTRATION</span><h2>Create Your Account</h2><p>Enter your information to create your student account.</p></div>{!isSupabaseConfigured && <div className="setup-notice" role="status">Registration is ready for Supabase. Add the values from <strong>.env.example</strong> to connect the production Auth and Database.</div>}{status.message && <div className={`form-status ${status.type}`} role="alert">{status.message}</div>}<form onSubmit={submitRegistration} noValidate><fieldset><legend>Personal Information</legend><div className="form-grid"><Field label="Full Name" name="fullName" error={errors.fullName}><input id="fullName" name="fullName" value={form.fullName} onChange={updateField} placeholder="Enter your full name" autoComplete="name" /></Field><PhotoUpload file={photo} preview={preview} onChange={selectPhoto} onRemove={removePhoto} error={photoError} /></div></fieldset><fieldset><legend>Contact Information</legend><div className="form-grid"><Field label="Email Address" name="email" error={errors.email}><input id="email" name="email" type="email" value={form.email} onChange={updateField} placeholder="you@example.com" autoComplete="email" /></Field><Field label="Phone Number" name="phone" error={errors.phone}><input id="phone" name="phone" type="tel" value={form.phone} onChange={updateField} placeholder="01XXXXXXXXX" autoComplete="tel" /></Field><Field label="Parent / Guardian Phone" name="parentPhone" error={errors.parentPhone}><input id="parentPhone" name="parentPhone" type="tel" value={form.parentPhone} onChange={updateField} placeholder="01XXXXXXXXX" autoComplete="tel" /></Field></div></fieldset><fieldset><legend>Educational Information</legend><div className="form-grid"><Field label="Grade" name="grade" error={errors.grade}><select id="grade" name="grade" value={form.grade} onChange={updateField}><option value="">Select your grade</option>{grades.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field><Field label="Educational System" name="educationalSystem" error={errors.educationalSystem}><select id="educationalSystem" name="educationalSystem" value={form.educationalSystem} onChange={updateField}><option value="">Select your system</option>{availableSystems.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field></div></fieldset><fieldset><legend>Account Security</legend><div className="form-grid"><Field label="Password" name="password" error={errors.password}><div className="password-control"><input id="password" name="password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={updateField} placeholder="At least 8 characters" autoComplete="new-password" /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'Hide' : 'Show'}</button></div><div className={`password-strength strength-${strength.level}`}><span><i /><i /><i /></span><small>{strength.label}</small></div></Field><Field label="Confirm Password" name="confirmPassword" error={errors.confirmPassword}><input id="confirmPassword" name="confirmPassword" type={showPassword ? 'text' : 'password'} value={form.confirmPassword} onChange={updateField} placeholder="Repeat your password" autoComplete="new-password" /></Field></div></fieldset><label className={`terms-check ${errors.terms ? 'has-error' : ''}`}><input type="checkbox" name="terms" checked={form.terms} onChange={updateField} /><span>I agree to the <Link to="/terms">Terms of Service</Link> and <Link to="/privacy">Privacy Policy</Link>.</span></label>{errors.terms && <small className="field-error terms-error" role="alert">{errors.terms}</small>}<button className="register-submit" type="submit" disabled={submitting}>{submitting ? <><span className="spinner" /> Creating Account...</> : <>Create Account <span>→</span></>}</button></form><div className="registration-footer-links"><span>Need help? <Link to="/contact">Contact us</Link></span><Link to="/teacher/login">Teacher Login</Link></div></div></main></div></div>
}