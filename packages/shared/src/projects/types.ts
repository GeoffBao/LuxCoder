/**
 * 项目类型定义 — Projects & Kanban
 *
 * 项目是 workspace 级的分组实体，将会话、工作目录和共享资产组织在一起。
 * 参照 OSS: packages/shared/src/projects/types.ts
 *
 * 磁盘结构:
 * {workspaceRootPath}/projects/{projectSlug}/
 *   ├── config.json   — 项目配置
 *   └── assets/       — 上传的文件（PDF、图片、文档）
 */

/**
 * 一个项目看板中的列定义。
 *
 * 当项目定义了 `kanbanColumns` 时，该数组即为单项目视图的完整列集合。
 * 每列的 `id` 稳定（作为 `kanbanColumn` 持久化值），`name` 为用户自定（不 i18n）。
 */
export interface KanbanColumnDef {
  /** 稳定的列 ID。内置种子复用了 'todo' | 'in-progress' | 'done' */
  id: string;
  /** 用户看到的列名（用户自定，不翻译） */
  name: string;
  /** 卡片拖入此列时自动应用的状态 ID（项目级） */
  dropStatusId?: string;
  /** 列头强调色（hex） */
  color?: string;
}

/**
 * 项目主配置（存储在 config.json 中）
 */
export interface ProjectConfig {
  id: string;
  slug: string;
  name: string;
  /** 列表/详情中显示的简短描述 */
  description?: string;
  /** 绑定的工作目录绝对路径；新会话继承此路径 */
  workingDirectory?: string;
  /** 注入系统提示词的自由文本 */
  details?: string;
  /** 可选颜色主题 ID */
  colorTheme?: string;
  /** 强调色（hex），会话列表中显示 */
  color?: string;
  createdAt: number;
  updatedAt: number;
  /** 归档时间（设置后从侧边栏隐藏但保留磁盘数据） */
  archivedAt?: number;
  /** 项目级 Kanban 列。缺失时看板使用默认 3 列。 */
  kanbanColumns?: KanbanColumnDef[];
  /** 默认 Agent 专家 ID（仅存储展示，本阶段不注入编排器） */
  defaultExpertId?: string;
}

/**
 * 项目资产（读取时从 assets 目录解析）
 */
export interface ProjectAsset {
  filename: string;
  sizeBytes: number;
  mimeType: string;
  uploadedAt: number;
  /** 磁盘绝对路径（运行时解析，不持久化） */
  absolutePath: string;
}

/**
 * 创建项目的输入（不含自动生成字段）
 */
export interface CreateProjectInput {
  name: string;
  description?: string;
  workingDirectory?: string;
  details?: string;
  colorTheme?: string;
  color?: string;
}

/**
 * 完全加载的项目（配置 + 文件夹路径）
 */
export interface LoadedProject {
  config: ProjectConfig;
  /** 项目文件夹绝对路径 */
  folderPath: string;
  /** 项目 assets 目录绝对路径 */
  assetsPath: string;
  /** workspace 根路径 */
  workspaceRootPath: string;
  /** workspace ID（派生自 basename(workspaceRootPath)） */
  workspaceId: string;
}

/**
 * 项目上下文（用于系统提示词注入）
 * 与 ProjectConfig 解耦以便隔离测试 prompt builder
 */
export interface ProjectPromptContext {
  name: string;
  description?: string;
  details?: string;
  assetsPath: string;
  /** 引用文件的轻量清单（最新优先）；内容按需读取 */
  assets: { filename: string; mimeType: string; sizeBytes: number }[];
  /** MEMORY.md 绝对路径，Agent 知道在哪里持久化知识 */
  memoryPath: string;
  /** 已按 token 上限截断的 MEMORY.md 内容 */
  memoryContent?: string;
}

/**
 * 项目更新输入
 */
export interface UpdateProjectInput {
  name?: string;
  description?: string;
  workingDirectory?: string;
  details?: string;
  colorTheme?: string;
  color?: string;
  /** 项目级 Kanban 列；undefined 恢复默认列。 */
  kanbanColumns?: KanbanColumnDef[];
  /** 设置值为 undefined 以取消归档 */
  archivedAt?: number;
  /** 默认 Agent 专家 ID（仅存储展示，本阶段不注入编排器） */
  defaultExpertId?: string;
}

/**
 * 上传项目资产的输入
 */
export interface UploadProjectAssetInput {
  filename: string;
  /** Base64 编码的内容（IPC 跨进程传输首选） */
  base64?: string;
  /** 纯文本内容（小文本/Markdown 上传） */
  text?: string;
  /** 磁盘源文件绝对路径（复制到 assets 目录） */
  sourcePath?: string;
}
