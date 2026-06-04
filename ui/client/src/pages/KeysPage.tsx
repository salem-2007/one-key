import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/page-header'
import { ProviderHelperLinks } from '@/components/provider-helper-links'
import { Info, Plus, Trash2, TestTube, Check, X, Server } from 'lucide-react'
import type { ApiKey, Platform, ProviderMetadata, ProvidersResponse } from '../../../shared/types'

const FALLBACK_PROVIDERS: ProviderMetadata[] = [
  { platform: 'google', displayName: 'Google AI Studio', docsUrl: '', apiBaseUrl: '', requiresKey: true },
  { platform: 'groq', displayName: 'Groq', docsUrl: '', apiBaseUrl: '', requiresKey: true },
  { platform: 'cerebras', displayName: 'Cerebras', docsUrl: '', apiBaseUrl: '', requiresKey: true },
  { platform: 'sambanova', displayName: 'SambaNova', docsUrl: '', apiBaseUrl: '', requiresKey: true },
  { platform: 'nvidia', displayName: 'NVIDIA NIM', docsUrl: '', apiBaseUrl: '', requiresKey: true },
  { platform: 'mistral', displayName: 'Mistral', docsUrl: '', apiBaseUrl: '', requiresKey: true },
  { platform: 'openrouter', displayName: 'OpenRouter', docsUrl: '', apiBaseUrl: '', requiresKey: true },
  { platform: 'github', displayName: 'GitHub Models', docsUrl: '', apiBaseUrl: '', requiresKey: true },
  { platform: 'cohere', displayName: 'Cohere', docsUrl: '', apiBaseUrl: '', requiresKey: true },
  { platform: 'cloudflare', displayName: 'Cloudflare Workers AI', docsUrl: '', apiBaseUrl: '', requiresKey: true },
  { platform: 'zhipu', displayName: 'Zhipu AI', docsUrl: '', apiBaseUrl: '', requiresKey: true },
  { platform: 'ollama', displayName: 'Ollama Cloud', docsUrl: '', apiBaseUrl: '', requiresKey: true },
  { platform: 'kilo', displayName: 'Kilo Gateway', docsUrl: '', apiBaseUrl: '', requiresKey: false },
  { platform: 'pollinations', displayName: 'Pollinations', docsUrl: '', apiBaseUrl: '', requiresKey: false },
  { platform: 'llm7', displayName: 'LLM7', docsUrl: '', apiBaseUrl: '', requiresKey: false },
]

const statusDot: Record<string, string> = {
  healthy: 'bg-emerald-500',
  rate_limited: 'bg-amber-500',
  invalid: 'bg-rose-500',
  error: 'bg-rose-500',
  unknown: 'bg-muted-foreground/40',
}

const statusLabel: Record<string, string> = {
  healthy: '正常',
  rate_limited: '限流',
  invalid: '无效',
  error: '错误',
  unknown: '未检测',
}

// 自定义 API 接口管理
interface CustomEndpoint {
  id: number
  name: string
  baseUrl: string
  maskedKey: string
  models: string[]
  enabled: boolean
  status: 'idle' | 'testing' | 'ok' | 'error'
  lastError?: string
}

