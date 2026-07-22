import type { Channel } from '@luxcoder/shared'
import type { KanbanModelOption, KanbanModelProviderGroup } from './types'

export interface KanbanModelSelection {
  modelId: string
  channelId: string
}

export interface KanbanModelCatalog {
  groups: KanbanModelProviderGroup[]
  /** modelId → channelId（仅作回退；同 modelId 跨渠道时后写覆盖，优先用显式 channelId） */
  modelToConnection: Map<string, string>
}

/**
 * 从已启用渠道构建看板模型目录。
 * 每个选项携带 channelId，避免同 modelId 跨渠道时路由错绑。
 */
export function buildKanbanModelCatalog(
  channels: Channel[],
  filterChannelIds?: string[],
): KanbanModelCatalog {
  const groups: KanbanModelProviderGroup[] = []
  const modelToConnection = new Map<string, string>()
  const filter = filterChannelIds && filterChannelIds.length > 0
    ? new Set(filterChannelIds)
    : null

  for (const channel of channels) {
    if (!channel.enabled) continue
    if (filter && !filter.has(channel.id)) continue
    const models: KanbanModelOption[] = channel.models
      .filter((model) => model.enabled)
      .map((model) => ({
        id: model.id,
        name: model.name || model.id,
        channelId: channel.id,
      }))
    if (models.length === 0) continue
    groups.push({
      provider: channel.provider,
      label: channel.name,
      models,
    })
    for (const model of models) {
      modelToConnection.set(model.id, channel.id)
    }
  }

  return { groups, modelToConnection }
}

export function resolveKanbanModelName(groups: KanbanModelProviderGroup[], id: string): string {
  if (!id) return '选择模型'
  for (const group of groups) {
    const hit = group.models.find((model) => model.id === id)
    if (hit) return hit.name
  }
  return id
}

/**
 * 运行时 ModelChip 展示文案：优先渠道友好名，否则压缩 raw model id。
 * 去掉日期后缀，过长则保留末段并截断，避免 `deepseek-...` 无信息截断。
 */
export function formatModelChipLabel(
  modelId: string,
  groups?: readonly KanbanModelProviderGroup[],
): string {
  const id = modelId.trim()
  if (!id) return ''
  const resolved = groups && groups.length > 0 ? resolveKanbanModelName([...groups], id) : id
  const base = (resolved === '选择模型' ? id : resolved).replace(/-\d{8}$/, '')
  if (base.length <= 22) return base
  const segment = base.split(/[/:]/).filter(Boolean).at(-1) ?? base
  if (segment.length <= 22) return segment
  return `${segment.slice(0, 20)}…`
}

/** 解析当前选中项：优先匹配 channelId+modelId，否则回退到任意同 modelId。 */
export function resolveKanbanModelSelection(
  groups: KanbanModelProviderGroup[],
  modelId: string,
  channelId?: string,
): KanbanModelSelection | null {
  if (!modelId) return null
  if (channelId) {
    for (const group of groups) {
      const hit = group.models.find((model) => model.id === modelId && model.channelId === channelId)
      if (hit) return { modelId: hit.id, channelId: hit.channelId }
    }
  }
  for (const group of groups) {
    const hit = group.models.find((model) => model.id === modelId)
    if (hit) return { modelId: hit.id, channelId: hit.channelId }
  }
  return channelId ? { modelId, channelId } : null
}
