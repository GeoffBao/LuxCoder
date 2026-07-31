/**
 * Active View Atom - 主内容区视图状态
 *
 * 控制 MainArea 显示的内容：
 * - conversations: 对话视图（Chat/Agent 模式内容）
 * - planning: Task 日历视图（Todo / 日历 / 定时任务合一）
 * - agent-skills: Agent 插件（专家 / 专家团 / Skills / MCP / API / Context）全屏管理视图
 * - projects: 遗留值（项目中心已移除；运行时回退到 conversations）
 * - excalidraw-gallery / excalidraw-editor: 手绘白板视图
 */

import { atom } from 'jotai'

export type ActiveView = 'conversations' | 'planning' | 'agent-skills'
  | 'excalidraw-gallery'
  | 'excalidraw-editor'
/** Agent 插件视图的子页：专家/专家团平级置顶，随后是 Skills / MCP / API（占位）/ Context。 */
export type AgentSkillsCapabilityTab = 'experts' | 'teams' | 'skills' | 'mcp' | 'api' | 'context'

/** 当前活跃视图（不持久化，每次启动默认显示对话） */
export const activeViewAtom = atom<ActiveView>('conversations')

/** Agent 技能视图当前子页，用于外部入口直达 MCP 管理 */
export const agentSkillsTabAtom = atom<AgentSkillsCapabilityTab>('experts')
