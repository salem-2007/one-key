import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FlaskConical, MessageSquare, RefreshCw } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/page-header'
import { PlaygroundChatPanel } from '@/components/playground-chat-panel'
import { RealtimeSessionPanel } from '@/components/realtime-session-panel'
import { cn } from '@/lib/utils'
import {
  getConfiguredProviderCount,
  getPlaygroundMode,
  getSupportedModelCount,
  isPlaygroundModeConfigured,
  PLAYGROUND_MODES,
  type PlaygroundCapabilityMode,
} from '../../../shared/playground'
import type { CapabilitiesResponse, ModelSweepJob } from '../../../shared/types'

interface FallbackEntry {
  modelDbId: number
  priority: number
  enabled: boolean
  platform: string
  modelId: string
  displayName: string
  sizeLabel: string
  keyCount: number
  runtimeStatus?: 'healthy' | 'degraded' | 'unavailable'
}

interface PlaygroundResult {
  id: number
  mode: PlaygroundCapabilityMode
  title: string
  content: string
  status: 'success' | 'error'
  meta?: {
    platform?: string
    model?: string
    latency?: number
    endpoint?: string
    fallbackAttempts?: number
  }
  imageSrc?: string
  audioSrc?: string
  raw?: unknown
}

type PlaygroundSurface = 'chat' | 'test-lab'

const defaultPrompt: Record<PlaygroundCapabilityMode, string> = {
  chat: '用两句话解释这个 AI 代理的功能。',
  vision: '这张图片显示了什么？',
  embeddings: 'AI 代理通过已配置的平台路由向量化请求。',
  image_generation: '为本地 AI 网关仪表盘设计简洁的黑白应用图标。',
  image_edit: '将背景替换为干净的白色摄影棚背景。',
  image_variation: '创建此图片的清晰视觉变体。',
  speech: 'AI 代理语音路由正常运行。',
  transcription: '',
  translation: '',
  realtime: '你简洁而有帮助。',
}

const responseFormatOptions = ['json', 'text', 'verbose_json'] as const

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function errorMessageFromBody(body: any): string {
  const err = body?.error
  if (typeof err === 'string') return err
  if (err && typeof err === 'object') return err.message ?? JSON.stringify(err)
  return '平台返回了错误响应。'
}

function routedViaFrom(res: Response, data: any) {
  const header = res.headers.get('X-Routed-Via')
  const via = data?._routed_via ?? (header ? {
    platform: header.split('/')[0],
    model: header.split('/').slice(1).join('/'),
  } : undefined)

  return {
    platform: via?.platform,
    model: via?.model,
  }
}

function modeStatus(data: CapabilitiesResponse | undefined, mode: PlaygroundCapabilityMode) {
  const configured = isPlaygroundModeConfigured(data, mode)
  const supportedModels = getSupportedModelCount(data, mode)
  if (configured) return 'configured'
  if (supportedModels > 0) return 'missing_key'
  return 'unsupported'
}

