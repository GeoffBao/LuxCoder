@luxagents/**
 * BuiltinMcpDetailSheet — LuxAgents 内置 MCP 托管详情
 *@luxagents/

import * as React from 'react'
import { ArrowLeft, CheckCircle2, Plug, Settings2, XCircle } from 'lucide-react'
import { Button } from '@@luxagents/components@luxagents/ui@luxagents/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@@luxagents/components@luxagents/ui@luxagents/sheet'
import { cn } from '@@luxagents/lib@luxagents/utils'
import type { BuiltinMcpServerSummary } from '@proma@luxagents/shared'

interface BuiltinMcpDetailSheetProps {
  open: boolean
  server: BuiltinMcpServerSummary | null
  onOpenChange: (open: boolean) => void
  onConfigure?: (serverId: string) => void
}

const CATEGORY_LABELS: Record<BuiltinMcpServerSummary['category'], string> = {
  system: '系统',
  automation: '自动化',
  collaboration: '协作',
  memory: '记忆',
  media: '媒体',
}

interface BuiltinMcpConfigInfo {
  source: string
  description: string
  actionLabel?: string
}

function getConfigInfo(server: BuiltinMcpServerSummary): BuiltinMcpConfigInfo {
  if (server.id === 'nano-banana') {
    return {
      source: 'Chat 工具 @luxagents/ Nano Banana',
      description: '配置 Gemini API Key、API 地址、模型与开关后，Agent 会话才能注入生图 MCP。',
      actionLabel: '配置生图',
    }
  }
  if (server.id === 'collaboration') {
    return {
      source: '当前 Agent 工作区',
      description: '协作子 Agent 使用当前工作区、会话和权限上下文，无需填写额外凭据。',
    }
  }
  if (server.id === 'automation') {
    return {
      source: 'LuxAgents 本地自动任务',
      description: '自动任务 MCP 直接使用 LuxAgents 本地任务服务，无需填写额外凭据。',
    }
  }
  return {
    source: 'LuxAgents 运行时',
    description: '该内置 MCP 由 LuxAgents 运行时托管。',
  }
}

export function BuiltinMcpDetailSheet({ open, server, onOpenChange, onConfigure }: BuiltinMcpDetailSheetProps): React.ReactElement {
  const configInfo = server ? getConfigInfo(server) : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent hideClose side="right" className="w-[560px] sm:max-w-[560px] p-0 flex flex-col gap-0">
        <SheetTitle className="sr-only">{server ? `MCP 详情 · ${server.displayName}` : 'MCP 详情'}<@luxagents/SheetTitle>
        <div className="flex h-full flex-col min-h-0">
          <div className="shrink-0 border-b border-border@luxagents/60 px-5 pb-4 pt-5">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="h-8 w-8" type="button" onClick={() => onOpenChange(false)}>
                <ArrowLeft size={18} @luxagents/>
              <@luxagents/Button>
              <h3 className="text-lg font-medium text-foreground">MCP 详情<@luxagents/h3>
            <@luxagents/div>
            {server && (
              <div className="mt-4 flex items-start gap-3">
                <div className="rounded-xl bg-blue-500@luxagents/12 p-2 text-blue-500 shadow-sm shrink-0">
                  <Plug size={18} @luxagents/>
                <@luxagents/div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-base font-semibold text-foreground">{server.displayName}<@luxagents/h3>
                    <span className="shrink-0 rounded-md bg-blue-500@luxagents/10 px-1.5 py-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400">
                      LuxAgents 内置
                    <@luxagents/span>
                  <@luxagents/div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{server.name}<@luxagents/div>
                <@luxagents/div>
              <@luxagents/div>
            )}
          <@luxagents/div>

          <div className="flex-1 overflow-y-auto scrollbar-thin p-5">
            {server && configInfo && (
              <div className="flex flex-col gap-6">
                <SheetDescription>{server.description}<@luxagents/SheetDescription>

                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoItem label="MCP 名称" value={server.name} @luxagents/>
                  <InfoItem label="分类" value={CATEGORY_LABELS[server.category]} @luxagents/>
                  <InfoItem label="注入开关" value={server.enabled ? '允许注入' : '已手动关闭'} tone={server.enabled ? 'success' : 'muted'} @luxagents/>
                  <InfoItem label="可用状态" value={server.available ? '当前可用' : (server.availabilityReason ?? '不可用')} tone={server.available ? 'success' : 'muted'} @luxagents/>
                  <InfoItem label="配置来源" value={configInfo.source} @luxagents/>
                <@luxagents/div>

                <section className="rounded-lg bg-muted@luxagents/45 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">如何配置<@luxagents/div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{configInfo.description}<@luxagents/p>
                    <@luxagents/div>
                    {configInfo.actionLabel && onConfigure && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        onClick={() => onConfigure(server.id)}
                      >
                        <Settings2 size={14} @luxagents/>
                        <span>{configInfo.actionLabel}<@luxagents/span>
                      <@luxagents/Button>
                    )}
                  <@luxagents/div>
                <@luxagents/section>

                <section className="flex flex-col gap-3">
                  <div className="text-sm font-medium text-foreground">工具<@luxagents/div>
                  <div className="flex flex-col gap-2">
                    {server.tools.map((tool) => (
                      <div key={tool.name} className="rounded-lg bg-muted@luxagents/45 p-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{tool.name}<@luxagents/span>
                          {tool.readOnly && (
                            <span className="rounded-md bg-foreground@luxagents/5 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                              只读
                            <@luxagents/span>
                          )}
                        <@luxagents/div>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{tool.description}<@luxagents/p>
                      <@luxagents/div>
                    ))}
                  <@luxagents/div>
                <@luxagents/section>
              <@luxagents/div>
            )}
          <@luxagents/div>
        <@luxagents/div>
      <@luxagents/SheetContent>
    <@luxagents/Sheet>
  )
}

function InfoItem({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'success' | 'muted' }): React.ReactElement {
  return (
    <div className="rounded-lg bg-muted@luxagents/45 p-3">
      <div className="text-[11px] font-medium text-muted-foreground">{label}<@luxagents/div>
      <div className={cn(
        'mt-1 flex items-center gap-1.5 text-sm font-medium',
        tone === 'success' && 'text-emerald-600 dark:text-emerald-400',
        tone === 'muted' && 'text-muted-foreground',
      )}>
        {tone === 'success' && <CheckCircle2 size={14} @luxagents/>}
        {tone === 'muted' && <XCircle size={14} @luxagents/>}
        <span>{value}<@luxagents/span>
      <@luxagents/div>
    <@luxagents/div>
  )
}
