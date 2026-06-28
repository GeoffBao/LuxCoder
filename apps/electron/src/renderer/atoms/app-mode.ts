/**
 * App Mode Atom - 应用模式状态
 *
 * - chat: 对话模式
 * - cowork: 协作看板模式（P4 实现）
 * - agent: Code 编程模式（底层 Claude Agent SDK）
 * - scratch: 草稿本模式
 */

import { atomWithStorage } from 'jotai/utils'

export type AppMode = 'chat' | 'cowork' | 'agent' | 'scratch'

/** App 模式，自动持久化到 localStorage */
export const appModeAtom = atomWithStorage<AppMode>('luxagents-app-mode', 'agent')
