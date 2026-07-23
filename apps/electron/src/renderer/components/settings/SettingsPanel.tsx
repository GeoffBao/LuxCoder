/**
 * SettingsPanel - 设置面板
 *
 * 顶部 Header（标题 + 关闭按钮）+ 下方（左侧导航 + 右侧 ScrollArea 内容区域）。
 * 使用 Jotai atom 管理当前标签页状态。
 */

import * as React from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { cn } from "@/lib/utils";
import {
  Settings,
  Radio,
  Palette,
  Info,
  Globe,
  BookOpen,
  Wrench,
  Bot,
  GraduationCap,
  X,
  Keyboard,
  Mic,
  HardDriveDownload,
  HardDrive,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { settingsTabAtom, channelFormDirtyAtom, settingsCloseRequestedAtom, settingsOpenAtom } from "@/atoms/settings-tab";
import type { SettingsTab } from "@/atoms/settings-tab";
import { appModeAtom } from "@/atoms/app-mode";
import { hasUpdateAtom } from "@/atoms/updater";
import { tabsAtom, activeTabIdAtom, openTab, TUTORIAL_TAB_ID } from "@/atoms/tab-atoms";
import { hasEnvironmentIssuesAtom } from "@/atoms/environment";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChannelSettings } from "./ChannelSettings";
import { GeneralSettings } from "./GeneralSettings";
import { ProxySettings } from "./ProxySettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { AboutSettings } from "./AboutSettings";
import { PromptSettings } from "./PromptSettings";
import { ToolSettings } from "./ToolSettings";
import { BotHubSettings } from "./BotHubSettings";
import { ShortcutSettings } from "./ShortcutSettings";
import { VoiceInputSettings } from "./VoiceInputSettings";
import { MigrationSettings } from "./MigrationSettings";
import { StorageSettings } from "./StorageSettings";

/** 设置 Tab 定义 */
interface TabItem {
  id: SettingsTab;
  label: string;
  icon: React.ReactNode;
}

/** 导航分组：macOS System Settings 式分组，组间留白 + 弱化组标题 */
interface NavGroup {
  /** 组标题（首组无标题） */
  label?: string;
  tabs: TabItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    tabs: [
      { id: "general", label: "通用设置", icon: <Settings size={16} /> },
      { id: "appearance", label: "外观设置", icon: <Palette size={16} /> },
      { id: "shortcuts", label: "快捷键管理", icon: <Keyboard size={16} /> },
    ],
  },
  {
    label: "模型与工具",
    tabs: [
      { id: "channels", label: "模型配置", icon: <Radio size={16} /> },
      { id: "prompts", label: "提示词管理", icon: <BookOpen size={16} /> },
      { id: "tools", label: "Chat 工具", icon: <Wrench size={16} /> },
      { id: "voice-input", label: "语音输入", icon: <Mic size={16} /> },
      { id: "proxy", label: "代理设置", icon: <Globe size={16} /> },
    ],
  },
  {
    label: "连接与数据",
    tabs: [
      { id: "bots", label: "远程连接", icon: <Bot size={16} /> },
      { id: "migration", label: "数据迁移", icon: <HardDriveDownload size={16} /> },
      { id: "storage", label: "磁盘管理", icon: <HardDrive size={16} /> },
    ],
  },
  {
    label: "帮助",
    tabs: [
      { id: "tutorial", label: "使用指南", icon: <GraduationCap size={16} /> },
      { id: "about", label: "关于/更新", icon: <Info size={16} /> },
    ],
  },
];

/** 暂时隐藏的 Tab（功能代码保留，待后续重新开放） */
const HIDDEN_TABS = new Set<SettingsTab>(["bots", "shortcuts", "migration", "storage", "voice-input"]);

/** 根据标签页 id 渲染对应内容 */
function renderTabContent(tab: SettingsTab): React.ReactElement {
  switch (tab) {
    case "general":
      return <GeneralSettings />;
    case "channels":
      return <ChannelSettings />;
    case "prompts":
      return <PromptSettings />;
    case "proxy":
      return <ProxySettings />;
    case "tools":
      return <ToolSettings />;
    case "appearance":
      return <AppearanceSettings />;
    case "about":
      return <AboutSettings />;
    case "bots":
      return <BotHubSettings />;
    case "shortcuts":
      return <ShortcutSettings />;
    case "voice-input":
      return <VoiceInputSettings />;
    case "migration":
      return <MigrationSettings />;
    case "storage":
      return <StorageSettings />;
    default:
      // tutorial 等特殊 tab 由 handleTabChange 拦截打开主区 Tab，不会在此渲染
      return <GeneralSettings />;
  }
}

interface SettingsPanelProps {
  onClose?: () => void;
}

