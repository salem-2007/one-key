import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type {
  DiagnosticSeverity,
  LogEntry,
  LogErrorCategory,
  LogsDiagnosticsResponse,
  ProviderRanking,
} from '../../../shared/types'

type TimeRange = '24h' | '7d' | '30d'
type StatusFilter = 'all' | 'success' | 'error'

const categoryLabels: Record<LogErrorCategory, string> = {
  zero_quota: '零配额',
  rate_limit: '限流',
  auth: '认证',
  forbidden: '禁止访问',
  not_found: '模型缺失',
  timeout: '超时',
  provider: '提供者',
  routing: '路由',
  other: '其他',
}

const severityClass: Record<DiagnosticSeverity, string> = {
  critical: 'text-destructive bg-destructive/10 border-destructive/20',
  warning: 'text-amber-600 dark:text-amber-300 bg-amber-500/10 border-amber-500/20',
  info: 'text-muted-foreground bg-muted border-border',
}

const providerStatusClass: Record<ProviderRanking['status'], string> = {
  excellent: 'text-emerald-600 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
  good: 'text-sky-600 dark:text-sky-300 bg-sky-500/10 border-sky-500/20',
  degraded: 'text-amber-600 dark:text-amber-300 bg-amber-500/10 border-amber-500/20',
  blocked: 'text-destructive bg-destructive/10 border-destructive/20',
  idle: 'text-muted-foreground bg-muted border-border',
}

const statusLabels: Record<StatusFilter, string> = {
  all: '全部',
  success: '成功',
  error: '错误',
}

