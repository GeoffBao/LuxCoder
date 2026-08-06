import { describe, expect, test } from 'bun:test'
import {
  analyzeTaskCompleteness,
  canTransition,
  classifyTbDefect,
  deriveLegalTargets,
  findWorkflowStatus,
  findWorkflowStatusByName,
  isTbDefectOverdue,
  isTbDefectReopened,
  resolveSkillMatches,
  type TbWorkflow,
} from '../model'

/** 对齐 ZURICHA 缺陷工作流实测的精简状态机（待审核/New/Open/Fixed/Close/Reopen/Postpone） */
const defectWorkflow: TbWorkflow = {
  taskflowId: 'defect-flow',
  statuses: [
    { id: 's-audit', name: '待审核', kind: 'start', pos: 65536, rejectStatusIds: ['s-new'] },
    { id: 's-new', name: 'New', kind: 'unset', pos: 131072, rejectStatusIds: ['s-audit', 's-close'] },
    { id: 's-open', name: 'Open', kind: 'unset', pos: 851968, rejectStatusIds: ['s-new', 's-fixed'] },
    { id: 's-fixed', name: 'Fixed', kind: 'unset', pos: 786432, rejectStatusIds: ['s-open', 's-reopen', 's-close'] },
    { id: 's-reopen', name: 'Reopen', kind: 'unset', pos: 917504, rejectStatusIds: ['s-open', 's-close'] },
    { id: 's-close', name: 'Close', kind: 'end', pos: 983040, rejectStatusIds: [] },
    { id: 's-postpone', name: 'Postpone', kind: 'end', pos: 1048576, rejectStatusIds: [] },
  ],
}

const MINE = 'user-me'
const OTHER = 'user-other'

describe('findWorkflowStatus', () => {
  test('按 id 命中', () => {
    expect(findWorkflowStatus(defectWorkflow, 's-open')?.name).toBe('Open')
  })
  test('未命中返回 undefined', () => {
    expect(findWorkflowStatus(defectWorkflow, 'nope')).toBeUndefined()
  })
  test('空 workflow 返回 undefined', () => {
    expect(findWorkflowStatus(undefined, 's-open')).toBeUndefined()
  })
})

describe('findWorkflowStatusByName', () => {
  test('按名命中（大小写不敏感）', () => {
    expect(findWorkflowStatusByName(defectWorkflow, 'reopen')?.id).toBe('s-reopen')
    expect(findWorkflowStatusByName(defectWorkflow, 'FIXED')?.id).toBe('s-fixed')
  })
  test('未命中返回 undefined', () => {
    expect(findWorkflowStatusByName(defectWorkflow, 'unknown')).toBeUndefined()
  })
})

describe('deriveLegalTargets', () => {
  test('Open 可正向到 Fixed/Close，可回跳到 New/Reopen，不含自身', () => {
    const targets = deriveLegalTargets(defectWorkflow, 's-open')
    const names = targets.map((t) => t.name)
    // Open rejectStatusIds = [New, Fixed]（回跳），正向 pos>Open 的 = Reopen/Close/Postpone（end 归终态）
    expect(names).toContain('New')
    expect(names).toContain('Fixed')
    expect(names).toContain('Close')
    expect(names).not.toContain('Open')
    expect(names).not.toContain('待审核')
  })

  test('Fixed 可正向到 Close（end），可回跳到 Open/Reopen', () => {
    const targets = deriveLegalTargets(defectWorkflow, 's-fixed')
    const names = targets.map((t) => t.name)
    expect(names).toContain('Open')
    expect(names).toContain('Reopen')
    expect(names).toContain('Close')
  })

  test('Close（end）不可再流转', () => {
    expect(deriveLegalTargets(defectWorkflow, 's-close')).toEqual([])
  })

  test('空 workflow 返回空', () => {
    expect(deriveLegalTargets(undefined, 's-open')).toEqual([])
  })
})

