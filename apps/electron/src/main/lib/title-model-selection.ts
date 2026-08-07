import type { Channel, ChannelModel, ProviderType } from '@myyoda/shared'

export type TitleProviderSetting = 'session' | ProviderType

export function resolveTitleChannel(
  channels: Channel[],
  sessionChannelId: string,
  titleProvider: TitleProviderSetting = 'session',
): Channel | undefined {
  const sessionChannel = channels.find((channel) => channel.id === sessionChannelId)
  if (titleProvider === 'session' || !titleProvider) return sessionChannel
  return channels.find((channel) => channel.enabled && channel.provider === titleProvider) ?? sessionChannel
}

interface TitleModelSelectionInput {
  provider: ProviderType
  defaultModelId: string
  models: ChannelModel[]
}

const PROVIDER_TITLE_MODEL_PREFERENCES: Partial<Record<ProviderType, string[]>> = {
  'openai-codex': ['gpt-5.4-mini'],
}

function isEnabledModel(model: ChannelModel): boolean {
  return model.enabled
}

function isLightweightModel(model: ChannelModel): boolean {
  const normalized = `${model.id} ${model.name}`.toLowerCase()
  return /(?:mini|haiku|flash|lite|small|nano|spark)/.test(normalized)
}

export function resolveTitleModel(input: TitleModelSelectionInput): string {
  const enabledModels = input.models.filter(isEnabledModel)
  const preferredIds = PROVIDER_TITLE_MODEL_PREFERENCES[input.provider] ?? []
  for (const preferredId of preferredIds) {
    if (enabledModels.some((model) => model.id === preferredId)) return preferredId
  }

  const lightweight = input.provider === 'openai-codex'
    ? undefined
    : enabledModels.find(isLightweightModel)
  return lightweight?.id ?? input.defaultModelId
}
