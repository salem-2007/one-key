// Realtime audio helpers

export interface RealtimeAudioChunk {
  data: Float32Array
  timestamp: number
}

export function createRealtimeSetupMessage(config: Record<string, unknown>) {
  return JSON.stringify({ type: 'session.update', session: config })
}

export function createRealtimeAudioInputMessage(audioBase64: string, mimeType: string) {
  return JSON.stringify({
    type: 'input_audio_buffer.append',
    audio: audioBase64,
    mime_type: mimeType,
  })
}

export function createRealtimeAudioStreamEndMessage() {
  return JSON.stringify({ type: 'input_audio_buffer.commit' })
}

export function createRealtimeClientContentMessage(content: string) {
  return JSON.stringify({
    type: 'conversation.item.create',
    item: {
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: content }],
    },
  })
}

export function parseRealtimeEvent(raw: string): { type: string; [key: string]: unknown } | null {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function encodeAudioForRealtime(pcm: Float32Array): string {
  const bytes = new Uint8Array(pcm.buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export function float32ToPcm16Base64(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]))
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
  }
  const bytes = new Uint8Array(int16.buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export function base64ToPcm16Float32(b64: string): Float32Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  const int16 = new Int16Array(bytes.buffer)
  const float32 = new Float32Array(int16.length)
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0
  }
  return float32
}

export function concatFloat32Arrays(arrays: Float32Array[]): Float32Array {
  const totalLength = arrays.reduce((sum, a) => sum + a.length, 0)
  const result = new Float32Array(totalLength)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}

export function parsePcmMimeTypeSampleRate(mimeType: string): number {
  const match = mimeType.match(/rate=(\d+)/)
  return match ? parseInt(match[1], 10) : 24000
}

export function summarizeRealtimeServerMessage(msg: Record<string, unknown>): string {
  const type = msg.type as string
  if (type === 'session.created') return 'Session created'
  if (type === 'session.updated') return 'Session updated'
  if (type === 'response.text.delta') return (msg.delta as string) ?? ''
  if (type === 'response.text.done') return (msg.text as string) ?? ''
  if (type === 'response.audio_transcript.delta') return (msg.delta as string) ?? ''
  if (type === 'response.audio_transcript.done') return (msg.transcript as string) ?? ''
  if (type === 'error') return (msg.error as any)?.message ?? 'Unknown error'
  return type
}
