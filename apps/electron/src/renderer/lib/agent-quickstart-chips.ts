/**
 * agent-quickstart-chips — Code 模式新会话首屏的场景分类与快捷入口
 *
 * 三个场景 Tab（日常办公/代码开发/设计创意）+ 每个 Tab 下一排快捷 chip。
 * chip 点击行为按 action.type 区分：
 * - insertPrompt：把引导文案写入输入框，用户续写后自己发送
 * - invokeSkill：写入 `/skillSlug ` 触发已有的 Skill 提及渲染（默认内置 Skill，见 apps/electron/default-skills/）
 */

import type { LucideIcon } from 'lucide-react'
import {
  FileText,
  Table,
  FileSearch,
  Search,
  Timer,
  Eraser,
  Code2,
  GitPullRequest,
  Bug,
  FlaskConical,
  ListChecks,
  PlayCircle,
  Blocks,
  Users,
  Presentation,
  Rocket,
  LayoutTemplate,
  FileStack,
  Network,
  GitBranch,
  PenTool,
  Image,
} from 'lucide-react'

export type QuickstartCategory = 'office' | 'dev' | 'design'

export type QuickstartChipAction =
  | { type: 'insertPrompt'; text: string }
  | { type: 'invokeSkill'; skillSlug: string }

export interface QuickstartChip {
  id: string
  label: string
  icon: LucideIcon
  action: QuickstartChipAction
}

export interface QuickstartCategoryDef {
  id: QuickstartCategory
  label: string
}

export const QUICKSTART_CATEGORIES: QuickstartCategoryDef[] = [
  { id: 'office', label: '日常办公' },
  { id: 'dev', label: '代码开发' },
  { id: 'design', label: '设计创意' },
]

export const QUICKSTART_CHIPS: Record<QuickstartCategory, QuickstartChip[]> = {
  office: [
    { id: 'office-docx', label: '文档处理', icon: FileText, action: { type: 'invokeSkill', skillSlug: 'docx' } },
    { id: 'office-xlsx', label: '表格分析', icon: Table, action: { type: 'invokeSkill', skillSlug: 'xlsx' } },
    { id: 'office-pdf', label: 'PDF 处理', icon: FileSearch, action: { type: 'invokeSkill', skillSlug: 'pdf' } },
    { id: 'office-search', label: '网络搜索', icon: Search, action: { type: 'invokeSkill', skillSlug: 'open-web-search' } },
    { id: 'office-automation', label: '自动化任务', icon: Timer, action: { type: 'invokeSkill', skillSlug: 'automation' } },
    { id: 'office-session-clean', label: '会话清洗', icon: Eraser, action: { type: 'invokeSkill', skillSlug: 'session-cleaner' } },
  ],
  dev: [
    { id: 'dev-daily', label: '日常开发', icon: Code2, action: { type: 'insertPrompt', text: '帮我实现：' } },
    { id: 'dev-review', label: '代码审查', icon: GitPullRequest, action: { type: 'invokeSkill', skillSlug: 'staged-review-and-fix' } },
    { id: 'dev-debug', label: '排查 Bug', icon: Bug, action: { type: 'invokeSkill', skillSlug: 'systematic-debugging' } },
    { id: 'dev-tdd', label: 'TDD 开发', icon: FlaskConical, action: { type: 'invokeSkill', skillSlug: 'test-driven-development' } },
    { id: 'dev-plan', label: '制定计划', icon: ListChecks, action: { type: 'invokeSkill', skillSlug: 'writing-plans' } },
    { id: 'dev-execute-plan', label: '执行计划', icon: PlayCircle, action: { type: 'invokeSkill', skillSlug: 'executing-plans' } },
    { id: 'dev-skill', label: 'Skill 开发', icon: Blocks, action: { type: 'invokeSkill', skillSlug: 'skill-creator' } },
    { id: 'dev-collab', label: '多 Agent 协作', icon: Users, action: { type: 'invokeSkill', skillSlug: 'agent-collaboration' } },
  ],
  design: [
    { id: 'design-ppt', label: 'PPT 设计', icon: Presentation, action: { type: 'invokeSkill', skillSlug: 'dashi-ppt' } },
    { id: 'design-web-ppt', label: '网页 PPT', icon: Rocket, action: { type: 'invokeSkill', skillSlug: 'frontend-slides' } },
    { id: 'design-guizang-ppt', label: '杂志风网页 PPT', icon: LayoutTemplate, action: { type: 'invokeSkill', skillSlug: 'guizang-ppt-skill' } },
    { id: 'design-pptx', label: 'PPTX 精修', icon: FileStack, action: { type: 'invokeSkill', skillSlug: 'ppt-master-skill' } },
    { id: 'design-drawio', label: '架构图', icon: Network, action: { type: 'invokeSkill', skillSlug: 'drawio-skill' } },
    { id: 'design-mermaid', label: 'Mermaid 图', icon: GitBranch, action: { type: 'invokeSkill', skillSlug: 'mermaid-visualizer' } },
    { id: 'design-excalidraw', label: 'Excalidraw 图', icon: PenTool, action: { type: 'invokeSkill', skillSlug: 'excalidraw-diagram' } },
    { id: 'design-poster', label: '视觉海报', icon: Image, action: { type: 'insertPrompt', text: '帮我设计一张海报，主题是：' } },
  ],
}
