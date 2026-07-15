import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export type TeambitionSyncState = 'synced' | 'pending' | 'conflict' | 'stale' | 'needs-reauth'

export interface TeambitionGatewayCapabilities {
  listTasks: boolean
  claimTask: boolean
  updateStatus: boolean
  syncProgress: boolean
}

export interface TeambitionCapabilities extends TeambitionGatewayCapabilities {
  needsReauth: boolean
}

export interface TeambitionRemoteTask {
  id: string
  title: string
  projectId: string
  status?: string
  updatedAt?: number
}

export interface TeambitionClaimableTask extends TeambitionRemoteTask {
  syncState: 'synced' | 'stale'
}

export interface TeambitionGateway {
  probeCapabilities(): Promise<TeambitionGatewayCapabilities>
  listClaimableTasks(projectId: string): Promise<TeambitionRemoteTask[]>
  claimTask(taskId: string, idempotencyKey: string): Promise<TeambitionRemoteTask>
  updateStatus(taskId: string, status: string, idempotencyKey: string): Promise<void>
  syncProgress(taskId: string, progress: number, idempotencyKey: string): Promise<void>
}

export interface TeambitionPendingOperation {
  kind: 'status' | 'progress'
  value: string | number
  idempotencyKey: string
}

export interface TeambitionBinding {
  id: string
  sessionId: string
  remoteTaskId: string
  projectId: string
  remoteTitle: string
  remoteStatus?: string
  remoteUpdatedAt?: number
  syncState: TeambitionSyncState
  updatedAt: number
  pendingOperation?: TeambitionPendingOperation
  error?: string
}

export interface ClaimTeambitionTaskInput {
  projectId: string
  remoteTaskId: string
  sessionId: string
  idempotencyKey: string
}

interface TeambitionStore {
  version: 1
  bindings: TeambitionBinding[]
  claims: Record<string, string>
}

export interface TeambitionServiceOptions {
  storagePath: string
  gateway?: TeambitionGateway
  now?: () => number
  staleAfterMs?: number
  statusMap?: Record<string, string>
}

const NO_CAPABILITIES: TeambitionGatewayCapabilities = {
  listTasks: false,
  claimTask: false,
  updateStatus: false,
  syncProgress: false,
}

export class TeambitionAuthenticationError extends Error {}
export class TeambitionConflictError extends Error {}
export class TeambitionCapabilityError extends Error {}

