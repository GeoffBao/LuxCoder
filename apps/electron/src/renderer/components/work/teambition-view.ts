export type TeambitionSyncState = 'synced' | 'pending' | 'conflict' | 'stale' | 'needs-reauth'

export interface TeambitionSyncBadge {
  label: string
  className: string
}

const SYNC_BADGES: Record<TeambitionSyncState, TeambitionSyncBadge> = {
  synced: { label: '已同步', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  pending: { label: '待同步', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  conflict: { label: '有冲突', className: 'bg-red-500/10 text-red-700 dark:text-red-300' },
  stale: { label: '数据较旧', className: 'bg-slate-500/10 text-slate-700 dark:text-slate-300' },
  'needs-reauth': { label: '需重新授权', className: 'bg-orange-500/10 text-orange-700 dark:text-orange-300' },
}

export function buildClaimIdempotencyKey(workspaceId: string, sessionId: string, remoteTaskId: string): string {
  return ['claim', workspaceId, sessionId, remoteTaskId].map(encodeURIComponent).join(':')
}

export function resolveTeambitionSyncBadge(state: TeambitionSyncState): TeambitionSyncBadge {
  return SYNC_BADGES[state]
}
