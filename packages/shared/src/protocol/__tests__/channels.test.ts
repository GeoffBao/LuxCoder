import { describe, expect, test } from 'bun:test';
import * as protocolContracts from '@luxcoder/shared/protocol';
import {
  PROJECT_IPC_CHANNELS,
  SESSION_KANBAN_IPC_CHANNELS,
  TASK_IPC_CHANNELS,
  TEAMBITION_IPC_CHANNELS,
} from '../channels.ts';
import type {
  AgentSessionMeta,
  KanbanIpcEventPayload,
  SessionKanbanCommand,
} from '../../types/agent.ts';

function readEventKind(event: KanbanIpcEventPayload): string {
  switch (event.kind) {
    case 'projects:changed':
      return event.workspaceId;
    case 'tasks:generated':
      return event.orchestratorSessionId;
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

function readSessionCommandKind(command: SessionKanbanCommand): string {
  switch (command.kind) {
    case 'move_to_workspace':
      return command.workspaceId;
    case 'set_project_id':
      return command.projectId ?? 'none';
    case 'set_kanban_column':
      return command.kanbanColumn ?? 'none';
    case 'set_session_status':
      return command.status;
    case 'set_task_node_count':
      return String(command.taskNodeCount);
    default: {
      const exhaustive: never = command;
      return exhaustive;
    }
  }
}

describe('kanban protocol contracts', () => {
  test('package export 会暴露 protocol 合约入口', () => {
    expect(protocolContracts).toMatchObject({
      PROJECT_IPC_CHANNELS,
      TASK_IPC_CHANNELS,
      SESSION_KANBAN_IPC_CHANNELS,
      TEAMBITION_IPC_CHANNELS,
    });
  });

  test('所有 Kanban IPC 通道都绑定为字符串', () => {
    expect(PROJECT_IPC_CHANNELS).toEqual({
      GET: 'projects:get',
      GET_ONE: 'projects:getOne',
      CREATE: 'projects:create',
      UPDATE: 'projects:update',
      DELETE: 'projects:delete',
      LIST_ASSETS: 'projects:listAssets',
      UPLOAD_ASSET: 'projects:uploadAsset',
      DELETE_ASSET: 'projects:deleteAsset',
      READ_MEMORY: 'projects:readMemory',
      WRITE_MEMORY: 'projects:writeMemory',
      CHANGED: 'projects:changed',
    });

    expect(TASK_IPC_CHANNELS).toEqual({
      VALIDATE: 'tasks:validate',
      CREATE: 'tasks:create',
      GENERATE: 'tasks:generate',
      GENERATED: 'tasks:generated',
      RUN: 'tasks:run',
      PAUSE: 'tasks:pause',
      RESUME: 'tasks:resume',
      STOP: 'tasks:stop',
      REHYDRATE: 'tasks:rehydrate',
      GET: 'tasks:get',
      LIST: 'tasks:list',
      GET_RESULTS: 'tasks:getResults',
    });

    expect(SESSION_KANBAN_IPC_CHANNELS).toEqual({
      COMMAND: 'session:command',
    });

    expect(TEAMBITION_IPC_CHANNELS).toEqual({
      LIST_TASKS: 'teambition:listMyTasks',
      CLAIM_TASK: 'teambition:claimTask',
      GET_BINDING: 'teambition:getBinding',
      CAPABILITIES: 'teambition:capabilities',
      SYNC_PROGRESS: 'teambition:syncProgress',
      UPDATE_STATUS: 'teambition:updateStatus',
      BIND_PROJECT: 'teambition:bindProject',
      LIST_BINDINGS: 'teambition:listBindings',
      RETRY_SYNC: 'teambition:retrySync',
    });
  });

  test('事件与命令 payload 使用 kind 作为判别字段', () => {
    const events: KanbanIpcEventPayload[] = [
      {
        kind: 'projects:changed',
        workspaceId: 'workspace-alpha',
        projects: [],
      },
      {
        kind: 'tasks:generated',
        workspaceId: 'workspace-alpha',
        orchestratorSessionId: 'session-1',
        status: 'saved',
        slug: 'demo-task',
      },
    ];

    const commands: SessionKanbanCommand[] = [
      { kind: 'move_to_workspace', workspaceId: 'workspace-beta' },
      { kind: 'set_project_id', projectId: 'project-1' },
      { kind: 'set_kanban_column', kanbanColumn: 'in-progress' },
      { kind: 'set_session_status', status: 'running' },
      { kind: 'set_task_node_count', taskNodeCount: 3 },
    ];

    expect(events.map((event) => readEventKind(event))).toEqual([
      'workspace-alpha',
      'session-1',
    ]);
    expect(commands.map((command) => readSessionCommandKind(command))).toEqual([
      'workspace-beta',
      'project-1',
      'in-progress',
      'running',
      '3',
    ]);
  });

  test('旧版 SessionMeta JSON 记录缺少新字段时仍保持可读', () => {
    const legacyRecord = JSON.parse(JSON.stringify({
      id: 'session-legacy',
      title: 'Legacy session',
      createdAt: 1,
      updatedAt: 2,
    })) as AgentSessionMeta;

    expect(legacyRecord).toEqual({
      id: 'session-legacy',
      title: 'Legacy session',
      createdAt: 1,
      updatedAt: 2,
    });
    expect(legacyRecord.projectId).toBeUndefined();
    expect(legacyRecord.parentSessionId).toBeUndefined();
    expect(legacyRecord.kanbanColumn).toBeUndefined();
    expect(legacyRecord.taskSlug).toBeUndefined();
    expect(legacyRecord.taskRunId).toBeUndefined();
    expect(legacyRecord.taskNodeId).toBeUndefined();
    expect(legacyRecord.taskNodeCount).toBeUndefined();
    expect(legacyRecord.taskDraft).toBeUndefined();
  });
});
