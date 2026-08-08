/** Agent 专家包 IPC 通道常量 */
export const EXPERT_IPC_CHANNELS = {
  /** 列出全部专家包 */
  LIST: 'experts:list',
  /** 按 id 读取单个专家包 */
  GET: 'experts:get',
  /** 新建自定义专家包 */
  CREATE: 'experts:create',
  /** 更新 expert.json 中的可编辑字段 */
  UPDATE_MANIFEST: 'experts:update-manifest',
  /** 更新 IDENTITY / SOUL / RULES 文本 */
  UPDATE_FILES: 'experts:update-files',
  /** 列出全部专家团（team.json 新结构） */
  TEAMS_LIST: 'experts:teams-list',
  /** 按 id 读取单个专家团 */
  TEAMS_GET: 'experts:teams-get',
  /** 新建专家团 */
  TEAMS_CREATE: 'experts:teams-create',
  /** 更新 team.json 可编辑字段 */
  TEAMS_UPDATE: 'experts:teams-update',
  /** 列出内置专家模板（新建专家参考） */
  TEMPLATES_LIST: 'experts:templates-list',
} as const
