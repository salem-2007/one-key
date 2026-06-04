import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Clipboard, Code2, KeyRound, Terminal } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'
import { cn } from '@/lib/utils'
import {
  getConfiguredProviderCount,
  getPlaygroundMode,
  getSupportedModelCount,
  PLAYGROUND_MODES,
  type PlaygroundCapabilityMode,
} from '../../../shared/playground'
import type { CapabilitiesResponse } from '../../../shared/types'

type SnippetLanguage = 'javascript' | 'python' | 'curl'

const languageLabels: Record<SnippetLanguage, string> = {
  javascript: 'JavaScript',
  python: 'Python',
  curl: 'cURL',
}

const capabilityDescriptions: Record<PlaygroundCapabilityMode, string> = {
  chat: '通过故障转移链路由文本提示。',
  vision: '发送文本加图片 URL 或数据 URL 到视觉模型。',
  embeddings: '为搜索、记忆或排序工作流创建向量。',
  image_generation: '生成图像并默认返回 base64 编码。',
  image_edit: '上传图片并进行提供者支持的编辑。',
  image_variation: '上传图片并请求生成变体。',
  speech: '通过配置的语音模型将文本转为音频。',
  transcription: '上传音频并获取文本或 JSON 转录输出。',
  translation: '上传音频并将语音翻译为英文文本。',
  realtime: '为浏览器会话客户端创建实时音频会话。',
}

function getBaseUrl() {
  if (typeof window === 'undefined') return 'http://localhost:3001/v1'
  return `${window.location.origin}/v1`
}

function envSnippet(language: SnippetLanguage, baseUrl: string, apiKey: string) {
  if (language === 'javascript') {
    return [
      `npm install openai`,
      ``,
      `FREELLMAPI_BASE_URL="${baseUrl}"`,
      `ONEKEY_KEY="${apiKey || 'onekey-your-local-key'}"`,
    ].join('\n')
  }

  if (language === 'python') {
    return [
      `pip install openai`,
      ``,
      `set FREELLMAPI_BASE_URL=${baseUrl}`,
      `set ONEKEY_KEY=${apiKey || 'onekey-your-local-key'}`,
    ].join('\n')
  }

  return [
    `$env:FREELLMAPI_BASE_URL = "${baseUrl}"`,
    `$env:ONEKEY_KEY = "${apiKey || 'onekey-your-local-key'}"`,
  ].join('\n')
}

function clientSnippet(language: SnippetLanguage, baseUrl: string) {
  if (language === 'javascript') {
    return [
      `import OpenAI from "openai";`,
      ``,
      `const client = new OpenAI({`,
      `  apiKey: process.env.ONEKEY_KEY,`,
      `  baseURL: process.env.FREELLMAPI_BASE_URL ?? "${baseUrl}",`,
      `});`,
    ].join('\n')
  }

  if (language === 'python') {
    return [
      `import os`,
      `from openai import OpenAI`,
      ``,
      `client = OpenAI(`,
      `    api_key=os.environ["ONEKEY_KEY"],`,
      `    base_url=os.environ.get("FREELLMAPI_BASE_URL", "${baseUrl}"),`,
      `)`,
    ].join('\n')
  }

  return [
    `curl "$env:FREELLMAPI_BASE_URL/models" \\`,
    `  -H "Authorization: Bearer $env:ONEKEY_KEY"`,
  ].join('\n')
}

function capabilitySnippet(mode: PlaygroundCapabilityMode, language: SnippetLanguage, baseUrl: string) {
  if (language === 'curl') return curlSnippet(mode)
  if (language === 'python') return pythonSnippet(mode, baseUrl)
  return javascriptSnippet(mode, baseUrl)
}

