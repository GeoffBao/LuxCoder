/**
 * RepoWikiView — Workspace 级 知识库主页面（个人知识库 / 企业知识库）
 *
 * Home / Code 两模式共享同一 workspace 顶层文件层级，个人知识库是整个软件工具
 * 层面的知识检索底座：聚合两模式在 workspace 内产出的 plan / spec / MEMORY /
 * 文档产物，遵循 Karpathy raw/→wiki/ 编译器范式
 * （raw=源，LLM=编译器，wiki=产物，lint=测试，query=运行时）。
 * 企业知识库为网页版，用系统浏览器打开（需企业登录态）。
 */

import * as React from 'react'
import { useAtom } from 'jotai'
import { Library, FileText, ShieldCheck, Search, Building2, ExternalLink } from 'lucide-react'
import { knowledgeTabAtom } from '@/atoms/active-view'
import { SectionTabs } from '@/components/ui/section-tabs'

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

/** 企业知识库网页地址（系统浏览器打开，需企业登录态） */
const ENTERPRISE_WIKI_URL = 'https://dkb.luxshare.com.cn/'

export function RepoWikiView(): React.ReactElement {
  const [tab, setTab] = useAtom(knowledgeTabAtom)

  const handleOpenEnterprise = React.useCallback((): void => {
    void window.electronAPI.openExternal(ENTERPRISE_WIKI_URL)
  }, [])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 顶部栏：标题 + 子页 tab（个人知识库 / 企业知识库） */}
      <div className="titlebar-no-drag flex h-11 shrink-0 items-center gap-3 border-b border-border px-4">
        <Library className="size-4.5 text-foreground/60" />
        <span className="text-[13px] font-semibold text-foreground">知识库</span>
        <SectionTabs
          value={tab}
          onChange={setTab}
          options={[
            { value: 'personal', label: '个人知识库', icon: <Library size={12} /> },
            { value: 'enterprise', label: '企业知识库', icon: <Building2 size={12} /> },
          ]}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {tab === 'personal' ? (
          /* 个人知识库：待开发占位 + 规划摘要 */
          <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-8 px-8 pb-16 pt-10 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-foreground/[0.04]">
              <Library className="size-8 text-foreground/30" />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="text-[15px] font-medium text-foreground/85">待开发：Workspace LLM 知识库</div>
              <div className="max-w-md text-[13px] leading-relaxed text-foreground/50">
                Home 与 Code 两模式共享同一 workspace 顶层文件层级，个人知识库聚合两模式产出的知识产物，
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
        ) : (
          /* 企业知识库：网页版引导（系统浏览器打开，保持企业登录态） */
          <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6 px-8 pb-16 pt-12 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-foreground/[0.04]">
              <Building2 className="size-8 text-foreground/30" />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="text-[15px] font-medium text-foreground/85">企业知识库网页版</div>
              <div className="max-w-sm text-[13px] leading-relaxed text-foreground/50">
                企业知识库需要企业账号登录态，将在系统默认浏览器中打开。
                {`（${ENTERPRISE_WIKI_URL}）`}
              </div>
            </div>
            <button
              type="button"
              onClick={handleOpenEnterprise}
              className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              <ExternalLink size={14} />
              <span>打开网页版</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
