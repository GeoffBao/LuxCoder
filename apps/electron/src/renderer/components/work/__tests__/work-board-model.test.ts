import { describe, expect, test } from 'bun:test'
import { buildKanbanTaskRun } from '../work-board-model'

describe('buildKanbanTaskRun', () => {
  test('按日志顺序恢复节点状态，并让重试节点回到 pending', () => {
    expect(buildKanbanTaskRun('release', {
      runId: 'run-1',
      log: [
        { kind: 'node-scheduled', nodeId: 'build' },
        { kind: 'node-spawned', nodeId: 'build' },
        { kind: 'node-finished', nodeId: 'build', state: 'done' },
        { kind: 'node-finished', nodeId: 'verify', state: 'failed' },
        { kind: 'node-retry', nodeId: 'verify' },
      ],
    })).toEqual({
      taskSlug: 'release',
      runId: 'run-1',
      nodeStates: {
        build: 'done',
        verify: 'pending',
      },
    })
  })

  test('忽略不包含节点状态的 run 级日志', () => {
    expect(buildKanbanTaskRun('release', {
      runId: 'run-2',
      log: [{ kind: 'run-completed' }],
    }).nodeStates).toEqual({})
  })
})
