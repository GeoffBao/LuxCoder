import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { FolderKanban } from 'lucide-react'
import { activeViewAtom } from '@/atoms/active-view'
import { appModeAtom } from '@/atoms/app-mode'
import { SidebarModule } from '@/components/app-shell/SidebarModule'
import { shouldOpenProjectsHub } from './projects-hub-model'

export interface SidebarProjectsSectionProps {
  count: number
}

/**
 * 左栏「项目中心」入口行
 *
 * 纯入口行，点击打开项目中心 Hub（activeView='projects'）。
 * 列表 / 搜索 / 新建能力在 ProjectsHubView 中提供。
 */
export function SidebarProjectsSection({
  count,
}: SidebarProjectsSectionProps): React.ReactElement | null {
  const mode = useAtomValue(appModeAtom)
  const activeView = useAtomValue(activeViewAtom)
  const setActiveView = useSetAtom(activeViewAtom)

  if (!shouldOpenProjectsHub(mode)) return null

  return (
    <SidebarModule
      icon={FolderKanban}
      title="项目中心"
      count={count}
      collapsible={false}
      active={activeView === 'projects'}
      onClick={() => setActiveView('projects')}
      ariaLabel={`项目中心，${count} 个项目`}
    />
  )
}
