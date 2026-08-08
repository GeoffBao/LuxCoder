import { atomWithStorage } from 'jotai/utils'

/** 看板「一键更新」上次手动更新时间（epoch ms）；null = 从未手动更新 */
export const taskBoardLastSyncAtAtom = atomWithStorage<number | null>(
  'yoda-taskboard-last-sync-at',
  null,
)
