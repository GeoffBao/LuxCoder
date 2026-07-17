import type * as React from 'react'
import { LoaderCircle, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface TaskEditorGenerationPanelProps {
  generating: boolean
  onGenerate: () => void
}

const PLAN_STEPS = ['调研', '计划', '实施'] as const

export function TaskEditorGenerationPanel({
  generating,
  onGenerate,
}: TaskEditorGenerationPanelProps): React.ReactElement {
  if (generating) {
    return (
      <div className="flex min-h-full flex-col gap-4 p-5" aria-live="polite">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary shadow-sm">
            <LoaderCircle className="h-5 w-5 animate-spin" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">正在生成你的计划…</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Agent 正在组织子任务图，通常需要一两分钟。</p>
          </div>
        </div>

        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="animate-pulse rounded-xl bg-muted/40 p-4 shadow-sm ring-1 ring-border/25"
              style={{ animationDelay: `${index * 120}ms` }}
            >
              <div className="flex items-start gap-3">
                <div className="h-7 w-7 shrink-0 rounded-full bg-foreground/[0.08]" />
                <div className="min-w-0 flex-1 space-y-2.5">
                  <div className="h-3.5 w-2/5 rounded-full bg-foreground/[0.08]" />
                  <div className="h-3 w-full rounded-full bg-foreground/[0.05]" />
                  <div className="h-3 w-4/5 rounded-full bg-foreground/[0.05]" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="relative grid min-h-full place-items-center overflow-hidden px-6 py-10 text-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,hsl(var(--primary)/0.08),transparent_58%)]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-primary/10" />

      <div className="relative flex max-w-md flex-col items-center gap-3">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary shadow-sm ring-1 ring-primary/10">
          <Sparkles className="h-7 w-7" />
        </span>

        <div className="flex items-center gap-1.5 rounded-full bg-muted/65 px-3 py-1 text-[11px] font-medium text-muted-foreground">
          {PLAN_STEPS.map((step, index) => (
            <span key={step} className="inline-flex items-center gap-1.5">
              {index > 0 && <span className="text-muted-foreground/45">→</span>}
              {step}
            </span>
          ))}
        </div>

        <div className="space-y-1.5">
          <h2 className="text-base font-semibold tracking-tight">生成初始计划</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            根据目标生成可编辑的子任务 DAG，运行前可以调整每个节点与依赖关系。
          </p>
        </div>

        <Button onClick={onGenerate} className="mt-1 shadow-sm">
          <Sparkles className="h-4 w-4" />
          生成初始计划
        </Button>
        <p className="text-xs text-muted-foreground/75">之后可以编辑所有内容。</p>
      </div>
    </div>
  )
}
