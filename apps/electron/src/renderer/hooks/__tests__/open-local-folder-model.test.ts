import { describe, expect, test } from 'bun:test'
import { planOpenLocalFolder } from '../open-local-folder-model.ts'

describe('open-local-folder-model', () => {
  test('取消对话框 → 无操作', () => {
    expect(planOpenLocalFolder({ dialog: null, workspaceRoot: '/ws' })).toEqual({ kind: 'cancel' })
  })

  test('缺少 workspaceRoot → 取消', () => {
    expect(planOpenLocalFolder({
      dialog: { path: '/repo/app', name: 'app' },
    })).toEqual({ kind: 'cancel' })
  })

  test('选中路径 → openOrCreate + draft session + 切会话视图', () => {
    expect(planOpenLocalFolder({
      dialog: { path: '/repo/app', name: 'app' },
      workspaceRoot: '/ws',
    })).toEqual({
      kind: 'open',
      folderPath: '/repo/app',
      workspaceRoot: '/ws',
    })
  })
})
