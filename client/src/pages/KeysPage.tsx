import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { PageHeader } from '@/components/page-header'
import type { ApiKey, Platform } from '../../../shared/types'
import { Pencil, ExternalLink } from 'lucide-react'
import { formatSqliteUtcToLocalTime } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'

// Small "Get API key" external link shown next to a provider (#137).
function GetKeyLink({ url }: { url: string }) {
  if (!url) return null
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      Get API key
      <ExternalLink className="size-3" />
    </a>
  )
}

// `url` points to each provider's key-management / signup page so the Keys page
// can show a "Get API key" shortcut (#137). OpenCode Zen's key is free from
// opencode.ai/auth — no card needed; billing only applies to paid models (#128).
// `keyless: true` providers (Kilo's anonymous free tier) need no API key — the
// form disables the key field and submits a sentinel the backend stores so
// routing treats the platform as configured.
// `custom: true` providers use a different form (Base URL + Model) and call /api/keys/custom.
function StatusDot({ status }: { status: string }) {
  const color = status === 'healthy' ? 'bg-green-500' : status === 'error' ? 'bg-red-500' : status === 'invalid' ? 'bg-orange-500' : 'bg-gray-400'
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
}

const PLATFORMS: { value: Platform; label: string; url: string; keyless?: boolean }[] = [
  { value: 'google', label: 'Google AI Studio', url: 'https://aistudio.google.com/apikey' },
  { value: 'groq', label: 'Groq', url: 'https://console.groq.com/keys' },
  { value: 'cerebras', label: 'Cerebras', url: 'https://cloud.cerebras.ai' },
  { value: 'sambanova', label: 'SambaNova', url: 'https://cloud.sambanova.ai' },
  { value: 'nvidia', label: 'NVIDIA NIM', url: 'https://build.nvidia.com/settings/api-keys' },
  { value: 'mistral', label: 'Mistral', url: 'https://console.mistral.ai/api-keys/' },
  { value: 'openrouter', label: 'OpenRouter', url: 'https://openrouter.ai/keys' },
  { value: 'github', label: 'GitHub Models', url: 'https://github.com/settings/tokens' },
  { value: 'cohere', label: 'Cohere', url: 'https://dashboard.cohere.com/api-keys' },
  { value: 'cloudflare', label: 'Cloudflare Workers AI', url: 'https://dash.cloudflare.com' },
  { value: 'zhipu', label: 'Zhipu AI (Z.ai)', url: 'https://z.ai/manage-apikey/apikey-list' },
  { value: 'ollama', label: 'Ollama Cloud', url: 'https://ollama.com/settings/keys' },
  { value: 'kilo', label: 'Kilo Gateway (no key needed)', url: 'https://app.kilo.ai', keyless: true },
  { value: 'pollinations', label: 'Pollinations (anon ok)', url: 'https://pollinations.ai' },
  { value: 'llm7', label: 'LLM7 (anon ok)', url: 'https://llm7.io' },
  { value: 'huggingface', label: 'HuggingFace Router', url: 'https://huggingface.co/settings/tokens' },
  { value: 'opencode', label: 'OpenCode Zen (free key)', url: 'https://opencode.ai/auth' },
]

// 'custom' is configured through its own form (base URL + model), not the
// generic key dropdown — but it still appears in the grouped provider list.
// CUSTOM_GROUP is defined inside KeysPage so the i18n `t()` function is in scope.

const statusDot: Record<string, string> = {
  healthy: 'bg-emerald-500',
  rate_limited: 'bg-amber-500',
  invalid: 'bg-rose-500',
  error: 'bg-rose-500',
  unknown: 'bg-muted-foreground/40',
}

const statusLabel: Record<string, string> = {
  healthy: 'healthy',
  rate_limited: 'rate-limited',
  invalid: 'invalid',
  error: 'error',
  unknown: 'unchecked',
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
  const { t } = useI18n()

  const { data, isError } = useQuery<{ apiKey: string }>({
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
    ? `http://${window.location.hostname}:${__SERVER_PORT__}/v1`
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
          <h2 className="text-sm font-medium">{t('keys.unifiedKey')}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('keys.unifiedKeyDesc')}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => regenerate.mutate()}
          disabled={regenerate.isPending || isError}
        >
          {t('keys.regenerate')}
        </Button>
      </div>

      {isError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
          Can't reach the server on <code className="font-mono">{baseUrl.replace('/v1', '')}</code>. Make sure the
          backend is running — <code className="font-mono">npm run dev</code> starts both, and the server logs print
          under the <code className="font-mono">server</code> prefix.
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <code className="flex-1 font-mono text-xs bg-muted px-3 py-2 rounded-md select-all truncate tabular-nums">
            {showKey ? apiKey : masked}
          </code>
          <Button variant="outline" size="sm" onClick={() => setShowKey(!showKey)}>
            {showKey ? t('keys.hide') : t('keys.show')}
          </Button>
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? t('keys.copied') : t('keys.copy')}
          </Button>
        </div>
      )}

      <div className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
        <span className="text-muted-foreground">{t('keys.baseurl')}</span>
        <code className="font-mono">{baseUrl}</code>
        <span className="text-muted-foreground">{t('keys.endpoint')}</span>
        <code className="font-mono">/v1/chat/completions</code>
      </div>
    </section>
  )
}

