import type { AiProvider, CandidateProfile } from '../types'

export type ProviderMeta = {
  id: AiProvider
  label: string
  keyLabel: string
  keyPlaceholder: string
  keyUrl: string
  model: string
}

export const AI_PROVIDERS: ProviderMeta[] = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    keyLabel: 'Gemini API key',
    keyPlaceholder: 'AIza…',
    keyUrl: 'https://aistudio.google.com/apikey',
    model: 'gemini-2.5-flash',
  },
  {
    id: 'openai',
    label: 'ChatGPT (OpenAI)',
    keyLabel: 'OpenAI API key',
    keyPlaceholder: 'sk-…',
    keyUrl: 'https://platform.openai.com/api-keys',
    model: 'gpt-4o-mini',
  },
  {
    id: 'claude',
    label: 'Claude (Anthropic)',
    keyLabel: 'Anthropic API key',
    keyPlaceholder: 'sk-ant-…',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    model: 'claude-3-5-haiku-latest',
  },
  {
    id: 'grok',
    label: 'Grok (xAI)',
    keyLabel: 'xAI API key',
    keyPlaceholder: 'xai-…',
    keyUrl: 'https://console.x.ai/',
    model: 'grok-2-latest',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    keyLabel: 'OpenRouter API key',
    keyPlaceholder: 'sk-or-…',
    keyUrl: 'https://openrouter.ai/keys',
    model: 'google/gemini-2.0-flash-001',
  },
]

export function providerMeta(id: AiProvider): ProviderMeta {
  return AI_PROVIDERS.find((p) => p.id === id) ?? AI_PROVIDERS[0]
}

export function profileApiKey(profile: CandidateProfile, provider = profile.aiProvider): string {
  switch (provider) {
    case 'openai':
      return profile.openaiApiKey.trim()
    case 'claude':
      return profile.claudeApiKey.trim()
    case 'grok':
      return profile.grokApiKey.trim()
    case 'openrouter':
      return profile.openrouterApiKey.trim()
    default:
      return profile.geminiApiKey.trim()
  }
}

export function hasAiConfigured(profile: CandidateProfile): boolean {
  return Boolean(profileApiKey(profile))
}

export function resolveOpenRouterModel(profile: CandidateProfile): string {
  const custom = profile.openrouterModel.trim()
  if (custom) return custom
  return providerMeta('openrouter').model
}
