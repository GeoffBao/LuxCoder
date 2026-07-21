/** Agent 专家包 IPC 通道常量 */
export const EXPERT_IPC_CHANNELS = {
  /** 列出全部专家包 */
  LIST: 'experts:list',
  /** 按 id 读取单个专家包 */
  GET: 'experts:get',
  /** 更新 expert.json 中的可编辑字段 */
  UPDATE_MANIFEST: 'experts:update-manifest',
  /** 更新 IDENTITY / SOUL / RULES 文本 */
  UPDATE_FILES: 'experts:update-files',
} as const
