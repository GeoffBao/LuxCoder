import { atom } from 'jotai'

export type SidebarSessionViewMode = 'recent' | 'projects'

/** Code 侧栏会话投影：最近会话 | 项目（同一批 Session，不复制数据） */
export const sidebarSessionViewModeAtom = atom<SidebarSessionViewMode>('recent')
