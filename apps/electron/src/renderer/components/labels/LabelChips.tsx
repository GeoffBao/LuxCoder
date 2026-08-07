import * as React from 'react'
import type { WorkspaceLabel } from '@myyoda/shared/labels'

export interface LabelChipsProps {
  labels: WorkspaceLabel[]
  activeIds: string[]
  max?: number
}

/**
 * 内联 Label 小标签。最多显示 `max` 个（默认 2），超出显示 +N。
 */
export function LabelChips({ labels, activeIds, max = 2 }: LabelChipsProps): React.ReactElement {
  const visibleLabels = labels.filter((label) => activeIds.includes(label.id))
  const remaining = visibleLabels.length - max
  if (visibleLabels.length === 0) return <></>

  return (
    <>
      {visibleLabels.slice(0, max).map((label) => (
        <span
          key={label.id}
          className="inline-flex items-center rounded-full bg-foreground/[0.06] px-1.5 py-px text-[11px] font-medium"
          style={{ color: label.color }}
        >
          {label.name}
        </span>
      ))}
      {remaining > 0 && (
        <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-px text-[11px] text-muted-foreground">
          +{remaining}
        </span>
      )}
    </>
  )
}
