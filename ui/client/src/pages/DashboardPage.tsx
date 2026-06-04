import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { Activity, Key, Zap, Server, Shield, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

export function DashboardPage() {
  const { data: keys } = useQuery({ queryKey: ['keys'], queryFn: () => apiFetch<any[]>('/api/keys') })
  const { data: health } = useQuery({ queryKey: ['health'], queryFn: () => apiFetch<any>('/api/health') })

  const totalKeys = keys?.length ?? 0
  const activeKeys = keys?.filter(k => k.enabled)?.length ?? 0
  const healthyKeys = keys?.filter(k => k.status === 'healthy')?.length ?? 0
  const platforms = health?.platforms?.length ?? 0

  const stats = [
    { title: '总令牌数', value: totalKeys, icon: <Key size={20} />, color: 'from-blue-500 to-blue-600', sub: `已启用 ${activeKeys}` },
    { title: '健康令牌', value: healthyKeys, icon: <Activity size={20} />, color: 'from-emerald-500 to-emerald-600', sub: totalKeys ? `${Math.round(healthyKeys/totalKeys*100)}% 健康率` : '无令牌' },
    { title: '可用平台', value: platforms, icon: <Server size={20} />, color: 'from-purple-500 to-purple-600', sub: '已配置平台数' },
    { title: '故障转移', value: keys?.filter(k => k.status === 'rate_limited')?.length ?? 0, icon: <Shield size={20} />, color: 'from-amber-500 to-amber-600', sub: '限流令牌数' },
  ]

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* 页头 */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">数据看板</h2>
        <p className="text-muted-foreground mt-1">系统概览与关键指标</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(s => (
          <div key={s.title} className="glass-hover p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">{s.title}</span>
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center text-white shadow-lg`}>
                {s.icon}
              </div>
            </div>
            <div className="text-3xl font-bold">{s.value}</div>
            <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* 两栏布局 */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* API 信息 */}
        <div className="glass p-6">
          <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
            <Zap size={18} className="text-yellow-500" /> API 信息
          </h3>
          <div className="space-y-3">
            {[
              ['代理端点', '/v1/chat/completions'],
              ['兼容格式', 'OpenAI API'],
              ['可用检查', '/api/health'],
              ['模型列表', '/v1/models'],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">{label}</span>
                <code className="font-mono text-xs bg-muted/60 px-2 py-1 rounded-lg">{value}</code>
              </div>
            ))}
          </div>
        </div>

        {/* 平台状态 */}
        <div className="glass p-6">
          <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
            <Shield size={18} className="text-green-500" /> 平台状态
          </h3>
          <div className="space-y-2">
            {health?.platforms?.length > 0 ? health.platforms.map((p: any) => (
              <div key={p.platform} className="flex items-center justify-between text-sm p-3 rounded-xl bg-muted/30">
                <span className="font-medium capitalize">{p.platform}</span>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                  p.status === 'healthy'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                }`}>
                  {p.status === 'healthy' ? '正常' : '异常'}
                </span>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground text-center py-6">暂无平台数据，请先添加 API 令牌</p>
            )}
          </div>
        </div>
      </div>

      {/* 快速开始 */}
      <div className="glass p-6">
        <h3 className="text-base font-semibold mb-4">快速开始</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { icon: <Key size={24} />, title: '1. 添加令牌', desc: '在令牌管理中添加各平台的 API Key', link: '/keys', color: 'text-blue-500' },
            { icon: <Zap size={24} />, title: '2. 配置模型', desc: '启用需要的模型并设置故障转移', link: '/capabilities', color: 'text-yellow-500' },
            { icon: <Activity size={24} />, title: '3. 开始使用', desc: '在操练场测试或通过 API 调用', link: '/playground', color: 'text-green-500' },
          ].map(s => (
            <Link key={s.title} to={s.link} className="group p-4 rounded-xl border border-border/50 hover:border-primary/30 hover:bg-muted/30 transition-all">
              <div className={`${s.color} mb-2`}>{s.icon}</div>
              <h4 className="font-medium text-sm">{s.title}</h4>
              <p className="text-xs text-muted-foreground mt-1">{s.desc}</p>
              <ArrowRight size={14} className="mt-2 text-muted-foreground group-hover:text-primary transition-colors" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
