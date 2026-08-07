/**
 * 会话自定义分组 Atoms
 *
 * 按当前工作区加载（见 ProjectsInitializer，与 craft Project 共用同一个加载时机），
 * 无广播通道——增删改后由发起操作的组件直接更新本 atom。
 */

import { atom } from 'jotai'
import type { SessionGroup } from '@myyoda/shared'

export const sessionGroupsAtom = atom<SessionGroup[]>([])
