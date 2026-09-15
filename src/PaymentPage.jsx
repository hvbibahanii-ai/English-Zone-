import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { isSupabaseConfigured, supabase } from './lib/supabase'

const instaPayNumber = '01014812293'

function normalizeEgyptPhone(value) {
  const digits = value.replace(/[^\d+]/g, '')
  if (digits.startsWith('+20')) return `0${digits.slice(3)}`
  if (digits.startsWith('0020')) return `0${digits.slice(4)}`
  return digits
}

function validEgyptPhone(value) {
  return /^(?:0)?1[0125]\d{8}$/.test(normalizeEgyptPhone(value))
}

function formatMoney(amount, currency = 'EGP') {
  return new Intl.NumberFormat('en-EG', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(amount))
}

function PaymentHeader() {
  return <header className="payment-header"><Link className="payment-brand" to="/">ENGLISH <em>ZONE</em><small>English Learning Platform</small></Link><Link className="payment-back" to="/courses">← Back to courses</Link></header>
}

function PaymentStatus({ status }) {
  return status.message ? <div className={`payment-alert ${status.type}`} role="alert">{status.message}</div> : null
}

function CourseOverview({ course }) {
  return <article className="course-overview">{course.image_url ? <img src={course.image_url} alt="" /> : <div className="course-image-fallback">EN</div>}<div className="course-overview-copy"><span className="payment-eyebrow">SELECTED COURSE</span><h1>{course.name}</h1><p>{course.description}</p><div className="course-meta"><span>{course.grade.replaceAll('_', ' ')}</span><span>{course.educational_system.replaceAll('_', ' ')}</span></div></div></article>
}

