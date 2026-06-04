import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Area, AreaChart,
} from 'recharts'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHeader } from '@/components/page-header'
import { formatSqliteUtcToLocalTime } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'

type TimeRange = '24h' | '7d' | '30d'

function formatTokens(n?: number): string {
  if (!n) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function Stat({ label, value, className }: { label: string; value: string | number; className?: string }) {
  return (
    <div className="rounded-2xl border border-white/40 bg-white/50 backdrop-blur-xl px-4 py-3.5 transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/20 hover:border-indigo-300/50 hover:bg-indigo-50/30 dark:hover:shadow-indigo-500/10 dark:hover:border-indigo-500/30 dark:hover:bg-indigo-950/20 dark:border-white/10 dark:bg-white/5">
      <p className="text-[11px] text-muted-foreground/70 font-medium tracking-wider uppercase">{label}</p>
      <p className={`text-xl font-semibold tabular-nums mt-1.5 ${className ?? ''}`}>{value}</p>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/40 bg-white/50 backdrop-blur-xl shadow-lg shadow-indigo-500/5 overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/15 hover:border-indigo-300/50 hover:bg-indigo-50/30 dark:hover:shadow-indigo-500/10 dark:hover:border-indigo-500/30 dark:hover:bg-indigo-950/20 dark:border-white/10 dark:bg-white/5">
      <div className="px-5 py-3.5 border-b border-border/30">
        <h3 className="text-sm font-medium text-foreground/80">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

// 柔和的调色板 - 适合亮暗模式
const colors = {
  primary: '#6366f1',      // indigo-500 - 柔和紫蓝
  primaryLight: '#818cf8', // indigo-400
  secondary: '#8b5cf6',    // violet-500
  success: '#22c55e',      // green-500
  successLight: '#4ade80', // green-400
  warning: '#f59e0b',      // amber-500
  danger: '#ef4444',       // red-500
  dangerLight: '#f87171',  // red-400
  muted: '#94a3b8',        // slate-400
}

const axisStyle = { fontSize: 11, fill: 'var(--muted-foreground)' } as const
const gridStyle = 'var(--border)'

// 自定义 Tooltip 样式
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border/50 bg-popover/95 backdrop-blur-sm px-3 py-2 shadow-lg">
      <p className="text-xs font-medium text-foreground/80 mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-xs tabular-nums" style={{ color: entry.color }}>
          {entry.name}: <span className="font-medium">{entry.value}</span>
        </p>
      ))}
    </div>
  )
}

