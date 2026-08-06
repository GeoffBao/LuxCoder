import { atomWithStorage } from 'jotai/utils'

/** TB 问题看板「刷新」上次成功同步时间（epoch ms）；null = 从未同步 */
export const tbDefectLastSyncAtAtom = atomWithStorage<number | null>(
  'luxcoder-tb-defect-last-sync-at',
  null,
)