function formatTokens(n?: number): string {
  if (!n) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatTime(value: string): string {
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString([], {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3 min-w-0">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wider truncate">{label}</p>
      <p className="text-xl font-semibold tabular-nums mt-1 truncate">{value}</p>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b">
        <h2 className="text-sm font-medium">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

function SeverityBadge({ severity }: { severity: DiagnosticSeverity }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium capitalize ${severityClass[severity]}`}>
      {severity}
    </span>
  )
}

function ProviderStatusBadge({ status }: { status: ProviderRanking['status'] }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium capitalize ${providerStatusClass[status]}`}>
      {status}
    </span>
  )
}

function buildLogsPath(range: TimeRange, status: StatusFilter, platform: string): string {
  const params = new URLSearchParams({ range, status, limit: '150' })
  if (platform !== 'all') params.set('platform', platform)
  return `/api/logs?${params.toString()}`
}

export default function LogsPage() {
  const [range, setRange] = useState<TimeRange>('24h')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [platform, setPlatform] = useState('all')

  const { data, isLoading, refetch, isFetching } = useQuery<LogsDiagnosticsResponse>({
    queryKey: ['logs', range, status, platform],
    queryFn: () => apiFetch(buildLogsPath(range, status, platform)),
  })

  const platforms = useMemo(() => {
    const names = new Set<string>()
    data?.rankings.forEach(row => names.add(String(row.platform)))
    data?.recent.forEach(row => names.add(String(row.platform)))
    if (platform !== 'all') names.add(platform)
    return Array.from(names).sort()
  }, [data, platform])

  const summary = data?.summary
  const rankings = data?.rankings ?? []
  const flags = data?.flags ?? []
  const recent = data?.recent ?? []

  return (
    <div>
      <PageHeader
        title="使用日志"
        description="诊断信息、平台排名和最近的 API 事件。"
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex gap-1 rounded-md border p-0.5">
              {(['24h', '7d', '30d'] as TimeRange[]).map(item => (
                <Button
                  key={item}
                  variant={range === item ? 'secondary' : 'ghost'}
                  size="xs"
                  onClick={() => setRange(item)}
                >
                  {item}
                </Button>
              ))}
            </div>
            <Select value={status} onValueChange={(value) => setStatus((value ?? 'all') as StatusFilter)}>
              <SelectTrigger size="sm" className="w-[112px]">
                <span>{statusLabels[status]}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="success">成功</SelectItem>
                <SelectItem value="error">错误</SelectItem>
              </SelectContent>
            </Select>
            <Select value={platform} onValueChange={(value) => setPlatform(value ?? 'all')}>
              <SelectTrigger size="sm" className="w-[152px]">
                <span className="truncate">{platform === 'all' ? '全部提供者' : platform}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有平台</SelectItem>
                {platforms.map(name => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon-sm" onClick={() => refetch()} disabled={isFetching} aria-label="Refresh logs">
              <RefreshCw className={isFetching ? 'animate-spin' : ''} />
            </Button>
          </div>
        }
      />

      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Stat label="请求数" value={summary?.totalRequests ?? 0} />
          <Stat label="成功率" value={`${summary?.successRate ?? 0}%`} />
          <Stat label="错误数" value={summary?.errorCount ?? 0} />
          <Stat label="延迟" value={`${summary?.avgLatencyMs ?? 0} ms`} />
          <Stat label="提供者" value={summary?.activeProviders ?? 0} />
          <Stat label="Token 数" value={formatTokens(summary?.totalTokens)} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_0.75fr] gap-6">
          <Panel title="平台排名">
            {isLoading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">加载中...</p>
            ) : rankings.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">此筛选条件下无请求数据。</p>
            ) : (
              <div className="-mx-4 max-h-[420px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4 w-12">排名</TableHead>
                      <TableHead>提供者</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead className="text-right">评分</TableHead>
                      <TableHead className="text-right">请求数</TableHead>
                      <TableHead className="text-right">成功</TableHead>
                      <TableHead className="text-right">延迟</TableHead>
                      <TableHead className="text-right pr-4">密钥</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rankings.map(row => (
                      <TableRow key={row.platform}>
                        <TableCell className="pl-4 text-xs tabular-nums text-muted-foreground">#{row.rank}</TableCell>
                        <TableCell>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{row.platform}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {row.topFlag ? categoryLabels[row.topFlag] : '无标记'}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell><ProviderStatusBadge status={row.status} /></TableCell>
                        <TableCell className="text-right tabular-nums">{row.score}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.requests}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.successRate}%</TableCell>
                        <TableCell className="text-right tabular-nums">{row.avgLatencyMs} ms</TableCell>
                        <TableCell className="text-right tabular-nums pr-4">
                          {row.healthyKeys}/{row.keyCount}
                          {row.invalidKeys > 0 && <span className="text-destructive ml-1">+{row.invalidKeys}</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Panel>

          <Panel title="诊断标记">
            {flags.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">此筛选条件下无标记数据。</p>
            ) : (
              <div className="space-y-3">
                {flags.slice(0, 8).map(flag => (
                  <div key={flag.id} className="border-b last:border-b-0 pb-3 last:pb-0">
                    <div className="flex items-center gap-2">
                      <SeverityBadge severity={flag.severity} />
                      <Badge variant="outline">{categoryLabels[flag.category]}</Badge>
                      <span className="ml-auto text-xs tabular-nums text-muted-foreground">{flag.count}</span>
                    </div>
                    <p className="mt-2 text-sm font-medium">{flag.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{flag.platform}{flag.modelId ? ` / ${flag.modelId}` : ''}</p>
                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{flag.recommendation}</p>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <Panel title="最近日志">
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">此筛选条件下无日志。</p>
          ) : (
            <div className="-mx-4 max-h-[520px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">时间</TableHead>
                    <TableHead>提供者</TableHead>
                    <TableHead>模型</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>标记</TableHead>
                    <TableHead className="text-right">延迟</TableHead>
                    <TableHead className="text-right">Token 数</TableHead>
                    <TableHead className="pr-4">消息</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recent.map((entry: LogEntry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="pl-4 text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                        {formatTime(entry.createdAt)}
                      </TableCell>
                      <TableCell className="text-xs font-medium">{entry.platform}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">{entry.modelId}</TableCell>
                      <TableCell>
                        <Badge variant={entry.status === 'success' ? 'secondary' : 'destructive'}>
                          {entry.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {entry.errorCategory ? (
                          <Badge variant="outline">{categoryLabels[entry.errorCategory]}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{entry.latencyMs} ms</TableCell>
                      <TableCell className="text-right tabular-nums">{formatTokens(entry.inputTokens + entry.outputTokens)}</TableCell>
                      <TableCell className="pr-4 text-xs max-w-[340px]">
                        <div className="truncate" title={entry.error ?? entry.suggestion}>
                          {entry.error ?? entry.suggestion}
                        </div>
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
  )
}