export function SettingsPanel({
  onClose,
}: SettingsPanelProps): React.ReactElement {
  const [activeTab, setActiveTab] = useAtom(settingsTabAtom);
  const channelFormDirty = useAtomValue(channelFormDirtyAtom);
  const [closeRequested, setCloseRequested] = useAtom(settingsCloseRequestedAtom);
  const setSettingsOpen = useSetAtom(settingsOpenAtom);
  const appMode = useAtomValue(appModeAtom);
  const hasUpdate = useAtomValue(hasUpdateAtom);
  const hasEnvironmentIssues = useAtomValue(hasEnvironmentIssuesAtom);
  const [mainTabs, setMainTabs] = useAtom(tabsAtom);
  const setMainActiveTabId = useSetAtom(activeTabIdAtom);

  /** 统一的退出拦截对话框状态 */
  type PendingAction = { type: 'tab'; tabId: SettingsTab } | { type: 'close' } | null
  const [pendingAction, setPendingAction] = React.useState<PendingAction>(null)
  const showNavDialog = pendingAction !== null

  /** 执行待处理的操作 */
  const executePendingAction = (): void => {
    if (!pendingAction) return
    if (pendingAction.type === 'tab') {
      setActiveTab(pendingAction.tabId)
    } else {
      onClose?.()
    }
    setPendingAction(null)
  }

  /** 取消待处理的操作 */
  const cancelPendingAction = (): void => {
    setPendingAction(null)
  }

  /** 切换标签页时检测是否有未保存内容，tutorial 特殊处理：打开 New Tab 并关闭设置 */
  const handleTabChange = (tabId: SettingsTab): void => {
    if (tabId === 'tutorial') {
      const result = openTab(mainTabs, { type: 'tutorial', sessionId: TUTORIAL_TAB_ID, title: 'LuxCoder 使用指南' })
      setMainTabs(result.tabs)
      setMainActiveTabId(result.activeTabId)
      setSettingsOpen(false)
      return
    }
    if (tabId === activeTab) return
    if (activeTab === 'channels' && channelFormDirty) {
      setPendingAction({ type: 'tab', tabId })
      return
    }
    setActiveTab(tabId)
  }

  /** 关闭设置面板时检测是否有未保存内容 */
  const handleClose = (): void => {
    if (activeTab === 'channels' && channelFormDirty) {
      setPendingAction({ type: 'close' })
      return
    }
    onClose?.()
  }

  // Cmd+W 等外部关闭请求：弹出确认对话框
  React.useEffect(() => {
    if (closeRequested && activeTab === 'channels') {
      setPendingAction({ type: 'close' })
      setCloseRequested(false)
    }
  }, [closeRequested, activeTab, setCloseRequested])

  // 工具 tab 两种模式都显示，Agent Skills / MCP 独立在侧边栏能力中心管理。
  const navGroups = React.useMemo(() => {
    return NAV_GROUPS
      .map((group) => ({ ...group, tabs: group.tabs.filter((t) => !HIDDEN_TABS.has(t.id)) }))
      .filter((group) => group.tabs.length > 0);
  }, [appMode]);

  // 当前 tab 标题
  const activeTabLabel = navGroups.flatMap((g) => g.tabs).find((t) => t.id === activeTab)?.label ?? "设置";

  return (
    <div className="flex flex-col h-full">
      {/* 顶部 Header 栏 */}
      <div className="h-12 flex items-center justify-between px-5 flex-shrink-0" style={{ boxShadow: 'inset 0 -1px 0 hsl(var(--foreground) / 0.06)' }}>
        <h2 className="text-sm font-medium text-foreground/90">
          {activeTabLabel}
        </h2>
        {onClose && (
          <button
            onClick={handleClose}
            className="rounded-md p-1.5 text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* 下方主体：左导航 + 右内容 */}
      <div className="flex flex-1 min-h-0">
        {/* 左侧 Tab 导航：分组 + 弱化组标题，选中态走墨水填充 */}
        <div className="w-[168px] pt-3 px-2.5 flex-shrink-0 overflow-y-auto scrollbar-thin" style={{ boxShadow: 'inset -1px 0 0 hsl(var(--foreground) / 0.06)' }}>
          <nav className="flex flex-col">
            {navGroups.map((group, groupIndex) => (
              <React.Fragment key={group.label ?? groupIndex}>
                {group.label && (
                  <div className="mt-4 mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-foreground/35 select-none">
                    {group.label}
                  </div>
                )}
                <div className="flex flex-col gap-0.5">
                  {group.tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => handleTabChange(tab.id)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] transition-colors",
                        activeTab === tab.id
                          ? "bg-foreground/[0.08] text-foreground/90"
                          : "text-foreground/55 hover:bg-foreground/[0.04] hover:text-foreground/80",
                      )}
                    >
                      {tab.icon}
                      <span>{tab.label}</span>
                      {tab.id === "about" && (hasUpdate || hasEnvironmentIssues) && (
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                      )}
                    </button>
                  ))}
                </div>
              </React.Fragment>
            ))}
          </nav>
        </div>

        {/* 右侧内容区域 */}
        <ScrollArea className="flex-1">
          <div className="px-6 py-4">{renderTabContent(activeTab)}</div>
        </ScrollArea>
      </div>

      {/* 退出拦截弹窗（侧边栏导航 / X 关闭 / Cmd+W） */}
      <AlertDialog open={showNavDialog} onOpenChange={(open) => { if (!open) cancelPendingAction() }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>放弃未保存的更改？</AlertDialogTitle>
            <AlertDialogDescription>
              当前渠道配置尚未保存，确定要离开吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelPendingAction}>留在当前页</AlertDialogCancel>
            <AlertDialogAction onClick={executePendingAction}>放弃并离开</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
