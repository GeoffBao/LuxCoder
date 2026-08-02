/**
 * RepoWikiView — Workspace 级 Yoda 知识库（LLM 知识库）入口
 *
 * Home / Code 两模式共享同一 workspace 顶层文件层级，Yoda 知识库是整个软件工具
 * 层面的知识检索底座：聚合两模式在 workspace 内产出的 plan / spec / MEMORY /
 * 文档产物，遵循 Karpathy raw/→wiki/ 编译器范式
 * （raw=源，LLM=编译器，wiki=产物，lint=测试，query=运行时）。
 * 完整实现见项目 MEMORY 记录的 spec。
 */

import * as React from 'react'
import { Library, FileText, ShieldCheck, Search } from 'lucide-react'

interface RoadmapItem {
  icon: React.ReactNode
  title: string
  description: string
}

const ROADMAP_ITEMS: RoadmapItem[] = [
  {
    icon: <FileText className="size-4" />,
    title: '数据源白名单（workspace 级）',
    description: '只吃知识产物，不吃源码：workspace 下各 project 的 MEMORY.md、.context/plan/*.md、spec/design 文档、assets 文档产物，以及 Agent 显式「发布到 Wiki」的 artifact。Home 与 Code 两模式的产出统一进入同一份索引。',
  },
  {
    icon: <Search className="size-4" />,
    title: 'Karpathy raw → wiki 编译范式',
    description: 'raw/ 是源、LLM 是编译器、wiki/ 是产物、lint 是测试、query 是运行时。MVP 走文件级检索（workspace 级 wiki/INDEX.md + 轻量清单），零新依赖，进阶再评估本地向量检索。',
  },
  {
    icon: <ShieldCheck className="size-4" />,
    title: '访问边界',
    description: '默认跨 project 只读；绝不索引密钥、node_modules、构建产物等敏感或噪声内容。',
  },
]

export function RepoWikiView(): React.ReactElement {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="titlebar-no-drag mx-auto flex w-full max-w-6xl shrink-0 items-center px-8 pt-14 pb-4">
        <div className="flex items-center gap-2.5">
          <Library className="size-6 text-foreground/70" />
          <h1 className="text-2xl font-semibold text-foreground">Yoda 知识库</h1>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-8 px-8 pb-16 pt-8 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-foreground/[0.04]">
            <Library className="size-8 text-foreground/30" />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="text-[15px] font-medium text-foreground/85">待开发：Workspace LLM 知识库</div>
            <div className="max-w-md text-[13px] leading-relaxed text-foreground/50">
              Home 与 Code 两模式共享同一 workspace 顶层文件层级，Yoda 知识库聚合两模式产出的知识产物，
              作为整个软件工具 workspace 的检索底座。当前为占位入口，规划摘要如下。
            </div>
          </div>

          <div className="flex w-full flex-col gap-3 text-left">
            {ROADMAP_ITEMS.map((item) => (
              <div
                key={item.title}
                className="flex items-start gap-3 rounded-xl border border-border/60 bg-content-area p-4"
              >
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.04] text-foreground/60">
                  {item.icon}
                </div>
                <div className="flex flex-col gap-1">
                  <div className="text-[13px] font-medium text-foreground/85">{item.title}</div>
                  <div className="text-[12px] leading-relaxed text-foreground/50">{item.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
