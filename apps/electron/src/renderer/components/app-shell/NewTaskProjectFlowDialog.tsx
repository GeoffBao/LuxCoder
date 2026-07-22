/**
 * NewTaskProjectFlowDialog — 新任务流第一步：必须选/建项目
 */

import * as React from 'react'
import { useAtom, useSetAtom } from 'jotai'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { ProjectContextPicker } from '@/components/app-shell/ProjectContextPicker'
import { newTaskProjectFlowOpenAtom } from '@/atoms/project-context-picker'
import {
  codeMainViewAtom,
  pendingTaskEditorTargetAtom,
  selectedProjectIdAtom,
  workViewAtom,
} from '@/atoms/project-atoms'
import { activeViewAtom } from '@/atoms/active-view'

export function NewTaskProjectFlowDialog(): React.ReactElement {
  const [open, setOpen] = useAtom(newTaskProjectFlowOpenAtom)
  const setPendingEditor = useSetAtom(pendingTaskEditorTargetAtom)
  const setSelectedProjectId = useSetAtom(selectedProjectIdAtom)
  const setCodeMainView = useSetAtom(codeMainViewAtom)
  const setWorkView = useSetAtom(workViewAtom)
  const setActiveView = useSetAtom(activeViewAtom)

  const handleSelect = React.useCallback(async (projectId: string | null): Promise<void> => {
    if (!projectId) return
    setSelectedProjectId(projectId)
    setPendingEditor({ mode: 'create', initialProjectId: projectId })
    setActiveView('conversations')
    setCodeMainView('work')
    setWorkView('board')
    setOpen(false)
  }, [
    setActiveView,
    setCodeMainView,
    setOpen,
    setPendingEditor,
    setSelectedProjectId,
    setWorkView,
  ])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新建任务</DialogTitle>
          <DialogDescription>
            选择项目后填写任务。也可新建项目或打开本地文件夹。
          </DialogDescription>
        </DialogHeader>
        <ProjectContextPicker
          mode="task"
          defaultOpen
          onSelect={handleSelect}
        />
      </DialogContent>
    </Dialog>
  )
}
