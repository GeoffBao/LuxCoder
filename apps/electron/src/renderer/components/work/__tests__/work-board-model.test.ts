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

  test('run-failed 无 reason 也标记失败（历史数据兜底）', () => {
    expect(buildKanbanTaskRun('release', {
      runId: 'run-3',
      log: [
        { kind: 'node-finished', nodeId: 'main', state: 'done' },
        { kind: 'run-failed' },
      ],
    }).failureReason).toBe('任务执行失败（未通过验收）')
  })

  test('run-failed 带 reason 时使用具体原因', () => {
    expect(buildKanbanTaskRun('release', {
      runId: 'run-4',
      log: [
        { kind: 'node-finished', nodeId: 'main', state: 'done' },
        { kind: 'run-failed', reason: '验收判定连续无法解析' },
      ],
    }).failureReason).toBe('验收判定连续无法解析')
  })

  test('verdict fail 被 repair 救回后 run-completed 不标记失败（P1 回归）', () => {
    // 修复前会把中途 verdict=fail 误判为最终失败；修复后仅以 run-failed 终态判定
    expect(buildKanbanTaskRun('release', {
      runId: 'run-5',
      log: [
        { kind: 'node-finished', nodeId: 'main', state: 'done' },
        { kind: 'verdict', result: 'fail', reason: '输出不满足验收标准' },
        { kind: 'node-retry', nodeId: 'main' },
        { kind: 'node-spawned', nodeId: 'main' },
        { kind: 'node-finished', nodeId: 'main', state: 'done' },
        { kind: 'verdict', result: 'pass' },
        { kind: 'run-completed' },
      ],
    }).failureReason).toBeUndefined()
  })

  test('最终 run-failed 无 reason 时用中途 verdict fail 的 reason 兜底', () => {
    expect(buildKanbanTaskRun('release', {
      runId: 'run-6',
      log: [
        { kind: 'node-finished', nodeId: 'main', state: 'done' },
        { kind: 'verdict', result: 'fail', reason: '根因分析不完整' },
        { kind: 'node-retry', nodeId: 'main' },
        { kind: 'node-finished', nodeId: 'main', state: 'done' },
        { kind: 'verdict', result: 'fail', reason: '仍未通过' },
        { kind: 'run-failed' },
      ],
    }).failureReason).toBe('根因分析不完整')
  })
})
