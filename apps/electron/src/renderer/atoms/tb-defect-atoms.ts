import { atom } from 'jotai'
import type {
  BrowserTbCompletenessResult,
  BrowserTbDefectItem,
  BrowserTbStatusTransition,
  BrowserTbTaskDetail,
  BrowserTbWorkflow,
} from '@/../preload/index'

/** TB 缺陷列表（研发「我的」或项目全量） */
export const tbDefectItemsAtom = atom<BrowserTbDefectItem[]>([])

/** 列表加载中 */
export const tbDefectLoadingAtom = atom(false)

/** 列表加载错误（needs-reauth / 网关不可用等） */
export const tbDefectErrorAtom = atom<string | null>(null)

/** 当前查看详情的缺陷 */
export const tbDefectDetailAtom = atom<BrowserTbDefectItem | null>(null)

/** 详情缓存：taskId → { detail, transitions }；切换回已看过的条目不重复调 MCP（整体刷新时清空） */
export const tbDefectDetailCacheAtom = atom<Map<string, { detail: BrowserTbTaskDetail; transitions: BrowserTbStatusTransition[] }>>(new Map())

/** 详情打开时加载的任务详情（备注/描述/附件/字段） */
export const tbDefectTaskDetailAtom = atom<BrowserTbTaskDetail | null>(null)

/** 详情打开时加载的流转历史 */
export const tbDefectTransitionsAtom = atom<BrowserTbStatusTransition[]>([])

/** 详情信息完整性检测结果（纯函数计算，展示层缓存） */
export const tbDefectCompletenessAtom = atom<BrowserTbCompletenessResult | null>(null)

/** 按 taskId 缓存的任务工作流（避免重复拉取） */
export const tbDefectWorkflowsAtom = atom<Map<string, BrowserTbWorkflow | undefined>>(new Map())

/** 当前用户 id（TB 看板授权判定用） */
export const tbCurrentUserIdAtom = atom<string | undefined>(undefined)

/** 已加载过 TB 看板数据的工作区根路径（模块级持久，切 tab 组件卸载不重置；切换工作区时由 WorkBoardView 清空） */
export const tbDefectLoadedWorkspaceAtom = atom<string | null>(null)

/** 本地 Agent 看板中已存在的 TB 任务 ID 集合（加入本地任务去重/置灰判断用） */
export const tbLocalTaskIdsAtom = atom<Set<string>>(new Set<string>())

/** TB 看板「我的 / 项目全量」切换（P1 仅我的；项目全量 P2 开放） */
export const tbDefectScopeAtom = atom<'mine' | 'project'>('mine')

/** 当前选中的 TB 项目 id（project 模式下使用；mine 模式下忽略） */
export const tbSelectedProjectIdAtom = atom<string | null>(null)

/** 写回操作进行中（防止并发） */
export const tbDefectBusyAtom = atom(false)

/** 增量合并：单条缺陷状态更新后替换列表项，保持引用稳定 */
export const updateTbDefectItemAtom = atom(
  null,
  (_get, set, updated: BrowserTbDefectItem) => {
    set(tbDefectItemsAtom, (items) => items.map((item) => item.taskId === updated.taskId ? updated : item))
    set(tbDefectDetailAtom, (detail) => detail?.taskId === updated.taskId ? updated : detail)
  },
)