export default function KeysPage() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [platform, setPlatform] = useState<Platform | 'custom' | ''>('')
  const [apiKey, setApiKey] = useState('')
  const [accountId, setAccountId] = useState('')
  const [label, setLabel] = useState('')
  const [editingKeyId, setEditingKeyId] = useState<number | null>(null)
  const [editingLabel, setEditingLabel] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  // Custom provider fields
  const [customProviderName, setCustomProviderName] = useState('')
  const [customBaseUrl, setCustomBaseUrl] = useState('')

  const [customApiKey, setCustomApiKey] = useState('')

  const { data: keys = [], isLoading } = useQuery<ApiKey[]>({
    queryKey: ['keys'],
    queryFn: () => apiFetch('/api/keys'),
  })

  const { data: healthData } = useQuery<HealthData>({
    queryKey: ['health'],
    queryFn: () => apiFetch('/api/health/all'),
    refetchInterval: 30_000,
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

  const addCustom = useMutation({
    mutationFn: (body: { baseUrl: string; apiKey?: string; label: string }) =>
      apiFetch('/api/keys/custom', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keys'] })
      queryClient.invalidateQueries({ queryKey: ['health'] })
      queryClient.invalidateQueries({ queryKey: ['fallback'] })
      queryClient.invalidateQueries({ queryKey: ['models'] })
      setCustomProviderName('')
      setCustomBaseUrl('')
      setCustomApiKey('')
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
  const checkPlatformAll = useMutation({
    mutationFn: (platform: string) => apiFetch(`/api/health/check-platform/${platform}`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health'] })
      queryClient.invalidateQueries({ queryKey: ['keys'] })
    },
  })

  const togglePlatform = useMutation({
    mutationFn: ({ platform, enabled }: { platform: string; enabled: boolean }) =>
      apiFetch(`/api/keys/platform/${platform}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keys'] })
      queryClient.invalidateQueries({ queryKey: ['health'] })
      queryClient.invalidateQueries({ queryKey: ['fallback'] })
    },
  })

  const updateKey = useMutation({
    mutationFn: ({ id, label }: { id: number; label: string }) =>
      apiFetch(`/api/keys/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ label }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keys'] })
      setEditingKeyId(null)
      setEditingLabel('')
    },
  })

  function startEditing(key: ApiKey) {
    setEditingKeyId(key.id)
    setEditingLabel(key.label)
  }

  function cancelEditing() {
    setEditingKeyId(null)
    setEditingLabel('')
  }

  function saveEditing(id: number) {
    if (editingLabel !== undefined) {
      updateKey.mutate({ id, label: editingLabel })
    }
  }

  useEffect(() => {
    if (editingKeyId !== null && editInputRef.current) {
      editInputRef.current.focus()
    }
  }, [editingKeyId])

  const needsAccountId = platform === 'cloudflare'
  const isKeyless = PLATFORMS.find(p => p.value === platform)?.keyless ?? false

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!platform) return
    if (!isKeyless && !apiKey) return
    if (needsAccountId && !accountId) return
    const key = isKeyless ? '' : (needsAccountId ? `${accountId}:${apiKey}` : apiKey)
    addKey.mutate({ platform, key, label: label || undefined })
  }

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!customProviderName || !customBaseUrl) return
    addCustom.mutate({
      baseUrl: customBaseUrl,
      apiKey: customApiKey || undefined,
      label: customProviderName,
    })
  }

  const healthKeyMap = new Map<number, { status: string; lastCheckedAt: string | null }>()
  for (const k of healthData?.keys ?? []) healthKeyMap.set(k.id, k)

  // Group keys by platform
  const standardPlatforms = PLATFORMS.map(p => ({ ...p, value: p.value as string }))
  const customPlatforms = keys
    .filter(k => k.platform.startsWith('custom_'))
    .reduce((acc, k) => {
      if (!acc.find(p => p.value === k.platform)) {
        acc.push({ value: k.platform, label: k.label || k.platform, keys: [] });
      }
      return acc;
    }, [] as { value: string; label: string; keys: any[] }[])
  
  const allPlatforms = [...standardPlatforms, ...customPlatforms]
  const grouped = allPlatforms.map(p => ({
    ...p,
    keys: keys.filter(k => k.platform === p.value),
  })).filter(p => p.keys.length > 0)

  return (
    <div>
      <PageHeader
        titleKey="keys.title"
        descKey="keys.desc"
        actions={
          keys.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => checkAll.mutate()} disabled={checkAll.isPending}>
              {checkAll.isPending ? t('keys.checking') : t('keys.checkall')}
            </Button>
          )
        }
      />

      <div className="space-y-8">
        <UnifiedKeySection />

        <section>
          <h2 className="text-sm font-medium mb-3">{t('keys.addProviderKey')}</h2>
          <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 rounded-lg border p-4 bg-card">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('keys.platform')}</Label>
              <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder={t('keys.selectProvider')} />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(() => {
                const sel = PLATFORMS.find(p => p.value === platform)
                return sel?.url ? <div className="pt-0.5"><GetKeyLink url={sel.url} /></div> : null
              })()}
            </div>

            {needsAccountId && (
              <div className="space-y-1.5">
                <Label className="text-xs">Account ID</Label>
                <Input
                  value={accountId}
                  onChange={e => setAccountId(e.target.value)}
                  placeholder="a1b2c3d4…"
                  className="w-[200px] font-mono text-xs"
                />
              </div>
            )}
            <div className="space-y-1.5 flex-1 min-w-[240px]">
                <Label className="text-xs">{needsAccountId ? t('keys.apiToken') : t('keys.key')}</Label>
                <Input
                  type="password"
                  value={isKeyless ? '' : apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder={isKeyless ? t('keys.noKeyNeeded') : (needsAccountId ? t('keys.bearerToken') : t('keys.pasteKey'))}
                  className="font-mono text-xs"
                  disabled={isKeyless}
                />
                {isKeyless && (
                  <p className="text-[11px] text-muted-foreground">
                    {t('keys.noKeyDesc')}
                  </p>
                )}
              </div>
            <div className="space-y-1.5">
                <Label className="text-xs">{t('keys.label')}</Label>
                <Input
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  placeholder={t('keys.optional')}
                  className="w-[160px]"
                />
              </div>

            <Button type="submit" size="sm" disabled={!platform || (!isKeyless && !apiKey) || (needsAccountId && !accountId) || addKey.isPending}>
              {addKey.isPending ? t('keys.adding') : isKeyless ? t('keys.enable') : t('keys.addkey')}
            </Button>
          </form>
          {addKey.isError && (
            <p className="text-destructive text-xs mt-2">{(addKey.error as Error).message}</p>
          )}
        </section>

        {/* Existing Keys */}
        {grouped.length > 0 && (
          <section>
            <h2 className="text-sm font-medium mb-3">{t('keys.existingKeys')}</h2>
            <div className="space-y-4">
              {grouped.map(g => (
                <div key={g.value} className="rounded-lg border p-4 bg-card">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium">{g.label}</h3>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={g.keys[0]?.enabled ?? true}
                        onCheckedChange={(enabled) => togglePlatform.mutate({ platform: g.value, enabled })}
                      />
                      <Button variant="outline" size="sm" onClick={() => checkPlatformAll.mutate(g.value)}>
                        {t('keys.check')}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {g.keys.map(k => {
                      const health = healthKeyMap.get(k.id)
                      const status = health?.status ?? k.status
                      return (
                        <div key={k.id} className="flex items-center gap-3 text-xs">
                          <StatusDot status={status} />
                          <span className="font-mono flex-1">{k.maskedKey}</span>
                          {k.label && <span className="text-muted-foreground">{k.label}</span>}
                          {health?.lastCheckedAt && (
                            <span className="text-muted-foreground">
                              {new Date(health.lastCheckedAt).toLocaleTimeString()}
                            </span>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => deleteKey.mutate(k.id)}>
                            {t('keys.delete')}
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Custom Provider Section */}
        <section>
          <h2 className="text-sm font-medium mb-3">添加自定义供应商</h2>
          <p className="text-xs text-muted-foreground mb-3">添加 OpenAI API 兼容的自定义供应商（如 Ollama、vLLM、One API 等）</p>
          <form onSubmit={handleCustomSubmit} className="flex flex-wrap items-end gap-3 rounded-lg border p-4 bg-card">
            <div className="space-y-1.5">
              <Label className="text-xs">供应商名称 <span className="text-destructive">*</span></Label>
              <Input
                value={customProviderName}
                onChange={e => setCustomProviderName(e.target.value)}
                placeholder="如：我的 Ollama"
                className="w-[180px]"
              />
            </div>
            <div className="space-y-1.5 flex-1 min-w-[240px]">
              <Label className="text-xs">Base URL <span className="text-destructive">*</span></Label>
              <Input
                value={customBaseUrl}
                onChange={e => setCustomBaseUrl(e.target.value)}
                placeholder="http://127.0.0.1:11434/v1"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5 flex-1 min-w-[240px]">
              <Label className="text-xs">API Key</Label>
              <Input
                type="password"
                value={customApiKey}
                onChange={e => setCustomApiKey(e.target.value)}
                placeholder="可选，本地服务可留空"
                className="font-mono text-xs"
              />
            </div>


            <Button type="submit" size="sm" disabled={!customProviderName || !customBaseUrl || addCustom.isPending}>
              {addCustom.isPending ? t('keys.adding') : '添加供应商'}
            </Button>
          </form>
          {addCustom.isError && (
            <p className="text-destructive text-xs mt-2">{(addCustom.error as Error).message}</p>
          )}
        </section>

      </div>
    </div>
  )
}
