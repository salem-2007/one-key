import { useEffect, useState, useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { Sun, Moon, LayoutDashboard, Key, AlertTriangle, Terminal, User, LogOut, ChevronLeft, ChevronRight, Languages, Zap } from 'lucide-react'
import { apiFetch, setToken } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { AuthGate } from '@/components/auth-gate'
import KeysPage from '@/pages/KeysPage'
import ProvidersPage from '@/pages/ProvidersPage'
import FallbackPage from '@/pages/FallbackPage'
import AnalyticsPage from '@/pages/AnalyticsPage'
import PlaygroundPage from '@/pages/PlaygroundPage'

const qc = new QueryClient()

function DarkModeToggle() {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('theme') === 'dark' || (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches) } catch { return false }
  })
  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    try { localStorage.setItem('theme', next ? 'dark' : 'light') } catch {}
  }
  return (
    <button onClick={toggle} className="ningyou-header-pill" title={dark ? 'Light mode' : 'Dark mode'}>
      {dark ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  )
}

function LangToggle() {
  const { lang, setLang } = useI18n()
  return (
    <button onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')} className="ningyou-header-pill">
      <Languages size={14} />
      <span className="ningyou-header-pill-label">{lang === 'zh' ? 'EN' : '中文'}</span>
    </button>
  )
}

function Header({ collapsed }: { collapsed: boolean }) {
  const { t } = useI18n()
  const location = useLocation()
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => apiFetch<{ email: string }>('/api/auth/me') })

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function logout() {
    setToken(null as any)
    window.location.reload()
  }

  const pageTitles: Record<string, string> = {
    '/': t('nav.analytics'),
    '/providers': t('nav.providers'),
    '/fallback': t('nav.fallback'),
    '/keys': t('nav.keys'),
    '/playground': t('nav.playground'),
  }
  const pageTitle = pageTitles[location.pathname] || t('nav.analytics')

  return (
    <header className="ningyou-header" style={{ left: collapsed ? '88px' : '244px' }}>
      <div className="ningyou-header-bar">
        <div className="ningyou-header-left">
          <div className="ningyou-header-title">
            <span>{pageTitle}</span>
          </div>
        </div>
        <div className="ningyou-header-right">
          <div className="ningyou-header-pills-wrap">
            <div className="ningyou-header-status">
              <span className="ningyou-status-dot" />
              <span>{t('header.running')}</span>
            </div>
            <DarkModeToggle />
            <LangToggle />
          </div>
          <div className="ningyou-header-profile-wrap" ref={menuRef}>
            <button onClick={() => setShowMenu(!showMenu)} className="ningyou-header-profile">
              <div className="ningyou-header-avatar">
                <User size={14} />
              </div>
            </button>
            {showMenu && (
              <div className="ningyou-header-dropdown">
                <div className="ningyou-dropdown-user">
                  <div className="ningyou-dropdown-avatar">
                    <User size={18} />
                  </div>
                  <div>
                    <div className="ningyou-dropdown-name">{me?.email?.split('@')[0] || 'User'}</div>
                    <div className="ningyou-dropdown-email">{me?.email || 'user@example.com'}</div>
                  </div>
                </div>
                <div className="ningyou-dropdown-divider" />
                <button onClick={logout} className="ningyou-dropdown-item">
                  <LogOut size={14} />
                  <span>{t('nav.signout')}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const location = useLocation()
  const { t } = useI18n()
  const navItems = [
    { to: '/', icon: LayoutDashboard, label: t('nav.analytics') },
    { to: '/providers', icon: Zap, label: t('nav.providers') },
    { to: '/fallback', icon: AlertTriangle, label: t('nav.fallback') },
    { to: '/keys', icon: Key, label: t('nav.keys') },
    { to: '/playground', icon: Terminal, label: t('nav.playground') },
  ]

  return (
    <aside className={cn("ningyou-sidebar", collapsed && "collapsed")} style={{ width: collapsed ? '64px' : '220px' }}>
      <div className="ningyou-sidebar-logo">
        <div className="ningyou-logo-icon"><Zap size={18} /></div>
        {!collapsed && <span className="ningyou-logo-text">ONE KEY</span>}
      </div>

      
      <nav className="ningyou-sidebar-nav">
        {navItems.map(item => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => cn('ningyou-nav-item', isActive && 'active')}>
            <item.icon size={18} strokeWidth={1.5} />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="ningyou-sidebar-actions">
        <button onClick={onToggle} className="ningyou-account-btn" title={collapsed ? '展开' : '收起'}>
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>
    </aside>
  )
}

function App() {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <AuthGate>
          <div className="ningyou-layout">
            <div className="ningyou-glow-bg" aria-hidden="true"></div>
            <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
            <Header collapsed={collapsed} />
            <main className="ningyou-main" style={{ marginLeft: collapsed ? '64px' : '220px' }}>
              <Routes>
                <Route path="/" element={<AnalyticsPage />} />
                <Route path="/providers" element={<ProvidersPage />} />
                <Route path="/fallback" element={<FallbackPage />} />
                <Route path="/keys" element={<KeysPage />} />
                <Route path="/playground" element={<PlaygroundPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
        </AuthGate>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
