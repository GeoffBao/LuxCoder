import { describe, expect, test } from 'bun:test';
import { interpolateRefs, resolveInputRefs } from '../refs.ts';

describe('task refs', () => {
  test('resolveInputRefs 会从已完成节点输出和 params 中解析输入', async () => {
    const resolved = await resolveInputRefs(
      {
        summary: { from: '${nodes.prepare.output}', summarize: true },
        title: '${nodes.prepare.output.title}',
        topic: '${params.topic}',
      },
      {
        nodeOutputs: {
          prepare: {
            text: '原始输出',
            params: {
              title: '阶段标题',
            },
          },
        },
        params: {
          topic: '任务迁移',
        },
      },
      {
        summarize: async (text) => `摘要:${text}`,
      },
    );

    expect(resolved).toEqual({
      summary: '摘要:原始输出',
      title: '阶段标题',
      topic: '任务迁移',
    });
  });

  test('interpolateRefs 缺失字段时保留原始占位符', () => {
    const rendered = interpolateRefs(
      '缺失字段 ${nodes.prepare.output.missing}',
      {
        nodeOutputs: {
          prepare: {
            text: '原始输出',
            params: {},
          },
        },
      },
    );

    expect(rendered).toBe('缺失字段 ${nodes.prepare.output.missing}');
  });
});
