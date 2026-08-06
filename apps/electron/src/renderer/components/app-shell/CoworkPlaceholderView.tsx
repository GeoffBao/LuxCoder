/**
 * CoworkPlaceholderView — cowork 协作模块占位页
 *
 * 按设计文件 v3.6 的 Coworker 模块蓝图展示占位卡片（ABOT 对话 / Slack / 审批流 /
 * 图像搜索 / SKILL Wiki / 成员管理 / 终端聚合），全部标记「即将上线」待后续开发。
 */
import * as React from 'react'
import { useSetAtom } from 'jotai'
import { ArrowLeft, Bot, MessageSquare, CheckSquare, Image, BookOpen, Users, Terminal, Rocket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { activeViewAtom } from '@/atoms/active-view'
import { cn } from '@/lib/utils'

interface CoworkModule {
  icon: React.ReactNode
  name: string
  desc: string
  accent: 'blue' | 'cyan' | 'green' | 'orange' | 'purple'
}

const MODULES: CoworkModule[] = [
  { icon: <Bot size={16} />, name: 'ABOT 对话', desc: '云端 Bot 主交互入口，长期记忆与企业知识库', accent: 'blue' },
  { icon: <MessageSquare size={16} />, name: 'Slack 集成', desc: '外部协作消息流接入，Bot 监听关键事件', accent: 'purple' },
  { icon: <CheckSquare size={16} />, name: '审批流', desc: '审批材料自动汇总与预审推进', accent: 'orange' },
  { icon: <Image size={16} />, name: '图像搜索', desc: '截图/设计稿/电路图匹配知识库', accent: 'cyan' },
  { icon: <BookOpen size={16} />, name: 'SKILL Wiki', desc: '技能文档载体，使用方法与适用场景', accent: 'green' },
  { icon: <Users size={16} />, name: '成员管理', desc: '技能认证、成员列表与权限管理', accent: 'blue' },
  { icon: <Terminal size={16} />, name: '终端聚合', desc: 'coderX | cursor | multica.ai 多终端切换', accent: 'orange' },
]

const ACCENT_CLASSES: Record<CoworkModule['accent'], string> = {
  blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  cyan: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  green: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  orange: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
}

export function CoworkPlaceholderView(): React.ReactElement {
  const setActiveView = useSetAtom(activeViewAtom)

  const handleBack = React.useCallback(() => {
    setActiveView('conversations')
  }, [setActiveView])

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
        <span className="text-[13px] font-semibold text-foreground">cowork 协作</span>
      </div>

      {/* 占位说明 */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-6 py-3">
        <Rocket size={15} className="text-muted-foreground/60" />
        <span className="text-[12px] text-muted-foreground">
          Cowork 协作模块开发中，以下模块将陆续上线
        </span>
      </div>

      {/* 模块卡片网格 */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((mod) => (
            <div
              key={mod.name}
              className="flex flex-col gap-2 rounded-xl border border-border/60 bg-content-area p-4 opacity-80 transition-opacity hover:opacity-100"
            >
              <div className="flex items-center gap-2.5">
                <div className={cn('flex size-9 items-center justify-center rounded-lg', ACCENT_CLASSES[mod.accent])}>
                  {mod.icon}
                </div>
                <span className="text-[13px] font-semibold text-foreground">{mod.name}</span>
                <span className="ml-auto rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  即将上线
                </span>
              </div>
              <p className="text-[12px] leading-5 text-muted-foreground">{mod.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
