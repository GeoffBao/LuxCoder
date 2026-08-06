/**
 * TeambitionConnectHint — 看板 Teambition 连接引导
 *
 * 检测当前工作区 TB MCP 配置状态：
 * - missing:  未配置 → 提示 + 查看格式指引 + 跳转 MCP 设置添加
 * - custom:   已配置但使用自定义名 → 提示可重命名（功能仍可用）
 * - preferred:已按 TB-Connect 配置 → 不提示
 */
import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { Link2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { TeambitionConfigDialog } from '@/components/settings/TeambitionConfigDialog'
import { agentSkillsTabAtom } from '@/atoms/active-view'
import { activeViewAtom } from '@/atoms/active-view'
import { settingsOpenAtom } from '@/atoms/settings-tab'
import type { TeambitionMcpRecognition } from '@luxcoder/shared'

interface TeambitionConnectHintProps {
  recognition: TeambitionMcpRecognition | null
  /** 当前工作区 slug（配置引导保存用） */
  workspaceSlug?: string
  /** 点击「去 MCP 设置」后由父组件触发跳转 */
  onNavigateToMcp?: () => void
}

/** TB MCP 添加格式指引 */
const TB_CONNECT_GUIDE = `# Teambition (TB) MCP 连接指引

1. 打开：https://rd.luxshare.com.cn/dev-center/user-mcp
2. 没有 Token 的点击「创建 Token」
3. 创建完成后点击「查看」，复制 Token ID 内容
4. 将 Token ID 追加到网关地址后：
   https://rd.luxshare.com.cn/gateway/mcp?userToken=<Token ID>

示例：
  https://rd.luxshare.com.cn/gateway/mcp?userToken=u-LPIE8fRcdPToptIaSMIP00R6NYtPIhhikPXq2y559tK44OUy

也可点击「一键配置 Token」直接填入并保存。
若已存在自定义命名的 TB MCP（如 TB-wxy），无需重命名，功能同样可用。`

export function TeambitionConnectHint({ recognition, workspaceSlug, onNavigateToMcp }: TeambitionConnectHintProps): React.ReactElement | null {
  const [guideOpen, setGuideOpen] = React.useState(false)
  const [configOpen, setConfigOpen] = React.useState(false)

  if (!recognition || recognition.status === 'preferred') return null

  const isMissing = recognition.status === 'missing'
  const customName = recognition.status === 'custom' ? recognition.name : null
  // 已有配置（custom 或 preferred）时回填 URL；missing 时无
  const existingUrl = recognition.status === 'custom'
    ? recognition.entry.url
    : undefined

  return (
    <>
      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogTrigger asChild>
          <button
            type="button"
            title={isMissing ? '未连接 Teambition，点击查看配置指引' : `Teambition MCP 使用自定义名「${customName}」`}
            className={cnHint(isMissing)}
          >
            <Link2 className="h-4 w-4" />
            <span className="hidden xl:inline">{isMissing ? 'TB 未连接' : 'TB 自定义名'}</span>
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{isMissing ? '连接 Teambition MCP' : `已检测到 Teambition MCP（${customName}）`}</DialogTitle>
            <DialogDescription>
              {isMissing
                ? '看板同步 Teambition 待办需要先配置 TB-Connect MCP 服务器。'
                : `当前使用自定义名「${customName}」，功能已可用；如需统一命名可重命名为 TB-Connect。`}
            </DialogDescription>
          </DialogHeader>

          <pre className="max-h-72 overflow-auto rounded-lg bg-muted p-3 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
            {TB_CONNECT_GUIDE}
          </pre>

          <DialogFooter>
            {isMissing ? (
              <>
                <Button variant="outline" onClick={() => { setGuideOpen(false); onNavigateToMcp?.() }}>
                  去 MCP 设置
                </Button>
                <Button
                  onClick={() => {
                    setGuideOpen(false)
                    setConfigOpen(true)
                  }}
                >
                  一键配置 Token
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setGuideOpen(false)}>
                知道了
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 配置引导（填入 Token → 保存 TB-Connect） */}
      {workspaceSlug && (
        <TeambitionConfigDialog
          open={configOpen}
          onOpenChange={setConfigOpen}
          workspaceSlug={workspaceSlug}
          existingUrl={existingUrl}
        />
      )}
    </>
  )
}

function cnHint(isMissing: boolean): string {
  const base = 'flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors'
  return isMissing
    ? `${base} border border-amber-500/30 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400`
    : `${base} border border-border/60 bg-content-area text-muted-foreground hover:bg-foreground/[0.04]`
}
