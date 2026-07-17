import { describe, expect, test } from 'bun:test'
import { extractYaml, buildGeneratorPrompt } from '../generator-prompt.ts'
import { parseTaskYaml } from '../storage.ts'

describe('extractYaml', () => {
  test('剥离 ```yaml 围栏后可解析为合法 task spec', () => {
    const body = [
      'id: aios-research',
      'title: AIOS调研',
      'goal: 找到本地可部署的最小方案',
      'runner: conduct',
      'nodes:',
      '  - id: survey',
      '    kind: session',
      '    prompt: 调研现有方案',
    ].join('\n')
    const fenced = `\`\`\`yaml\n${body}\n\`\`\``

    expect(parseTaskYaml(fenced).valid).toBe(false)
    expect(parseTaskYaml(extractYaml(fenced)).valid).toBe(true)
    expect(extractYaml(body)).toBe(body)
  })

  test('buildGeneratorPrompt 包含目标与标题', () => {
    const prompt = buildGeneratorPrompt('ship v1', 'Release')
    expect(prompt).toContain('Goal: ship v1')
    expect(prompt).toContain('Working title: Release')
  })
})
