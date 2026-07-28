import { atom } from 'jotai'

/** Global flag controlling the WorkspaceLabelManagerDialog visibility. */
export const labelManagerOpenAtom = atom<boolean>(false)

/** Workspace root to pass to the dialog; set by the caller opening the dialog. */
export const labelManagerWorkspaceRootAtom = atom<string | null>(null)