function javascriptSnippet(mode: PlaygroundCapabilityMode, baseUrl: string) {
  switch (mode) {
    case 'chat':
      return [
        `const response = await client.chat.completions.create({`,
        `  model: "auto",`,
        `  messages: [{ role: "user", content: "用一句话描述此路由器。" }],`,
        `});`,
        ``,
        `console.log(response.choices[0]?.message?.content);`,
      ].join('\n')
    case 'vision':
      return [
        `const response = await client.chat.completions.create({`,
        `  model: "auto",`,
        `  messages: [{`,
        `    role: "user",`,
        `    content: [`,
        `      { type: "text", text: "这张图片中是什么？" },`,
        `      { type: "image_url", image_url: { url: "https://example.com/image.png" } },`,
        `    ],`,
        `  }],`,
        `});`,
        ``,
        `console.log(response.choices[0]?.message?.content);`,
      ].join('\n')
    case 'embeddings':
      return [
        `const embedding = await client.embeddings.create({`,
        `  model: "auto",`,
        `  input: "ONEKEY 路由向量化请求。",`,
        `});`,
        ``,
        `console.log(embedding.data[0].embedding.length);`,
      ].join('\n')
    case 'image_generation':
      return [
        `const image = await client.images.generate({`,
        `  model: "auto",`,
        `  prompt: "本地 AI 网关的简洁应用图标",`,
        `  size: "1024x1024",`,
        `  response_format: "b64_json",`,
        `});`,
        ``,
        `console.log(image.data[0].b64_json);`,
      ].join('\n')
    case 'image_edit':
      return [
        `import fs from "node:fs";`,
        ``,
        `const edited = await client.images.edit({`,
        `  model: "auto",`,
        `  image: fs.createReadStream("input.png"),`,
        `  prompt: "将背景替换为白色摄影棚背景。",`,
        `  response_format: "b64_json",`,
        `});`,
        ``,
        `console.log(edited.data[0].b64_json);`,
      ].join('\n')
    case 'image_variation':
      return [
        `import fs from "node:fs";`,
        ``,
        `const variation = await client.images.createVariation({`,
        `  model: "auto",`,
        `  image: fs.createReadStream("input.png"),`,
        `  response_format: "b64_json",`,
        `});`,
        ``,
        `console.log(variation.data[0].b64_json);`,
      ].join('\n')
    case 'speech':
      return [
        `import fs from "node:fs/promises";`,
        ``,
        `const audio = await client.audio.speech.create({`,
        `  model: "auto",`,
        `  voice: "alloy",`,
        `  input: "ONEKEY 可通过配置的提供者进行语音合成。",`,
        `  response_format: "wav",`,
        `});`,
        ``,
        `await fs.writeFile("speech.wav", Buffer.from(await audio.arrayBuffer()));`,
      ].join('\n')
    case 'transcription':
      return [
        `import fs from "node:fs";`,
        ``,
        `const text = await client.audio.transcriptions.create({`,
        `  model: "auto",`,
        `  file: fs.createReadStream("speech.wav"),`,
        `  response_format: "json",`,
        `});`,
        ``,
        `console.log(text);`,
      ].join('\n')
    case 'translation':
      return [
        `import fs from "node:fs";`,
        ``,
        `const translated = await client.audio.translations.create({`,
        `  model: "auto",`,
        `  file: fs.createReadStream("speech.wav"),`,
        `  response_format: "json",`,
        `});`,
        ``,
        `console.log(translated);`,
      ].join('\n')
    case 'realtime':
      return [
        `const session = await fetch("${baseUrl}/realtime/sessions", {`,
        `  method: "POST",`,
        `  headers: {`,
        `    "Authorization": \`Bearer \${process.env.ONEKEY_KEY}\`,`,
        `    "Content-Type": "application/json",`,
        `  },`,
        `  body: JSON.stringify({`,
        `    model: "auto",`,
        `    instructions: "你简洁而乐于助人。",`,
        `    voice: "alloy",`,
        `    response_modalities: ["AUDIO"],`,
        `  }),`,
        `}).then(res => res.json());`,
        ``,
        `console.log(session.connect_url, session.client_secret.value);`,
      ].join('\n')
  }
}

