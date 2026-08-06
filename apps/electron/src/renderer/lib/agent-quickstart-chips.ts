/**
 * agent-quickstart-chips — Code 模式新会话首屏的场景分类与快捷入口
 *
 * 三个场景 Tab（日常办公/代码开发/设计创意）+ 每个 Tab 下一排快捷 chip。
 * chip 点击行为按 action.type 区分：
 * - insertPrompt：把引导文案写入输入框，用户续写后自己发送
 * - invokeSkill：写入 `/skillSlug ` 触发已有的 Skill 提及渲染（默认内置 Skill，见 apps/electron/default-skills/）
 * - navigate：跳转到已有的应用内页面（目前只有 Work 看板）
 */

import type { LucideIcon } from 'lucide-react'
import {
  FileText,
  Table,
  FileSearch,
  LayoutGrid,
  Timer,
  Code2,
  GitPullRequest,
  ListChecks,
  Blocks,
  Users,
  Presentation,
  LayoutTemplate,
  Image,
  Smartphone,
  Globe,
} from 'lucide-react'

export type QuickstartCategory = 'office' | 'dev' | 'design'

export type QuickstartChipAction =
  | { type: 'insertPrompt'; text: string }
  | { type: 'invokeSkill'; skillSlug: string }
  | { type: 'navigate'; target: 'work-board' }

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
    { id: 'office-pdf', label: 'PDF 处理', icon: FileText, action: { type: 'invokeSkill', skillSlug: 'pdf' } },
    { id: 'office-work-board', label: '项目看板', icon: LayoutGrid, action: { type: 'navigate', target: 'work-board' } },
    { id: 'office-automation', label: '自动化任务', icon: Timer, action: { type: 'invokeSkill', skillSlug: 'automation' } },
    { id: 'office-research', label: '深度研究', icon: FileSearch, action: { type: 'insertPrompt', text: '帮我深入研究一下：' } },
  ],
  dev: [
    { id: 'dev-daily', label: '日常开发', icon: Code2, action: { type: 'insertPrompt', text: '帮我实现：' } },
    { id: 'dev-review', label: '代码审查', icon: GitPullRequest, action: { type: 'insertPrompt', text: '帮我审查这段改动：' } },
    { id: 'dev-plan', label: '制定计划', icon: ListChecks, action: { type: 'invokeSkill', skillSlug: 'writing-plans' } },
    { id: 'dev-execute-plan', label: '执行计划', icon: ListChecks, action: { type: 'invokeSkill', skillSlug: 'executing-plans' } },
    { id: 'dev-skill', label: 'Skill 开发', icon: Blocks, action: { type: 'invokeSkill', skillSlug: 'skill-creator' } },
    { id: 'dev-collab', label: '多 Agent 协作', icon: Users, action: { type: 'invokeSkill', skillSlug: 'agent-collaboration' } },
  ],
  design: [
    { id: 'design-ppt', label: 'PPT 设计', icon: Presentation, action: { type: 'invokeSkill', skillSlug: 'dashi-ppt' } },
    { id: 'design-guizang-ppt', label: '杂志风网页 PPT', icon: LayoutTemplate, action: { type: 'invokeSkill', skillSlug: 'guizang-ppt-skill' } },
    { id: 'design-docx', label: 'Word 文档排版', icon: FileText, action: { type: 'invokeSkill', skillSlug: 'docx' } },
    { id: 'design-website', label: '网站/落地页设计', icon: Globe, action: { type: 'insertPrompt', text: '帮我设计一个网站页面：' } },
    { id: 'design-poster', label: '视觉海报', icon: Image, action: { type: 'insertPrompt', text: '帮我设计一张海报，主题是：' } },
    { id: 'design-app', label: '移动端 App 界面', icon: Smartphone, action: { type: 'insertPrompt', text: '帮我设计一个 App 界面：' } },
  ],
}