function CustomEndpointSection() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', baseUrl: '', apiKey: '', models: '' })

  const { data: endpoints = [], isLoading } = useQuery<CustomEndpoint[]>({
    queryKey: ['custom-endpoints'],
    queryFn: () => apiFetch('/api/custom-endpoints'),
  })

  const addEndpoint = useMutation({
    mutationFn: (body: { name: string; baseUrl: string; apiKey: string; models?: string[] }) =>
      apiFetch('/api/custom-endpoints', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-endpoints'] })
      setForm({ name: '', baseUrl: '', apiKey: '', models: '' })
      setShowForm(false)
    },
  })

  const deleteEndpoint = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/custom-endpoints/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['custom-endpoints'] }),
  })

  const toggleEndpoint = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      apiFetch(`/api/custom-endpoints/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['custom-endpoints'] }),
  })

  const testEndpoint = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/custom-endpoints/${id}/test`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['custom-endpoints'] }),
  })

  const fetchModels = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/custom-endpoints/${id}/fetch-models`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['custom-endpoints'] }),
  })

  const statusIcon = (s: CustomEndpoint['status']) => {
    if (s === 'testing') return <div className="w-3 h-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
    if (s === 'ok') return <Check size={12} className="text-emerald-500" />
    if (s === 'error') return <X size={12} className="text-red-500" />
    return <div className="w-3 h-3 rounded-full bg-muted-foreground/30" />
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.baseUrl || !form.apiKey) return
    const models = form.models.split(',').map(m => m.trim()).filter(Boolean)
    addEndpoint.mutate({
      name: form.name,
      baseUrl: form.baseUrl,
      apiKey: form.apiKey,
      models: models.length > 0 ? models : undefined,
    })
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Server size={16} className="text-muted-foreground" />
          <h2 className="text-sm font-medium">自定义 API 接口</h2>
          <span className="text-xs text-muted-foreground">添加 OpenAI 兼容的第三方端点</span>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus size={14} className="mr-1" />
          {showForm ? '取消' : '添加接口'}
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-lg border p-4 bg-card mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">接口名称</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="如：本地 Ollama、vLLM 等"
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Base URL</Label>
              <Input
                value={form.baseUrl}
                onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))}
                placeholder="https://api.example.com/v1"
                className="font-mono text-xs"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">API Key</Label>
              <Input
                type="password"
                value={form.apiKey}
                onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                placeholder="sk-..."
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">模型列表（逗号分隔，可选）</Label>
              <Input
                value={form.models}
                onChange={e => setForm(f => ({ ...f, models: e.target.value }))}
                placeholder="gpt-4, gpt-3.5-turbo"
                className="font-mono text-xs"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" type="button" onClick={() => setShowForm(false)}>取消</Button>
            <Button size="sm" type="submit" disabled={!form.name || !form.baseUrl || !form.apiKey || addEndpoint.isPending}>
              <Plus size={14} className="mr-1" />{addEndpoint.isPending ? '添加中...' : '添加'}
            </Button>
          </div>
        </form>
      )}

      {addEndpoint.isError && (
        <p className="text-destructive text-xs mt-2 mb-2">{(addEndpoint.error as Error).message}</p>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">加载中...</p>
      ) : endpoints.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <Server size={24} className="mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">暂无自定义接口</p>
          <p className="text-xs text-muted-foreground mt-1">支持 OpenAI 兼容的任意 API 端点（Ollama、vLLM、LiteLLM 等）</p>
        </div>
      ) : (
        <div className="space-y-2">
          {endpoints.map(ep => (
            <div key={ep.id} className={`rounded-lg border p-4 bg-card transition-all ${!ep.enabled ? 'opacity-50' : ''}`}>
              <div className="flex items-center gap-3">
                {statusIcon(ep.status)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{ep.name}</span>
                    {!ep.enabled && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">已禁用</span>}
                    {ep.status === 'error' && ep.lastError && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-500">{ep.lastError}</span>
                    )}
                  </div>
                  <code className="text-xs text-muted-foreground font-mono">{ep.baseUrl}</code>
                  {ep.models.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {ep.models.map(m => (
                        <span key={m} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{m}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="xs" onClick={() => testEndpoint.mutate(ep.id)} disabled={testEndpoint.isPending}>
                    <TestTube size={12} className="mr-1" />测试
                  </Button>
                  <Button variant="ghost" size="xs" onClick={() => fetchModels.mutate(ep.id)} disabled={fetchModels.isPending}>
                    刷新模型
                  </Button>
                  <Button variant="ghost" size="xs" onClick={() => toggleEndpoint.mutate({ id: ep.id, enabled: !ep.enabled })}>
                    {ep.enabled ? '禁用' : '启用'}
                  </Button>
                  <Button variant="ghost" size="xs" className="text-muted-foreground hover:text-destructive" onClick={() => deleteEndpoint.mutate(ep.id)}>
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

interface HealthPlatform {
  platform: string
  totalKeys: number
  healthyKeys: number
  rateLimitedKeys: number
  invalidKeys: number
  errorKeys: number
  unknownKeys: number
}

interface HealthData {
  platforms: HealthPlatform[]
  keys: { id: number; platform: string; status: string; lastCheckedAt: string | null }[]
}

function UnifiedKeySection() {
  const queryClient = useQueryClient()
  const [showKey, setShowKey] = useState(false)
  const [copied, setCopied] = useState(false)

  const { data } = useQuery<{ apiKey: string }>({
    queryKey: ['unified-key'],
    queryFn: () => apiFetch('/api/settings/api-key'),
  })

  const regenerate = useMutation({
    mutationFn: () => apiFetch('/api/settings/api-key/regenerate', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['unified-key'] }),
  })

  const apiKey = data?.apiKey ?? ''
  const masked = apiKey ? apiKey.slice(0, 13) + '•'.repeat(32) : '…'
  const baseUrl = import.meta.env.DEV
    ? `http://${window.location.hostname}:${import.meta.env.VITE_SERVER_PORT}/v1`
    : `${window.location.origin}/v1`

  function copy() {
    navigator.clipboard.writeText(apiKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <section className="rounded-lg border bg-card p-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h2 className="text-sm font-medium">统一 API 令牌</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            使用此令牌作为 OpenAI <code className="font-mono">api_key</code>；它将验证到此代理的请求。
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => regenerate.mutate()}
          disabled={regenerate.isPending}
        >
          重新生成
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <code className="flex-1 font-mono text-xs bg-muted px-3 py-2 rounded-md select-all truncate tabular-nums">
          {showKey ? apiKey : masked}
        </code>
        <Button variant="outline" size="sm" onClick={() => setShowKey(!showKey)}>
          {showKey ? '隐藏' : '显示'}
        </Button>
        <Button variant="outline" size="sm" onClick={copy}>
          {copied ? '已复制' : '复制'}
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
        <span className="text-muted-foreground">Base URL</span>
        <code className="font-mono">{baseUrl}</code>
        <span className="text-muted-foreground">端点</span>
        <code className="font-mono">/v1/chat/completions</code>
      </div>
    </section>
  )
}

