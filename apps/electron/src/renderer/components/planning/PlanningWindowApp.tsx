import { useEffect } from 'react'
import { useAtomValue } from 'jotai'
import { AutomationFormView } from '@/components/automation/AutomationFormView'
import { AutomationsView } from '@/components/automation/AutomationsView'
import { automationFormAtom } from '@/atoms/automation-atoms'
import { TooltipProvider } from '@/components/ui/tooltip'
import { WindowControls } from '@/components/WindowControls'

/** 独立窗口模式：复用定时任务主界面，不挂载聊天与 Agent 工作区。 */
export function PlanningWindowApp(): React.ReactElement {
  const automationFormOpen = useAtomValue(automationFormAtom).open

  useEffect(() => {
    document.title = 'Yoda · 定时任务'
  }, [])

  return <TooltipProvider delayDuration={200}><div className="relative h-screen overflow-hidden bg-content-area"><WindowControls />{automationFormOpen ? <AutomationFormView standalone /> : <AutomationsView standalone />}</div></TooltipProvider>
}