describe('classifyTbDefect', () => {
  test('executor==我 → mine-actionable', () => {
    expect(classifyTbDefect({ tfsId: 's-open', executorId: MINE, involveMembers: [] }, defectWorkflow, MINE))
      .toBe('mine-actionable')
  })
  test('executor 为空且我在参与人 → mine-actionable（可认领）', () => {
    expect(classifyTbDefect({ tfsId: 's-new', executorId: undefined, involveMembers: [MINE] }, defectWorkflow, MINE))
      .toBe('mine-actionable')
  })
  test('executor==他人 → handed-off', () => {
    expect(classifyTbDefect({ tfsId: 's-fixed', executorId: OTHER, involveMembers: [] }, defectWorkflow, MINE))
      .toBe('handed-off')
  })
  test('end 状态 → closed（即使 executor==我）', () => {
    expect(classifyTbDefect({ tfsId: 's-close', executorId: MINE, involveMembers: [] }, defectWorkflow, MINE))
      .toBe('closed')
  })
  test('缺 workflow 且非 end → 按 executor 判断', () => {
    expect(classifyTbDefect({ tfsId: 'x', executorId: MINE, involveMembers: [] }, undefined, MINE))
      .toBe('mine-actionable')
  })
})

describe('canTransition', () => {
  test('我可流转且存在合法目标 → 返回目标', () => {
    const targets = canTransition(
      { tfsId: 's-open', executorId: MINE, involveMembers: [] },
      defectWorkflow,
      MINE,
    )
    expect(targets.length).toBeGreaterThan(0)
  })
  test('executor==他人 → 空（无权限）', () => {
    expect(canTransition(
      { tfsId: 's-fixed', executorId: OTHER, involveMembers: [] },
      defectWorkflow,
      MINE,
    )).toEqual([])
  })
  test('end 状态 → 空', () => {
    expect(canTransition(
      { tfsId: 's-close', executorId: MINE, involveMembers: [] },
      defectWorkflow,
      MINE,
    )).toEqual([])
  })
})

describe('isTbDefectReopened', () => {
  test('当前状态名为 Reopen → true', () => {
    expect(isTbDefectReopened({ tfsName: 'Reopen', transitions: [] }, defectWorkflow)).toBe(true)
  })
  test('最近一条流转到 Reopen → true', () => {
    expect(isTbDefectReopened({
      tfsName: 'Fixed',
      transitions: [{ fromName: 'Fixed', toName: 'Reopen', at: 1 }],
    }, defectWorkflow)).toBe(true)
  })
  test('未被打回 → false', () => {
    expect(isTbDefectReopened({
      tfsName: 'Fixed',
      transitions: [{ fromName: 'Open', toName: 'Fixed', at: 1 }],
    }, defectWorkflow)).toBe(false)
  })
})

describe('isTbDefectOverdue', () => {
  test('非终态且 dueDate 已过 → true', () => {
    expect(isTbDefectOverdue({ tfsId: 's-open', dueDate: '2026-08-01T00:00:00.000Z' }, defectWorkflow, Date.parse('2026-08-06T00:00:00.000Z')))
      .toBe(true)
  })
  test('无 dueDate → false', () => {
    expect(isTbDefectOverdue({ tfsId: 's-open', dueDate: undefined }, defectWorkflow, Date.now())).toBe(false)
  })
  test('终态即使逾期 → false', () => {
    expect(isTbDefectOverdue({ tfsId: 's-close', dueDate: '2026-08-01T00:00:00.000Z' }, defectWorkflow, Date.parse('2026-08-06T00:00:00.000Z')))
      .toBe(false)
  })
})

