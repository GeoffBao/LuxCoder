import { describe, expect, test } from 'bun:test'
import {
  analyzeTaskCompleteness,
  buildReportCommentDraft,
  buildTbCommentDraft,
  canTransition,
  classifyTbDefect,
  deriveLegalTargets,
  extractAnalysisText,
  findWorkflowStatus,
  findWorkflowStatusByName,
  inferStatusStage,
  isTbDefectOverdue,
  isTbDefectReopened,
  resolveSkillMatches,
  TB_ROLE_VIEWS,
  type TbWorkflow,
  type TbWorkflowStatus,
} from '../model'

/** 对齐 ZURICHA 缺陷工作流实测的精简状态机（待审核/New/Open/Fixed/Close/Reopen/Postpone） */
const defectWorkflow: TbWorkflow = {
  taskflowId: 'defect-flow',
  statuses: [
    { id: 's-audit', name: '待审核', kind: 'start', pos: 65536, rejectStatusIds: ['s-new'], stage: 'waiting' },
    { id: 's-new', name: 'New', kind: 'unset', pos: 131072, rejectStatusIds: ['s-audit', 's-close'], stage: 'dev' },
    { id: 's-open', name: 'Open', kind: 'unset', pos: 851968, rejectStatusIds: ['s-new', 's-fixed'], stage: 'dev' },
    { id: 's-fixed', name: 'Fixed', kind: 'unset', pos: 786432, rejectStatusIds: ['s-open', 's-reopen', 's-close'], stage: 'waiting' },
    { id: 's-reopen', name: 'Reopen', kind: 'unset', pos: 917504, rejectStatusIds: ['s-open', 's-close'], stage: 'dev' },
    { id: 's-close', name: 'Close', kind: 'end', pos: 983040, rejectStatusIds: [], stage: 'closed' },
    { id: 's-postpone', name: 'Postpone', kind: 'end', pos: 1048576, rejectStatusIds: [], stage: 'closed' },
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

describe('inferStatusStage', () => {
  test('end → closed', () => {
    expect(inferStatusStage('Close', 'end')).toBe('closed')
    expect(inferStatusStage('Postpone', 'end')).toBe('closed')
  })
  test('开发执行段（我可流转）→ dev', () => {
    expect(inferStatusStage('New', 'start')).toBe('dev')
    expect(inferStatusStage('Assign', 'unset')).toBe('dev')
    expect(inferStatusStage('In Progress', 'unset')).toBe('dev')
    expect(inferStatusStage('Open', 'unset')).toBe('dev')
    expect(inferStatusStage('Reopen', 'unset')).toBe('dev')
    expect(inferStatusStage('待处理', 'start')).toBe('dev')
    expect(inferStatusStage('处理中', 'unset')).toBe('dev')
  })
  test('他人处理段（测试/评审/集成，需他人流转）→ waiting', () => {
    expect(inferStatusStage('待审核', 'start')).toBe('waiting')
    expect(inferStatusStage('Review', 'unset')).toBe('waiting')
    expect(inferStatusStage('Resolved', 'unset')).toBe('waiting')
    expect(inferStatusStage('Fixed', 'unset')).toBe('waiting')
    expect(inferStatusStage('Done', 'unset')).toBe('waiting')
    expect(inferStatusStage('Completed', 'unset')).toBe('waiting')
    expect(inferStatusStage('Pending', 'unset')).toBe('waiting')
    expect(inferStatusStage('Commited', 'unset')).toBe('waiting')
    expect(inferStatusStage('已解决', 'unset')).toBe('waiting')
    expect(inferStatusStage('To Be Integrated', 'unset')).toBe('waiting')
  })
  test('未知非终态状态回退 dev（研发优先展示，不误藏任务）', () => {
    expect(inferStatusStage('某自定义状态', 'unset')).toBe('dev')
  })
})

const statusWithStage = (name: string, kind: 'start' | 'unset' | 'end'): TbWorkflowStatus => ({
  id: `s-${name}`, name, kind, pos: 1, rejectStatusIds: [], stage: inferStatusStage(name, kind),
})

describe('classifyTbDefect', () => {
  const devRole = TB_ROLE_VIEWS.developer
  const testRole = TB_ROLE_VIEWS.tester

  test('研发：dev 段 → mine-actionable（即使 executor==他人）', () => {
    expect(classifyTbDefect({ tfsId: 's-open', executorId: MINE, involveMembers: [] }, defectWorkflow, devRole, MINE))
      .toBe('mine-actionable')
  })
  test('研发：Reopen 被打回 → mine-actionable', () => {
    expect(classifyTbDefect({ tfsId: 's-reopen', executorId: MINE, involveMembers: [] }, defectWorkflow, devRole, MINE))
      .toBe('mine-actionable')
  })
  test('研发：待审核/待测试 → handed-off（待他人处理）', () => {
    expect(classifyTbDefect({ tfsId: 's-audit', executorId: MINE, involveMembers: [] }, defectWorkflow, devRole, MINE))
      .toBe('handed-off')
    expect(classifyTbDefect({ tfsId: 's-fixed', executorId: MINE, involveMembers: [] }, defectWorkflow, devRole, MINE))
      .toBe('handed-off')
  })
  test('测试：Fixed/Review 段 → mine-actionable（待我验证）', () => {
    expect(classifyTbDefect({ tfsId: 's-fixed', executorId: MINE, involveMembers: [] }, defectWorkflow, testRole, MINE))
      .toBe('mine-actionable')
    expect(classifyTbDefect({ tfsId: 's-audit', executorId: MINE, involveMembers: [] }, defectWorkflow, testRole, MINE))
      .toBe('mine-actionable')
  })
  test('测试：New/Open 研发段 → handed-off（待开发处理）', () => {
    expect(classifyTbDefect({ tfsId: 's-open', executorId: MINE, involveMembers: [] }, defectWorkflow, testRole, MINE))
      .toBe('handed-off')
    expect(classifyTbDefect({ tfsId: 's-reopen', executorId: MINE, involveMembers: [] }, defectWorkflow, testRole, MINE))
      .toBe('handed-off')
  })
  test('任意角色：closed → closed', () => {
    expect(classifyTbDefect({ tfsId: 's-close', executorId: MINE, involveMembers: [] }, defectWorkflow, devRole, MINE))
      .toBe('closed')
    expect(classifyTbDefect({ tfsId: 's-close', executorId: MINE, involveMembers: [] }, defectWorkflow, testRole, MINE))
      .toBe('closed')
  })
  test('缺 workflow 且非 end → 按 executor 判断', () => {
    expect(classifyTbDefect({ tfsId: 'x', executorId: MINE, involveMembers: [] }, undefined, devRole, MINE))
      .toBe('mine-actionable')
  })
})

describe('canTransition', () => {
  const devRole = TB_ROLE_VIEWS.developer
  const testRole = TB_ROLE_VIEWS.tester

  test('研发：dev 段且存在合法目标 → 返回目标', () => {
    const targets = canTransition(
      { tfsId: 's-open', executorId: MINE, involveMembers: [] },
      defectWorkflow,
      devRole,
      MINE,
    )
    expect(targets.length).toBeGreaterThan(0)
  })
  test('研发：waiting 段 → 空（等待他人，我不可流转）', () => {
    expect(canTransition(
      { tfsId: 's-fixed', executorId: MINE, involveMembers: [] },
      defectWorkflow,
      devRole,
      MINE,
    )).toEqual([])
  })
  test('测试：Fixed 段 → 可流转（待我验证）', () => {
    const targets = canTransition(
      { tfsId: 's-fixed', executorId: MINE, involveMembers: [] },
      defectWorkflow,
      testRole,
      MINE,
    )
    expect(targets.length).toBeGreaterThan(0)
  })
  test('任意角色：closed → 空', () => {
    expect(canTransition(
      { tfsId: 's-close', executorId: MINE, involveMembers: [] },
      defectWorkflow,
      devRole,
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
  // 已统一为一个 TB skill：connect-tb-workflow（分析 + 流转双模式，v2.4.0 合并 tb-defect-flow）
  const skills = [
    { slug: 'connect-tb-workflow', name: 'connect_TB_workflow', description: '通过teambition-mcp接入TB系统处理问题单：定位问题单 → 按意图执行【分析模式】（下载日志/分析/输出报告/更新评论）或【流转模式】（状态机校验/授权判断/写回流转/巡检）。当用户提到分析TB问题单、下载TB日志、排查TB问题、流转/认领/关闭TB缺陷、TB缺陷单处理、问题单id、teambition问题等场景时调用。', enabled: true },
    { slug: 'systematic-debugging', name: 'systematic-debugging', description: '系统化调试方法论。当用户遇到复杂 bug、崩溃、无法定位根因时调用，提供排查框架。', enabled: true },
    { slug: 'docx', name: 'docx', description: 'Word 文档处理', enabled: true },
    { slug: 'disabled-skill', name: 'disabled-skill', description: 'TB 日志分析', enabled: false },
  ]

  test('有日志附件 → 匹配统一的 TB skill（分析+流转双能力）；调试类不因通用词误配', () => {
    const result = resolveSkillMatches(
      { content: '手机无法注网', note: '问题描述', description: '复现步骤', attachments: [{ name: 'signal.zip' }], type: 'bug', fields: [] },
      skills,
    )
    const slugs = result.map((m) => m.slug)
    expect(slugs).toContain('connect-tb-workflow')
    // 关键：systematic-debugging 描述含 bug/崩溃/日志 但非日志分析类，不得因附件误配
    expect(slugs).not.toContain('systematic-debugging')
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

  test('缺陷流转意图 → 命中统一的 TB skill（合并后含流转能力）', () => {
    const result = resolveSkillMatches(
      { content: '请流转这个缺陷到 Fixed', note: '', description: '缺陷', attachments: [], type: 'bug', fields: [] },
      skills,
    )
    const slugs = result.map((m) => m.slug)
    expect(slugs).toContain('connect-tb-workflow')
  })

  test('无启用 skill → 空', () => {
    expect(resolveSkillMatches(
      { content: 'x', note: '', description: '缺陷', attachments: [{ name: 'log' }], type: 'bug', fields: [] },
      [{ slug: 'a', name: 'a', description: 'TB 日志', enabled: false }],
    )).toEqual([])
  })

  test('buildTbCommentDraft: 空分析 → 四段骨架待补充', () => {
    const draft = buildTbCommentDraft('')
    expect(draft).toContain('## 🔍 结论')
    expect(draft).toContain('## 📎 证据日志')
    expect(draft).toContain('## ➡️ 下一步动作')
    expect(draft).toContain('## 🛠 修复建议')
    expect(draft).toContain('待补充')
  })

  test('buildTbCommentDraft: 已含四段标题 → 原样返回', () => {
    const text = '## 🔍 结论\nSIM 卡无法识别\n\n## 📎 证据日志\n```\n12:00 ERR IMSI\n```\n\n## ➡️ 下一步动作\n待换卡验证\n\n## 🛠 修复建议\n更换 SIM 卡'
    expect(buildTbCommentDraft(text)).toBe(text)
  })

  test('buildTbCommentDraft: 普通分析文本 → 结论段包裹 + 其余待补充', () => {
    const draft = buildTbCommentDraft('根因是 IMSI 读取失败，建议更换 SIM 卡')
    expect(draft).toContain('## 🔍 结论')
    expect(draft).toContain('根因是 IMSI 读取失败，建议更换 SIM 卡')
    expect(draft).toContain('## 📎 证据日志')
    expect(draft).toContain('## ➡️ 下一步动作')
    expect(draft).toContain('## 🛠 修复建议')
  })

  test('extractAnalysisText: 最后是验收回复时仍提取前面的分析结论', () => {
    const messages = [
      { type: 'assistant', message: { content: [{ type: 'text', text: '## 📌 结论先行\n根因：SIM 卡无 ATR 应答' }] } },
      { type: 'user', message: { content: [{ type: 'text', text: 'The task has finished running' }] } },
      { type: 'assistant', message: { content: [{ type: 'text', text: '验证最终结果与任务标准：已完成的全部步骤' }] } },
    ]
    const result = extractAnalysisText(messages)
    expect(result).toContain('结论先行')
    expect(result).toContain('根因：SIM 卡无 ATR 应答')
    expect(result).not.toContain('验证最终结果')
  })

  test('extractAnalysisText: 仅验收回复无分析标记 → 兜底取最后 assistant', () => {
    const messages = [
      { type: 'assistant', message: { content: [{ type: 'text', text: '验证最终结果与任务标准' }] } },
    ]
    expect(extractAnalysisText(messages)).toContain('验证最终结果')
  })

  test('extractAnalysisText: 无 assistant → 空串', () => {
    expect(extractAnalysisText([{ type: 'user', message: { content: [] } }])).toBe('')
  })

  test('buildReportCommentDraft: 从分析报告提取四段式', () => {
    const report = [
      '# QXDM SIM 分析报告：SIM 卡无法识别',
      '',
      '## 1. 元数据',
      '- **TB 缺陷**：#12247 SIM 卡问题',
      '',
      '## 2. 证据摘要',
      '- 插卡检测正常：OEM_SIM_EVENT_TYPE_INSERTED',
      '- 认卡中断于 ATR：atr_received=0x0',
      '',
      '## 3. 现象与解读',
      '1. **🔴 CRITICAL｜ATR 无响应**',
      '   - **根因定位**：测试白卡无 ATR 应答（最高嫌疑）',
      '',
      '## 4. 建议下一步',
      '1. 更换商用 SIM 卡验证',
      '2. 交叉验证样机',
      '',
      '## 5. 局限性',
      '- 未覆盖 AP 侧',
    ].join('\n')
    const draft = buildReportCommentDraft(report)
    expect(draft).toContain('## 🔍 结论')
    expect(draft).toContain('## 🔬 根因')
    expect(draft).toContain('根因定位')
    expect(draft).toContain('## 📎 证据日志')
    expect(draft).toContain('插卡检测正常')
    expect(draft).toContain('## ➡️ 下一步动作')
    expect(draft).toContain('更换商用 SIM 卡验证')
    expect(draft).toContain('## 🛠 修复建议')
  })

  test('buildReportCommentDraft: 四段式报告（结论/根因独立标题）直接提取', () => {
    const report = [
      '# 分析报告',
      '',
      '## 🔍 结论',
      '根因：SIM 卡在 ATR 阶段无响应，判定为卡侧故障',
      '',
      '## 🔬 根因',
      '测试白卡无 ATR 应答（最高嫌疑）',
      '',
      '## 📎 证据日志',
      '```',
      '07:14 ATR timeout',
      '```',
      '',
      '## ➡️ 下一步动作',
      '1. 更换商用 SIM 卡验证',
      '',
      '## 🛠 修复建议',
      '短期：换卡；长期：查公共通路',
    ].join('\n')
    const draft = buildReportCommentDraft(report)
    expect(draft).toContain('根因：SIM 卡在 ATR 阶段无响应')
    expect(draft).toContain('测试白卡无 ATR 应答')
    expect(draft).not.toContain('分析报告')
  })

  test('buildReportCommentDraft: HTML 报告（h2 标题）也正确提取', () => {
    const report = [
      '<h1>#12247 分析报告</h1>',
      '<h2>🔍 结论</h2>',
      '<p>根因：SIM 卡在 ATR 阶段无响应</p>',
      '<h2>🔬 根因</h2>',
      '<p>测试白卡无 ATR 应答（最高嫌疑）</p>',
      '<h2>📎 证据日志</h2>',
      '<pre>07:14 ATR timeout</pre>',
      '<h2>➡️ 下一步动作</h2>',
      '<p>更换商用 SIM 卡验证</p>',
      '<h2>🛠 修复建议</h2>',
      '<p>短期：换卡</p>',
    ].join('')
    const draft = buildReportCommentDraft(report)
    expect(draft).toContain('根因：SIM 卡在 ATR 阶段无响应')
    expect(draft).toContain('测试白卡无 ATR 应答')
    expect(draft).toContain('07:14 ATR timeout')
    expect(draft).toContain('更换商用 SIM 卡验证')
    expect(draft).not.toContain('<h2>')
  })
})
