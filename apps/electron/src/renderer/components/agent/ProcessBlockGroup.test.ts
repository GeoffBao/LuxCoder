import { describe, expect, test } from 'bun:test'
import { buildAssistantTurnRenderItems, buildProcessGroupToolNames } from './ProcessBlockGroup'
import type { SDKContentBlock } from '@myyoda/shared'

const tool = (id: string, name = 'Read'): SDKContentBlock => ({
  type: 'tool_use',
  id,
  name,
  input: {},
})

const thinking = (text = '分析中'): SDKContentBlock => ({
  type: 'thinking',
  thinking: text,
})

const text = (value: string): SDKContentBlock => ({
  type: 'text',
  text: value,
})

describe('Agent 过程块折叠分组', () => {
  test('given continuous thinking and tools before final text when grouping then folds them into one process group', () => {
    const items = buildAssistantTurnRenderItems([
      thinking(),
      tool('tool-1'),
      tool('tool-2'),
      text('最终输出'),
    ])

    expect(items).toHaveLength(2)
    expect(items[0]?.type).toBe('process-group')
    expect(items[1]?.type).toBe('block')
    if (items[0]?.type === 'process-group') {
      expect(items[0].items.map((item) => item.index)).toEqual([0, 1, 2])
    }
  })

  test('given intermediate text between tool runs when grouping then exposes every text run and only folds the tool runs', () => {
    // 早期实现只把「结尾连续的 text」当正文，中间那段 tool_use 之间写完的说明
    // 会被整段吞进折叠的执行过程——用户得点开才能看到。这里应逐段拆分：
    // 每个 text 片段都单独展示，tool_use 片段各自折成自己的过程组。
    const items = buildAssistantTurnRenderItems([
      tool('tool-1'),
      text('中间说明'),
      tool('tool-2'),
      text('最终输出'),
    ])

    expect(items.map((item) => item.type)).toEqual(['process-group', 'block', 'process-group', 'block'])
    if (items[0]?.type === 'process-group') {
      expect(items[0].items.map((item) => item.index)).toEqual([0])
    }
    if (items[1]?.type === 'block') {
      expect(items[1].item.index).toBe(1)
    }
    if (items[2]?.type === 'process-group') {
      expect(items[2].items.map((item) => item.index)).toEqual([2])
    }
    if (items[3]?.type === 'block') {
      expect(items[3].item.index).toBe(3)
    }
  })

  test('given a research turn that narrates findings between many searches when grouping then keeps every finding visible', () => {
    // 复现真实场景：搜索型任务反复「调用工具 → 写一段发现」，最后补一句总结。
    // 之前的实现会把除了最后一句总结之外的全部发现都吞进折叠区。
    const items = buildAssistantTurnRenderItems([
      tool('search-1', 'WebSearch'),
      text('发现一：xxx'),
      tool('search-2', 'WebSearch'),
      text('发现二：yyy'),
      tool('search-3', 'WebSearch'),
      text('以上就是搜到的最新动态'),
    ])

    expect(items.map((item) => item.type)).toEqual([
      'process-group', 'block', 'process-group', 'block', 'process-group', 'block',
    ])
    const textIndices = items
      .filter((item) => item.type === 'block')
      .map((item) => (item.type === 'block' ? item.item.index : -1))
    expect(textIndices).toEqual([1, 3, 5])
  })

  test('given streaming turn with trailing text when grouping then keeps the whole turn inside process group', () => {
    const items = buildAssistantTurnRenderItems([
      tool('tool-1'),
      text('可能还是中间说明'),
    ], { isStreaming: true })

    expect(items).toHaveLength(1)
    expect(items[0]?.type).toBe('process-group')
    if (items[0]?.type === 'process-group') {
      expect(items[0].items.map((item) => item.index)).toEqual([0, 1])
    }
  })

  test('given streaming turn with completed tools before trailing text when grouping then keeps final output outside process group', () => {
    const items = buildAssistantTurnRenderItems([
      tool('tool-1'),
      text('最终输出'),
    ], { isStreaming: true, completedToolResultIds: new Set(['tool-1']) })

    expect(items.map((item) => item.type)).toEqual(['process-group', 'block'])
    if (items[0]?.type === 'process-group') {
      expect(items[0].items.map((item) => item.index)).toEqual([0])
    }
    if (items[1]?.type === 'block') {
      expect(items[1].item.index).toBe(1)
    }
  })

  test('given completed turn when grouping then keeps final output outside process group', () => {
    const items = buildAssistantTurnRenderItems([
      tool('tool-1'),
      text('最终输出'),
    ])

    expect(items.map((item) => item.type)).toEqual(['process-group', 'block'])
    expect(items[0]?.type).toBe('process-group')
    if (items[0]?.type === 'process-group') {
      expect(items[0].items.map((item) => item.index)).toEqual([0])
    }
  })

  test('given pure text streaming turn when grouping then keeps text as normal output', () => {
    const items = buildAssistantTurnRenderItems([
      text('普通回答'),
    ], { isStreaming: true })

    expect(items).toHaveLength(1)
    expect(items[0]?.type).toBe('block')
  })

  test('given process only turn when grouping then folds the whole turn', () => {
    const items = buildAssistantTurnRenderItems([
      thinking(),
      tool('tool-1'),
    ])

    expect(items).toHaveLength(1)
    expect(items[0]?.type).toBe('process-group')
    if (items[0]?.type === 'process-group') {
      expect(items[0].items.map((item) => item.index)).toEqual([0, 1])
    }
  })

  test('given streaming turn with only thinking before trailing text when grouping then keeps the whole turn inside process group', () => {
    // 仅有 thinking + 尾部 text 时，工具调用可能稍后才出现，
    // 不应把这段尾部 text 提前外置——避免后续完成瞬间从外部又跳回过程组。
    const items = buildAssistantTurnRenderItems([
      thinking(),
      text('暂时的回答片段'),
    ], { isStreaming: true, completedToolResultIds: new Set() })

    expect(items).toHaveLength(1)
    expect(items[0]?.type).toBe('process-group')
    if (items[0]?.type === 'process-group') {
      expect(items[0].items.map((item) => item.index)).toEqual([0, 1])
    }
  })

  test('given repeated tools when building capability icons then returns unique tool names in order', () => {
    const toolNames = buildProcessGroupToolNames([
      tool('tool-1', 'Grep'),
      thinking(),
      tool('tool-2', 'Read'),
      tool('tool-3', 'Grep'),
      tool('tool-4', 'Bash'),
    ])

    expect(toolNames).toEqual(['Grep', 'Read', 'Bash'])
  })
})
