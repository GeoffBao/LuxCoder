/**
 * App Mode Atom - 应用模式状态
 *
 * - chat: 对话模式
 * - cowork: 遗留 Work 模式（顶栏已下线；启动时迁移为 agent + codeMainView='work'）
 * - agent: Code 编程模式（底层 Claude Agent SDK）；看板 / 项目详情由其主区视图承载
 * - scratch: 草稿本模式
 */

import { atomWithStorage } from 'jotai/utils'

export type AppMode = 'chat' | 'cowork' | 'agent' | 'scratch'

/** App 模式，自动持久化到 localStorage */
export const appModeAtom = atomWithStorage<AppMode>('luxcoder-app-mode', 'agent')
