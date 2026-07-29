# Excalidraw 画板 — 侧栏集成设计方案

> 日期：2026-07-29
> 来源：llm-wipa Excalidraw 模块功能移植

## 一、架构概览

- **侧栏入口**：左侧导航栏新增「Excalidraw 画板」入口（`PenTool` 图标），与其他模块一致的 `SidebarModule` 交互规格（`collapsible: false`，纯入口行）
- **路由**：`activeViewAtom` 新增 `excalidraw-gallery`（画廊列表）和 `excalidraw-editor`（编辑器）两个视图
- **存储策略**：文件默认存 `<workspace>/.luxcoder/excalidraw/`，JSON 格式（`.excalidraw`）。编辑器提供「导出到…」按钮让用户另存到任意路径
- **渲染方案**：`@excalidraw/excalidraw` npm 包作为 React 组件，直接在主渲染进程中使用
- **v1 不含**：Obsidian `.excalidraw.md` 格式兼容、AI 生成图表、多人协作

## 二、组件树

```
LeftSidebar
  └─ SidebarModule（新入口：「Excalidraw 画板」，PenTool 图标）
       └─ onClick → setActiveView('excalidraw-gallery')

MainContent（根据 activeViewAtom 路由）
  ├─ ExcalidrawGallery（画廊页）
  │    ├─ 顶部栏：标题「Excalidraw 画板」+ 新建按钮
  │    ├─ 卡片网格：每个文件显示 SVG 缩略图 + 标题 + 元素数
  │    ├─ 空状态：插画 + 「新建第一张画布」引导按钮
  │    └─ 点击卡片 → setActiveView('excalidraw-editor')
  │
  └─ ExcalidrawEditor（编辑器页）
       ├─ 顶部栏：← 返回画廊 | 标题输入框 | 导出按钮 | 保存按钮 | 状态指示
       └─ <Excalidraw/> 组件（@excalidraw/excalidraw 全屏渲染）
```

## 三、数据流

### Atoms（渲染进程，Jotai）
- `excalidrawFilesAtom` ← IPC `excalidraw:list`
- `excalidrawEditorDataAtom` ← IPC `excalidraw:read`
- `excalidrawEditorSlugAtom` — 当前编辑的文件 slug
- `excalidrawEditorDirtyAtom` — 是否有未保存变更

### IPC（主进程 handlers）
- `excalidraw:list({ workspaceSlug })` → fs.readdir + 解析 `.excalidraw` JSON 元数据（title, slug, elementCount, background, mtime）→ 返回文件列表
- `excalidraw:read({ workspaceSlug, slug })` → fs.readFile → 返回完整 JSON（elements, appState, files）
- `excalidraw:write({ workspaceSlug, slug, payload })` → fs.writeFile → ok
- `excalidraw:export({ workspaceSlug, slug })` → dialog.showSaveDialog → fs.copyFile → 返回目标路径
- `excalidraw:create({ workspaceSlug, title })` → 生成 slug → 写入空白 `.excalidraw` → 返回 slug

### 存储路径约定
```
<workspace-root>/.luxcoder/excalidraw/
  ├── 架构图.excalidraw
  ├── 流程图.excalidraw
  └── ...
```

文件格式（JSON）：
```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "luxcoder",
  "elements": [...],
  "appState": { "viewBackgroundColor": "#ffffff" },
  "files": {}
}
```

## 四、编辑器交互

- **自动保存**：每 60 秒自动写入磁盘，状态栏显示「已自动保存」
- **Cmd/Ctrl+S**：手动保存，状态栏显示「已保存 ✓」
- **导出**：打开原生另存为对话框，支持 `.excalidraw` 原始格式
- **新建后跳转**：新建时先写盘生成 slug，再跳转编辑器
- **未保存离开**：切换 Workspace 或导航离开时，若有未保存变更弹出确认

## 五、画廊页

- 卡片网格布局，每个卡片包含：
  - SVG 缩略图（矢量形状渲染，不渲染嵌入图片）
  - 文件标题
  - 元素计数（如「12 elements」）
  - 最后修改时间
- 点击卡片进入编辑器
- 空状态：居中引导文案 + 「新建画布」按钮

## 六、缩略图 SVG 生成

在 `excalidraw:list` 中为每个文件生成 200×130 的 SVG 缩略图，渲染逻辑复用 llm-wipa 的 `buildThumbnailSvg`：
- 计算所有元素包围盒 → 缩放适配
- 渲染矩形/椭圆/菱形/箭头/线段/文字占位
- 嵌入图片不渲染（位图太大）
- >1000 元素的画布用纯色占位避免卡顿

## 七、错误处理

| 场景 | 策略 |
|---|---|
| 画廊为空（新工作区） | 显示空状态插画 + 引导按钮 |
| 文件 JSON 损坏 | 列表中跳过，卡片显示⚠️；编辑器打开时报 toast 并退回画廊 |
| 保存时磁盘满/权限不足 | 捕获 IPC 错误 → toast 报错，保留编辑器内数据 |
| 切换 Workspace | 自动刷新画廊列表；编辑器有未保存变更时弹出确认 |
| 导出路径冲突 | 原生对话框自带覆盖确认 |
| @excalidraw/excalidraw 打包不兼容 | 降级方案：iframe 加载本地 HTML 页面 + UMD 包 |

## 八、实施阶段

| 阶段 | 内容 | 预估 |
|---|---|---|
| 1. 调研验证 | `npm install @excalidraw/excalidraw`，验证 Electron + Vite 打包兼容性 | 30 min |
| 2. 主进程 IPC | `excalidraw:list|read|write|export|create` 五个 handler + 路径管理 | 1h |
| 3. 侧栏入口 + 路由 | `activeViewAtom` 加两个视图，`LeftSidebar` 加入口行 | 30 min |
| 4. 画廊页 | 卡片网格 + SVG 缩略图 + 新建按钮 + 空状态 | 1h |
| 5. 编辑器页 | `<Excalidraw/>` 集成 + 顶部栏 + 保存/导出/自动保存 | 1.5h |
| 6. 集成测试 + UI 验收 | 截图 + 验收清单 → 统一 commit | 1h |

**总预估**：~5.5 小时

## 九、不变更原则

- 不修改现有侧栏模块（Agent 技能、自动任务、任务看板、项目等）
- 不修改 `SidebarModule` 组件
- 不修改现有 IPC handler 命名空间
- 文件存储仅在 `<workspace>/.luxcoder/excalidraw/` 范围内，不触碰用户项目文件
