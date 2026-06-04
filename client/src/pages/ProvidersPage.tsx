import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { PageHeader } from '@/components/page-header'
import type { ApiKey } from '../../../shared/types'
import { Trash2, Key, Eye, EyeOff, Loader2, List, ExternalLink } from 'lucide-react'
import { formatSqliteUtcToLocalTime } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'

const PLATFORM_META: Record<string, { name: string; url: string; color: string; icon: string }> = {
  openai: { name: 'OpenAI', url: 'https://platform.openai.com/api-keys', color: '#10a37f', icon: '🤖' },
  anthropic: { name: 'Anthropic', url: 'https://console.anthropic.com/', color: '#d4a574', icon: '🧠' },
  google: { name: 'Google', url: 'https://aistudio.google.com/apikey', color: '#4285f4', icon: '🔍' },
  mistral: { name: 'Mistral', url: 'https://console.mistral.ai/', color: '#ff7000', icon: '💨' },
  groq: { name: 'Groq', url: 'https://console.groq.com/keys', color: '#f55036', icon: '⚡' },
  deepseek: { name: 'DeepSeek', url: 'https://platform.deepseek.com/api_keys', color: '#0066ff', icon: '🔬' },
  openrouter: { name: 'OpenRouter', url: 'https://openrouter.ai/keys', color: '#6366f1', icon: '🔀' },
  cerebras: { name: 'Cerebras', url: 'https://cloud.cerebras.ai/', color: '#f97316', icon: '🧮' },
  zhipu: { name: '智谱', url: 'https://open.bigmodel.cn/', color: '#2d5dea', icon: '🇨🇳' },
  sambanova: { name: 'SambaNova', url: 'https://cloud.sambanova.ai/apis', color: '#00d4aa', icon: '🎵' },
  nvidia: { name: 'NVIDIA', url: 'https://integrate.api.nvidia.com/', color: '#76b900', icon: '💚' },
  cohere: { name: 'Cohere', url: 'https://dashboard.cohere.com/api-keys', color: '#39594d', icon: '🌿' },
  cloudflare: { name: 'Cloudflare', url: 'https://dash.cloudflare.com/', color: '#f48120', icon: '☁️' },
  github: { name: 'GitHub', url: 'https://github.com/settings/tokens', color: '#333', icon: '🐙' },
  ollama: { name: 'Ollama', url: 'https://ollama.com/', color: '#000', icon: '🦙' },
  llm7: { name: 'LLM7', url: 'https://llm7.io/', color: '#7c3aed', icon: '7️⃣' },
  pollinations: { name: 'Pollinations', url: 'https://pollinations.ai/', color: '#ec4899', icon: '🌸' },
  kilo: { name: 'Kilo', url: 'https://kilo.ai/', color: '#0ea5e9', icon: '💎' },
  custom: { name: 'Custom', url: '', color: '#888', icon: '⚙️' },
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; text: string; label: string }> = {
    healthy: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', label: '正常' },
    'rate-limited': { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400', label: '限流' },
    error: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', label: '异常' },
    unknown: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-500', label: '未知' },
  }
  const s = styles[status] ?? styles.unknown
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${s.bg} ${s.text}`}>
      <span className={`size-1.5 rounded-full ${status === 'healthy' ? 'bg-green-500' : status === 'error' ? 'bg-red-500' : status === 'rate-limited' ? 'bg-yellow-500' : 'bg-gray-400'}`} />
      {s.label}
    </span>
  )
}

export default function ProvidersPage() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null)
  const [modelsData, setModelsData] = useState<{ platform: string; models: string[]; count: number } | null>(null)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)

  const { data: keys = [], isLoading } = useQuery<ApiKey[]>({
    queryKey: ['keys'],
    queryFn: () => apiFetch('/api/keys'),
  })

  const { data: healthData } = useQuery({
    queryKey: ['health-all'],
    queryFn: () => apiFetch('/api/health/all'),
    refetchInterval: 30000,
  })

  const healthKeyMap = new Map<string, any>()
  if (healthData?.byKeyId) {
    for (const h of healthData.byKeyId) {
      healthKeyMap.set(h.keyId, h)
    }
  }

  const togglePlatform = useMutation({
    mutationFn: ({ platform, enabled }: { platform: string; enabled: boolean }) =>
      apiFetch(`/api/keys/platform/${platform}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['keys'] }),
  })

  const deleteKey = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/keys/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['keys'] }),
  })


  const fetchModels = async (keyId: number, platform: string) => {
    setModelsLoading(true)
    setModelsError(null)
    setModelsData(null)
    try {
      const data = await apiFetch(`/api/keys/${keyId}/fetch-models`, { method: 'POST' }) as any
      setModelsData({ platform, models: data.models || [], count: data.count || 0 })
      queryClient.invalidateQueries({ queryKey: ['health-all'] })
    } catch (err: any) {
      setModelsError(err.message || 'Failed to fetch models')
    } finally {
      setModelsLoading(false)
    }
  }

  // Group keys by platform
  interface ProviderGroup {
    platform: string
    label: string
    url: string
    color: string
    icon: string
    keys: ApiKey[]
    enabled: boolean
  }

  const groups: ProviderGroup[] = []
  const platformMap = new Map<string, ProviderGroup>()

  for (const k of keys) {
    if (!platformMap.has(k.platform)) {
      const meta = PLATFORM_META[k.platform] ?? PLATFORM_META.custom
      const group: ProviderGroup = {
        platform: k.platform,
        label: meta.name,
        url: meta.url,
        color: meta.color,
        icon: meta.icon,
        keys: [],
        enabled: k.enabled,
      }
      platformMap.set(k.platform, group)
      groups.push(group)
    }
    platformMap.get(k.platform)!.keys.push(k)
  }

  groups.sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
    return a.label.localeCompare(b.label)
  })

  return (
    <div className="flex flex-col h-full">
      <PageHeader titleKey="providers.title" descKey="providers.desc" />
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/40 bg-white/30 backdrop-blur-sm p-16 text-center dark:border-white/10 dark:bg-white/5">
            <Key className="size-10 mx-auto mb-4 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground font-medium">{t('providers.noProviders')}</p>
            <p className="text-xs text-muted-foreground mt-2 max-w-xs mx-auto">{t('providers.noProvidersHint')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map(group => {
              const primaryKey = group.keys[0]
              const health = healthKeyMap.get(primaryKey?.id)
              const status = health?.status ?? primaryKey?.status ?? 'unknown'
              const isExpanded = expandedPlatform === group.platform
              const lastChecked = health?.lastCheckedAt

              return (
                <div
                  key={group.platform}
                  className={`rounded-xl border border-white/40 bg-white/50 backdrop-blur-xl shadow-md overflow-hidden transition-all duration-200 hover:shadow-lg dark:border-white/10 dark:bg-white/5`}
                >
                  {/* Main Row */}
                  <div className="flex items-center gap-4 px-5 py-4">
                    {/* Platform Icon */}
                    <div
                      className="flex items-center justify-center size-10 rounded-lg text-lg"
                      style={{ background: group.color + '18' }}
                    >
                      {group.icon}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{group.label}</span>
                        <StatusBadge status={status} />
                        <span className="text-xs text-muted-foreground">
                          {t('keys.keyCount').replace('{n}', String(group.keys.length))}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <code className="text-xs font-mono text-muted-foreground">{primaryKey?.maskedKey}</code>
                        {lastChecked && (
                          <span className="text-[11px] text-muted-foreground">
                            {formatSqliteUtcToLocalTime(lastChecked, { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Toggle */}
                    <Switch
                      checked={group.enabled}
                      onCheckedChange={(checked) =>
                        togglePlatform.mutate({ platform: group.platform, enabled: checked })
                      }
                      disabled={togglePlatform.isPending}
                    />

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => {
                          if (isExpanded) {
                            setExpandedPlatform(null)
                            setModelsData(null)
                            setModelsError(null)
                          } else {
                            setExpandedPlatform(group.platform)
                            if (primaryKey) fetchModels(primaryKey.id, group.platform)
                          }
                        }}
                        title={t('providers.showKeys')}
                      >
                        {isExpanded ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => {
                          setExpandedPlatform(group.platform)
                          if (primaryKey) fetchModels(primaryKey.id, group.platform)
                        }}
                        disabled={modelsLoading}
                        title={t('providers.fetchModels')}
                      >
                        {modelsLoading ? <Loader2 className="size-4 animate-spin" /> : <List className="size-4" />}
                      </Button>
                      {group.url && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => window.open(group.url, '_blank')}
                          title={t('providers.updateKey')}
                        >
                          <ExternalLink className="size-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm(t('providers.confirmDelete').replace('{n}', group.label))) {
                            for (const k of group.keys) deleteKey.mutate(k.id)
                          }
                        }}
                        disabled={deleteKey.isPending}
                        title={t('providers.delete')}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Expanded Key List */}
                  {isExpanded && (
                    <div className="border-t border-white/20 bg-white/30 backdrop-blur-sm px-5 py-3 space-y-3 dark:bg-white/5 dark:border-white/10">
                      {/* Models Status */}
                      {modelsLoading && modelsData === null && !modelsError && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                          <Loader2 className="size-3.5 animate-spin" />
                          <span>{t('providers.fetchingModels')}</span>
                        </div>
                      )}
                      {modelsError && (
                        <div className="flex items-center gap-2 text-xs text-destructive py-2">
                          <span>❌</span>
                          <span>{t('providers.fetchModelsError')}: {modelsError}</span>
                        </div>
                      )}
                      {modelsData && modelsData.platform === group.platform && (
                        <div className="py-2">
                          <div className="flex items-center gap-2 text-xs mb-2">
                            <span>✅</span>
                            <span className="text-green-600 dark:text-green-400 font-medium">
                              {t('providers.modelsAvailable')} · {t('providers.modelsCount').replace('{n}', String(modelsData.count))}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {modelsData.models.slice(0, 20).map((m, i) => (
                              <span key={i} className="inline-block px-2 py-0.5 rounded bg-background border text-[11px] font-mono">{m}</span>
                            ))}
                            {modelsData.models.length > 20 && (
                              <span className="inline-block px-2 py-0.5 rounded bg-muted text-[11px] text-muted-foreground">
                                {t('providers.modelsMore').replace('{n}', String(modelsData.models.length - 20))}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      {/* Key List */}
                      <div className="space-y-2">
                        {group.keys.map(k => {
                          const kHealth = healthKeyMap.get(k.id)
                          const kStatus = kHealth?.status ?? k.status
                          return (
                            <div key={k.id} className="flex items-center gap-3 text-xs py-1.5">
                              <span className={`size-1.5 rounded-full ${kStatus === 'healthy' ? 'bg-green-500' : kStatus === 'error' ? 'bg-red-500' : kStatus === 'rate-limited' ? 'bg-yellow-500' : 'bg-gray-400'}`} />
                              <code className="font-mono text-[11px] w-32 truncate">{k.maskedKey}</code>
                              <span className="text-muted-foreground">{k.label || '-'}</span>
                              <span className="text-muted-foreground">{t(`keys.status.${kStatus}`)}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