export default function PaymentPage() {
  const { courseId: pathCourseId } = useParams()
  const [searchParams] = useSearchParams()
  const courseId = pathCourseId || searchParams.get('course')
  const navigate = useNavigate()
  const [course, setCourse] = useState(null)
  const [student, setStudent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ transferredFrom: '', reference: '', note: '' })
  const [screenshot, setScreenshot] = useState(null)
  const [preview, setPreview] = useState('')
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState({ type: '', message: '' })
  const [submitting, setSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadPaymentData() {
      if (!isSupabaseConfigured || !supabase || !courseId) return setLoading(false)
      const { data: authData } = await supabase.auth.getUser()
      if (!authData.user) return setLoading(false)
      const [courseResult, profileResult] = await Promise.all([
        supabase.from('courses').select('id, name, description, image_url, grade, educational_system, price, currency, duration_days, start_date, end_date').eq('id', courseId).eq('is_published', true).maybeSingle(),
        supabase.from('student_profiles').select('id, account_status').eq('auth_user_id', authData.user.id).maybeSingle(),
      ])
      if (!cancelled) {
        setCourse(courseResult.data)
        setStudent(profileResult.data)
        if (courseResult.error || profileResult.error) setStatus({ type: 'error', message: 'Unable to load the payment details. Please try again.' })
        setLoading(false)
      }
    }
    loadPaymentData()
    return () => { cancelled = true }
  }, [courseId])

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview])

  const durationLabel = useMemo(() => course ? `${course.duration_days} ${course.duration_days === 1 ? 'Day' : 'Days'}` : '', [course])

  async function copyInstaPay() {
    try {
      await navigator.clipboard.writeText(instaPayNumber)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2200)
    } catch {
      setStatus({ type: 'error', message: 'Could not copy the number. Please copy it manually.' })
    }
  }

  function updateField(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: name === 'note' ? value.slice(0, 500) : value }))
    setErrors((current) => ({ ...current, [name]: '' }))
    setStatus({ type: '', message: '' })
  }

  function selectScreenshot(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return setErrors((current) => ({ ...current, screenshot: 'Upload a PNG, JPG, JPEG or WEBP image.' }))
    if (file.size > 5 * 1024 * 1024) return setErrors((current) => ({ ...current, screenshot: 'The screenshot must be smaller than 5 MB.' }))
    if (preview) URL.revokeObjectURL(preview)
    setScreenshot(file)
    setPreview(URL.createObjectURL(file))
    setErrors((current) => ({ ...current, screenshot: '' }))
  }

  function removeScreenshot() {
    if (preview) URL.revokeObjectURL(preview)
    setScreenshot(null)
    setPreview('')
  }

  async function submitRequest(event) {
    event.preventDefault()
    const nextErrors = {}
    if (!validEgyptPhone(form.transferredFrom)) nextErrors.transferredFrom = 'Enter a valid Egyptian phone number.'
    if (form.reference.trim().length < 3 || form.reference.trim().length > 100) nextErrors.reference = 'Enter a valid transaction reference.'
    if (!screenshot) nextErrors.screenshot = 'Payment screenshot is required.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length || !supabase || !student || !course) return
    setSubmitting(true)
    setStatus({ type: '', message: '' })
    let uploadedPath = ''
    try {
      const extension = screenshot.name.split('.').pop().toLowerCase()
      uploadedPath = `${student.id}/${crypto.randomUUID()}.${extension}`
      const uploadResult = await supabase.storage.from('payment-screenshots').upload(uploadedPath, screenshot, { contentType: screenshot.type, upsert: false })
      if (uploadResult.error) throw new Error('We could not upload the screenshot. Please try again.')
      const { error } = await supabase.rpc('submit_payment_request', { requested_course_id: course.id, requested_transferred_from: normalizeEgyptPhone(form.transferredFrom), requested_transaction_reference: form.reference.trim(), requested_screenshot_path: uploadedPath, requested_note: form.note.trim() || null })
      if (error) {
        await supabase.storage.from('payment-screenshots').remove([uploadedPath])
        if (error.message.includes('pending_request_exists')) throw new Error('You already have a pending payment request for this course.')
        throw new Error('We could not submit your payment request. Please try again.')
      }
      setStatus({ type: 'success', message: 'Payment request submitted successfully. Your payment is now pending review by the teacher.' })
      setForm({ transferredFrom: '', reference: '', note: '' })
      removeScreenshot()
      window.setTimeout(() => navigate('/student/dashboard'), 1800)
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Something went wrong. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="payment-page"><PaymentHeader /><main className="payment-state"><div className="payment-loader" /><p>Loading payment details...</p></main></div>
  if (!isSupabaseConfigured) return <div className="payment-page"><PaymentHeader /><main className="payment-state"><h1>Payment is not connected yet.</h1><p>Add the Supabase environment variables before submitting payment requests.</p></main></div>
  if (!courseId || !course || !student) return <div className="payment-page"><PaymentHeader /><main className="payment-state"><h1>Payment details unavailable</h1><p>Choose a real published course and sign in before opening payment.</p><Link className="payment-primary-link" to="/courses">Back to courses</Link></main></div>

  return <div className="payment-page"><PaymentHeader /><main className="payment-main"><div className="payment-heading"><div><span className="payment-eyebrow">SECURE PAYMENT REQUEST</span><h1>Pay for Your Course</h1><p>Complete your InstaPay transfer, then submit the details for teacher review.</p></div><span className="pending-pill">Pending after submission</span></div><PaymentStatus status={status} /><div className="payment-layout"><div className="payment-left"><CourseOverview course={course} /><section className="instapay-card"><div><span className="payment-eyebrow">MANUAL TRANSFER</span><h2>Pay with InstaPay</h2><p>Transfer the exact course amount to the number below.</p></div><div className="instapay-number"><span>InstaPay Number</span><strong>{instaPayNumber}</strong><button type="button" onClick={copyInstaPay}>{copied ? 'Copied!' : 'Copy'}</button></div>{copied && <small className="copy-success">InstaPay number copied successfully.</small>}<div className="payment-disclaimer">After completing your InstaPay transfer, submit the transaction details below. Your payment will remain pending until it is reviewed and approved by the teacher.</div></section><form className="payment-form" onSubmit={submitRequest} noValidate><div className="payment-section-title"><span>01</span><div><h2>Payment Details</h2><p>Enter the information shown after your transfer.</p></div></div><div className="payment-field-grid"><label className={errors.transferredFrom ? 'has-error' : ''}>Transferred From<input name="transferredFrom" type="tel" value={form.transferredFrom} onChange={updateField} placeholder="01XXXXXXXXX" autoComplete="tel" />{errors.transferredFrom && <small>{errors.transferredFrom}</small>}</label><label className={errors.reference ? 'has-error' : ''}>Transaction / Reference Number<input name="reference" value={form.reference} onChange={updateField} placeholder="Enter the reference number" maxLength="100" />{errors.reference && <small>{errors.reference}</small>}</label></div><label className="payment-note-field">Additional Note <span>Optional</span><textarea name="note" value={form.note} onChange={updateField} placeholder="Add any additional information about your payment..." maxLength="500" /><small>{form.note.length}/500</small></label><div className={`screenshot-upload ${errors.screenshot ? 'has-error' : ''}`}><div><strong>Payment Screenshot</strong><p>Upload a screenshot showing your InstaPay transfer. PNG, JPG, JPEG or WEBP up to 5 MB.</p></div>{preview ? <div className="screenshot-preview"><img src={preview} alt="Payment screenshot preview" /><span>{screenshot.name} · {(screenshot.size / 1024 / 1024).toFixed(2)} MB</span><div><label htmlFor="paymentScreenshot">Replace</label><button type="button" onClick={removeScreenshot}>Remove</button></div></div> : <label className="screenshot-drop" htmlFor="paymentScreenshot"><span>＋</span><strong>Upload Screenshot</strong><small>Choose an image file</small></label>}<input id="paymentScreenshot" type="file" accept="image/png,image/jpeg,image/webp" onChange={selectScreenshot} />{errors.screenshot && <small className="upload-error">{errors.screenshot}</small>}</div><button className="payment-submit" disabled={submitting} type="submit">{submitting ? <><span className="spinner" /> Submitting Payment Request...</> : <>Submit Payment Request <span>→</span></>}</button></form></div><aside className="payment-summary"><span className="payment-eyebrow">PAYMENT SUMMARY</span><h2>Review your request</h2><dl><div><dt>Course</dt><dd>{course.name}</dd></div><div><dt>Amount</dt><dd className="summary-amount">{formatMoney(course.price, course.currency)}</dd></div><div><dt>Duration</dt><dd>{durationLabel}</dd></div><div><dt>Payment Method</dt><dd>InstaPay</dd></div><div><dt>Status</dt><dd><span className="status-dot" /> Pending after submission</dd></div></dl><div className="course-dates">{course.start_date && <span>Start date <b>{course.start_date}</b></span>}{course.end_date && <span>End date <b>{course.end_date}</b></span>}</div><p className="summary-note">The amount and duration come directly from the published course record and cannot be changed here.</p></aside></div></main></div>
}