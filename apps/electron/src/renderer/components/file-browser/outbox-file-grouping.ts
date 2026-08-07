import type { FileEntry } from '@myyoda/shared'

/** Outbox 展示分组：按扩展名机械推断，不需要 Agent 或用户维护分类体系。 */
export type OutboxFileGroup = 'document' | 'image' | 'data' | 'presentation' | 'code' | 'other'

export const OUTBOX_FILE_GROUP_LABELS: Record<OutboxFileGroup, string> = {
  document: '文档',
  image: '图片',
  data: '数据',
  presentation: '演示',
  code: '代码',
  other: '其他',
}

/** 展示顺序：文档/图片/数据/演示最贴近多数职能角色的产出习惯，代码放后，其他兜底。 */
const GROUP_ORDER: readonly OutboxFileGroup[] = ['document', 'image', 'data', 'presentation', 'code', 'other']

const EXTENSION_GROUPS: Record<string, OutboxFileGroup> = {
  md: 'document', markdown: 'document', doc: 'document', docx: 'document', pdf: 'document', txt: 'document', rtf: 'document',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', svg: 'image', webp: 'image', bmp: 'image', heic: 'image',
  csv: 'data', json: 'data', xlsx: 'data', xls: 'data', tsv: 'data', ndjson: 'data',
  ppt: 'presentation', pptx: 'presentation', key: 'presentation',
  ts: 'code', tsx: 'code', js: 'code', jsx: 'code', py: 'code', sh: 'code', go: 'code', rs: 'code',
  java: 'code', c: 'code', cpp: 'code', h: 'code', rb: 'code', php: 'code', swift: 'code', kt: 'code', sql: 'code',
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return ''
  return name.slice(dot + 1).toLowerCase()
}

/** 根据文件名机械推断展示分组；未知扩展名归入「其他」。 */
export function classifyOutboxFile(name: string): OutboxFileGroup {
  return EXTENSION_GROUPS[extensionOf(name)] ?? 'other'
}

export interface OutboxFileGroupBucket {
  group: OutboxFileGroup
  label: string
  entries: FileEntry[]
}

/**
 * 把一层文件条目按类型分组用于展示；目录条目不参与分组（保持原有文件夹语义），
 * 由调用方单独渲染在分组之前。空分组不返回，产出为零时调用方据此隐藏整个区块。
 */
export function groupOutboxFilesByType(entries: readonly FileEntry[]): OutboxFileGroupBucket[] {
  const buckets = new Map<OutboxFileGroup, FileEntry[]>()
  for (const entry of entries) {
    if (entry.isDirectory) continue
    const group = classifyOutboxFile(entry.name)
    const bucket = buckets.get(group)
    if (bucket) bucket.push(entry)
    else buckets.set(group, [entry])
  }
  return GROUP_ORDER
    .filter((group) => buckets.has(group))
    .map((group) => ({ group, label: OUTBOX_FILE_GROUP_LABELS[group], entries: buckets.get(group)! }))
}
