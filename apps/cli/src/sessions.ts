/**
 * 会话索引读取（electron-free）。
 *
 * 与主进程 agent-session-manager.ts 的 readIndex/listAgentSessions 等价，
 * 但不依赖 electron——直接读 <configDir>/agent-sessions.json。CLI 只做只读，
 * 不写索引（导出/清洗不修改用户数据）。
 */
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { AgentSessionMeta } from '@luxcoder/shared'
import { getSessionsDir, getSessionsIndexPath, getSessionMessagesPath, type PathOptions } from './paths'

interface AgentSessionsIndex {
  version: number
  sessions: AgentSessionMeta[]
}

/** 读取会话索引；文件不存在或损坏时返回空列表。 */
export function readSessionIndex(opts: PathOptions = {}): AgentSessionMeta[] {
  const indexPath = getSessionsIndexPath(opts)
  if (!existsSync(indexPath)) return []
  try {
    const data = JSON.parse(readFileSync(indexPath, 'utf-8')) as AgentSessionsIndex
    return Array.isArray(data?.sessions) ? data.sessions : []
  } catch {
    return []
  }
}

/** 列出会话，按 updatedAt 降序（无 updatedAt 的排后）。 */
export function listSessions(opts: PathOptions = {}): AgentSessionMeta[] {
  return readSessionIndex(opts).sort(
    (a, b) => ((b as { updatedAt?: number }).updatedAt ?? 0) - ((a as { updatedAt?: number }).updatedAt ?? 0),
  )
}

export function getSessionMeta(id: string, opts: PathOptions = {}): AgentSessionMeta | undefined {
  return readSessionIndex(opts).find((s) => s.id === id)
}

export interface ResolvedSession {
  id: string
  filePath: string
  meta?: AgentSessionMeta
  /** JSONL 文件字节数（不存在为 undefined）。 */
  bytes?: number
}

/** session id 不得含路径分隔或 `..`，防止 escape agent-sessions/ */
export function isSafeSessionId(id: string): boolean {
  if (!id || id.length > 200) return false
  if (id.includes('..') || id.includes('/') || id.includes('\\') || id.includes('\0')) return false
  if (isAbsolute(id)) return false
  return true
}

function isPathInsideDir(filePath: string, dirPath: string): boolean {
  let fileReal: string
  let dirReal: string
  try {
    fileReal = realpathSync(filePath)
    dirReal = existsSync(dirPath) ? realpathSync(dirPath) : resolve(dirPath)
  } catch {
    return false
  }
  const rel = relative(dirReal, fileReal)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/**
 * 把用户给的 target 解析为会话文件：
 *   - 形如已存在的 .jsonl 路径 → 仅当位于 agent-sessions/ 目录内才允许
 *   - 否则当作 session id，定位 <configDir>/agent-sessions/<id>.jsonl
 * 解析失败（文件不存在 / 越界）返回 undefined，由命令层报错。
 */
export function resolveSession(target: string, opts: PathOptions = {}): ResolvedSession | undefined {
  const sessionsDir = getSessionsDir(opts)

  // 直接文件路径：必须落在 agent-sessions/ 内，禁止任意绝对路径读盘
  if (target.endsWith('.jsonl')) {
    const abs = resolve(target)
    if (!existsSync(abs)) return undefined
    if (!isPathInsideDir(abs, sessionsDir)) return undefined
    const id = abs.replace(/\.jsonl$/i, '').split(sep).pop() ?? target
    return { id, filePath: abs, meta: getSessionMeta(id, opts), bytes: safeBytes(abs) }
  }

  if (!isSafeSessionId(target)) return undefined

  const filePath = getSessionMessagesPath(target, opts)
  if (!existsSync(filePath)) return undefined
  if (!isPathInsideDir(filePath, sessionsDir)) return undefined
  return { id: target, filePath, meta: getSessionMeta(target, opts), bytes: safeBytes(filePath) }
}

function safeBytes(path: string): number | undefined {
  try {
    return statSync(path).size
  } catch {
    return undefined
  }
}
