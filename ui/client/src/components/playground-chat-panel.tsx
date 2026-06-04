import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Clipboard,
  FileAudio,
  ImageIcon,
  Loader2,
  MessageSquare,
  Mic,
  Radio,
  SendHorizontal,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { RealtimeSessionPanel } from '@/components/realtime-session-panel'
import { cn } from '@/lib/utils'
import {
  getConfiguredProviderCount,
  getPlaygroundMode,
  getSupportedModelCount,
  isPlaygroundModeConfigured,
  type PlaygroundCapabilityMode,
} from '../../../shared/playground'
import type { CapabilitiesResponse } from '../../../shared/types'

interface PlaygroundChatModelOption {
  modelDbId: number
  platform: string
  modelId: string
  displayName: string
  keyCount: number
}

interface PlaygroundChatPanelProps {
  apiKey?: string
  models: PlaygroundChatModelOption[]
  capabilityData?: CapabilitiesResponse
}

type MessageRole = 'user' | 'assistant' | 'system'

interface ChatMessageItem {
  id: number
  role: MessageRole
  content: string
  status?: 'success' | 'error'
  imageUrl?: string
  imageSrc?: string
  audioSrc?: string
  meta?: {
    platform?: string
    model?: string
    latency?: number
    endpoint?: string
    fallbackAttempts?: number
    mode?: PlaygroundCapabilityMode
  }
}

const STORAGE_KEY = 'onekey.playground.chat.messages.v1'

const CHAT_ACTIONS: Array<{
  id: PlaygroundCapabilityMode
  label: string
  icon: typeof MessageSquare
  helper: string
}> = [
  { id: 'chat', label: '聊天', icon: MessageSquare, helper: '通过故障转移链发送文本。' },
  { id: 'vision', label: '视觉', icon: ImageIcon, helper: '询问图片链接、数据URL或本地图片。' },
  { id: 'embeddings', label: '向量化', icon: Sparkles, helper: '为文本生成向量化摘要。' },
  { id: 'image_generation', label: '图像生成', icon: ImageIcon, helper: '根据提示词生成图片。' },
  { id: 'image_edit', label: '图像编辑', icon: Upload, helper: '上传图片并进行编辑。' },
  { id: 'image_variation', label: '图像变体', icon: Upload, helper: '上传图片并请求变体。' },
  { id: 'speech', label: '语音合成', icon: Volume2, helper: '朗读文本。' },
  { id: 'transcription', label: '语音转文字', icon: FileAudio, helper: '上传音频并提取文本。' },
  { id: 'translation', label: '翻译', icon: FileAudio, helper: '上传音频并翻译。' },
  { id: 'realtime', label: '实时会话', icon: Radio, helper: '打开实时音频会话面板。' },
]

function nextId() {
  return Date.now() + Math.random()
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function isPersistentImageUrl(value: unknown): value is string {
  return typeof value === 'string' && !value.startsWith('data:') && !value.startsWith('blob:')
}

function loadMessages(): ChatMessageItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(item => ['user', 'assistant', 'system'].includes(item?.role) && typeof item?.content === 'string')
      .slice(-40)
      .map(item => ({
        id: typeof item.id === 'number' ? item.id : nextId(),
        role: item.role,
        content: item.content,
        status: item.status === 'error' ? 'error' : item.status === 'success' ? 'success' : undefined,
        imageUrl: isPersistentImageUrl(item.imageUrl) ? item.imageUrl : undefined,
        imageSrc: isPersistentImageUrl(item.imageSrc) ? item.imageSrc : undefined,
        meta: item.meta && typeof item.meta === 'object' ? item.meta : undefined,
      }))
  } catch {
    return []
  }
}

function serializableMessages(messages: ChatMessageItem[]) {
  return messages.map(({ audioSrc: _audioSrc, imageUrl, imageSrc, ...message }) => ({
    ...message,
    imageUrl: isPersistentImageUrl(imageUrl) ? imageUrl : undefined,
    imageSrc: isPersistentImageUrl(imageSrc) ? imageSrc : undefined,
  })).slice(-40)
}

function modeStatus(data: CapabilitiesResponse | undefined, mode: PlaygroundCapabilityMode) {
  const configured = isPlaygroundModeConfigured(data, mode)
  const supportedModels = getSupportedModelCount(data, mode)
  if (configured) return 'configured'
  if (supportedModels > 0) return 'missing_key'
  return 'unsupported'
}

