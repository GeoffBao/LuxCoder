import * as React from 'react'
import { useAtom } from 'jotai'
import { SlidersHorizontal } from 'lucide-react'
import type { SessionListGroupBy, SessionListSortBy, SessionListStatusFilter } from '@luxcoder/shared'
import { sessionListPreferenceAtom } from '@/atoms/session-list-preference-atoms'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const STATUS_OPTIONS: Array<{ value: SessionListStatusFilter; label: string }> = [
  { value: 'active', label: '活跃' },
  { value: 'archived', label: '已归档' },
  { value: 'all', label: '全部' },
]

const GROUP_BY_OPTIONS: Array<{ value: SessionListGroupBy; label: string }> = [
  { value: 'date', label: '日期' },
  { value: 'project', label: '项目' },
  { value: 'state', label: '状态' },
  { value: 'customGroup', label: '自定义分组' },
  { value: 'none', label: '不分组' },
]

const SORT_BY_OPTIONS: Array<{ value: SessionListSortBy; label: string }> = [
  { value: 'recency', label: '最近更新' },
  { value: 'alphabetical', label: '名称' },
  { value: 'createdAt', label: '创建时间' },
]

/**
 * 会话列表紧凑筛选菜单（参考 Claude 客户端）
 *
 * 替代原来的「会话/项目」大 Tab：状态 / 分组方式 / 排序方式 三级子菜单。
 */
export function SessionListFilterMenu(): React.ReactElement {
  const [preference, setPreference] = useAtom(sessionListPreferenceAtom)

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="筛选与排序"
              className="grid size-6 place-items-center rounded-md text-foreground/50 transition-colors hover:bg-foreground/[0.06] hover:text-foreground/80 data-[state=open]:bg-foreground/[0.06] data-[state=open]:text-foreground/80"
            >
              <SlidersHorizontal size={13} />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">筛选与排序</TooltipContent>
      </Tooltip>
      <DropdownMenuPortal>
        <DropdownMenuContent align="start" className="w-40 z-[9999] min-w-0 p-0.5">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="text-xs py-1">状态</DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="w-28 z-[9999] min-w-0 p-0.5">
                <DropdownMenuRadioGroup
                  value={preference.status}
                  onValueChange={(value) => setPreference({ status: value as SessionListStatusFilter })}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <DropdownMenuRadioItem key={option.value} value={option.value} className="text-xs py-1 pl-6">
                      {option.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="text-xs py-1">分组方式</DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="w-32 z-[9999] min-w-0 p-0.5">
                <DropdownMenuRadioGroup
                  value={preference.groupBy}
                  onValueChange={(value) => setPreference({ groupBy: value as SessionListGroupBy })}
                >
                  {GROUP_BY_OPTIONS.map((option) => (
                    <DropdownMenuRadioItem key={option.value} value={option.value} className="text-xs py-1 pl-6">
                      {option.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="text-xs py-1">排序方式</DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="w-28 z-[9999] min-w-0 p-0.5">
                <DropdownMenuRadioGroup
                  value={preference.sortBy}
                  onValueChange={(value) => setPreference({ sortBy: value as SessionListSortBy })}
                >
                  {SORT_BY_OPTIONS.map((option) => (
                    <DropdownMenuRadioItem key={option.value} value={option.value} className="text-xs py-1 pl-6">
                      {option.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenu>
  )
}
