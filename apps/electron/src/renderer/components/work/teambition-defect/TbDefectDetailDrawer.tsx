import * as React from 'react'
import { Bot, CheckCircle2, FileText, Loader2, Sparkles, X, XCircle } from 'lucide-react'
import type { BrowserTbDefectItem, BrowserTbStatusTransition, BrowserTbTaskDetail, BrowserTbWorkflow } from '@/../preload/index'
import type { TbSkillMatch } from '@luxcoder/shared/teambition-defect'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { analyzeCompleteness } from './tb-defect-model'

interface TbDefectDetailDrawerProps {
  item: BrowserTbDefectItem
  workflow?: BrowserTbWorkflow
  transitions: BrowserTbStatusTransition[]
  transitionsLoading?: boolean
  /** 任务详情（备注/描述/附件/字段） */
  detail?: BrowserTbTaskDetail | null
  detailLoading?: boolean
  currentUserId?: string
  busy?: boolean
  /** AI 预分析结果（任务已执行过分析后由会话写入；未执行为空） */
  analysis?: string
  /** 用户编辑分析结果 */
  onAnalysisChange?: (text: string) => void
  /** 本地 Agent 任务执行状态（联动展示） */
  execution?: { status: 'idle' | 'running' | 'completed' | 'failed'; at: number; summary?: string; taskSlug?: string }
  /** 匹配到的工作区 Skill */
  skillMatches?: TbSkillMatch[]
  onClose: () => void
  /** 评论（AI 流转由会话/skill 负责；详情只保留评论入口） */
  onComment?: (text: string) => Promise<void>
}

