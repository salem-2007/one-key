// Playground mode definitions and helpers
import type { CapabilitiesResponse } from './types'

export type PlaygroundCapabilityMode = 'chat' | 'vision' | 'tools' | 'code' | 'audio' | 'realtime'

export interface PlaygroundModeDefinition {
  id: PlaygroundCapabilityMode
  label: string
  description: string
  icon: string
}

export const PLAYGROUND_MODES: PlaygroundModeDefinition[] = [
  { id: 'chat', label: 'Chat', description: 'Standard chat completion', icon: 'MessageSquare' },
  { id: 'vision', label: 'Vision', description: 'Image + text input', icon: 'ImageIcon' },
  { id: 'tools', label: 'Tools', description: 'Function calling', icon: 'Wrench' },
  { id: 'code', label: 'Code', description: 'Code generation', icon: 'Code2' },
  { id: 'audio', label: 'Audio', description: 'Audio input/output', icon: 'FileAudio' },
  { id: 'realtime', label: 'Realtime', description: 'Realtime voice session', icon: 'Radio' },
]

export function getPlaygroundMode(id: string): PlaygroundModeDefinition | undefined {
  return PLAYGROUND_MODES.find(m => m.id === id)
}

export function isPlaygroundModeConfigured(data: CapabilitiesResponse | undefined, mode: PlaygroundCapabilityMode): boolean {
  if (!data) return false
  if (mode === 'chat') return data.configuredProviderCount > 0
  if (mode === 'vision') return data.models.some(m => m.supportsVision)
  if (mode === 'tools') return data.models.some(m => m.supportsTools)
  if (mode === 'code') return data.configuredProviderCount > 0
  if (mode === 'audio') return data.configuredProviderCount > 0
  if (mode === 'realtime') return data.configuredProviderCount > 0
  return false
}

export function getConfiguredProviderCount(data: CapabilitiesResponse | undefined): number {
  return data?.configuredProviderCount ?? 0
}

export function getSupportedModelCount(data: CapabilitiesResponse | undefined, mode?: PlaygroundCapabilityMode): number {
  if (!data) return 0
  if (!mode || mode === 'chat' || mode === 'code') return data.models.length
  if (mode === 'vision') return data.models.filter(m => m.supportsVision).length
  if (mode === 'tools') return data.models.filter(m => m.supportsTools).length
  return data.models.length
}
