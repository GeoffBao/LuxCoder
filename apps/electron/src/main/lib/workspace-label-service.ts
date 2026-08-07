import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  WORKSPACE_LABEL_CONFIG_SCHEMA_VERSION,
  WorkspaceLabelConfigSchema,
  WorkspaceLabelSchema,
  type WorkspaceLabel,
  type WorkspaceLabelConfig,
  type WorkspaceLabelConfigLoadResult,
} from '@myyoda/shared/labels'

export interface WorkspaceLabelServiceOptions {
  now?: () => number
  generateId?: () => string
}

export interface CreateWorkspaceLabelInput {
  name: string
  color?: string
}

export interface UpdateWorkspaceLabelInput {
  name?: string
  /** null removes the explicit color. */
  color?: string | null
  archived?: boolean
}

export function workspaceLabelsConfigPath(workspaceRoot: string): string {
  return join(workspaceRoot, 'labels', 'config.json')
}

function emptyConfig(): WorkspaceLabelConfig {
  return { schemaVersion: WORKSPACE_LABEL_CONFIG_SCHEMA_VERSION, labels: [] }
}

export function loadWorkspaceLabelConfig(workspaceRoot: string): WorkspaceLabelConfigLoadResult {
  const path = workspaceLabelsConfigPath(workspaceRoot)
  if (!existsSync(path)) return { kind: 'missing', config: emptyConfig() }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch (cause) {
    return { kind: 'invalid', message: cause instanceof Error ? cause.message : String(cause) }
  }
  if (raw && typeof raw === 'object' && 'schemaVersion' in raw) {
    const version = (raw as { schemaVersion?: unknown }).schemaVersion
    if (typeof version === 'number' && version > WORKSPACE_LABEL_CONFIG_SCHEMA_VERSION) {
      return { kind: 'unsupported', schemaVersion: version }
    }
  }
  const parsed = WorkspaceLabelConfigSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      kind: 'invalid',
      message: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    }
  }
  return { kind: 'valid', config: parsed.data }
}

function requireConfig(workspaceRoot: string): WorkspaceLabelConfig {
  const loaded = loadWorkspaceLabelConfig(workspaceRoot)
  if (loaded.kind === 'valid' || loaded.kind === 'missing') return loaded.config
  if (loaded.kind === 'unsupported') {
    throw new Error(`Labels config 版本 ${loaded.schemaVersion} 高于当前客户端支持范围`)
  }
  throw new Error(`Labels config 损坏，拒绝覆盖: ${loaded.message}`)
}

function atomicWriteConfig(workspaceRoot: string, config: WorkspaceLabelConfig): void {
  const parsed = WorkspaceLabelConfigSchema.parse(config)
  const path = workspaceLabelsConfigPath(workspaceRoot)
  mkdirSync(dirname(path), { recursive: true })
  const tempPath = `${path}.${randomUUID()}.tmp`
  try {
    writeFileSync(tempPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
    renameSync(tempPath, path)
  } finally {
    rmSync(tempPath, { force: true })
  }
}

export function assertValidWorkspaceLabelIds(workspaceRoot: string, labelIds: readonly string[]): string[] {
  const uniqueIds = [...new Set(labelIds)]
  const labels = requireConfig(workspaceRoot).labels
  const byId = new Map(labels.map((label) => [label.id, label]))
  for (const labelId of uniqueIds) {
    const label = byId.get(labelId)
    if (!label) throw new Error(`Label 不存在于当前 Workspace: ${labelId}`)
    if (label.archivedAt !== undefined) throw new Error(`Label 已归档，不能继续分配: ${labelId}`)
  }
  return uniqueIds
}

function normalizedName(name: string): string {
  return name.trim().toLocaleLowerCase()
}

function assertUniqueName(config: WorkspaceLabelConfig, name: string, exceptId?: string): void {
  const normalized = normalizedName(name)
  if (config.labels.some((label) => label.id !== exceptId && normalizedName(label.name) === normalized)) {
    throw new Error(`Label 名称已存在: ${name.trim()}`)
  }
}

export class WorkspaceLabelService {
  private readonly now: () => number
  private readonly generateId: () => string

  constructor(private readonly workspaceRoot: string, options: WorkspaceLabelServiceOptions = {}) {
    this.now = options.now ?? Date.now
    this.generateId = options.generateId ?? randomUUID
  }

  list(options: { includeArchived?: boolean } = {}): WorkspaceLabel[] {
    const labels = requireConfig(this.workspaceRoot).labels
    return options.includeArchived ? labels : labels.filter((label) => label.archivedAt === undefined)
  }

  create(input: CreateWorkspaceLabelInput): WorkspaceLabel {
    const config = requireConfig(this.workspaceRoot)
    assertUniqueName(config, input.name)
    const timestamp = this.now()
    const label = WorkspaceLabelSchema.parse({
      id: this.generateId(),
      name: input.name,
      ...(input.color ? { color: input.color } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    atomicWriteConfig(this.workspaceRoot, { ...config, labels: [...config.labels, label] })
    return label
  }

  update(labelId: string, patch: UpdateWorkspaceLabelInput): WorkspaceLabel {
    if (patch.name === undefined && patch.color === undefined && patch.archived === undefined) {
      throw new Error('Label patch 不能为空')
    }
    const config = requireConfig(this.workspaceRoot)
    const existing = config.labels.find((label) => label.id === labelId)
    if (!existing) throw new Error(`Label 不存在: ${labelId}`)
    if (patch.name !== undefined) assertUniqueName(config, patch.name, labelId)
    const timestamp = this.now()
    const next = WorkspaceLabelSchema.parse({
      ...existing,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.color === null ? { color: undefined } : patch.color !== undefined ? { color: patch.color } : {}),
      ...(patch.archived === undefined
        ? {}
        : patch.archived
          ? { archivedAt: existing.archivedAt ?? timestamp }
          : { archivedAt: undefined }),
      updatedAt: timestamp,
    })
    atomicWriteConfig(this.workspaceRoot, {
      ...config,
      labels: config.labels.map((label) => label.id === labelId ? next : label),
    })
    return next
  }

  archive(labelId: string): WorkspaceLabel {
    return this.update(labelId, { archived: true })
  }
}