function pythonSnippet(mode: PlaygroundCapabilityMode, baseUrl: string) {
  switch (mode) {
    case 'chat':
      return [
        `response = client.chat.completions.create(`,
        `    model="auto",`,
        `    messages=[{"role": "user", "content": "用一句话描述此路由器。"}],`,
        `)`,
        ``,
        `print(response.choices[0].message.content)`,
      ].join('\n')
    case 'vision':
      return [
        `response = client.chat.completions.create(`,
        `    model="auto",`,
        `    messages=[{`,
        `        "role": "user",`,
        `        "content": [`,
        `            {"type": "text", "text": "这张图片中是什么？"},`,
        `            {"type": "image_url", "image_url": {"url": "https://example.com/image.png"}},`,
        `        ],`,
        `    }],`,
        `)`,
        ``,
        `print(response.choices[0].message.content)`,
      ].join('\n')
    case 'embeddings':
      return [
        `embedding = client.embeddings.create(`,
        `    model="auto",`,
        `    input="ONEKEY 路由向量化请求。",`,
        `)`,
        ``,
        `print(len(embedding.data[0].embedding))`,
      ].join('\n')
    case 'image_generation':
      return [
        `image = client.images.generate(`,
        `    model="auto",`,
        `    prompt="本地 AI 网关的简洁应用图标",`,
        `    size="1024x1024",`,
        `    response_format="b64_json",`,
        `)`,
        ``,
        `print(image.data[0].b64_json)`,
      ].join('\n')
    case 'image_edit':
      return [
        `with open("input.png", "rb") as image_file:`,
        `    edited = client.images.edit(`,
        `        model="auto",`,
        `        image=image_file,`,
        `        prompt="将背景替换为白色摄影棚背景。",`,
        `        response_format="b64_json",`,
        `    )`,
        ``,
        `print(edited.data[0].b64_json)`,
      ].join('\n')
    case 'image_variation':
      return [
        `with open("input.png", "rb") as image_file:`,
        `    variation = client.images.create_variation(`,
        `        model="auto",`,
        `        image=image_file,`,
        `        response_format="b64_json",`,
        `    )`,
        ``,
        `print(variation.data[0].b64_json)`,
      ].join('\n')
    case 'speech':
      return [
        `speech = client.audio.speech.create(`,
        `    model="auto",`,
        `    voice="alloy",`,
        `    input="ONEKEY 可通过配置的提供者进行语音合成。",`,
        `    response_format="wav",`,
        `)`,
        ``,
        `speech.write_to_file("speech.wav")`,
      ].join('\n')
    case 'transcription':
      return [
        `with open("speech.wav", "rb") as audio_file:`,
        `    text = client.audio.transcriptions.create(`,
        `        model="auto",`,
        `        file=audio_file,`,
        `        response_format="json",`,
        `    )`,
        ``,
        `print(text)`,
      ].join('\n')
    case 'translation':
      return [
        `with open("speech.wav", "rb") as audio_file:`,
        `    translated = client.audio.translations.create(`,
        `        model="auto",`,
        `        file=audio_file,`,
        `        response_format="json",`,
        `    )`,
        ``,
        `print(translated)`,
      ].join('\n')
    case 'realtime':
      return [
        `import os`,
        `import requests`,
        ``,
        `session = requests.post(`,
        `    "${baseUrl}/realtime/sessions",`,
        `    headers={"Authorization": f"Bearer {os.environ['ONEKEY_KEY']}"},`,
        `    json={`,
        `        "model": "auto",`,
        `        "instructions": "你简洁而乐于助人。",`,
        `        "voice": "alloy",`,
        `        "response_modalities": ["AUDIO"],`,
        `    },`,
        `    timeout=30,`,
        `).json()`,
        ``,
        `print(session["connect_url"], session["client_secret"]["value"])`,
      ].join('\n')
  }
}

