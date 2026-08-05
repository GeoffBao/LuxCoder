/**
 * ToolsView — 工具集主页面
 *
 * 分「本地工具」与「网站工具」两类：
 * - 网站工具：点击卡片在外部浏览器打开
 * - 本地工具：预留（后续接入本地可执行工具/脚本）
 */

import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { ArrowLeft, Globe, FolderCog, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { activeViewAtom, toolsSectionAtom } from '@/atoms/active-view'
import { cn } from '@/lib/utils'

interface WebTool {
  id: string
  name: string
  url: string
  description?: string
}

/** 网站工具（配置化，后续可扩展） */
const WEB_TOOLS: WebTool[] = [
  {
    id: 'luxclaw',
    name: 'LuxClaw',
    url: 'http://10.116.44.161:5177/static/user/index.html?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI1OTkwMTcyMSIsIlVTRVItSU5GTyI6IntcImFkZGF0ZVwiOlwiMjAyNS0wNS0yMSAxMTo0OTozNFwiLFwiYnVcIjpcIue6q-iur-mAmuiurzpcIixcImNkXCI6XCLml6BcIixcImRlcGFydG1lbnRcIjpcIuS6jOmDqOi9r-S7tuS6pOS7mOS4ieivvlwiLFwiZHFcIjpcIjMyMVwiLFwiZW1haWxcIjpcIlhJQU5HWVUuV0VJMkBMVVhTSEFSRS1JQ1QuQ09NXCIsXCJmanF4XCI6XCLml6BcIixcImZsYWdcIjpcIjBcIixcImxvZ2luSXBcIjpcIjEwLjExOC4xNC4xMzRcIixcImxvZ2luSXBUaW1lXCI6XCIyMDI2LTA4LTAzIDA5OjQ5OjUyXCIsXCJsb2dpbmlkXCI6XCI1OTkwMTcyMVwiLFwibG9naW50aW1lXCI6XCIyMDI2LTA4LTA1IDA2OjIzOjU2XCIsXCJvcmdhbml6YXRpb25cIjpcIueri-iur-mAmuiurz7nq4vorq_pgJrorq8-6L2v5Lu25LqM6YOoPuS6jOmDqOi9r-S7tuS6pOS7mOS4ieivvlwiLFwicGFzc3dvcmRcIjpcIlwiLFwicGhvbmVcIjpcIjEzNzk1NDcxNDkxXCIsXCJzZmdjXCI6XCIxXCIsXCJzdGF0dXNcIjpcIuWcqOiBjFwiLFwic3VwZXJ2aXNvclwiOlwiNTk5MDE0MTRcIixcInVzZXJGbGFnXCI6XCJseFwiLFwidXNlclR5cGVcIjpcIjBcIixcInVzZXJhY2NvdW50XCI6XCI1OTkwMTcyMVwiLFwidXNlcm5hbWVcIjpcIuWNq-e_lOWuh1wifSJ9.AviqzaOcn9F3GBKe8plCsptlx4klT_mVtNhIyRDv8Yc&session_id=session-msfxbj05-ea82arju',
    description: 'LuxClaw 智能工具平台',
  },
  {
    id: 'test-cloud',
    name: '测试云平台',
    url: 'http://10.119.20.207/dashboard',
    description: '测试云平台管理控制台',
  },
]

export function ToolsView(): React.ReactElement {
  const setActiveView = useSetAtom(activeViewAtom)
  const section = useAtomValue(toolsSectionAtom)

  const handleBack = React.useCallback(() => {
    setActiveView('conversations')
  }, [setActiveView])

  const handleOpenWebTool = React.useCallback((url: string): void => {
    window.electronAPI?.openExternal?.(url).catch(() => {
      window.open(url, '_blank', 'noopener')
    })
  }, [])

  return (
    <div className="flex h-full flex-col">
      {/* 顶部栏：返回 + 标题 */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          className="h-8 gap-1.5 px-2 text-[13px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} />
          <span>返回</span>
        </Button>
        <span className="text-[13px] font-semibold text-foreground">工具集</span>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl space-y-8">
          {/* 本地工具 */}
          {section === 'local' && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <FolderCog size={16} className="text-foreground/50" />
                <h3 className="text-[13px] font-semibold text-foreground">本地工具</h3>
                <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">待添加</span>
              </div>
              <div className="rounded-xl border border-dashed border-border/60 bg-content-area/50 p-8 text-center text-[12px] text-muted-foreground">
                本地工具预留区，后续可接入可执行脚本 / CLI 工具
              </div>
            </section>
          )}

          {/* 网站工具 */}
          {section === 'web' && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <Globe size={16} className="text-foreground/50" />
                <h3 className="text-[13px] font-semibold text-foreground">网站工具</h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {WEB_TOOLS.map((tool) => (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => handleOpenWebTool(tool.url)}
                    className={cn(
                      'group flex flex-col gap-2 rounded-xl border border-border/60 bg-content-area p-4 text-left transition-[border-color,box-shadow]',
                      'hover:border-primary/40 hover:shadow-sm'
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Globe size={16} />
                      </div>
                      <span className="text-[13px] font-semibold text-foreground">{tool.name}</span>
                      <ExternalLink size={13} className="ml-auto text-muted-foreground/40 transition-colors group-hover:text-primary" />
                    </div>
                    {tool.description && (
                      <p className="text-[12px] leading-5 text-muted-foreground">{tool.description}</p>
                    )}
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
