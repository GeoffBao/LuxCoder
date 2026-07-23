import { describe, expect, test } from 'bun:test'
import { buildMinimalTaskSpec } from '../build-minimal-spec.ts'

describe('buildMinimalTaskSpec', () => {
  test('最小输入：id 由 title 派生，goal/首节点 prompt 用 description', () => {
    const spec = buildMinimalTaskSpec({ title: 'Fix Login Bug', description: '修复登录页报错' })
    expect(spec.id).toBe('fix-login-bug')
    expect(spec.title).toBe('Fix Login Bug')
    expect(spec.goal).toBe('修复登录页报错')
    expect(spec.nodes).toHaveLength(1)
    expect(spec.nodes[0]).toMatchObject({ id: 'main', prompt: '修复登录页报错' })
    // schema 对未显式设置的 kind 应用 .default('session')，因此解析后是 'session' 而非 undefined
    expect(spec.nodes[0]!.kind).toBe('session')
  })

  test('可选字段全部映射到对应 spec 字段', () => {
    const spec = buildMinimalTaskSpec({
      title: 'T',
      description: 'D',
      acceptanceCriteria: 'AC',
      sources: ['docs'],
      skills: ['skill-a'],
      llmConnection: 'conn-1',
      model: 'model-1',
      workingDirectory: '/tmp/proj',
      projectId: 'proj-1',
    })
    expect(spec.acceptance_criteria).toBe('AC')
    expect(spec.sources).toEqual(['docs'])
    expect(spec.skills).toEqual(['skill-a'])
    expect(spec.defaults).toEqual({ llmConnection: 'conn-1', model: 'model-1' })
    expect(spec.cwd).toBe('/tmp/proj')
    expect(spec.project).toBe('proj-1')
  })

  test('省略可选字段时 spec 不包含对应 key', () => {
    const spec = buildMinimalTaskSpec({ title: 'T', description: 'D' })
    expect(spec.sources).toBeUndefined()
    expect(spec.skills).toBeUndefined()
    expect(spec.defaults).toBeUndefined()
    expect(spec.cwd).toBeUndefined()
    expect(spec.project).toBeUndefined()
  })

  test('title 全是符号时 slug 回退为 untitled-task', () => {
    const spec = buildMinimalTaskSpec({ title: '###', description: 'D' })
    expect(spec.id).toBe('untitled-task')
  })
})
