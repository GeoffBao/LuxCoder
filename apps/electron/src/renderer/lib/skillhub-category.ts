/**
 * SkillHub 技能分类推断
 *
 * SkillHub API（GET /index.json）不提供 category 字段，这里根据技能名/描述关键词
 * 推断业务分类，供「企业组织导入」的分类筛选使用。
 */

const CATEGORY_RULES: { category: string; keywords: string[] }[] = [
  { category: 'Android 开发', keywords: ['android', 'apk', 'gradle', 'sdk', 'kotlin', 'java', 'flutter'] },
  { category: '测试', keywords: ['test', 'testing', 'regression', 'qa', 'unit', 'e2e', 'benchmark', 'eval'] },
  { category: '文档', keywords: ['doc', 'document', 'readme', 'markdown', 'wiki', 'report', 'note'] },
  { category: '代码审查', keywords: ['review', 'code review', 'lint', 'static', 'analysis', 'refactor'] },
  { category: '构建/CI', keywords: ['build', 'compile', 'ci', 'cd', 'pipeline', 'deploy', 'release', 'workflow'] },
  { category: 'AI/Agent', keywords: ['agent', 'ai', 'llm', 'claude', 'prompt', 'model', 'sdk', 'openai'] },
  { category: '数据处理', keywords: ['data', 'database', 'sql', 'pipeline', 'etl', 'csv', 'json'] },
  { category: '硬件/嵌入式', keywords: ['hardware', 'embedded', 'firmware', 'chip', 'driver', 'spi', 'i2c', 'soc', 'rtos'] },
  { category: '办公协作', keywords: ['office', 'excel', 'ppt', 'word', 'email', 'calendar', 'slack', 'team'] },
]

const UNKNOWN_CATEGORY = '其他'

/** 根据技能名/描述推断分类 */
export function inferSkillCategory(name: string, description?: string): string {
  const haystack = `${name} ${description ?? ''}`.toLowerCase()
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((kw) => haystack.includes(kw))) {
      return rule.category
    }
  }
  return UNKNOWN_CATEGORY
}

/** 从技能列表聚合分类（含计数），供分类下拉使用 */
export function collectSkillCategories(
  skills: Array<{ name: string; description?: string }>,
): { category: string; count: number }[] {
  const map = new Map<string, number>()
  for (const s of skills) {
    const cat = inferSkillCategory(s.name, s.description)
    map.set(cat, (map.get(cat) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => (a.category === UNKNOWN_CATEGORY ? 1 : b.category === UNKNOWN_CATEGORY ? -1 : a.category.localeCompare(b.category, 'zh-CN')))
}