function formatTime(at: number): string {
  const date = new Date(at)
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** TB 任务详情抽屉：基础信息 + 信息完整性 + Skill 适配 + AI 预分析 + 流转时间线 */
export function TbDefectDetailDrawer({
  item,
  workflow,
  transitions,
  transitionsLoading = false,
  detail,
  detailLoading = false,
  currentUserId,
  busy = false,
  analysis = '',
  onAnalysisChange,
  execution,
  skillMatches = [],
  onClose,
  onComment,
}: TbDefectDetailDrawerProps): React.ReactElement {
  const [comment, setComment] = React.useState('')
  const [editingAnalysis, setEditingAnalysis] = React.useState(false)
  const [analysisDraft, setAnalysisDraft] = React.useState(analysis)
  const completeness = analyzeCompleteness(detail ?? undefined)

  const startEditAnalysis = (): void => {
    setAnalysisDraft(analysis)
    setEditingAnalysis(true)
  }

  const saveAnalysis = (): void => {
    onAnalysisChange?.(analysisDraft.trim())
    setEditingAnalysis(false)
  }

  const submitComment = async (): Promise<void> => {
    if (!comment.trim() || !onComment) return
    try {
      await onComment(comment.trim())
      setComment('')
    } catch (cause) {
      console.error('[TbBoard] 评论失败:', cause)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border/30">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {item.uniqueId !== undefined && <span>#{item.uniqueId}</span>}
            <span>{item.tfsName ?? '未知状态'}</span>
            {item.executorId === currentUserId && <span className="text-primary">· 我执行</span>}
          </div>
          <h2 className="mt-1 font-semibold leading-6">{item.content}</h2>
          <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            {item.executorId && <span>执行者：{item.executorId === currentUserId ? '我' : item.executorId}</span>}
            {typeof item.progress === 'number' && <span>进度 {item.progress}%</span>}
            {item.dueDate && <span>截止 {new Date(item.dueDate).toLocaleString()}</span>}
            {item.startDate && <span>开始 {new Date(item.startDate).toLocaleDateString()}</span>}
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="关闭详情"><X className="h-4 w-4" /></Button>
      </header>

      {/* 基础信息 + 完整性 */}
      <section className="space-y-2 rounded-xl bg-muted/25 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">基础信息</span>
          {detailLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
        {detailLoading ? (
          <p className="text-[11px] text-muted-foreground">加载问题详情…</p>
        ) : (
          <>
            {detail?.description && <p className="text-xs leading-5 text-foreground/85"><FileText className="mr-1 inline h-3 w-3" />{detail.description}</p>}
            {detail?.note && !detail.description && <p className="text-xs leading-5 text-foreground/85">{detail.note}</p>}
            {!detail?.description && !detail?.note && <p className="text-[11px] text-muted-foreground/70">暂无问题描述</p>}
            {detail && detail.fields.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {detail.fields.map((field) => (
                  <span key={field.name} className="rounded bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {field.name}：{field.value}
                  </span>
                ))}
              </div>
            )}
            {detail && detail.attachments.length > 0 && (
              <div className="text-[11px] text-muted-foreground">
                附件：{detail.attachments.map((attachment) => attachment.name).join('、')}
              </div>
            )}
          </>
        )}

        {/* 信息完整性检测 */}
        <div className="mt-2 space-y-1 border-t border-border/40 pt-2">
          <p className="text-[11px] font-medium text-foreground/70">
            信息完整性检测
            <span className={cn('ml-2', completeness.complete ? 'text-emerald-600' : 'text-amber-600')}>
              {completeness.satisfied}/{completeness.total}
            </span>
          </p>
          {completeness.items.map((check) => (
            <div key={check.key} className="flex items-start gap-1.5 text-[11px] leading-4">
              {check.ok
                ? <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-emerald-600" />
                : <XCircle className="mt-0.5 size-3 shrink-0 text-amber-500" />}
              <span className={check.ok ? 'text-foreground/60' : 'text-foreground/75'}>
                <span className="font-medium">{check.label}</span>
                <span className={cn('ml-1', check.ok ? 'text-muted-foreground/60' : 'text-amber-600/90')}>{check.hint}</span>
              </span>
            </div>
          ))}
        </div>

        {/* Skill 适配判断 */}
        <div className="mt-2 space-y-1 border-t border-border/40 pt-2">
          <p className="text-[11px] font-medium text-foreground/70">Skill 适配</p>
          {skillMatches.length === 0 ? (
            <p className="text-[11px] leading-4 text-muted-foreground/70">暂无 Skill 适配</p>
          ) : (
            skillMatches.map((match) => (
              <div key={match.slug} className="flex items-start gap-1.5 text-[11px] leading-4">
                <Bot className="mt-0.5 size-3 shrink-0 text-primary" />
                <span className="text-foreground/80">
                  <span className="font-medium">{match.name}</span>
                  <span className="ml-1 text-muted-foreground/70">{match.reason}</span>
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* AI 预分析窗口：执行过分析后展示结果（可编辑）；未执行为空态 */}
      <section className="space-y-1.5 rounded-xl bg-muted/20 p-3">
        <div className="flex items-center justify-between">
          <p className="inline-flex items-center gap-1 text-xs font-medium text-foreground/70">
            <Sparkles className="size-3.5 text-primary" /> AI 预分析
          </p>
          {/* 本地 Agent 执行状态联动（与 Agent 看板执行状态实时同步） */}
          {execution && execution.status !== 'idle' && (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium leading-none',
                execution.status === 'running' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                execution.status === 'completed' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                execution.status === 'failed' && 'bg-destructive/10 text-destructive',
              )}
              title={execution.summary ?? undefined}
            >
              {execution.status === 'running' && <Loader2 className="size-2.5 animate-spin" />}
              {execution.status === 'running' && 'Agent 执行中'}
              {execution.status === 'completed' && 'Agent 已完成'}
              {execution.status === 'failed' && 'Agent 执行失败'}
            </span>
          )}
          {analysis && !editingAnalysis && (
            <Button variant="ghost" size="sm" onClick={startEditAnalysis} disabled={busy}>编辑</Button>
          )}
          {editingAnalysis && (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setEditingAnalysis(false)} disabled={busy}>取消</Button>
              <Button size="sm" onClick={saveAnalysis} disabled={busy}>保存</Button>
            </div>
          )}
        </div>
        {!analysis && !editingAnalysis ? (
          <div className="flex items-start gap-2 rounded-lg bg-background/60 px-3 py-2.5 text-[11px] leading-4 text-muted-foreground">
            <Bot className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60" />
            暂未执行 AI 分析。执行问题分析流程后，分析结果将展示在此处，可手动编辑优化。
          </div>
        ) : editingAnalysis ? (
          <textarea
            value={analysisDraft}
            onChange={(event) => setAnalysisDraft(event.target.value)}
            placeholder="输入/编辑 AI 分析结果…"
            rows={5}
            className="w-full resize-none rounded-lg border border-border/60 bg-background px-2.5 py-2 text-xs leading-5 outline-none focus:ring-1 focus:ring-ring"
          />
        ) : (
          <div className="whitespace-pre-wrap rounded-lg bg-background/60 px-3 py-2.5 text-[11px] leading-5 text-foreground/80">
            {analysis}
          </div>
        )}
      </section>

      {/* 流转时间线（紧凑：非核心信息，跟随整体刷新，无单独刷新按钮） */}
      <section className="max-h-36 space-y-1 overflow-y-auto rounded-xl bg-muted/35 p-2.5">
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">流转时间线</p>
        {transitionsLoading ? (
          <div className="flex items-center justify-center gap-2 py-3 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> 加载中…
          </div>
        ) : transitions.length === 0 ? (
          <p className="py-3 text-center text-[11px] text-muted-foreground/70">暂无流转记录</p>
        ) : (
          transitions.map((transition, index) => (
            <div key={`${transition.at}-${index}`} className="flex items-start gap-1.5 text-[11px]">
              <div className="mt-1 size-1 shrink-0 rounded-full bg-foreground/30" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-muted-foreground">{transition.fromName || '—'}</span>
                  <span className="text-muted-foreground/50">→</span>
                  <span className="font-medium">{transition.toName}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground/60">{formatTime(transition.at)}</span>
                </div>
                {transition.note && <p className="mt-0.5 truncate text-[10px] text-muted-foreground/70">{transition.note}</p>}
              </div>
            </div>
          ))
        )}
      </section>

      {onComment && (
        <section className="space-y-2 rounded-xl bg-muted/20 p-3">
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="评论 / @ 相关人催办"
            rows={2}
            className="w-full resize-none rounded-md border border-border/60 bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
          />
          <Button variant="outline" size="sm" className="w-full" disabled={busy || !comment.trim()} onClick={() => void submitComment()}>
            提交评论
          </Button>
        </section>
      )}
    </div>
  )
}
