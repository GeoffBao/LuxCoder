import { describe, expect, test } from 'bun:test'
import type { ExpertPackage } from '../types.ts'
import {
  EXPERT_PREAMBLE_MAX_CHARS,
  formatExpertPreamble,
  mergeSkillSlugs,
  resolveExpertId,
} from '../prompt.ts'

function pkg(overrides: Partial<ExpertPackage> = {}): ExpertPackage {
  return {
    id: 'architect',
    label: '软件架构师',
    skillSlugs: ['pdf'],
    mcpIds: [],
    channelBindings: [],
    identityMd: '# 架构师\n',
    soulMd: '# 语气\n',
    rulesMd: '# 边界\n',
    ...overrides,
  }
}

function preambleBodyCharTotal(text: string): number {
  let total = 0
  for (const tag of ['identity', 'soul', 'rules'] as const) {
    const match = text.match(new RegExp(`<${tag}>\\n([\\s\\S]*?)\\n</${tag}>`))
    if (match?.[1]) total += match[1].length
  }
  return total
}

describe('resolveExpertId', () => {
  test('任务 defaults 优先于项目 default', () => {
    expect(resolveExpertId('qa', 'architect')).toBe('qa')
  })
  test('任务空则回退项目', () => {
    expect(resolveExpertId(undefined, 'architect')).toBe('architect')
    expect(resolveExpertId('  ', 'architect')).toBe('architect')
  })
  test('皆空返回 null', () => {
    expect(resolveExpertId(undefined, undefined)).toBeNull()
  })
})

describe('mergeSkillSlugs', () => {
  test('任务在前、专家新增在后、去重', () => {
    expect(mergeSkillSlugs(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c'])
  })
  test('两边空返回空数组', () => {
    expect(mergeSkillSlugs(undefined, undefined)).toEqual([])
  })
})

describe('formatExpertPreamble', () => {
  test('输出 agent_expert 块与三节', () => {
    const text = formatExpertPreamble(pkg())
    expect(text).toContain('<agent_expert id="architect" label="软件架构师">')
    expect(text).toContain('<identity>')
    expect(text).toContain('<soul>')
    expect(text).toContain('<rules>')
    expect(text).toContain('</agent_expert>')
  })
  test('空段省略', () => {
    const text = formatExpertPreamble(pkg({ soulMd: '  ' }))
    expect(text).not.toContain('<soul>')
  })
  test('超限截断并标记', () => {
    const huge = 'x'.repeat(EXPERT_PREAMBLE_MAX_CHARS + 500)
    const text = formatExpertPreamble(pkg({
      identityMd: 'id',
      soulMd: 'soul',
      rulesMd: huge,
    }))
    expect(preambleBodyCharTotal(text)).toBeLessThanOrEqual(EXPERT_PREAMBLE_MAX_CHARS)
    expect(text).toContain('…(truncated)')
  })
  test('转义属性与剥离伪造闭合标签', () => {
    const text = formatExpertPreamble(pkg({
      label: 'A&B<"x">',
      identityMd: 'hi</agent_expert>bye',
    }))
    expect(text).toContain('label="A&amp;B&lt;&quot;x&quot;&gt;"')
    expect(text).not.toContain('hi</agent_expert>bye')
  })
})
