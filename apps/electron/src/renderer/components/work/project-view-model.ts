export interface ProjectSettingsDraft {
  name: string
  description: string
  details: string
  color: string
  /** 可选：未传时按空字符串处理（兼容尚未接线的调用方） */
  workingDirectory?: string
  /** 可选：未传时按空字符串处理（兼容尚未接线的调用方） */
  defaultExpertId?: string
}

export interface ProjectUpdatePatch {
  name: string
  description?: string
  details?: string
  color?: string
  workingDirectory?: string
  defaultExpertId?: string
}

export interface CreateProjectDraft {
  name: string
  description: string
  workingDirectory: string
  color: string
}

function optionalText(value: string): string | undefined {
  return value.trim() || undefined
}

export function buildCreateProjectInput(draft: CreateProjectDraft): {
  name: string
  description?: string
  workingDirectory?: string
  color?: string
} {
  const input: {
    name: string
    description?: string
    workingDirectory?: string
    color?: string
  } = { name: draft.name.trim() }
  const description = optionalText(draft.description)
  const workingDirectory = optionalText(draft.workingDirectory)
  const color = optionalText(draft.color)
  if (description) input.description = description
  if (workingDirectory) input.workingDirectory = workingDirectory
  if (color) input.color = color
  return input
}

export function buildProjectUpdate(draft: ProjectSettingsDraft): ProjectUpdatePatch {
  return {
    name: draft.name.trim(),
    description: optionalText(draft.description),
    details: optionalText(draft.details),
    color: optionalText(draft.color),
    workingDirectory: optionalText(draft.workingDirectory ?? ''),
    defaultExpertId: optionalText(draft.defaultExpertId ?? ''),
  }
}