function curlSnippet(mode: PlaygroundCapabilityMode) {
  switch (mode) {
    case 'chat':
      return [
        `curl "$env:FREELLMAPI_BASE_URL/chat/completions" \\`,
        `  -H "Authorization: Bearer $env:ONEKEY_KEY" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  -d '{"model":"auto","messages":[{"role":"user","content":"用一句话描述此路由器。"}]}'`,
      ].join('\n')
    case 'vision':
      return [
        `curl "$env:FREELLMAPI_BASE_URL/chat/completions" \\`,
        `  -H "Authorization: Bearer $env:ONEKEY_KEY" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  -d '{"model":"auto","messages":[{"role":"user","content":[{"type":"text","text":"这张图片中是什么？"},{"type":"image_url","image_url":{"url":"https://example.com/image.png"}}]}]}'`,
      ].join('\n')
    case 'embeddings':
      return [
        `curl "$env:FREELLMAPI_BASE_URL/embeddings" \\`,
        `  -H "Authorization: Bearer $env:ONEKEY_KEY" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  -d '{"model":"auto","input":"ONEKEY 路由向量化请求。"}'`,
      ].join('\n')
    case 'image_generation':
      return [
        `curl "$env:FREELLMAPI_BASE_URL/images/generations" \\`,
        `  -H "Authorization: Bearer $env:ONEKEY_KEY" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  -d '{"model":"auto","prompt":"本地 AI 网关的简洁应用图标","size":"1024x1024","response_format":"b64_json"}'`,
      ].join('\n')
    case 'image_edit':
      return [
        `curl "$env:FREELLMAPI_BASE_URL/images/edits" \\`,
        `  -H "Authorization: Bearer $env:ONEKEY_KEY" \\`,
        `  -F model=auto \\`,
        `  -F image=@input.png \\`,
        `  -F prompt="将背景替换为白色摄影棚背景。" \\`,
        `  -F response_format=b64_json`,
      ].join('\n')
    case 'image_variation':
      return [
        `curl "$env:FREELLMAPI_BASE_URL/images/variations" \\`,
        `  -H "Authorization: Bearer $env:ONEKEY_KEY" \\`,
        `  -F model=auto \\`,
        `  -F image=@input.png \\`,
        `  -F response_format=b64_json`,
      ].join('\n')
    case 'speech':
      return [
        `curl "$env:FREELLMAPI_BASE_URL/audio/speech" \\`,
        `  -H "Authorization: Bearer $env:ONEKEY_KEY" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  -d '{"model":"auto","voice":"alloy","input":"ONEKEY 可通过配置的提供者进行语音合成。","response_format":"wav"}' \\`,
        `  --output speech.wav`,
      ].join('\n')
    case 'transcription':
      return [
        `curl "$env:FREELLMAPI_BASE_URL/audio/transcriptions" \\`,
        `  -H "Authorization: Bearer $env:ONEKEY_KEY" \\`,
        `  -F model=auto \\`,
        `  -F file=@speech.wav \\`,
        `  -F response_format=json`,
      ].join('\n')
    case 'translation':
      return [
        `curl "$env:FREELLMAPI_BASE_URL/audio/translations" \\`,
        `  -H "Authorization: Bearer $env:ONEKEY_KEY" \\`,
        `  -F model=auto \\`,
        `  -F file=@speech.wav \\`,
        `  -F response_format=json`,
      ].join('\n')
    case 'realtime':
      return [
        `curl "$env:FREELLMAPI_BASE_URL/realtime/sessions" \\`,
        `  -H "Authorization: Bearer $env:ONEKEY_KEY" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  -d '{"model":"auto","instructions":"你简洁而乐于助人。","voice":"alloy","response_modalities":["AUDIO"]}'`,
      ].join('\n')
  }
}

function CopyButton({ id, value, copiedId, onCopy }: {
  id: string
  value: string
  copiedId: string | null
  onCopy: (id: string, value: string) => void
}) {
  const copied = copiedId === id
  return (
    <Button variant="ghost" size="icon-xs" onClick={() => onCopy(id, value)} aria-label="Copy snippet">
      {copied ? <Check className="text-emerald-500" /> : <Clipboard />}
    </Button>
  )
}

function CodeBlock({
  id,
  code,
  copiedId,
  onCopy,
}: {
  id: string
  code: string
  copiedId: string | null
  onCopy: (id: string, value: string) => void
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="font-mono text-[11px] text-muted-foreground">可复制</span>
        <CopyButton id={id} value={code} copiedId={copiedId} onCopy={onCopy} />
      </div>
      <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words p-3 text-xs leading-relaxed">
        {code}
      </pre>
    </div>
  )
}

function statusForMode(data: CapabilitiesResponse | undefined, mode: PlaygroundCapabilityMode) {
  const configured = getConfiguredProviderCount(data, mode)
  const supported = getSupportedModelCount(data, mode)
  if (configured > 0) return { configured, supported, label: '就绪', dot: 'bg-emerald-500' }
  if (supported > 0) return { configured, supported, label: '需要密钥', dot: 'bg-amber-500' }
  return { configured, supported, label: '不支持', dot: 'bg-muted-foreground/25' }
}

