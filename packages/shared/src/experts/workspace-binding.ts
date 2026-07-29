/**
 * Expert Workspace Binding types.
 *
 * Global expert manifest (expert.json) only keeps IDENTITY/SOUL/RULES.
 * Skill/MCP/override bindings are stored per workspace at:
 *   <workspaceRoot>/expert-bindings/<expertId>.json
 */

export interface ExpertWorkspaceBinding {
  /** Expert ID this binding belongs to */
  expertId: string
  /** Skill slugs to activate for this expert in this workspace */
  skillSlugs: string[]
  /** MCP server IDs to activate */
  mcpIds: string[]
  /** Overrides: model, permission, token budget, etc. */
  overrides?: ExpertBindingOverrides
  /** When this binding was created */
  createdAt: string
  /** When this binding was last updated */
  updatedAt: string
}

export interface ExpertBindingOverrides {
  model?: string
  llmConnection?: string
  permissionMode?: string
  tokenBudget?: number
}

export type ExpertWorkspaceBindingLoadResult =
  | { kind: 'missing' }
  | { kind: 'valid'; binding: ExpertWorkspaceBinding }
  | { kind: 'invalid'; message: string }
