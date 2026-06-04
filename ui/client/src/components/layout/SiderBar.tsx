import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Key, MessageSquare, Shield, FileText,
  BarChart3, Settings, ChevronLeft, ChevronRight, Zap, Server,
} from 'lucide-react'

interface NavItem {
  key: string
  label: string
  icon: React.ReactNode
  path: string
  section: string
}

const navItems: NavItem[] = [
  { key: 'dashboard', label: '数据看板', icon: <LayoutDashboard size={18} />, path: '/dashboard', section: '概览' },
  { key: 'keys', label: '令牌管理', icon: <Key size={18} />, path: '/keys', section: '配置' },
  { key: 'playground', label: '操练场', icon: <MessageSquare size={18} />, path: '/playground', section: '配置' },
  { key: 'integrations', label: '渠道管理', icon: <Server size={18} />, path: '/integrations', section: '管理' },
  { key: 'fallback', label: '故障转移', icon: <Shield size={18} />, path: '/fallback', section: '管理' },
  { key: 'capabilities', label: '模型管理', icon: <Zap size={18} />, path: '/capabilities', section: '管理' },
  { key: 'analytics', label: '数据分析', icon: <BarChart3 size={18} />, path: '/analytics', section: '管理' },
  { key: 'logs', label: '使用日志', icon: <FileText size={18} />, path: '/logs', section: '系统' },
  { key: 'settings', label: '系统设置', icon: <Settings size={18} />, path: '/settings', section: '系统' },
]

export function SiderBar() {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const sections = Array.from(new Set(navItems.map(i => i.section)))

  return (
    <aside className={`glass-sidebar flex flex-col h-screen transition-all duration-300 ${collapsed ? 'w-[68px]' : 'w-[220px]'}`}>
      {/* Logo */}
      <div className="flex items-center h-14 px-4 border-b border-border/50">
        {!collapsed ? (
          <div className="flex items-center gap-2">
            <img src={`${import.meta.env.BASE_URL}favicon.png`} alt="ONE KEY" className="w-8 h-8 rounded-lg object-cover" />
            <div>
              <span className="font-bold text-sm">ONE KEY</span>
              <span className="ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Pro Max
              </span>
            </div>
          </div>
        ) : (
          <img src={`${import.meta.env.BASE_URL}favicon.png`} alt="ONE KEY" className="w-8 h-8 rounded-lg object-cover mx-auto" />
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {sections.map(section => (
          <div key={section} className="mb-3">
            {!collapsed && (
              <div className="px-3 mb-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                {section}
              </div>
            )}
            {navItems.filter(i => i.section === section).map(item => {
              const active = location.pathname === item.path
              return (
                <NavLink
                  key={item.key}
                  to={item.path}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm mb-0.5 transition-all duration-200 ${
                    active
                      ? 'bg-primary/10 text-primary font-medium shadow-sm'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                  } ${collapsed ? 'justify-center' : ''}`}
                >
                  {item.icon}
                  {!collapsed && <span>{item.label}</span>}
                </NavLink>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Collapse */}
      <div className="p-2 border-t border-border/50">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center p-2 rounded-xl hover:bg-muted/60 transition-colors text-muted-foreground"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </aside>
  )
}
