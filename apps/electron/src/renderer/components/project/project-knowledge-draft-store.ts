const drafts = new Map<string, string>()
let beforeUnloadInstalled = false

function warnBeforeUnload(event: BeforeUnloadEvent): void {
  if (drafts.size === 0) return
  event.preventDefault()
  event.returnValue = ''
}

function syncBeforeUnloadGuard(): void {
  if (typeof window === 'undefined') return
  if (drafts.size > 0 && !beforeUnloadInstalled) {
    window.addEventListener('beforeunload', warnBeforeUnload)
    beforeUnloadInstalled = true
  } else if (drafts.size === 0 && beforeUnloadInstalled) {
    window.removeEventListener('beforeunload', warnBeforeUnload)
    beforeUnloadInstalled = false
  }
}

export function getProjectKnowledgeDraft(key: string): string | undefined {
  return drafts.get(key)
}

export function setProjectKnowledgeDraft(key: string, value: string): void {
  drafts.set(key, value)
  syncBeforeUnloadGuard()
}

export function removeProjectKnowledgeDraft(key: string): void {
  drafts.delete(key)
  syncBeforeUnloadGuard()
}

export function hasProjectKnowledgeDrafts(): boolean {
  return drafts.size > 0
}

/** Test/support helper; production code should remove per Project after save. */
export function clearProjectKnowledgeDrafts(): void {
  drafts.clear()
  syncBeforeUnloadGuard()
}
