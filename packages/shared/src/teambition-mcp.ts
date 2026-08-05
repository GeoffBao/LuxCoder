/**
 * Teambition MCP 识别工具
 *
 * 看板同步需要连接 Teambition (TB) MCP。为了兼容不同用户的历史命名，识别采用
 * 宽松策略而非只匹配规范名 `TB-Connect`：
 *  1. 精确匹配 server key === 'TB-Connect'（推荐名）
 *  2. URL 匹配：server.url 包含 TB 网关域名或路径
 *  3. 名称匹配：server key 包含 tb / teambition（不区分大小写）
 *
 * 这样用户已自定义命名（TB-wxy、teambition-mcp 等）也能被识别，不会漏掉提示。
 */

import type { McpServerEntry } from './types/agent'

/** Teambition MCP 推荐统一名（预制 MCP 骨架使用；用户可自行改名但仍会被宽松识别） */
export const TB_MCP_PREFERRED_NAME = 'TB-Connect' as const

/** TB 网关 URL 特征（用于 URL 匹配识别） */
const TB_GATEWAY_URL_HINTS = [
  'rd.luxshare.com.cn/gateway/mcp',
  'teambition',
  'aliwork',
]

/** 名称特征（用于 server key 匹配识别） */
const TB_NAME_HINTS = ['tb', 'teambition']

function containsAny(haystack: string, needles: string[]): boolean {
  const lower = haystack.toLowerCase()
  return needles.some((needle) => lower.includes(needle.toLowerCase()))
}

/** 判断某个 MCP server 条目是否指向 Teambition */
export function isTeambitionMcpEntry(name: string, entry: McpServerEntry | undefined): boolean {
  if (!entry) return false

  // 1. 精确匹配推荐名
  if (name === TB_MCP_PREFERRED_NAME) return true

  // 2. URL 匹配（http/sse 类型带 url）
  if (entry.url && containsAny(entry.url, TB_GATEWAY_URL_HINTS)) return true

  // 3. 名称模糊匹配
  if (containsAny(name, TB_NAME_HINTS)) return true

  return false
}

/**
 * 从工作区 MCP 配置中查找 Teambition MCP：
 * 返回 { name, entry }（首个匹配）；未找到返回 null。
 * 若多个候选，优先推荐名 TB-Connect，其次按配置顺序返回首个。
 */
export function findTeambitionMcpEntry(
  config: { servers: Record<string, McpServerEntry> } | undefined | null,
): { name: string; entry: McpServerEntry } | null {
  if (!config?.servers) return null

  const entries = Object.entries(config.servers)
  const matches = entries.filter(([name, entry]) => isTeambitionMcpEntry(name, entry))

  if (matches.length === 0) return null

  const preferred = matches.find(([name]) => name === TB_MCP_PREFERRED_NAME)
  const [name, entry] = preferred ?? matches[0]!
  return { name, entry }
}

/**
 * 识别结果分类：
 * - 'preferred'  已按推荐名 TB-Connect 配置（理想态）
 * - 'custom'     已配置但使用了自定义名（需提示可重命名，但功能可用）
 * - 'missing'    完全未配置 Teambition MCP（需引导添加）
 */
export type TeambitionMcpRecognition =
  | { status: 'preferred'; name: string; entry: McpServerEntry }
  | { status: 'custom'; name: string; entry: McpServerEntry }
  | { status: 'missing' }

export function recognizeTeambitionMcp(
  config: { servers: Record<string, McpServerEntry> } | undefined | null,
): TeambitionMcpRecognition {
  const found = findTeambitionMcpEntry(config)
  if (!found) return { status: 'missing' }
  return found.name === TB_MCP_PREFERRED_NAME
    ? { status: 'preferred', ...found }
    : { status: 'custom', ...found }
}