function authHeaders(apiKey?: string): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
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

function errorMessageFromBody(body: any): string {
  const error = body?.error
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') return error.message ?? JSON.stringify(error)
  return '提供者返回了错误响应。'
}

function imageSrcFrom(data: any) {
  const item = data?.data?.[0]
  if (item?.url) return item.url
  if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`
  return undefined
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Could not read image file.'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image file.'))
    reader.readAsDataURL(file)
  })
}
async function readJsonResponse(res: Response) {
  return res.json().catch(() => null)
}

export function PlaygroundChatPanel({ apiKey, models, capabilityData }: PlaygroundChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessageItem[]>(loadMessages)
  const [action, setAction] = useState<PlaygroundCapabilityMode>('chat')
  const [selectedModel, setSelectedModel] = useState('auto')
  const [input, setInput] = useState('用两句话解释这个 ONEKEY 代理的功能。')
  const [imageUrl, setImageUrl] = useState('')
  const [visionFileName, setVisionFileName] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [maskFile, setMaskFile] = useState<File | null>(null)
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [voice, setVoice] = useState('alloy')
  const [speechFormat, setSpeechFormat] = useState('wav')
  const [language, setLanguage] = useState('')
  const [responseFormat, setResponseFormat] = useState('json')
  const [busy, setBusy] = useState(false)
  const [speakingId, setSpeakingId] = useState<number | null>(null)
  const [showRealtime, setShowRealtime] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const activeAction = CHAT_ACTIONS.find(item => item.id === action) ?? CHAT_ACTIONS[0]
  const activeDefinition = getPlaygroundMode(action)
  const activeModelLabel = selectedModel === 'auto'
    ? '自动（故障转移链）'
    : models.find(model => model.modelId === selectedModel)?.displayName ?? selectedModel

  const history = useMemo(() => {
    return messages
      .filter(message => (message.role === 'user' || message.role === 'assistant') && message.content.trim())
      .slice(-10)
      .map(message => ({ role: message.role, content: message.content }))
  }, [messages])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializableMessages(messages)))
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  useEffect(() => {
    return () => {
      for (const message of messages) {
        if (message.audioSrc) URL.revokeObjectURL(message.audioSrc)
      }
    }
  }, [])

  async function runAction() {
    if (busy) return
    if (action === 'realtime') {
      setShowRealtime(true)
      return
    }

    setBusy(true)
    try {
      if (action === 'chat') await runChat(false)
      else if (action === 'vision') await runChat(true)
      else if (action === 'embeddings') await runEmbeddings()
      else if (action === 'image_generation') await runImageGeneration()
      else if (action === 'image_edit') await runImageEdit()
      else if (action === 'image_variation') await runImageVariation()
      else if (action === 'speech') await runSpeechFromInput()
      else if (action === 'transcription' || action === 'translation') await runAudioText()
    } catch (error: any) {
      appendMessage({
        role: 'assistant',
        content: error.message ?? '请求失败。',
        status: 'error',
        meta: { mode: action, endpoint: activeDefinition.endpoint },
      })
    } finally {
      setBusy(false)
    }
  }

  async function runChat(withVision: boolean) {
    const text = input.trim()
    if (!text) throw new Error('请输入消息。')
    if (withVision && !imageUrl.trim()) throw new Error('请提供图片链接、数据URL或本地图片。')

    const userMessage: ChatMessageItem = {
      id: nextId(),
      role: 'user',
      content: text,
      imageUrl: withVision && !imageUrl.startsWith('data:') ? imageUrl.trim() : undefined,
      meta: { mode: action, endpoint: activeDefinition.endpoint },
    }
    setMessages(current => [...current, userMessage])

    const bodyMessages = [
      ...history,
      withVision
        ? {
            role: 'user',
            content: [
              { type: 'text', text },
              { type: 'image_url', image_url: { url: imageUrl.trim() } },
            ],
          }
        : { role: 'user', content: text },
    ]

    const { data, meta } = await postJson('/v1/chat/completions', {
      model: selectedModel,
      messages: bodyMessages,
    })

    appendMessage({
      role: 'assistant',
      content: data?.choices?.[0]?.message?.content ?? formatJson(data),
      status: 'success',
      meta: { ...meta, mode: action, endpoint: '/v1/chat/completions' },
    })
    setInput('')
  }

  async function runEmbeddings() {
    const text = input.trim()
    if (!text) throw new Error('请输入要向量化的文本。')
    appendMessage({ role: 'user', content: text, meta: { mode: action, endpoint: activeDefinition.endpoint } })

    const { data, meta } = await postJson('/v1/embeddings', {
      model: selectedModel,
      input: text,
    })
    const embedding = data?.data?.[0]?.embedding
    const dimensions = Array.isArray(embedding) ? embedding.length : 'base64'
    appendMessage({
      role: 'assistant',
      content: `向量化返回 ${dimensions} 维。Token 数: ${data?.usage?.total_tokens ?? '-'}.`,
      status: 'success',
      meta: { ...meta, mode: action, endpoint: activeDefinition.endpoint },
    })
  }

  async function runImageGeneration() {
    const prompt = input.trim()
    if (!prompt) throw new Error('请输入图像生成提示词。')
    appendMessage({ role: 'user', content: prompt, meta: { mode: action, endpoint: activeDefinition.endpoint } })

    const { data, meta } = await postJson('/v1/images/generations', {
      model: selectedModel,
      prompt,
      response_format: 'b64_json',
      size: '1024x1024',
    })
    appendMessage({
      role: 'assistant',
      content: data?.data?.[0]?.revised_prompt ?? '图像已生成。',
      status: 'success',
      imageSrc: imageSrcFrom(data),
      meta: { ...meta, mode: action, endpoint: activeDefinition.endpoint },
    })
  }

  async function runImageEdit() {
    const prompt = input.trim()
    if (!imageFile) throw new Error('请选择要编辑的图片文件。')
    if (!prompt) throw new Error('请输入编辑提示词。')
    appendMessage({ role: 'user', content: prompt, meta: { mode: action, endpoint: activeDefinition.endpoint } })

    const form = new FormData()
    form.append('model', selectedModel)
    form.append('image', imageFile)
    if (maskFile) form.append('mask', maskFile)
    form.append('prompt', prompt)
    form.append('response_format', 'b64_json')
    const { data, meta } = await postMultipart('/v1/images/edits', form)

    appendMessage({
      role: 'assistant',
      content: data?.data?.[0]?.revised_prompt ?? '图像编辑已生成。',
      status: 'success',
      imageSrc: imageSrcFrom(data),
      meta: { ...meta, mode: action, endpoint: activeDefinition.endpoint },
    })
  }

  async function runImageVariation() {
    if (!imageFile) throw new Error('选择一张图片进行变体生成。')
    appendMessage({
      role: 'user',
      content: input.trim() || `创建 ${imageFile.name} 的变体。`,
      meta: { mode: action, endpoint: activeDefinition.endpoint },
    })

    const form = new FormData()
    form.append('model', selectedModel)
    form.append('image', imageFile)
    form.append('response_format', 'b64_json')
    const { data, meta } = await postMultipart('/v1/images/variations', form)

    appendMessage({
      role: 'assistant',
      content: data?.data?.[0]?.revised_prompt ?? '图像变体已生成。',
      status: 'success',
      imageSrc: imageSrcFrom(data),
      meta: { ...meta, mode: action, endpoint: activeDefinition.endpoint },
    })
  }

  async function runSpeechFromInput() {
    const text = input.trim()
    if (!text) throw new Error('请输入要转换为语音的文本。')
    appendMessage({ role: 'user', content: text, meta: { mode: action, endpoint: activeDefinition.endpoint } })

    const { blob, meta } = await postSpeech(text)
    const audioSrc = URL.createObjectURL(blob)
    appendMessage({
      role: 'assistant',
      content: `${blob.type || 'audio'} generated. Size: ${Math.round(blob.size / 1024)} KB.`,
      status: 'success',
      audioSrc,
      meta: { ...meta, mode: action, endpoint: activeDefinition.endpoint },
    })
  }

  async function runAudioText() {
    if (!audioFile) throw new Error('请选择音频文件。')
    appendMessage({
      role: 'user',
      content: input.trim() || `${activeDefinition.label}: ${audioFile.name}`,
      meta: { mode: action, endpoint: activeDefinition.endpoint },
    })

    const form = new FormData()
    form.append('model', selectedModel)
    form.append('file', audioFile)
    if (input.trim()) form.append('prompt', input.trim())
    form.append('response_format', responseFormat)
    if (action === 'transcription' && language.trim()) form.append('language', language.trim())

    const { data, meta } = await postMultipart(activeDefinition.endpoint, form)
    appendMessage({
      role: 'assistant',
      content: typeof data?.text === 'string' ? data.text : formatJson(data),
      status: 'success',
      meta: { ...meta, mode: action, endpoint: activeDefinition.endpoint },
    })
  }

  async function speakMessage(message: ChatMessageItem) {
    if (speakingId || !message.content.trim()) return
    setSpeakingId(message.id)
    try {
      const { blob } = await postSpeech(message.content)
      const audioSrc = URL.createObjectURL(blob)
      setMessages(current => current.map(item => {
        if (item.id !== message.id) return item
        if (item.audioSrc) URL.revokeObjectURL(item.audioSrc)
        return { ...item, audioSrc }
      }))
    } catch (error: any) {
      appendMessage({
        role: 'system',
        content: error.message ?? '语音生成失败。',
        status: 'error',
        meta: { mode: 'speech', endpoint: '/v1/audio/speech' },
      })
    } finally {
      setSpeakingId(null)
    }
  }

  async function postJson(endpoint: string, body: Record<string, unknown>) {
    const start = Date.now()
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { ...authHeaders(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await readJsonResponse(res)
    const meta = {
      ...routedViaFrom(res, data),
      latency: Date.now() - start,
      fallbackAttempts: Number(res.headers.get('X-Fallback-Attempts') ?? '') || undefined,
    }
    if (!res.ok || data?.error) {
      const error = new Error(data?.error?.message ?? errorMessageFromBody(data) ?? `HTTP ${res.status}`)
      ;(error as any).meta = meta
      throw error
    }
    return { data, meta }
  }

  async function postMultipart(endpoint: string, body: FormData) {
    const start = Date.now()
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: authHeaders(apiKey),
      body,
    })
    const data = await readJsonResponse(res)
    const meta = {
      ...routedViaFrom(res, data),
      latency: Date.now() - start,
      fallbackAttempts: Number(res.headers.get('X-Fallback-Attempts') ?? '') || undefined,
    }
    if (!res.ok || data?.error) throw new Error(data?.error?.message ?? errorMessageFromBody(data) ?? `HTTP ${res.status}`)
    return { data, meta }
  }

  async function postSpeech(text: string) {
    const start = Date.now()
    const res = await fetch('/v1/audio/speech', {
      method: 'POST',
      headers: { ...authHeaders(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: selectedModel,
        input: text,
        voice: voice.trim() || 'alloy',
        response_format: speechFormat,
      }),
    })
    if (!res.ok) {
      const data = await readJsonResponse(res)
      throw new Error(data?.error?.message ?? `HTTP ${res.status}`)
    }
    return {
      blob: await res.blob(),
      meta: {
        latency: Date.now() - start,
        fallbackAttempts: Number(res.headers.get('X-Fallback-Attempts') ?? '') || undefined,
      },
    }
  }

  function appendMessage(message: Omit<ChatMessageItem, 'id'>) {
    setMessages(current => [...current, { id: nextId(), ...message }].slice(-60))
  }

  function clearMessages() {
    for (const message of messages) {
      if (message.audioSrc) URL.revokeObjectURL(message.audioSrc)
    }
    setMessages([])
  }

  function copyMessage(content: string) {
    void navigator.clipboard?.writeText(content)
  }

  async function loadVisionFile(file: File | null) {
    if (!file) {
      setVisionFileName('')
      return
    }
    if (!file.type.startsWith('image/')) {
      appendMessage({
        role: 'system',
        content: '视觉功能目前仅支持本地图片文件。',
        status: 'error',
        meta: { mode: 'vision', endpoint: '/v1/chat/completions' },
      })
      return
    }
    try {
      const dataUrl = await fileToDataUrl(file)
      setImageUrl(dataUrl)
      setVisionFileName(file.name)
    } catch (error: any) {
      appendMessage({
        role: 'system',
        content: error.message ?? 'Could not read image file.',
        status: 'error',
        meta: { mode: 'vision', endpoint: '/v1/chat/completions' },
      })
    }
  }

  return (
    <div className="grid min-h-0 gap-4 lg:h-[calc(100vh-15rem)] lg:min-h-[620px] lg:grid-cols-[340px_minmax(0,1fr)]">
      <section className="min-w-0 overflow-y-auto rounded-lg border bg-card p-4 lg:max-h-full">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium">聊天工作区</h2>
            <p className="mt-1 text-xs text-muted-foreground">{activeAction.helper}</p>
          </div>
          <Badge variant={modeStatus(capabilityData, action) === 'configured' ? 'default' : 'outline'}>
            {getConfiguredProviderCount(capabilityData, action)}/{getSupportedModelCount(capabilityData, action)}
          </Badge>
        </div>

        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">模型</Label>
            <Select value={selectedModel} onValueChange={(value) => setSelectedModel(value ?? 'auto')}>
              <SelectTrigger className="w-full min-w-0">
                <span className="truncate">{activeModelLabel}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">自动（故障转移链）</SelectItem>
                {models.map(model => (
                  <SelectItem key={`${model.platform}-${model.modelDbId}`} value={model.modelId}>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{model.displayName}</span>
                      <span className="text-xs text-muted-foreground">{model.platform}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {CHAT_ACTIONS.map(item => {
              const Icon = item.icon
              const status = modeStatus(capabilityData, item.id)
              const active = item.id === action
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setAction(item.id)}
                  className={cn(
                    'rounded-lg border px-2.5 py-2 text-left transition-colors hover:bg-muted/60',
                    active ? 'border-foreground bg-muted/70' : 'bg-background',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="size-3.5 text-muted-foreground" />
                    <span className="truncate text-xs font-medium">{item.label}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className={cn(
                      'size-1.5 rounded-full',
                      status === 'configured' ? 'bg-emerald-500' : status === 'missing_key' ? 'bg-amber-500' : 'bg-muted-foreground/25',
                    )} />
                    <span>{getConfiguredProviderCount(capabilityData, item.id)}/{getSupportedModelCount(capabilityData, item.id)}</span>
                  </div>
                </button>
              )
            })}
          </div>

          {action === 'vision' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">本地图片</Label>
                <Input type="file" accept="image/*" onChange={event => void loadVisionFile(event.target.files?.[0] ?? null)} />
                {visionFileName && <p className="truncate text-xs text-muted-foreground">已加载 {visionFileName}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">图片链接</Label>
                <Input
                  value={visionFileName && imageUrl.startsWith('data:') ? '' : imageUrl}
                  onChange={event => {
                    setImageUrl(event.target.value)
                    setVisionFileName('')
                  }}
                  placeholder={visionFileName ? '已加载本地图片；粘贴链接可替换。' : 'https://... or data:image/png;base64,...'}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          )}

          {(action === 'image_edit' || action === 'image_variation') && (
            <div className="space-y-1.5">
              <Label className="text-xs">图片文件</Label>
              <Input type="file" accept="image/*" onChange={event => setImageFile(event.target.files?.[0] ?? null)} />
            </div>
          )}

          {action === 'image_edit' && (
            <div className="space-y-1.5">
              <Label className="text-xs">遮罩文件</Label>
              <Input type="file" accept="image/*" onChange={event => setMaskFile(event.target.files?.[0] ?? null)} />
            </div>
          )}

          {(action === 'transcription' || action === 'translation') && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">音频文件</Label>
                <Input type="file" accept="audio/*" onChange={event => setAudioFile(event.target.files?.[0] ?? null)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">响应格式</Label>
                  <Select value={responseFormat} onValueChange={(value) => setResponseFormat(value ?? 'json')}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="json">json</SelectItem>
                      <SelectItem value="text">text</SelectItem>
                      <SelectItem value="verbose_json">verbose_json</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {action === 'transcription' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">语言</Label>
                    <Input value={language} onChange={event => setLanguage(event.target.value)} placeholder="en" />
                  </div>
                )}
              </div>
            </>
          )}

          {(action === 'speech' || action === 'realtime') && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">音色</Label>
                <Input value={voice} onChange={event => setVoice(event.target.value)} />
              </div>
              {action === 'speech' && (
                <div className="space-y-1.5">
                  <Label className="text-xs">格式</Label>
                  <Select value={speechFormat} onValueChange={(value) => setSpeechFormat(value ?? 'wav')}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wav">wav</SelectItem>
                      <SelectItem value="pcm">pcm</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={clearMessages} disabled={busy || messages.length === 0} className="gap-2">
              <Trash2 className="size-3.5" />
              清空
            </Button>
            <Badge variant="outline" className="font-mono">{activeDefinition.endpoint}</Badge>
          </div>
        </div>
      </section>

      <section className="flex min-h-[620px] min-w-0 flex-col overflow-hidden rounded-lg border bg-card lg:min-h-0 lg:max-h-full">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-medium">对话</h2>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {activeAction.label} 通过 {activeModelLabel}
            </p>
          </div>
          {showRealtime && (
            <Button variant="outline" size="sm" onClick={() => setShowRealtime(false)}>
              '隐藏实时会话'
            </Button>
          )}
        </div>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
              选择功能，发送请求，响应将在此会话中保留。
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map(message => (
                <div
                  key={message.id}
                  className={cn(
                    'max-w-[88%] rounded-lg border px-3 py-2',
                    message.role === 'user' ? 'ml-auto bg-muted/70' : message.role === 'system' ? 'mx-auto bg-background' : 'bg-background',
                    message.status === 'error' && 'border-destructive/50 bg-destructive/10',
                  )}
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge variant={message.role === 'assistant' ? 'default' : 'outline'}>{message.role === 'user' ? '用户' : message.role === 'assistant' ? '助手' : message.role === 'system' ? '系统' : message.role}</Badge>
                    {message.status === 'error' && <Badge variant="destructive">错误</Badge>}
                    {message.meta?.platform && <Badge variant="outline">{message.meta.platform}</Badge>}
                    {message.meta?.model && <code className="break-all text-[11px] text-muted-foreground">{message.meta.model}</code>}
                    {message.meta?.latency != null && <span className="text-[11px] text-muted-foreground tabular-nums">{message.meta.latency} ms</span>}
                    {message.role === 'assistant' && (
                      <div className="ml-auto flex items-center gap-1">
                        <Button variant="ghost" size="icon-xs" title="复制" onClick={() => copyMessage(message.content)}>
                          <Clipboard className="size-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          title="朗读"
                          disabled={speakingId != null}
                          onClick={() => speakMessage(message)}
                        >
                          {speakingId === message.id ? <Loader2 className="size-3 animate-spin" /> : <Volume2 className="size-3" />}
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.content}</div>
                  {message.imageUrl && (
                    <div className="mt-2 overflow-hidden rounded-md border bg-muted">
                      <img src={message.imageUrl} alt="视觉输入" className="max-h-[260px] w-full object-contain" />
                    </div>
                  )}
                  {message.imageSrc && (
                    <div className="mt-2 overflow-hidden rounded-md border bg-muted">
                      <img src={message.imageSrc} alt="生成结果" className="max-h-[360px] w-full object-contain" />
                    </div>
                  )}
                  {message.audioSrc && <audio controls src={message.audioSrc} className="mt-2 w-full" />}
                </div>
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {showRealtime && (
          <div className="border-t">
            <RealtimeSessionPanel
              apiKey={apiKey}
              model={selectedModel === 'auto' ? undefined : selectedModel}
              instructions={input}
              voice={voice}
              variant="voice"
            />
          </div>
        )}

        <div className="border-t p-4">
          <div className="space-y-2">
            <Label className="text-xs">
              {action === 'realtime' ? '实时指令' : action === 'speech' ? '朗读文本' : action === 'embeddings' ? '文本' : '消息'}
            </Label>
            <Textarea
              value={input}
              onChange={event => setInput(event.target.value)}
              rows={3}
              placeholder={activeAction.helper}
              className="max-h-40 resize-none text-sm"
              onKeyDown={event => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault()
                  void runAction()
                }
              }}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {action === 'realtime' ? <Mic className="size-3.5" /> : <SendHorizontal className="size-3.5" />}
              <span>{action === 'realtime' ? '打开面板，连接后开始录音。' : 'Ctrl+Enter 发送当前操作。'}</span>
            </div>
            <Button onClick={runAction} disabled={busy} className="gap-2">
              {busy ? <Loader2 className="size-4 animate-spin" /> : action === 'realtime' ? <Radio className="size-4" /> : <SendHorizontal className="size-4" />}
              {action === 'realtime' ? '打开实时会话' : `运行 ${activeAction.label}`}
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
