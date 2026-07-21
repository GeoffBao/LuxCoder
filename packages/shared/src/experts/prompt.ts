import type { ExpertPackage } from './types.ts'

/** 身份核正文合计软上限（不含 XML 外壳） */
export const EXPERT_PREAMBLE_MAX_CHARS = 12_000

export function resolveExpertId(
  taskExpertId: string | undefined,
  projectDefaultExpertId: string | undefined,
): string | null {
  const fromTask = taskExpertId?.trim()
  if (fromTask) return fromTask
  const fromProject = projectDefaultExpertId?.trim()
  if (fromProject) return fromProject
  return null
}

export function mergeSkillSlugs(
  taskSkills: string[] | undefined,
  expertSkills: string[] | undefined,
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const list of [taskSkills, expertSkills]) {
    for (const raw of list ?? []) {
      const slug = raw.trim()
      if (!slug || seen.has(slug)) continue
      seen.add(slug)
      out.push(slug)
    }
  }
  return out
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function sanitizeBody(text: string): string {
  return text
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    .replace(/<\s*\/\s*agent_expert\s*>/gi, '')
    .replace(/<\s*\/\s*(?:identity|soul|rules)\s*>/gi, '')
}

function section(tag: 'identity' | 'soul' | 'rules', md: string): string | null {
  const body = sanitizeBody(md).trim()
  if (!body) return null
  return `<${tag}>\n${body}\n</${tag}>`
}

/**
 * 将专家包格式化为 TaskRunner 用户消息 preamble。
 * 超限时按 RULES → SOUL → IDENTITY 裁剪正文尾部。
 */
export function formatExpertPreamble(expert: ExpertPackage): string {
  const parts: Array<{ tag: 'identity' | 'soul' | 'rules'; text: string }> = []
  for (const [tag, md] of [
    ['identity', expert.identityMd],
    ['soul', expert.soulMd],
    ['rules', expert.rulesMd],
  ] as const) {
    const body = sanitizeBody(md).trim()
    if (body) parts.push({ tag, text: body })
  }

  let budgets = parts.map((p) => p.text.length)
  let total = budgets.reduce((a, b) => a + b, 0)
  if (total > EXPERT_PREAMBLE_MAX_CHARS) {
    const order = ['rules', 'soul', 'identity'] as const
    for (const tag of order) {
      if (total <= EXPERT_PREAMBLE_MAX_CHARS) break
      const idx = parts.findIndex((p) => p.tag === tag)
      if (idx < 0) continue
      const overflow = total - EXPERT_PREAMBLE_MAX_CHARS
      const keep = Math.max(0, budgets[idx]! - overflow)
      const truncated = parts[idx]!.text.slice(0, keep).trimEnd()
      parts[idx] = {
        tag,
        text: truncated.length > 0 ? `${truncated}\n…(truncated)` : '…(truncated)',
      }
      budgets = parts.map((p) => p.text.length)
      total = budgets.reduce((a, b) => a + b, 0)
    }
  }

  const sections = parts
    .map((p) => section(p.tag, p.text))
    .filter((s): s is string => s !== null)

  if (sections.length === 0) return ''

  return [
    `<agent_expert id="${escapeAttr(expert.id)}" label="${escapeAttr(expert.label)}">`,
    ...sections,
    `</agent_expert>`,
    '',
  ].join('\n')
}
