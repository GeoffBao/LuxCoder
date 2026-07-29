export interface WorkspaceLoadIdentity {
  generation: number
  workspaceId: string
  root: string | null
}

/** Async Task/Run/Project reads may write only to the exact Workspace load that started them. */
export function matchesWorkspaceLoad(
  active: WorkspaceLoadIdentity | null,
  expected: WorkspaceLoadIdentity,
): boolean {
  return active?.generation === expected.generation
    && active.workspaceId === expected.workspaceId
    && active.root === expected.root
}