function formatDuration(ms: number | null | undefined) {
  if (ms == null) return '计算中'
  if (ms < 1000) return '<1s'
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds}s`
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
}

export default function PlaygroundPage() {
  const queryClient = useQueryClient()
  const [surface, setSurface] = useState<PlaygroundSurface>('chat')
  const [mode, setMode] = useState<PlaygroundCapabilityMode>('chat')
  const [selectedModel, setSelectedModel] = useState<string>('自动')
  const [modelOverride, setModelOverride] = useState('')
  const [prompt, setPrompt] = useState(defaultPrompt.chat)
  const [imageUrl, setImageUrl] = useState('')
  const [visionFileName, setVisionFileName] = useState('')
  const [voice, setVoice] = useState('alloy')
  const [speechFormat, setSpeechFormat] = useState('wav')
  const [audioTextFormat, setAudioTextFormat] = useState<(typeof responseFormatOptions)[number]>('json')
  const [language, setLanguage] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [maskFile, setMaskFile] = useState<File | null>(null)
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [audioUrl, setAudioUrl] = useState('')
  const [results, setResults] = useState<PlaygroundResult[]>([])
  const [loading, setLoading] = useState(false)
  const [sweepId, setSweepId] = useState<string | null>(null)
  const [sweepStarting, setSweepStarting] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const { data: keyData } = useQuery<{ apiKey: string }>({
    queryKey: ['unified-key'],
    queryFn: () => apiFetch('/api/settings/api-key'),
  })

  const fallbackQuery = useQuery<FallbackEntry[]>({
    queryKey: ['fallback'],
    queryFn: () => apiFetch('/api/fallback'),
  })
  const fallbackEntries = fallbackQuery.data ?? []

  const capabilityQuery = useQuery<CapabilitiesResponse>({
    queryKey: ['models', 'capabilities'],
    queryFn: () => apiFetch('/api/models/capabilities'),
  })
  const capabilityData = capabilityQuery.data

  const sweepQuery = useQuery<ModelSweepJob>({
    queryKey: ['model-sweep', sweepId],
    enabled: Boolean(sweepId),
    queryFn: () => apiFetch(`/api/model-sweeps/${sweepId}`),
    refetchInterval: query => query.state.data?.status === 'running' ? 1000 : false,
  })
  const sweepJob = sweepQuery.data

  const availableModels = fallbackEntries.filter(e => e.keyCount > 0 && e.enabled && e.runtimeStatus !== 'unavailable')
  const definition = getPlaygroundMode(mode)
  const configuredProviders = getConfiguredProviderCount(capabilityData, mode)
  const supportedModels = getSupportedModelCount(capabilityData, mode)
  const currentStatus = modeStatus(capabilityData, mode)
  const lastResult = results[0]
  const sweepRunning = sweepJob?.status === 'running'
  const sweepProgressPercent = sweepJob && sweepJob.total > 0
    ? Math.round((sweepJob.completed / sweepJob.total) * 100)
    : 0
  const sweepFailures = sweepJob?.results.filter(result => result.status === 'failed').slice(-4).reverse() ?? []
  const activeChatModelLabel = selectedModel === '自动'
    ? '自动（故障转移链）'
    : availableModels.find(m => m.modelId === selectedModel)?.displayName ?? selectedModel

  const activeModel = useMemo(() => {
    if (mode === 'chat' && selectedModel !== '自动') return selectedModel
    return modelOverride.trim() || undefined
  }, [mode, modelOverride, selectedModel])

  useEffect(() => {
    setPrompt(defaultPrompt[mode])
    setModelOverride('')
    setSelectedModel('自动')
    inputRef.current?.focus()
  }, [mode])

  useEffect(() => {
    return () => {
      for (const result of results) {
        if (result.audioSrc) URL.revokeObjectURL(result.audioSrc)
      }
    }
  }, [results])

  useEffect(() => {
    if (sweepJob?.status !== 'completed') return
    void fallbackQuery.refetch()
    void capabilityQuery.refetch()
  }, [sweepJob?.id, sweepJob?.status])

  async function startSweep() {
    if (sweepStarting || sweepRunning) return

    setSweepStarting(true)
    try {
      const job = await apiFetch<ModelSweepJob>('/api/model-sweeps', { method: 'POST' })
      queryClient.setQueryData(['model-sweep', job.id], job)
      setSweepId(job.id)
    } catch (err: any) {
      pushResult({
        mode,
        title: '模型扫描失败',
        content: err.message,
        status: 'error',
        meta: { endpoint: '/api/model-sweeps' },
      })
    } finally {
      setSweepStarting(false)
    }
  }

  async function execute() {
    if (loading) return

    const endpoint = definition.endpoint
    const headers: Record<string, string> = {}
    if (keyData?.apiKey) headers.Authorization = `Bearer ${keyData.apiKey}`

    let init: RequestInit
    try {
      init = buildRequest(headers)
    } catch (err: any) {
      pushResult({
        mode,
        title: '需要输入',
        content: err.message,
        status: 'error',
        meta: { endpoint },
      })
      return
    }

    setLoading(true)
    const start = Date.now()
    try {
      const res = await fetch(endpoint, init)
      const latency = Date.now() - start
      const fallbackAttempts = res.headers.get('X-Fallback-Attempts')

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        pushResult({
          mode,
          title: `${definition.label} 失败`,
          content: body?.error?.message ?? `HTTP ${res.status}`,
          status: 'error',
          meta: { endpoint, latency },
          raw: body,
        })
        return
      }

      if (mode === 'speech') {
        const blob = await res.blob()
        const audioSrc = URL.createObjectURL(blob)
        pushResult({
          mode,
          title: '语音已生成',
          content: `${blob.type || 'audio'} · ${Math.round(blob.size / 1024)} KB`,
          status: 'success',
          meta: { endpoint, latency, fallbackAttempts: fallbackAttempts ? Number(fallbackAttempts) : undefined },
          audioSrc,
        })
        return
      }

      const data = await res.json()
      const routed = routedViaFrom(res, data)
      if (data?.error) {
        pushResult({
          mode,
          title: `${definition.label} 失败`,
          content: errorMessageFromBody(data),
          status: 'error',
          meta: {
            endpoint,
            latency,
            platform: routed.platform,
            model: routed.model,
            fallbackAttempts: fallbackAttempts ? Number(fallbackAttempts) : undefined,
          },
          raw: data,
        })
        return
      }

      pushResult({
        mode,
        title: successTitle(data),
        content: resultSummary(data),
        status: 'success',
        meta: {
          endpoint,
          latency,
          platform: routed.platform,
          model: routed.model,
          fallbackAttempts: fallbackAttempts ? Number(fallbackAttempts) : undefined,
        },
        imageSrc: imageSrcFrom(data),
        raw: data,
      })
    } catch (err: any) {
      pushResult({
        mode,
        title: `${definition.label} 失败`,
        content: err.message,
        status: 'error',
        meta: { endpoint },
      })
    } finally {
      setLoading(false)
    }
  }

  function pushResult(result: Omit<PlaygroundResult, 'id'>) {
    setResults(current => [{ id: Date.now(), ...result }, ...current].slice(0, 8))
  }

  function buildRequest(headers: Record<string, string>): RequestInit {
    if (definition.requestKind === 'multipart') {
      const form = new FormData()
      if (activeModel) form.append('model', activeModel)

      if (mode === 'image_edit') {
        if (!imageFile) throw new Error('请选择要编辑的图片文件。')
        if (!prompt.trim()) throw new Error('请输入编辑提示词。')
        form.append('image', imageFile)
        if (maskFile) form.append('mask', maskFile)
        form.append('prompt', prompt.trim())
        form.append('response_format', 'b64_json')
      } else if (mode === 'image_variation') {
        if (!imageFile) throw new Error('选择一张图片进行变体生成。')
        form.append('image', imageFile)
        form.append('response_format', 'b64_json')
      } else if (mode === 'transcription' || mode === 'translation') {
        if (audioFile) form.append('file', audioFile)
        if (audioUrl.trim()) form.append('url', audioUrl.trim())
        if (!audioFile && !audioUrl.trim()) throw new Error('请选择音频文件或提供音频 URL。')
        if (prompt.trim()) form.append('prompt', prompt.trim())
        form.append('response_format', audioTextFormat)
        if (mode === 'transcription' && language.trim()) form.append('language', language.trim())
      }

      return { method: 'POST', headers, body: form }
    }

    const body: Record<string, unknown> = {}
    if (activeModel) body.model = activeModel

    if (mode === 'chat') {
      if (!prompt.trim()) throw new Error('请输入聊天消息。')
      body.messages = [{ role: 'user', content: prompt.trim() }]
    } else if (mode === 'vision') {
      if (!prompt.trim()) throw new Error('请输入视觉提示词。')
      if (!imageUrl.trim()) throw new Error('请提供本地图片、数据 URL 或远程图片链接。')
      body.messages = [{
        role: 'user',
        content: [
          { type: 'text', text: prompt.trim() },
          { type: 'image_url', image_url: { url: imageUrl.trim() } },
        ],
      }]
    } else if (mode === 'embeddings') {
      if (!prompt.trim()) throw new Error('请输入要向量化的文本。')
      body.input = prompt.trim()
    } else if (mode === 'image_generation') {
      if (!prompt.trim()) throw new Error('请输入图像生成提示词。')
      body.prompt = prompt.trim()
      body.response_format = 'b64_json'
      body.size = '1024x1024'
    } else if (mode === 'speech') {
      if (!prompt.trim()) throw new Error('请输入要转换为语音的文本。')
      body.input = prompt.trim()
      body.voice = voice.trim() || 'alloy'
      body.response_format = speechFormat
    } else if (mode === 'realtime') {
      body.instructions = prompt.trim() || defaultPrompt.realtime
      body.voice = voice.trim() || 'alloy'
      body.response_modalities = ['AUDIO']
      body.input_audio_transcription = true
      body.output_audio_transcription = true
    }

    return {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  }

  function successTitle(data: any) {
    if (mode === 'embeddings') return `向量化返回 ${data.data?.[0]?.embedding?.length ?? 0} 维`
    if (mode === 'image_generation') return '图片已生成'
    if (mode === 'image_edit') return '图片编辑已生成'
    if (mode === 'image_variation') return '图片变体已生成'
    if (mode === 'realtime') return '实时会话已创建'
    if (mode === 'transcription') return '转录完成'
    if (mode === 'translation') return '翻译完成'
    return '已收到响应'
  }

  function resultSummary(data: any) {
    if (mode === 'chat' || mode === 'vision') {
      return data.choices?.[0]?.message?.content ?? formatJson(data)
    }
    if (mode === 'embeddings') {
      const embedding = data.data?.[0]?.embedding
      return `model=${data.model ?? 'unknown'}; dimensions=${Array.isArray(embedding) ? embedding.length : 'base64'}; tokens=${data.usage?.total_tokens ?? '-'}`
    }
    if (mode === 'realtime') {
      return `expires_at=${new Date((data.expires_at ?? 0) * 1000).toLocaleString()}\nconnect_url=${data.connect_url}\nclient_secret=${data.client_secret?.value ? data.client_secret.value.slice(0, 16) + '...' : '-'}`
    }
    if (mode === 'transcription' || mode === 'translation') {
      return typeof data.text === 'string' ? data.text : formatJson(data)
    }
    return data.data?.[0]?.revised_prompt ?? '请打开图片预览或查看下方原始 JSON。'
  }

  function imageSrcFrom(data: any) {
    const item = data.data?.[0]
    if (item?.url) return item.url
    if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`
    return undefined
  }

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('无法读取图片文件。'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('无法读取图片文件。'))
    reader.readAsDataURL(file)
  })
}
  async function loadVisionFile(file: File | null) {
    if (!file) {
      setVisionFileName('')
      return
    }
    if (!file.type.startsWith('image/')) {
      pushResult({
        mode: 'vision',
        title: '需要输入',
        content: '视觉功能目前仅支持本地图片文件。',
        status: 'error',
        meta: { endpoint: '/v1/chat/completions' },
      })
      return
    }
    try {
      const dataUrl = await fileToDataUrl(file)
      setImageUrl(dataUrl)
      setVisionFileName(file.name)
    } catch (err: any) {
      pushResult({
        mode: 'vision',
        title: '需要输入',
        content: err.message ?? '无法读取图片文件。',
        status: 'error',
        meta: { endpoint: '/v1/chat/completions' },
      })
    }
  }
  const statusDot = currentStatus === 'configured'
    ? 'bg-emerald-500'
    : currentStatus === 'missing_key'
      ? 'bg-amber-500'
      : 'bg-muted-foreground/25'

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col">
      <PageHeader
        title="操练场"
        description="测试模型、比较输出、调整参数"
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {mode === 'chat' && (
              <Select value={selectedModel} onValueChange={(v) => setSelectedModel(v ?? '自动')}>
                <SelectTrigger className="w-[260px]">
                  <span className="truncate">{activeChatModelLabel}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="自动">自动（故障转移链）</SelectItem>
                  {availableModels.map(m => (
                    <SelectItem key={m.modelDbId} value={m.modelId}>
                      <span className="flex items-center gap-2">
                        <span>{m.displayName}</span>
                        <span className="text-xs text-muted-foreground">{m.platform}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              variant="outline"
              onClick={startSweep}
              disabled={sweepStarting || sweepRunning}
              className="gap-2"
            >
              <RefreshCw className={cn('size-4', (sweepStarting || sweepRunning) && 'animate-spin')} />
              {sweepRunning ? '测试模型中...' : '测试所有模型'}
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex w-fit rounded-lg border bg-card p-1">
        <button
          type="button"
          onClick={() => setSurface('chat')}
          className={cn(
            'inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors',
            surface === 'chat' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <MessageSquare className="size-4" />
          聊天
        </button>
        <button
          type="button"
          onClick={() => setSurface('test-lab')}
          className={cn(
            'inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors',
            surface === 'test-lab' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <FlaskConical className="size-4" />
          测试实验室
        </button>
      </div>

      {surface === 'chat' ? (
        <PlaygroundChatPanel
          apiKey={keyData?.apiKey}
          models={availableModels}
          capabilityData={capabilityData}
        />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
        {PLAYGROUND_MODES.map(item => {
          const status = modeStatus(capabilityData, item.id)
          const active = item.id === mode
          const supported = getSupportedModelCount(capabilityData, item.id)
          const configured = getConfiguredProviderCount(capabilityData, item.id)
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setMode(item.id)}
              className={cn(
                'rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted/60',
                active ? 'border-foreground bg-muted/70' : 'bg-card',
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn(
                  'size-2 rounded-full',
                  status === 'configured' ? 'bg-emerald-500' : status === 'missing_key' ? 'bg-amber-500' : 'bg-muted-foreground/25',
                )} />
                <span className="truncate text-xs font-medium">{item.label}</span>
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                {configured}/{supported} 可路由
              </div>
            </button>
          )
        })}
      </div>

      {sweepJob && (
        <section className="mb-4 rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-medium">模型扫描</h2>
                <Badge variant={sweepJob.status === 'completed' ? 'default' : sweepJob.status === 'failed' ? 'destructive' : 'outline'}>
                  {sweepJob.status}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{sweepJob.note}</p>
              {sweepJob.currentModel && (
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                  current: {sweepJob.currentModel}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-right text-xs tabular-nums md:grid-cols-4">
              <span className="text-muted-foreground">进度</span>
              <span>{sweepJob.completed}/{sweepJob.total}</span>
              <span className="text-muted-foreground">通过</span>
              <span>{sweepJob.passed}</span>
              <span className="text-muted-foreground">已隔离</span>
              <span>{sweepJob.quarantined}</span>
              <span className="text-muted-foreground">预计剩余时间</span>
              <span>{formatDuration(sweepJob.estimatedRemainingMs)}</span>
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${sweepProgressPercent}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>{sweepProgressPercent}% 完成</span>
            <span>已用 {formatDuration(sweepJob.elapsedMs)}</span>
            <span>{sweepJob.failed} 个失败</span>
          </div>
          {sweepFailures.length > 0 && (
            <div className="mt-3 space-y-2 border-t pt-3">
              <h3 className="text-xs font-medium text-muted-foreground">最近失败</h3>
              {sweepFailures.map(result => (
                <div key={`${result.modelDbId}-${result.status}`} className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="destructive">{result.errorCategory ?? '错误'}</Badge>
                  <span className="font-medium">{result.providerDisplayName}</span>
                  <code className="break-all text-muted-foreground">{result.modelId}</code>
                  <span className="min-w-0 break-words text-muted-foreground">{result.error}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="grid flex-1 min-h-0 gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <section className="min-w-0 rounded-lg border bg-card p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium">{definition.label}</h2>
              <p className="mt-1 font-mono text-xs text-muted-foreground">{definition.endpoint}</p>
            </div>
            <Badge variant={currentStatus === 'configured' ? 'default' : 'outline'} className="gap-1">
              <span className={cn('size-1.5 rounded-full', statusDot)} />
              {configuredProviders}/{supportedModels}
            </Badge>
          </div>

          <div className="space-y-4">
            {mode !== 'chat' && (
              <div className="space-y-1.5">
                <Label className="text-xs">模型覆盖</Label>
                <Input
                  value={modelOverride}
                  onChange={e => setModelOverride(e.target.value)}
                  placeholder="自动"
                  className="font-mono text-xs"
                />
              </div>
            )}

            {mode !== 'image_variation' && (
              <div className="space-y-1.5">
                <Label className="text-xs">
                  {mode === 'embeddings' ? '文本' : mode === 'realtime' ? '指令' : '提示词'}
                </Label>
                <Textarea
                  ref={inputRef}
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  rows={mode === 'speech' || mode === 'embeddings' ? 4 : 5}
                  className="text-sm"
                />
              </div>
            )}

            {mode === 'vision' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">本地图片</Label>
                  <Input type="file" accept="image/*" onChange={e => void loadVisionFile(e.target.files?.[0] ?? null)} />
                  {visionFileName && <p className="truncate text-xs text-muted-foreground">已加载 {visionFileName}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">图片链接</Label>
                  <Input
                    value={visionFileName && imageUrl.startsWith('data:') ? '' : imageUrl}
                    onChange={e => {
                      setImageUrl(e.target.value)
                      setVisionFileName('')
                    }}
                    placeholder={visionFileName ? '已加载本地图片；粘贴 URL 替换。' : 'https://... 或 data:image/png;base64,...'}
                    className="font-mono text-xs"
                  />
                </div>
              </div>
            )}

            {(mode === 'image_edit' || mode === 'image_variation') && (
              <div className="space-y-1.5">
                <Label className="text-xs">图片文件</Label>
                <Input type="file" accept="image/*" onChange={e => setImageFile(e.target.files?.[0] ?? null)} />
              </div>
            )}

            {mode === 'image_edit' && (
              <div className="space-y-1.5">
                <Label className="text-xs">遮罩文件</Label>
                <Input type="file" accept="image/*" onChange={e => setMaskFile(e.target.files?.[0] ?? null)} />
              </div>
            )}

            {(mode === 'speech' || mode === 'realtime') && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">语音</Label>
                  <Input value={voice} onChange={e => setVoice(e.target.value)} />
                </div>
                {mode === 'speech' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">格式</Label>
                    <Select value={speechFormat} onValueChange={(v) => setSpeechFormat(v ?? 'wav')}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="wav">wav</SelectItem>
                        <SelectItem value="pcm">pcm</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {(mode === 'transcription' || mode === 'translation') && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">音频文件</Label>
                  <Input type="file" accept="audio/*" onChange={e => setAudioFile(e.target.files?.[0] ?? null)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">音频链接</Label>
                  <Input
                    value={audioUrl}
                    onChange={e => setAudioUrl(e.target.value)}
                    placeholder="https://..."
                    className="font-mono text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">响应格式</Label>
                    <Select value={audioTextFormat} onValueChange={(v) => setAudioTextFormat(v as typeof audioTextFormat)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {responseFormatOptions.map(format => (
                          <SelectItem key={format} value={format}>{format}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {mode === 'transcription' && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">语言</Label>
                      <Input value={language} onChange={e => setLanguage(e.target.value)} placeholder="en" />
                    </div>
                  )}
                </div>
              </>
            )}

            {mode !== 'realtime' && (
              <div className="flex items-center gap-2 pt-1">
                <Button onClick={execute} disabled={loading}>
                  {loading ? '测试中...' : `测试 ${definition.label}`}
                </Button>
                {results.length > 0 && (
                  <Button variant="outline" onClick={() => setResults([])} disabled={loading}>
                    清空
                  </Button>
                )}
              </div>
            )}
          </div>
        </section>

        {mode === 'realtime' ? (
          <section className="flex min-h-[520px] min-w-0 flex-col overflow-hidden rounded-lg border bg-card">
            <RealtimeSessionPanel
              apiKey={keyData?.apiKey}
              model={activeModel}
              instructions={prompt}
              voice={voice}
            />
          </section>
        ) : (
          <section className="flex min-h-[520px] min-w-0 flex-col overflow-hidden rounded-lg border bg-card">
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-medium">结果</h2>
            </div>
            <div className="min-w-0 flex-1 overflow-y-auto p-4">
              {!lastResult ? (
                <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
                  选择功能，填写输入，然后运行请求。
                </div>
              ) : (
                <div className="min-w-0 space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={lastResult.status === 'success' ? 'default' : 'destructive'}>{lastResult.status}</Badge>
                    <span className="text-sm font-medium">{lastResult.title}</span>
                    {lastResult.meta?.platform && <Badge variant="outline">{lastResult.meta.platform}</Badge>}
                    {lastResult.meta?.model && <code className="break-all text-xs text-muted-foreground">{lastResult.meta.model}</code>}
                    {lastResult.meta?.latency != null && <span className="text-xs text-muted-foreground tabular-nums">{lastResult.meta.latency} ms</span>}
                  </div>

                  <pre className="max-h-[220px] max-w-full overflow-自动 whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-xs leading-relaxed">
                    {lastResult.content}
                  </pre>

                  {lastResult.imageSrc && (
                    <div className="overflow-hidden rounded-lg border bg-background">
                      <img src={lastResult.imageSrc} alt="生成结果" className="max-h-[420px] w-full object-contain" />
                    </div>
                  )}

                  {lastResult.audioSrc && (
                    <audio controls src={lastResult.audioSrc} className="w-full" />
                  )}

                  {lastResult.raw != null && (
                    <details className="min-w-0 overflow-hidden rounded-lg border bg-background">
                      <summary className="cursor-pointer px-3 py-2 text-xs font-medium">原始 JSON</summary>
                      <pre className="max-h-[320px] max-w-full overflow-自动 whitespace-pre-wrap break-words p-3 text-xs">{formatJson(lastResult.raw)}</pre>
                    </details>
                  )}

                  {results.length > 1 && (
                    <div className="space-y-2 border-t pt-3">
                      <h3 className="text-xs font-medium text-muted-foreground">最近运行</h3>
                      {results.slice(1).map(result => (
                        <button
                          key={result.id}
                          type="button"
                          onClick={() => setResults(current => [result, ...current.filter(item => item.id !== result.id)])}
                          className="block w-full rounded-md border px-3 py-2 text-left text-xs hover:bg-muted/60"
                        >
                          <span className="font-medium">{getPlaygroundMode(result.mode).label}</span>
                          <span className="ml-2 text-muted-foreground">{result.title}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}
      </div>
        </>
      )}
    </div>
  )
}
