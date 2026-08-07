import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, renameSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  ExpertWorkspaceBinding,
  ExpertWorkspaceBindingLoadResult,
} from '@myyoda/shared/experts/workspace-binding'

export function workspaceExpertBindingsDir(workspaceRoot: string): string {
  return join(workspaceRoot, 'expert-bindings')
}

function bindingPath(workspaceRoot: string, expertId: string): string {
  return join(workspaceExpertBindingsDir(workspaceRoot), `${expertId}.json`)
}

export function loadExpertWorkspaceBinding(
  workspaceRoot: string,
  expertId: string,
): ExpertWorkspaceBindingLoadResult {
  const path = bindingPath(workspaceRoot, expertId)
  if (!existsSync(path)) return { kind: 'missing' }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    if (!raw?.expertId || !Array.isArray(raw.skillSlugs)) {
      return { kind: 'invalid', message: 'Invalid binding format' }
    }
    return { kind: 'valid', binding: raw as ExpertWorkspaceBinding }
  } catch (cause) {
    return { kind: 'invalid', message: cause instanceof Error ? cause.message : String(cause) }
  }
}

export function listBoundExpertIds(workspaceRoot: string): string[] {
  const dir = workspaceExpertBindingsDir(workspaceRoot)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -5))
}

export function saveExpertWorkspaceBinding(
  workspaceRoot: string,
  binding: ExpertWorkspaceBinding,
): void {
  const dir = workspaceExpertBindingsDir(workspaceRoot)
  mkdirSync(dir, { recursive: true })
  const path = bindingPath(workspaceRoot, binding.expertId)
  const temp = `${path}.${randomUUID()}.tmp`
  try {
    writeFileSync(temp, `${JSON.stringify(binding, null, 2)}\n`, 'utf-8')
    renameSync(temp, path)
  } finally {
    try { if (existsSync(temp)) writeFileSync(temp, '{}') } catch { /* best effort */ }
  }
}

export function createDefaultBinding(expertId: string): ExpertWorkspaceBinding {
  const now = new Date().toISOString()
  return {
    expertId,
    skillSlugs: [],
    mcpIds: [],
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Migrate old global expert bindings (skillSlugs/mcpIds from expert.json) to workspace bindings.
 * For each existing workspace, copy the expert's global binding as a default workspace binding.
 * If no workspace binding exists yet, create one from the global manifest.
 * Does NOT mutate the global manifest.
 */
export function migrateGlobalBindingsToWorkspaces(
  workspaceRoots: string[],
  expertId: string,
  globalSkillSlugs: string[],
  globalMcpIds: string[],
): void {
  for (const root of workspaceRoots) {
    const existing = loadExpertWorkspaceBinding(root, expertId)
    if (existing.kind !== 'missing') continue
    saveExpertWorkspaceBinding(root, {
      ...createDefaultBinding(expertId),
      skillSlugs: [...globalSkillSlugs],
      mcpIds: [...globalMcpIds],
    })
  }
}
