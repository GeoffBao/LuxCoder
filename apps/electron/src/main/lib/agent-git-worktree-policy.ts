/**
 * Agent 创建 Git worktree 时的默认路径约定。
 *
 * 只约束 Agent 自行执行的 `git worktree add`；项目指令、已有配置或用户明确指定
 * 的路径优先，避免破坏已经采用集中式 worktree 目录的工程。
 */
export function buildGitWorktreePromptSection(): string {
  return `## Git Worktree 路径约定

当你为复杂开发任务自行创建 Git worktree 时：
- 先读取仓库内的 AGENTS.md / CLAUDE.md、已有 worktree 配置与 \`.gitignore\`，遵循项目既有约定
- 没有明确约定时，默认使用仓库内隐藏目录：\`<repo-root>/.worktrees/<branch-or-task-slug>\`
- 创建前确保 \`<repo-root>/.worktrees\` 已被 Git 忽略；不要把 worktree 内容纳入主工作树
- 不要默认创建与仓库同级的 \`<repo-name>-worktrees\` 或其他新目录
- 项目指令、已有配置或用户明确指定其他路径时，以其为准
- 不要自动移动或删除已经存在的 worktree；路径迁移需先确认其分支和未提交改动安全`
}