export default function KeysPage() {
  const queryClient = useQueryClient()
  const [platform, setPlatform] = useState<Platform | ''>('')
  const [apiKey, setApiKey] = useState('')
  const [accountId, setAccountId] = useState('')
  const [label, setLabel] = useState('')

  const { data: keys = [], isLoading } = useQuery<ApiKey[]>({
    queryKey: ['keys'],
    queryFn: () => apiFetch('/api/keys'),
  })

  const { data: providersData } = useQuery<ProvidersResponse>({
    queryKey: ['models', 'providers'],
    queryFn: () => apiFetch('/api/models/providers'),
  })

  const { data: healthData } = useQuery<HealthData>({
    queryKey: ['health'],
    queryFn: () => apiFetch('/api/health'),
    refetchInterval: 30000,
  })

  const addKey = useMutation({
    mutationFn: (body: { platform: string; key: string; label?: string }) =>
      apiFetch('/api/keys', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keys'] })
      queryClient.invalidateQueries({ queryKey: ['health'] })
      queryClient.invalidateQueries({ queryKey: ['fallback'] })
      setPlatform('')
      setApiKey('')
      setAccountId('')
      setLabel('')
    },
  })

  const deleteKey = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/keys/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keys'] })
      queryClient.invalidateQueries({ queryKey: ['health'] })
    },
  })

  const checkAll = useMutation({
    mutationFn: () => apiFetch('/api/health/check-all', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health'] })
      queryClient.invalidateQueries({ queryKey: ['keys'] })
    },
  })

  const checkKey = useMutation({
    mutationFn: (keyId: number) => apiFetch(`/api/health/check/${keyId}`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health'] })
      queryClient.invalidateQueries({ queryKey: ['keys'] })
    },
  })

  const needsAccountId = platform === 'cloudflare'

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!platform || !apiKey) return
    if (needsAccountId && !accountId) return
    const key = needsAccountId ? `${accountId}:${apiKey}` : apiKey
    addKey.mutate({ platform, key, label: label || undefined })
  }

  const healthKeyMap = new Map<number, { status: string; lastCheckedAt: string | null }>()
  for (const k of healthData?.keys ?? []) healthKeyMap.set(k.id, k)

  const providers = providersData?.providers ?? FALLBACK_PROVIDERS
  const selectedProvider = platform ? providers.find(p => p.platform === platform) : undefined

  const grouped = providers.map(p => ({
    ...p,
    keys: keys.filter(k => k.platform === p.platform),
  })).filter(p => p.keys.length > 0)

  return (
    <div>
      <PageHeader
        title="令牌管理"
        description="平台凭据和应用连接使用的统一 API 令牌。"
        actions={
          keys.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => checkAll.mutate()} disabled={checkAll.isPending}>
              {checkAll.isPending ? '检测中...' : '检测全部'}
            </Button>
          )
        }
      />

      <div className="space-y-8">
        <UnifiedKeySection />

        <section>
          <h2 className="text-sm font-medium mb-3">添加提供者密钥</h2>
          <div className="mb-3 flex items-start gap-2 rounded-lg border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 flex-shrink-0 text-foreground/70" aria-hidden="true" />
            <p>
              为获得更高可用配额，请从不同的提供者账户或项目添加密钥。同一账户的密钥可能仍会共享提供者端的限制，即使此代理会分别轮换和跟踪它们。
            </p>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 rounded-lg border p-4 bg-card">
            <div className="space-y-1.5">
              <Label className="text-xs">平台</Label>
              <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="选择提供者" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map(p => (
                    <SelectItem key={p.platform} value={p.platform}>{p.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedProvider && (
                <ProviderHelperLinks provider={selectedProvider} className="mt-1" />
              )}
            </div>
            {needsAccountId && (
              <div className="space-y-1.5">
                <Label className="text-xs">账户 ID</Label>
                <Input
                  value={accountId}
                  onChange={e => setAccountId(e.target.value)}
                  placeholder="a1b2c3d4…"
                  className="w-[200px] font-mono text-xs"
                />
              </div>
            )}
            <div className="space-y-1.5 flex-1 min-w-[240px]">
              <Label className="text-xs">{needsAccountId ? 'API 令牌' : 'API 密钥'}</Label>
              <Input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={needsAccountId ? 'Bearer token' : '粘贴密钥'}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">标签</Label>
              <Input
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="可选"
                className="w-[160px]"
              />
            </div>
            <Button type="submit" size="sm" disabled={!platform || !apiKey || (needsAccountId && !accountId) || addKey.isPending}>
              {addKey.isPending ? '添加中...' : '添加密钥'}
            </Button>
          </form>
          {addKey.isError && (
            <p className="text-destructive text-xs mt-2">{(addKey.error as Error).message}</p>
          )}
        </section>

        {/* 自定义 API 接口 */}
        <CustomEndpointSection />

        <section>
          <h2 className="text-sm font-medium mb-3">已配置的平台</h2>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">加载中...</p>
          ) : keys.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <p className="text-sm text-muted-foreground">
                暂无平台令牌，请在上方添加以开始路由。
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map(group => (
                <div key={group.platform}>
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-medium">{group.displayName}</h3>
                      <ProviderHelperLinks provider={group} className="mt-1" />
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {group.keys.length} 个密钥
                    </span>
                  </div>
                  <div className="rounded-lg border divide-y bg-card overflow-hidden">
                    {group.keys.map(k => {
                      const h = healthKeyMap.get(k.id)
                      const status = h?.status ?? k.status
                      const lastChecked = h?.lastCheckedAt
                      return (
                        <div key={k.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                          <span className={`size-1.5 rounded-full flex-shrink-0 ${statusDot[status] ?? statusDot.unknown}`} />
                          <code className="text-xs font-mono flex-shrink-0">{k.maskedKey}</code>
                          {k.label && <span className="text-xs text-muted-foreground">{k.label}</span>}
                          <span className="text-xs text-muted-foreground">{statusLabel[status] ?? status}</span>
                          <div className="flex-1" />
                          {lastChecked && (
                            <span className="text-[11px] text-muted-foreground tabular-nums">
                              {new Date(lastChecked).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                          <Button variant="ghost" size="xs" onClick={() => checkKey.mutate(k.id)} disabled={checkKey.isPending}>
                            检测
                          </Button>
                          <Button variant="ghost" size="xs" className="text-muted-foreground hover:text-destructive" onClick={() => deleteKey.mutate(k.id)} disabled={deleteKey.isPending}>
                            删除
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
