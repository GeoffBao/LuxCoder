const NEUTRAL_PILL = 'border-border bg-muted text-muted-foreground'

const NODE_STATE_PILL: Record<string, string> = {
  done: 'border-primary/25 bg-primary/10 text-primary',
  failed: 'border-destructive/25 bg-destructive/10 text-destructive',
  running: 'border-accent-foreground/20 bg-accent text-accent-foreground',
  cancelled: NEUTRAL_PILL,
  skipped: NEUTRAL_PILL,
  pending: NEUTRAL_PILL,
}

const NODE_STATE_LABEL: Record<string, string> = {
  pending: '等待中',
  running: '运行中',
  done: '已完成',
  failed: '失败',
  cancelled: '已取消',
  skipped: '已跳过',
}

/** 将运行状态映射为使用 LuxAgents 主题变量的胶囊样式与中文标签。 */
export function resolveNodeStatePill(state: string): { className: string; label: string | null } {
  return {
    className: NODE_STATE_PILL[state] ?? NEUTRAL_PILL,
    label: NODE_STATE_LABEL[state] ?? null,
  }
}
