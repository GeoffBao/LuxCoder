/**
 * TeambitionConfigDialog — TB-Connect MCP 配置引导
 *
 * 对齐 Nano Banana 的「需配置」体验：
 * - 展示 dev-center 获取 Token 的分步指引（打开网页 → 创建 token → 复制 Token ID）
 * - 提供 URL 输入框，保存后写入工作区 mcp.json 的 TB-Connect 条目
 */
import * as React from 'react'
import { toast } from 'sonner'
import { ExternalLink, Link2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { McpServerEntry } from '@yoda/shared'
import { isTeambitionMcpEntry, TB_MCP_PREFERRED_NAME } from '@yoda/shared/teambition-mcp'

interface TeambitionConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 当前工作区 slug（保存到 mcp.json 用） */
  workspaceSlug: string
  /** 当前已配置的 URL（若有，回填输入框） */
  existingUrl?: string
  /** 保存成功后回调（刷新 MCP 列表） */
  onSaved?: () => void
}

/** Teambition user-mcp 开发者中心 */
const DEV_CENTER_URL = 'https://rd.luxshare.com.cn/dev-center/user-mcp'
/** 网关前缀（用户只需填 token，拼成完整 URL） */
const GATEWAY_PREFIX = 'https://rd.luxshare.com.cn/gateway/mcp?userToken='

export function TeambitionConfigDialog({
  open,
  onOpenChange,
  workspaceSlug,
  existingUrl,
  onSaved,
}: TeambitionConfigDialogProps): React.ReactElement {
  // 从已有 URL 提取 token（若有），否则空
  const initialToken = React.useMemo(() => {
    if (!existingUrl) return ''
    const match = existingUrl.match(/[?&]userToken=([^&]+)/)
    return match?.[1] ?? ''
  }, [existingUrl])
  const [token, setToken] = React.useState(initialToken)
  const [saving, setSaving] = React.useState(false)

  // dialog 打开时同步初始 token
  React.useEffect(() => {
    if (open) setToken(initialToken)
  }, [open, initialToken])

  const handleOpenDevCenter = React.useCallback(() => {
    void window.electronAPI.openExternal(DEV_CENTER_URL)
  }, [])

  const handleSave = React.useCallback(async (): Promise<void> => {
    const trimmed = token.trim()
    if (!trimmed) {
      toast.error('请先填写 Token ID')
      return
    }
    setSaving(true)
    try {
      const config = await window.electronAPI.getWorkspaceMcpConfig(workspaceSlug)
      const fullUrl = trimmed.startsWith('http')
        ? trimmed
        : `${GATEWAY_PREFIX}${trimmed}`
      // 归一化：移除历史自定义名条目（如 TB-wxy），统一写入推荐名 TB-Connect，
      // 避免 mcp.json 残留多个 Teambition 条目导致 Agent 注入重复的 TB server
      const servers: Record<string, McpServerEntry> = {}
      for (const [name, entry] of Object.entries(config.servers ?? {})) {
        if (!isTeambitionMcpEntry(name, entry)) servers[name] = entry
      }
      servers[TB_MCP_PREFERRED_NAME] = {
        type: 'http',
        enabled: true,
        url: fullUrl,
        headers: {},
      }
      await window.electronAPI.saveWorkspaceMcpConfig(workspaceSlug, { servers })
      toast.success('TB-Connect 配置已保存并启用')
      onOpenChange(false)
      onSaved?.()
    } catch (error) {
      console.error('[TB-Connect] 保存配置失败:', error)
      toast.error('保存配置失败，请重试')
    } finally {
      setSaving(false)
    }
  }, [token, workspaceSlug, onOpenChange, onSaved])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-emerald-500" />
            配置 TB-Connect（Teambition MCP）
          </DialogTitle>
          <DialogDescription>
            连接 Teambition 后，看板「一键更新」可同步你名下未关闭的问题。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border border-border/60 bg-muted/40 p-3 text-[13px] leading-relaxed text-foreground/80">
            <p className="mb-2 font-medium text-foreground">获取 Token 步骤</p>
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>打开 <button type="button" onClick={handleOpenDevCenter} className="inline-flex items-center gap-0.5 text-primary hover:underline">Teambition 开发者中心 <ExternalLink size={12} /></button></li>
              <li>没有 Token 的点击「创建 Token」</li>
              <li>创建完成后点击「查看」，复制 Token ID 内容</li>
              <li>将 Token ID 粘贴到下方输入框，保存即可</li>
            </ol>
          </div>

          <label className="block space-y-1.5 text-xs font-medium">
            Token ID（userToken）
            <Input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="u-XXXXXXXX..."
              className="h-9 font-mono text-[12px]"
            />
          </label>

          <div className="rounded-md bg-foreground/[0.03] px-3 py-2 text-[11px] text-muted-foreground break-all">
            <span className="font-medium text-foreground/70">将配置为：</span>
            {token.trim() && !token.trim().startsWith('http')
              ? `${GATEWAY_PREFIX}${token.trim()}`
              : token.trim() || 'https://rd.luxshare.com.cn/gateway/mcp?userToken=...'}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            <Save size={14} className="mr-1.5" />
            {saving ? '保存中...' : '保存并启用'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
