import { useEffect, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, setToken, UNAUTHORIZED_EVENT } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/lib/i18n'
import { Zap, ArrowLeft, Copy, Check, Eye, EyeOff, Shield, Globe, Gauge, Layers, Lock } from 'lucide-react'

interface AuthStatus {
  needsSetup: boolean
  authenticated: boolean
  email: string | null
  mustChangePassword: boolean
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="ningyou-login-page">
      <div className="ningyou-orb ningyou-orb-a" />
      <div className="ningyou-orb ningyou-orb-b" />
      <div className="ningyou-orb ningyou-orb-c" />
      {children}
    </div>
  )
}

type AuthMode = 'login' | 'change-password' | 'forgot' | 'reset'

// 左侧介绍面板
function IntroPanel() {
  const { t } = useI18n()
  const features = [
    { icon: <Globe size={20} />, title: t('intro.feature1.title'), desc: t('intro.feature1.desc') },
    { icon: <Shield size={20} />, title: t('intro.feature2.title'), desc: t('intro.feature2.desc') },
    { icon: <Gauge size={20} />, title: t('intro.feature3.title'), desc: t('intro.feature3.desc') },
    { icon: <Layers size={20} />, title: t('intro.feature4.title'), desc: t('intro.feature4.desc') },
  ]

  return (
    <div className="ningyou-intro-panel">
      <div>
        <div className="ningyou-eyebrow">UNIFIED API GATEWAY</div>
        <h1 className="ningyou-hero-title">ONE KEY</h1>
        <p className="ningyou-hero-subtitle">
          {t('intro.subtitle1')}<br />
          {t('intro.subtitle2')}
        </p>
      </div>

      <div className="ningyou-features">
        {features.map((f, i) => (
          <div key={i} className="ningyou-feature-card">
            <div className="ningyou-feature-icon">{f.icon}</div>
            <div>
              <div className="ningyou-feature-title">{f.title}</div>
              <p>{f.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="ningyou-footer-text">
        Powered by <a href="https://github.com/salem-2007" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground transition-colors"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg> GitHub</a> · {t('intro.footer')}
      </div>
    </div>
  )
}

function AuthForm({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [resetToken, setResetToken] = useState('')
  const [generatedToken, setGeneratedToken] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [token, setTokenState] = useState<string | null>(null)
  const { t, lang, setLang } = useI18n()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await apiFetch<{ token: string; email: string; mustChangePassword: boolean }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: username, password }),
      })
      if (res.mustChangePassword) {
        setTokenState(res.token)
        setMode('change-password')
      } else {
        setToken(res.token)
        onAuthed()
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    if (newPassword !== confirmPassword) {
      setError(t('auth.changePassword.mismatch'))
      setBusy(false)
      return
    }
    if (newPassword.length < 8) {
      setError(t('auth.changePassword.minlength'))
      setBusy(false)
      return
    }
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ newPassword }),
      })
      setToken(token!)
      onAuthed()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      const res = await apiFetch<{ success: boolean; resetToken?: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: username }),
      })
      if (res.resetToken) {
        setGeneratedToken(res.resetToken)
        setSuccess(t('auth.forgot.success'))
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    if (newPassword.length < 8) {
      setError(t('auth.changePassword.minlength'))
      setBusy(false)
      return
    }
    try {
      await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken, password: newPassword }),
      })
      setSuccess(t('auth.reset.success'))
      setTimeout(() => {
        setMode('login')
        setSuccess('')
        setNewPassword('')
        setResetToken('')
        setGeneratedToken('')
      }, 2000)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function copyToken() {
    if (generatedToken) {
      await navigator.clipboard.writeText(generatedToken)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  function resetForm() {
    setError('')
    setSuccess('')
    setPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setResetToken('')
    setGeneratedToken('')
  }

  const titleMap = {
    login: t('auth.signin'),
    'change-password': t('auth.changePassword'),
    forgot: t('auth.forgot'),
    reset: t('auth.reset'),
  }

  const subtitleMap = {
    login: t('auth.login.hint'),
    'change-password': t('auth.changePassword.desc'),
    forgot: t('auth.forgot.desc'),
    reset: t('auth.reset.desc'),
  }

  return (
    <Centered>
      <div className="ningyou-auth-shell">
        <IntroPanel />

        <div className="ningyou-glass-card">
          <div className="ningyou-auth-header">
            <div className="ningyou-form-badge">
              <Lock size={14} />
              {mode === 'login' ? t('auth.badge.login') : mode === 'change-password' ? t('auth.badge.security') : t('auth.badge.recovery')}
            </div>
            <h2 className="ningyou-auth-title">{titleMap[mode]}</h2>
            <p className="ningyou-auth-subtitle">{subtitleMap[mode]}</p>
          </div>

          {mode === 'login' && (
            <form onSubmit={handleLogin} className="ningyou-auth-form">
              <div className="ningyou-form-item">
                <Label className="ningyou-label">{t('auth.username')}</Label>
                <Input
                  id="auth-username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder={t('auth.username.placeholder')}
                  className="ningyou-input"
                />
              </div>
              <div className="ningyou-form-item">
                <div className="ningyou-label-row">
                  <Label className="ningyou-label">{t('auth.password')}</Label>
                  <button type="button" onClick={() => { setMode('forgot'); resetForm(); }} className="ningyou-forgot-link">
                    {t('auth.forgot.link')}
                  </button>
                </div>
                <div className="ningyou-password-wrapper">
                  <Input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={t('auth.password.placeholder')}
                    className="ningyou-input"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="ningyou-eye-btn">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && <div className="ningyou-error">{error}</div>}

              <Button type="submit" disabled={busy} className="ningyou-submit-btn">
                {busy ? '...' : t('auth.signin')}
              </Button>

              <button type="button" onClick={() => { setMode('reset'); resetForm(); }} className="ningyou-back-link">
                {t('auth.reset.link')}
              </button>
            </form>
          )}

          {mode === 'change-password' && (
            <form onSubmit={handleChangePassword} className="ningyou-auth-form">
              <div className="ningyou-tip">
                {t('auth.changePassword.warning')}
              </div>
              <div className="ningyou-form-item">
                <Label className="ningyou-label">{t('auth.changePassword.new')}</Label>
                <div className="ningyou-password-wrapper">
                  <Input
                    id="new-password"
                    type={showNewPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder={t('auth.changePassword.minlength')}
                    className="ningyou-input"
                  />
                  <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="ningyou-eye-btn">
                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="ningyou-form-item">
                <Label className="ningyou-label">{t('auth.changePassword.confirm')}</Label>
                <div className="ningyou-password-wrapper">
                  <Input
                    id="confirm-password"
                    type={showNewPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder={t('auth.changePassword.confirm')}
                    className="ningyou-input"
                  />
                </div>
              </div>

              {error && <div className="ningyou-error">{error}</div>}

              <Button type="submit" disabled={busy} className="ningyou-submit-btn">
                {busy ? '...' : t('auth.changePassword.btn')}
              </Button>
            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="ningyou-auth-form">
              <div className="ningyou-form-item">
                <Label className="ningyou-label">{t('auth.username')}</Label>
                <Input
                  id="forgot-username"
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder={t('auth.username.placeholder')}
                  className="ningyou-input"
                />
              </div>
              {generatedToken && (
                <div className="ningyou-form-item">
                  <Label className="ningyou-label">{t('auth.forgot.token')}</Label>
                  <div className="ningyou-token-row">
                    <Input value={generatedToken} readOnly className="ningyou-input font-mono" />
                    <Button type="button" variant="outline" size="sm" onClick={copyToken} className="ningyou-copy-btn">
                      {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                    </Button>
                  </div>
                  <p className="ningyou-tip">⚠️ {t('auth.forgot.success')}</p>
                </div>
              )}

              {error && <div className="ningyou-error">{error}</div>}
              {success && <div className="ningyou-success">{success}</div>}

              <Button type="submit" disabled={busy} className="ningyou-submit-btn">
                {busy ? '...' : t('auth.forgot.btn')}
              </Button>

              <button type="button" onClick={() => { setMode('login'); resetForm(); }} className="ningyou-back-link">
                <ArrowLeft size={14} />
                {t('auth.forgot.back')}
              </button>
            </form>
          )}

          {mode === 'reset' && (
            <form onSubmit={handleResetPassword} className="ningyou-auth-form">
              <div className="ningyou-form-item">
                <Label className="ningyou-label">{t('auth.reset.token')}</Label>
                <Input
                  id="reset-token"
                  type="text"
                  value={resetToken}
                  onChange={e => setResetToken(e.target.value)}
                  placeholder={t('auth.reset.token')}
                  className="ningyou-input font-mono"
                />
              </div>
              <div className="ningyou-form-item">
                <Label className="ningyou-label">{t('auth.reset.newPassword')}</Label>
                <div className="ningyou-password-wrapper">
                  <Input
                    id="reset-password"
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder={t('auth.changePassword.minlength')}
                    className="ningyou-input"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="ningyou-eye-btn">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && <div className="ningyou-error">{error}</div>}
              {success && <div className="ningyou-success">{success}</div>}

              <Button type="submit" disabled={busy} className="ningyou-submit-btn">
                {busy ? '...' : t('auth.reset.btn')}
              </Button>

              <button type="button" onClick={() => { setMode('login'); resetForm(); }} className="ningyou-back-link">
                <ArrowLeft size={14} />
                {t('auth.reset.back')}
              </button>
            </form>
          )}

          <div className="ningyou-lang-toggle">
            <Button variant="ghost" size="sm" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
              {lang === 'zh' ? 'English' : '中文'}
            </Button>
          </div>
        </div>
      </div>
    </Centered>
  )
}

export function AuthGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const { data, isLoading, isError, refetch } = useQuery<AuthStatus>({
    queryKey: ['auth-status'],
    queryFn: () => apiFetch('/api/auth/status'),
    retry: false,
  })

  useEffect(() => {
    const handler = () => { refetch() }
    window.addEventListener(UNAUTHORIZED_EVENT, handler)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handler)
  }, [refetch])

  function onAuthed() {
    queryClient.invalidateQueries()
    refetch()
  }

  if (isLoading) return (
    <Centered>
      <div className="ningyou-loading">
        <div className="ningyou-spinner" />
        <p>Loading…</p>
      </div>
    </Centered>
  )
  if (isError || !data) {
    return (
      <Centered>
        <div className="ningyou-error-card">
          Can't reach the server. Make sure the backend is running.
        </div>
      </Centered>
    )
  }

  if (data.needsSetup) return <AuthForm onAuthed={onAuthed} />
  if (!data.authenticated) return <AuthForm onAuthed={onAuthed} />

  return <>{children}</>
}