export default function IntegrationsPage() {
  const [language, setLanguage] = useState<SnippetLanguage>('javascript')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const baseUrl = useMemo(getBaseUrl, [])

  const { data: keyData } = useQuery<{ apiKey: string }>({
    queryKey: ['unified-key'],
    queryFn: () => apiFetch('/api/settings/api-key'),
  })

  const { data: capabilityData } = useQuery<CapabilitiesResponse>({
    queryKey: ['models', 'capabilities'],
    queryFn: () => apiFetch('/api/models/capabilities'),
  })

  const apiKey = keyData?.apiKey ?? ''
  const setupCode = envSnippet(language, baseUrl, apiKey)
  const clientCode = clientSnippet(language, baseUrl)

  async function copy(id: string, value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedId(id)
      window.setTimeout(() => setCopiedId(current => current === id ? null : current), 1400)
    } catch {
      setCopiedId(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="集成指南"
        description="为每个已配置的端点提供可复制的 SDK 和 HTTP 代码片段"
        actions={
          <div className="flex gap-1 rounded-md border p-0.5">
            {(Object.keys(languageLabels) as SnippetLanguage[]).map(item => (
              <Button
                key={item}
                variant={language === item ? 'secondary' : 'ghost'}
                size="xs"
                onClick={() => setLanguage(item)}
              >
                {languageLabels[item]}
              </Button>
            ))}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="rounded-lg border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <Terminal className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-medium">连接信息</h2>
            </div>
            <div className="space-y-3">
              <div>
                <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">基础地址</div>
                <div className="flex min-w-0 items-center gap-2 rounded-md border bg-background px-2 py-1.5">
                  <code className="min-w-0 flex-1 truncate text-xs">{baseUrl}</code>
                  <CopyButton id="base-url" value={baseUrl} copiedId={copiedId} onCopy={copy} />
                </div>
              </div>
              <div>
                <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">API 密钥</div>
                <div className="flex min-w-0 items-center gap-2 rounded-md border bg-background px-2 py-1.5">
                  <KeyRound className="size-3.5 text-muted-foreground" />
                  <code className="min-w-0 flex-1 truncate text-xs">{apiKey || '加载中...'}</code>
                  <CopyButton id="api-key" value={apiKey} copiedId={copiedId} onCopy={copy} />
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-lg border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <Code2 className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-medium">设置</h2>
            </div>
            <CodeBlock
              id={`setup-${language}`}
              code={setupCode}
              copiedId={copiedId}
              onCopy={copy}
            />
          </section>

          <section className="rounded-lg border bg-card p-4">
            <h2 className="mb-3 text-sm font-medium">客户端引导</h2>
            <CodeBlock
              id={`client-${language}`}
              code={clientCode}
              copiedId={copiedId}
              onCopy={copy}
            />
          </section>
        </aside>

        <section className="min-w-0 space-y-3">
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {PLAYGROUND_MODES.map(mode => {
              const definition = getPlaygroundMode(mode.id)
              const code = capabilitySnippet(mode.id, language, baseUrl)
              const status = statusForMode(capabilityData, mode.id)
              return (
                <article key={mode.id} className="min-w-0 overflow-hidden rounded-lg border bg-card">
                  <div className="border-b p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn('size-2 rounded-full', status.dot)} />
                          <h2 className="truncate text-sm font-medium">{definition.label}</h2>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{capabilityDescriptions[mode.id]}</p>
                      </div>
                      <Badge variant={status.configured > 0 ? 'default' : 'outline'}>
                        {status.label}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <code className="rounded-md bg-muted px-1.5 py-0.5">{definition.endpoint}</code>
                      <span className="tabular-nums">{status.configured}/{status.supported} 可路由</span>
                    </div>
                  </div>
                  <div className="p-4">
                    <CodeBlock
                      id={`${language}-${mode.id}`}
                      code={code}
                      copiedId={copiedId}
                      onCopy={copy}
                    />
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
