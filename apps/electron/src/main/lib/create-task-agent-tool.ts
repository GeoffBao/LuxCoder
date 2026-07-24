/**
 * Agent 内置"创建任务"工具
 *
 * 通过 SDK MCP Server 暴露 create_task：对话中直接把一张 todo 状态的看板任务
 * 落到当前工作区（task.yaml + orchestrator 会话），只创建不运行，是否启动交给
 * 用户或自动化决定。跟"新建任务"表单共用 materializeTaskFromSpec，不重复实现落盘逻辑。
 */

import { buildMinimalTaskSpec } from '@luxcoder/shared/tasks'
import { listTaskSlugs } from '@luxcoder/shared/tasks/storage'
import { getAgentSessionMeta } from './agent-session-manager'
import { getAgentWorkspace, getWorkspaceMcpConfig, getWorkspaceSkills } from './agent-workspace-manager'
import { getAgentWorkspacePath } from './config-paths'
import { materializeTaskFromSpec } from './task-handlers'

export interface CreateTaskToolContext {
  sessionId: string
  workspaceId: string
}

interface CreateTaskToolResult extends Record<string, unknown> {
  content: Array<{ type: 'text'; text: string }>
}

function jsonResult(payload: unknown): CreateTaskToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
  }
}

/**
 * 若 baseSlug 已被占用，追加数字后缀直到唯一。
 *
 * 背景：`saveTaskSpec` 遇到同 slug 会直接覆盖已有 task.yaml，不做任何冲突检测——手动"新建任务"
 * 表单场景下用户是显式命名、碰撞概率低，但 Agent 反复以相近标题调用 create_task 时碰撞概率高得多，
 * 覆盖会静默丢失一个已存在的任务定义（残留的旧 orchestrator 会话则变成孤儿）。这个去重逻辑只加在
 * 新工具这一侧，不改 materializeTaskFromSpec/表单既有行为——对齐 task-spec-form.ts 里 buildSpec()
 * 给节点 ID 去重用的同一套"追加 -2 -3..."算法。
 */
function ensureUniqueTaskSlug(workspaceRoot: string, baseSlug: string): string {
  const existing = new Set(listTaskSlugs(workspaceRoot))
  if (!existing.has(baseSlug)) return baseSlug
  let n = 2
  let candidate = `${baseSlug}-${n}`
  while (existing.has(candidate)) {
    n += 1
    candidate = `${baseSlug}-${n}`
  }
  return candidate
}

/** 校验 sources/skills 里的未知 slug，返回 warning 文案数组（不阻断创建，对齐 craft 语义）。 */
function collectUnknownSlugWarnings(
  workspaceSlug: string,
  sources: string[] | undefined,
  skills: string[] | undefined,
): string[] {
  const warnings: string[] = []
  if (sources?.length) {
    const known = new Set(Object.keys(getWorkspaceMcpConfig(workspaceSlug).servers ?? {}))
    const unknown = sources.filter((s) => !known.has(s))
    if (unknown.length) warnings.push(`未知的 source slug（已忽略校验，仍会写入 spec）: ${unknown.join(', ')}`)
  }
  if (skills?.length) {
    const known = new Set(getWorkspaceSkills(workspaceSlug).map((s) => s.slug))
    const unknown = skills.filter((s) => !known.has(s))
    if (unknown.length) warnings.push(`未知的 skill slug（已忽略校验，仍会写入 spec）: ${unknown.join(', ')}`)
  }
  return warnings
}

export async function injectCreateTaskMcpServer(
  sdk: typeof import('@anthropic-ai/claude-agent-sdk'),
  mcpServers: Record<string, Record<string, unknown>>,
  ctx: CreateTaskToolContext,
): Promise<void> {
  const { z } = await import('zod')

  const server = sdk.createSdkMcpServer({
    name: 'create-task',
    version: '1.0.0',
    tools: [
      sdk.tool(
        'create_task',
        `在当前工作区创建一个 Craft 风格的看板任务——写 task.yaml 并创建其 orchestrator 会话。CREATION ONLY：任务落地后状态为 todo，不会自动运行；是否启动由用户或自动化决定。

提供 title + description（description 会成为任务目标和首个节点的 prompt）。可选：acceptanceCriteria（验收标准）、sources / skills（工作区已注册的 slug）、llmConnection + model、workingDirectory、projectId（省略时继承当前会话所属项目）。

返回 { slug, orchestratorSessionId, warnings }——未知的 source/skill slug 会作为 warning 返回，不会阻断创建。用户要求"记录/排队/建个任务"时用这个工具；要立即执行工作，用当前会话或委派子会话，不要用这个工具。`,
        {
          title: z.string().trim().min(1).describe('任务标题'),
          description: z.string().trim().min(1).describe('任务目标，同时作为唯一节点的 prompt'),
          acceptanceCriteria: z.string().optional().describe('验收标准，供 orchestrator 判断任务是否完成'),
          sources: z.array(z.string()).optional().describe('要启用的 source（MCP）slug 列表'),
          skills: z.array(z.string()).optional().describe('要启用的 skill slug 列表'),
          llmConnection: z.string().optional().describe('指定渠道 connection；不传则继承工作区默认'),
          model: z.string().optional().describe('指定模型；不传则继承工作区默认'),
          workingDirectory: z.string().optional().describe('任务工作目录；不传则回退到项目/工作区默认'),
          projectId: z.string().optional().describe('绑定的项目 ID；不传则继承当前会话所属项目'),
        },
        async (args) => {
          const workspace = getAgentWorkspace(ctx.workspaceId)
          if (!workspace) return jsonResult({ error: `工作区不存在: ${ctx.workspaceId}` })
          const workspaceRoot = getAgentWorkspacePath(workspace.slug)

          const projectId = args.projectId ?? getAgentSessionMeta(ctx.sessionId)?.projectId
          const warnings = collectUnknownSlugWarnings(workspace.slug, args.sources, args.skills)

          const spec = buildMinimalTaskSpec({
            title: args.title,
            description: args.description,
            acceptanceCriteria: args.acceptanceCriteria,
            sources: args.sources,
            skills: args.skills,
            llmConnection: args.llmConnection,
            model: args.model,
            workingDirectory: args.workingDirectory,
            projectId,
          })
          const uniqueId = ensureUniqueTaskSlug(workspaceRoot, spec.id)
          const finalSpec = uniqueId === spec.id ? spec : { ...spec, id: uniqueId }

          const result = await materializeTaskFromSpec(workspaceRoot, ctx.workspaceId, finalSpec)
          return jsonResult({ ...result, warnings })
        },
      ),
    ],
  })

  mcpServers['create-task'] = server as unknown as Record<string, unknown>
  console.log('[Agent 编排] 已注入内置创建任务工具 (create-task)')
}
