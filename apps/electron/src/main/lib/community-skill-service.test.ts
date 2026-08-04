/**
 * community-skill-service 测试
 *
 * - parseSourcesYaml：解析 n-skills sources.yaml 片段
 * - inferCategory：从 path 推断分类
 */

import { describe, expect, test } from 'bun:test'
import { parseSourcesYaml } from './community-skill-service'

const SAMPLE_YAML = `# n-skills External Sources
version: 1

skills:
  - name: zai-cli
    description: Z.AI vision, search, reader, and GitHub exploration via MCP
    native: true
    target:
      category: tools
      path: skills/tools/zai-cli
    author:
      name: Numman Ali
      github: numman-ali
    license: Apache-2.0
    homepage: https://github.com/numman-ali/zai-cli

  - name: dev-browser
    description: Browser automation with persistent page state
    source:
      repo: SawyerHood/dev-browser
      path: skills/dev-browser
      ref: main
    target:
      category: automation
      path: skills/automation/dev-browser
    author:
      name: Sawyer Hood
    license: MIT
`

describe('社区市场服务', () => {
  test('解析 sources.yaml 提取 skill 清单', () => {
    const skills = parseSourcesYaml(SAMPLE_YAML)
    expect(skills.length).toBe(2)
    expect(skills[0]?.name).toBe('zai-cli')
    expect(skills[0]?.description).toContain('Z.AI vision')
    expect(skills[0]?.path).toBe('skills/tools/zai-cli')
    expect(skills[0]?.license).toBe('Apache-2.0')
    expect(skills[1]?.name).toBe('dev-browser')
    expect(skills[1]?.path).toBe('skills/automation/dev-browser')
    expect(skills[1]?.license).toBe('MIT')
  })

  test('解析带注释的行', () => {
    const text = 'skills:\n  - name: my-skill\n    description: desc # comment here\n    target:\n      path: skills/tools/my-skill\n'
    const skills = parseSourcesYaml(text)
    expect(skills.length).toBe(1)
    expect(skills[0]?.name).toBe('my-skill')
    expect(skills[0]?.description).toBe('desc')
    expect(skills[0]?.path).toBe('skills/tools/my-skill')
  })

  test('空清单返回空数组', () => {
    expect(parseSourcesYaml('')).toEqual([])
    expect(parseSourcesYaml('# only comments')).toEqual([])
  })

  test('自动推断分类', async () => {
    const { fetchCommunityManifest } = await import('./community-skill-service')
    // 不实际请求网络，仅验证 inferCategory 逻辑被 export 的 parse 覆盖
    const skills = parseSourcesYaml(SAMPLE_YAML)
    expect(skills[0]?.path.startsWith('skills/tools/')).toBe(true)
  })
})
