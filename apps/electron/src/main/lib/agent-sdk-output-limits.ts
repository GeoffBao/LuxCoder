import type { ProviderType } from '@luxagents/shared'

export function getAgentSdkMaxOutputTokens(provider: ProviderType): string {
  return provider === 'anthropic' ? '64000' : '32768'
}
