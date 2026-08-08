/**
 * ReleaseNoteMarkdown - 本地化版本历史的 Markdown 渲染
 *
 * 与 ReleaseNotesViewer 的 prose + CodeBlock + 外链处理保持一致，
 * 供 VersionHistory 展开项与 ReleaseNotesDialog 复用。
 */

import * as React from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CodeBlock } from '@myyoda/ui'
import { cn } from '@/lib/utils'
import { copyTextToClipboard } from '@/lib/clipboard'

export interface ReleaseNoteMarkdownProps {
  content: string
  compact?: boolean
}

export function ReleaseNoteMarkdown({
  content,
  compact = false,
}: ReleaseNoteMarkdownProps): React.ReactElement {
  return (
    <div
      className={cn(
        'prose dark:prose-invert max-w-none',
        compact ? 'text-xs prose-sm' : 'text-sm',
        'prose-p:my-1.5 prose-p:leading-[1.6] prose-li:leading-[1.6]',
        '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0'
      )}
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children: preChildren }) => (
            <CodeBlock onCopy={copyTextToClipboard}>{preChildren}</CodeBlock>
          ),
          a: ({ href, children: linkChildren, ...linkProps }) => (
            <a
              {...linkProps}
              href={href ?? undefined}
              onClick={(e) => {
                e.preventDefault()
                if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
                  window.electronAPI.openExternal(href)
                }
              }}
              title={href ?? undefined}
            >
              {linkChildren}
            </a>
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  )
}