export default function AnalyticsPage() {
  const [range, setRange] = useState<TimeRange>('7d')
  const { t } = useI18n()

  const { data: summary } = useQuery({
    queryKey: ['analytics', 'summary', range],
    queryFn: () => apiFetch<any>(`/api/analytics/summary?range=${range}`),
  })

  const { data: byPlatform = [] } = useQuery({
    queryKey: ['analytics', 'by-platform', range],
    queryFn: () => apiFetch<any[]>(`/api/analytics/by-platform?range=${range}`),
  })

  const { data: timeline = [] } = useQuery({
    queryKey: ['analytics', 'timeline', range],
    queryFn: () => apiFetch<any[]>(`/api/analytics/timeline?range=${range}`),
  })

  const { data: byModel = [] } = useQuery({
    queryKey: ['analytics', 'by-model', range],
    queryFn: () => apiFetch<any[]>(`/api/analytics/by-model?range=${range}`),
  })

  const { data: errors = [] } = useQuery({
    queryKey: ['analytics', 'errors', range],
    queryFn: () => apiFetch<any[]>(`/api/analytics/errors?range=${range}`),
  })

  const { data: errorDist } = useQuery({
    queryKey: ['analytics', 'error-distribution', range],
    queryFn: () => apiFetch<{ byCategory: any[]; byPlatform: any[]; detailed: any[] }>(`/api/analytics/error-distribution?range=${range}`),
  })

  return (
    <div>
      <PageHeader
        titleKey="analytics.title"
        descKey="analytics.desc"
        actions={
          <div className="flex gap-0.5 rounded-lg border border-border/50 p-0.5 bg-muted/30">
            {(['24h', '7d', '30d'] as TimeRange[]).map(r => (
              <Button
                key={r}
                variant={range === r ? 'secondary' : 'ghost'}
                size="xs"
                onClick={() => setRange(r)}
                className={range === r ? 'shadow-sm' : ''}
              >
                {t(`analytics.${r}`)}
              </Button>
            ))}
          </div>
        }
      />

      <div className="space-y-5">
        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Stat label={t('analytics.requests')} value={summary?.totalRequests ?? 0} />
          <Stat label={t('analytics.successRate')} value={`${summary?.successRate ?? 0}%`} />
          <Stat label={t('analytics.inputTokens')} value={formatTokens(summary?.totalInputTokens)} />
          <Stat label={t('analytics.outputTokens')} value={formatTokens(summary?.totalOutputTokens)} />
          <Stat label={t('analytics.avgLatency')} value={`${summary?.avgLatencyMs ?? 0} ms`} />
          <Stat label={t('analytics.estSavings')} value={`$${summary?.estimatedCostSavings ?? '0.00'}`} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* 请求量统计 */}
          <Panel title={t('analytics.requestsByProvider')}>
            {byPlatform.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t("analytics.noData")}</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byPlatform} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradPrimary" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={colors.primary} stopOpacity={0.9} />
                      <stop offset="100%" stopColor={colors.primary} stopOpacity={0.5} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 6" stroke={gridStyle} strokeOpacity={0.5} />
                  <XAxis dataKey="platform" tick={axisStyle} tickLine={false} axisLine={{ stroke: gridStyle, strokeOpacity: 0.5 }} />
                  <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.3, radius: 4 }} />
                  <Bar dataKey="requests" name={t('analytics.requests')} fill="url(#gradPrimary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Panel>

          {/* 延迟统计 */}
          <Panel title={t('analytics.latencyByProvider')}>
            {byPlatform.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t("analytics.noData")}</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byPlatform} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradSecondary" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={colors.secondary} stopOpacity={0.8} />
                      <stop offset="100%" stopColor={colors.secondary} stopOpacity={0.4} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 6" stroke={gridStyle} strokeOpacity={0.5} />
                  <XAxis dataKey="platform" tick={axisStyle} tickLine={false} axisLine={{ stroke: gridStyle, strokeOpacity: 0.5 }} />
                  <YAxis unit="ms" tick={axisStyle} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.3, radius: 4 }} />
                  <Bar dataKey="avgLatencyMs" name={t('analytics.latency')} fill="url(#gradSecondary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Panel>

          {/* 请求趋势 - 使用面积图 */}
          <div className="lg:col-span-2">
            <Panel title={t('analytics.requestsOverTime')}>
              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">{t("analytics.noData")}</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={timeline} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradSuccess" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={colors.success} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={colors.success} stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="gradDanger" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={colors.danger} stopOpacity={0.2} />
                        <stop offset="100%" stopColor={colors.danger} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 6" stroke={gridStyle} strokeOpacity={0.5} />
                    <XAxis dataKey="timestamp" tick={axisStyle} tickLine={false} axisLine={{ stroke: gridStyle, strokeOpacity: 0.5 }} />
                    <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3", strokeOpacity: 0.5 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
                    <Area type="monotone" dataKey="successCount" name={t('analytics.success')} stroke={colors.success} strokeWidth={2} fill="url(#gradSuccess)" dot={false} />
                    <Area type="monotone" dataKey="failureCount" name={t('analytics.failures')} stroke={colors.danger} strokeWidth={2} fill="url(#gradDanger)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </Panel>
          </div>

          {/* 模型统计表格 */}
          <div className="lg:col-span-2">
            <Panel title={t('analytics.perModel')}>
              {byModel.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">{t("analytics.noData")}</p>
              ) : (
                <div className="max-h-[360px] overflow-y-auto -mx-5">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="pl-5">{t('analytics.table.model')}</TableHead>
                        <TableHead>{t('analytics.table.provider')}</TableHead>
                        <TableHead className="text-right">{t('analytics.table.requests')}</TableHead>
                        <TableHead className="text-right">{t('analytics.table.success')}</TableHead>
                        <TableHead className="text-right">{t('analytics.table.latency')}</TableHead>
                        <TableHead className="text-right">{t('analytics.table.inTokens')}</TableHead>
                        <TableHead className="text-right pr-5">{t('analytics.table.outTokens')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {byModel.map((m: any, i: number) => (
                        <TableRow key={i} className="hover:bg-muted/30">
                          <TableCell className="pl-5 text-sm font-medium">{m.displayName}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{m.platform}</TableCell>
                          <TableCell className="text-right tabular-nums">{m.requests}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span className={m.successRate >= 90 ? 'text-green-600 dark:text-green-400' : m.successRate >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}>
                              {m.successRate}%
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{m.avgLatencyMs} ms</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{formatTokens(m.totalInputTokens)}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground pr-5">{formatTokens(m.totalOutputTokens)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Panel>
          </div>

          {/* 错误分布 */}
          <Panel title={t('analytics.errorsByProvider')}>
            {!errorDist?.byPlatform?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t("analytics.noErrors")}</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={errorDist.byPlatform} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradDangerBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={colors.dangerLight} stopOpacity={0.8} />
                      <stop offset="100%" stopColor={colors.danger} stopOpacity={0.5} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 6" stroke={gridStyle} strokeOpacity={0.5} />
                  <XAxis dataKey="platform" tick={axisStyle} tickLine={false} axisLine={{ stroke: gridStyle, strokeOpacity: 0.5 }} />
                  <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.3, radius: 4 }} />
                  <Bar dataKey="count" name={t('analytics.errors')} fill="url(#gradDangerBar)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Panel>

          {/* 最近错误 */}
          <Panel title={t('analytics.recentErrors')}>
            {errors.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t("analytics.noErrors")}</p>
            ) : (
              <div className="max-h-[220px] overflow-y-auto -mx-5">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-5">{t('analytics.table.provider')}</TableHead>
                      <TableHead>{t('analytics.table.message')}</TableHead>
                      <TableHead className="text-right pr-5">{t('analytics.table.time')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {errors.slice(0, 20).map((e: any) => (
                      <TableRow key={e.id} className="hover:bg-muted/30">
                        <TableCell className="pl-5 text-xs">{e.platform}</TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate text-red-600/80 dark:text-red-400/80">{e.error}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground tabular-nums pr-5">
                          {formatSqliteUtcToLocalTime(e.createdAt, { hour: '2-digit', minute: '2-digit' })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
