import { afterEach, describe, expect, test } from 'bun:test'
import { clearProjectKnowledgeDrafts, getProjectKnowledgeDraft, removeProjectKnowledgeDraft, setProjectKnowledgeDraft } from '../project-knowledge-draft-store'

afterEach(clearProjectKnowledgeDrafts)

describe('project knowledge draft store', () => {
  test('组件卸载后仍能恢复未保存草稿', () => {
    setProjectKnowledgeDraft('workspace/project-a', '# 未保存')
    expect(getProjectKnowledgeDraft('workspace/project-a')).toBe('# 未保存')
  })

  test('保存成功后移除草稿，不污染其他项目', () => {
    setProjectKnowledgeDraft('workspace/a', 'A')
    setProjectKnowledgeDraft('workspace/b', 'B')
    removeProjectKnowledgeDraft('workspace/a')
    expect(getProjectKnowledgeDraft('workspace/a')).toBeUndefined()
    expect(getProjectKnowledgeDraft('workspace/b')).toBe('B')
  })
})