describe('analyzeTaskCompleteness', () => {
  test('信息完整：日志 + 步骤 + 时间 + 概率 + 描述', () => {
    const result = analyzeTaskCompleteness({
      note: '相机黑屏，复现步骤：打开相机→黑屏。发生时间 8/1 10:00，复现概率 80%',
      description: '现象描述',
      attachments: [{ resourceId: 'work:1', name: 'log.txt' }],
      fields: [{ name: '复现概率', value: '高' }],
    })
    expect(result.complete).toBe(true)
    expect(result.satisfied).toBe(5)
  })

  test('信息不完整：无日志无步骤无时间无概率 → 提示', () => {
    const result = analyzeTaskCompleteness({
      note: '有个问题',
      description: undefined,
      attachments: [],
      fields: [],
    })
    expect(result.complete).toBe(false)
    expect(result.satisfied).toBe(1) // 只有 description 满足
    const log = result.items.find((item) => item.key === 'log')
    expect(log?.ok).toBe(false)
    expect(log?.hint).toContain('日志')
  })

  test('字段名含日志视为有日志', () => {
    const result = analyzeTaskCompleteness({
      note: '',
      description: '',
      attachments: [],
      fields: [{ name: '日志', value: '有' }],
    })
    expect(result.items.find((item) => item.key === 'log')?.ok).toBe(true)
  })

  test('时间关键词可从备注识别', () => {
    const result = analyzeTaskCompleteness({
      note: '问题出现在 8/1 下午',
      description: '',
      attachments: [],
      fields: [],
    })
    expect(result.items.find((item) => item.key === 'time')?.ok).toBe(true)
  })

  test('概率关键词可从字段值识别', () => {
    const result = analyzeTaskCompleteness({
      note: '',
      description: '',
      attachments: [],
      fields: [{ name: '频次', value: '经常出现' }],
    })
    expect(result.items.find((item) => item.key === 'probability')?.ok).toBe(true)
  })
})

describe('resolveSkillMatches', () => {
  const skills = [
    { slug: 'connect-tb-workflow', name: 'connect_TB_workflow', description: '通过teambition-mcp接入TB系统查找问题单并下载日志进行分析输出报告。当用户提到分析TB问题单、问题单id、teambition问题、下载TB日志、排查TB上问题等场景时调用。', enabled: true },
    { slug: 'tb-defect-flow', name: 'tb-defect-flow', description: 'TB 缺陷问题单状态流转编排。当用户要求处理TB缺陷单、流转缺陷状态、认领缺陷、关闭缺陷、把缺陷单状态改成某状态、巡检名下缺陷时调用。', enabled: true },
    { slug: 'docx', name: 'docx', description: 'Word 文档处理', enabled: true },
    { slug: 'disabled-skill', name: 'disabled-skill', description: 'TB 日志分析', enabled: false },
  ]

  test('有日志附件 → 匹配日志分析类 skill，禁用 skill 不匹配', () => {
    const result = resolveSkillMatches(
      { content: '手机无法注网', note: '问题描述', description: '复现步骤', attachments: [{ name: 'signal.zip' }], type: 'bug', fields: [] },
      skills,
    )
    const slugs = result.map((m) => m.slug)
    expect(slugs).toContain('connect-tb-workflow')
    expect(slugs).toContain('tb-defect-flow')
    expect(slugs).not.toContain('disabled-skill')
    expect(slugs).not.toContain('docx')
  })

  test('无附件非缺陷 → 空匹配（暂无 skill 适配）', () => {
    const result = resolveSkillMatches(
      { content: '普通任务', note: '', description: '', attachments: [], type: 'task', fields: [] },
      skills,
    )
    expect(result).toEqual([])
  })

  test('问题文本命中 skill 名 → 关键词匹配', () => {
    const result = resolveSkillMatches(
      { content: '请用 tb-defect-flow 处理这个缺陷', note: '', description: '缺陷', attachments: [], type: 'bug', fields: [] },
      skills,
    )
    const slugs = result.map((m) => m.slug)
    expect(slugs).toContain('tb-defect-flow')
  })

  test('无启用 skill → 空', () => {
    expect(resolveSkillMatches(
      { content: 'x', note: '', description: '缺陷', attachments: [{ name: 'log' }], type: 'bug', fields: [] },
      [{ slug: 'a', name: 'a', description: 'TB 日志', enabled: false }],
    )).toEqual([])
  })
})