function emptyStore(): TeambitionStore {
  return { version: 1, bindings: [], claims: {} }
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

export class TeambitionService {
  readonly storagePath: string
  private readonly gateway: TeambitionGateway | undefined
  private readonly now: () => number
  private readonly staleAfterMs: number
  private readonly statusMap: Record<string, string>

  constructor(options: TeambitionServiceOptions) {
    this.storagePath = options.storagePath
    this.gateway = options.gateway
    this.now = options.now ?? Date.now
    this.staleAfterMs = options.staleAfterMs ?? 5 * 60_000
    this.statusMap = options.statusMap ?? {}
  }

  private readStore(): TeambitionStore {
    if (!existsSync(this.storagePath)) return emptyStore()
    try {
      const parsed = JSON.parse(readFileSync(this.storagePath, 'utf8')) as Partial<TeambitionStore>
      return {
        version: 1,
        bindings: Array.isArray(parsed.bindings) ? parsed.bindings : [],
        claims: parsed.claims && typeof parsed.claims === 'object' ? parsed.claims : {},
      }
    } catch {
      return emptyStore()
    }
  }

  private writeStore(store: TeambitionStore): void {
    mkdirSync(dirname(this.storagePath), { recursive: true })
    const temporaryPath = `${this.storagePath}.tmp`
    writeFileSync(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, 'utf8')
    renameSync(temporaryPath, this.storagePath)
  }

  async probeCapabilities(): Promise<TeambitionCapabilities> {
    if (!this.gateway) return { ...NO_CAPABILITIES, needsReauth: true }
    try {
      return { ...await this.gateway.probeCapabilities(), needsReauth: false }
    } catch (cause) {
      return {
        ...NO_CAPABILITIES,
        needsReauth: cause instanceof TeambitionAuthenticationError,
      }
    }
  }

  async listClaimableTasks(projectId: string): Promise<{
    tasks: TeambitionClaimableTask[]
    needsReauth: boolean
  }> {
    const capabilities = await this.probeCapabilities()
    if (!this.gateway || !capabilities.listTasks) {
      return { tasks: [], needsReauth: capabilities.needsReauth }
    }
    try {
      const boundTaskIds = new Set(this.readStore().bindings.map((binding) => binding.remoteTaskId))
      const tasks = (await this.gateway.listClaimableTasks(projectId))
        .filter((task) => !boundTaskIds.has(task.id))
        .map((task): TeambitionClaimableTask => ({
          ...task,
          syncState: task.updatedAt !== undefined && this.now() - task.updatedAt > this.staleAfterMs
            ? 'stale'
            : 'synced',
        }))
      return { tasks, needsReauth: false }
    } catch (cause) {
      if (cause instanceof TeambitionAuthenticationError) return { tasks: [], needsReauth: true }
      throw cause
    }
  }

  async claimTask(input: ClaimTeambitionTaskInput): Promise<TeambitionBinding> {
    const store = this.readStore()
    const existingBindingId = store.claims[input.idempotencyKey]
    const existing = store.bindings.find((binding) => binding.id === existingBindingId)
    if (existing) return existing

    const capabilities = await this.probeCapabilities()
    if (!this.gateway || capabilities.needsReauth) throw new TeambitionAuthenticationError('Teambition 需要重新授权')
    if (!capabilities.claimTask) throw new TeambitionCapabilityError('Teambition gateway 不支持认领任务')

    const task = await this.gateway.claimTask(input.remoteTaskId, input.idempotencyKey)
    const binding = this.bindTask(input.sessionId, task)
    const nextStore = this.readStore()
    nextStore.claims[input.idempotencyKey] = binding.id
    this.writeStore(nextStore)
    return binding
  }

  bindTask(sessionId: string, task: TeambitionRemoteTask): TeambitionBinding {
    const store = this.readStore()
    const now = this.now()
    const binding: TeambitionBinding = {
      id: `tb:${sessionId}:${task.id}`,
      sessionId,
      remoteTaskId: task.id,
      projectId: task.projectId,
      remoteTitle: task.title,
      ...(task.status ? { remoteStatus: task.status } : {}),
      ...(task.updatedAt !== undefined ? { remoteUpdatedAt: task.updatedAt } : {}),
      syncState: 'synced',
      updatedAt: now,
    }
    store.bindings = [
      ...store.bindings.filter((candidate) => candidate.sessionId !== sessionId && candidate.remoteTaskId !== task.id),
      binding,
    ]
    this.writeStore(store)
    return binding
  }

  getBinding(sessionIdOrBindingId: string): TeambitionBinding | null {
    return this.readStore().bindings.find((binding) =>
      binding.sessionId === sessionIdOrBindingId || binding.id === sessionIdOrBindingId,
    ) ?? null
  }

  listBindings(): TeambitionBinding[] {
    return this.readStore().bindings
  }

  async syncStatus(bindingId: string, localStatus: string): Promise<TeambitionBinding> {
    return this.executeSync(bindingId, {
      kind: 'status',
      value: localStatus,
      idempotencyKey: `status:${bindingId}:${localStatus}`,
    })
  }

  async syncProgress(bindingId: string, progress: number): Promise<TeambitionBinding> {
    const normalizedProgress = Math.max(0, Math.min(100, Math.round(progress)))
    return this.executeSync(bindingId, {
      kind: 'progress',
      value: normalizedProgress,
      idempotencyKey: `progress:${bindingId}:${normalizedProgress}`,
    })
  }

  async retryPendingSync(bindingId: string): Promise<TeambitionBinding> {
    const binding = this.getBinding(bindingId)
    if (!binding) throw new Error(`Teambition binding 不存在: ${bindingId}`)
    if (!binding.pendingOperation) return binding
    return this.executeSync(bindingId, binding.pendingOperation)
  }

  private async executeSync(
    bindingId: string,
    operation: TeambitionPendingOperation,
  ): Promise<TeambitionBinding> {
    let binding = this.updateBinding(bindingId, {
      syncState: 'pending',
      pendingOperation: operation,
      error: undefined,
    })
    const capabilities = await this.probeCapabilities()
    if (!this.gateway || capabilities.needsReauth) {
      return this.updateBinding(bindingId, {
        syncState: 'needs-reauth',
        error: 'Teambition 需要重新授权',
      })
    }

    const supported = operation.kind === 'status' ? capabilities.updateStatus : capabilities.syncProgress
    if (!supported) {
      return this.updateBinding(bindingId, {
        syncState: 'pending',
        error: `Teambition gateway 不支持${operation.kind === 'status' ? '状态同步' : '进度同步'}`,
      })
    }

    try {
      if (operation.kind === 'status') {
        const localStatus = String(operation.value)
        const remoteStatus = this.statusMap[localStatus] ?? localStatus
        await this.gateway.updateStatus(binding.remoteTaskId, remoteStatus, operation.idempotencyKey)
        binding = this.updateBinding(bindingId, {
          remoteStatus,
          syncState: 'synced',
          pendingOperation: undefined,
          error: undefined,
        })
      } else {
        await this.gateway.syncProgress(binding.remoteTaskId, Number(operation.value), operation.idempotencyKey)
        binding = this.updateBinding(bindingId, {
          syncState: 'synced',
          pendingOperation: undefined,
          error: undefined,
        })
      }
      return binding
    } catch (cause) {
      if (cause instanceof TeambitionAuthenticationError) {
        return this.updateBinding(bindingId, { syncState: 'needs-reauth', error: errorMessage(cause) })
      }
      if (cause instanceof TeambitionConflictError) {
        return this.updateBinding(bindingId, { syncState: 'conflict', error: errorMessage(cause) })
      }
      return this.updateBinding(bindingId, { syncState: 'pending', error: errorMessage(cause) })
    }
  }

  private updateBinding(
    bindingId: string,
    patch: Partial<Omit<TeambitionBinding, 'id' | 'sessionId' | 'remoteTaskId' | 'projectId'>>,
  ): TeambitionBinding {
    const store = this.readStore()
    const index = store.bindings.findIndex((binding) => binding.id === bindingId)
    if (index === -1) throw new Error(`Teambition binding 不存在: ${bindingId}`)
    const existing = store.bindings[index]!
    const updated: TeambitionBinding = { ...existing, ...patch, updatedAt: this.now() }
    store.bindings[index] = updated
    this.writeStore(store)
    return updated
  }
}
