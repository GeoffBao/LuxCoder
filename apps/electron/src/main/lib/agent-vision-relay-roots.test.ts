import { describe, expect, test } from 'bun:test'
import { appendVisionRelayAllowedRoot } from './vision-relay-roots'

const PROJECT_DIR = '/Users/admin/Workspace/Resources/obsidian/AI-KN-Base'
const HOME = '/Users/admin'

describe('appendVisionRelayAllowedRoot', () => {
  test('agentCwd 为项目工作目录且不在基础列表 → 追加到授权根', () => {
    const base = ['/tmp/additional', '/tmp/workspace-files']
    const result = appendVisionRelayAllowedRoot(base, PROJECT_DIR, HOME)
    expect(result).toEqual([...base, PROJECT_DIR])
  })

  test('agentCwd 已在基础列表 → 不重复追加', () => {
    const base = ['/tmp/additional', PROJECT_DIR]
    const result = appendVisionRelayAllowedRoot(base, PROJECT_DIR, HOME)
    expect(result).toEqual(base)
  })

  test('agentCwd 未定义 → 原样返回', () => {
    const base = ['/tmp/additional']
    expect(appendVisionRelayAllowedRoot(base, undefined, HOME)).toEqual(base)
  })

  test('agentCwd 等于 homedir（无 workspace 兜底）→ 不无脑放宽整个主目录', () => {
    const base = ['/tmp/additional']
    expect(appendVisionRelayAllowedRoot(base, HOME, HOME)).toEqual(base)
  })
})
