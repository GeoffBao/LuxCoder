/**
 * IPC 通道常量 — 按功能分组
 *
 * 参照 OSS: packages/shared/src/protocol/channels.ts
 * 适配: RPC_CHANNELS 对象改为 PROJECTS/TASKS/TEAMBITION/SESSION 四个独立通道组
 */

export const PROJECT_IPC_CHANNELS = {
  GET:         'projects:get',
  GET_ONE:     'projects:getOne',
  CREATE:      'projects:create',
  UPDATE:      'projects:update',
  DELETE:      'projects:delete',
  ANALYZE_DELETE_IMPACT: 'projects:analyzeDeleteImpact',
  LIST_ASSETS: 'projects:listAssets',
  UPLOAD_ASSET: 'projects:uploadAsset',
  DELETE_ASSET: 'projects:deleteAsset',
  READ_MEMORY: 'projects:readMemory',
  WRITE_MEMORY: 'projects:writeMemory',
  OPEN_OR_CREATE_BY_PATH: 'projects:openOrCreateByPath',
  RESOLVE_EFFECTIVE_CWD: 'projects:resolveEffectiveCwd',
  RELOCATE_WORKING_DIRECTORY: 'projects:relocateWorkingDirectory',
  RESTORE_WORKING_DIRECTORY: 'projects:restoreWorkingDirectory',
  CHANGED:     'projects:changed',
} as const;

export const TASK_IPC_CHANNELS = {
  VALIDATE:     'tasks:validate',
  CREATE:       'tasks:create',
  GENERATE:     'tasks:generate',
  GENERATED:    'tasks:generated',
  RUN:          'tasks:run',
  PAUSE:        'tasks:pause',
  RESUME:       'tasks:resume',
  STOP:         'tasks:stop',
  REHYDRATE:    'tasks:rehydrate',
  GET:          'tasks:get',
  LIST:         'tasks:list',
  LIST_SUMMARIES: 'tasks:listSummaries',
  UPDATE_WORKFLOW: 'tasks:updateWorkflow',
  UPDATE_METADATA: 'tasks:updateMetadata',
  DELETE:       'tasks:delete',
  ANALYZE_DELETE_IMPACT: 'tasks:analyzeDeleteImpact',
  GET_RESULTS:  'tasks:getResults',
} as const;

export const LABEL_IPC_CHANNELS = {
  LIST:         'labels:list',
  CREATE:       'labels:create',
  UPDATE:       'labels:update',
  ARCHIVE:      'labels:archive',
  SET_SESSION_LABELS: 'labels:setSessionLabels',
  SET_TASK_LABELS:    'labels:setTaskLabels',
} as const;

export const SESSION_KANBAN_IPC_CHANNELS = {
  COMMAND: 'session:command',
} as const;

export const SESSION_GROUP_IPC_CHANNELS = {
  LIST:   'session-group:list',
  CREATE: 'session-group:create',
  RENAME: 'session-group:rename',
  DELETE: 'session-group:delete',
} as const;

export const TEAMBITION_IPC_CHANNELS = {
  LIST_TASKS:    'teambition:listMyTasks',
  CLAIM_TASK:    'teambition:claimTask',
  GET_BINDING:   'teambition:getBinding',
  CAPABILITIES:  'teambition:capabilities',
  SYNC_PROGRESS: 'teambition:syncProgress',
  UPDATE_STATUS: 'teambition:updateStatus',
  BIND_PROJECT:  'teambition:bindProject',
  LIST_BINDINGS: 'teambition:listBindings',
  RETRY_SYNC:    'teambition:retrySync',
  /** 一键同步用户名下未 close 任务到看板（拉取候选，不自动创建） */
  SYNC_MY_OPEN_TASKS: 'teambition:syncMyOpenTasks',
  /** 手动创建选中的 TB 任务为本地看板 Task（不自动运行） */
  CREATE_SYNCED_TASKS: 'teambition:createSyncedTasks',
  /** 识别当前工作区 Teambition MCP 配置状态（preferred/custom/missing） */
  RECOGNIZE: 'teambition:recognize',
} as const;

export const SESSION_COMMAND_CHANNEL = SESSION_KANBAN_IPC_CHANNELS.COMMAND;
