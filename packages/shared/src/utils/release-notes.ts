/**
 * Release Notes 纯函数工具
 *
 * 版本文件名的解析与 semver 比较。纯函数，主进程 / 渲染进程均可复用。
 */

/** 从版本文件名解析出版本号（如 "0.1.94.md" → "0.1.94"） */
export function parseReleaseVersion(filename: string): string {
  return filename.replace(/\.md$/, '')
}

/** 比较两个 semver 版本串（降序，新版本在前） */
export function compareReleaseSemver(a: string, b: string): number {
  const pa = a.split('.').map((s) => {
    const n = Number(s)
    return Number.isNaN(n) ? 0 : n
  })
  const pb = b.split('.').map((s) => {
    const n = Number(s)
    return Number.isNaN(n) ? 0 : n
  })
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da !== db) return db - da
  }
  return 0
}

/** 判断某版本号是否「更旧」于参考版本（用于未读红点判定） */
export function isOlderThan(candidate: string, reference: string): boolean {
  return compareReleaseSemver(candidate, reference) > 0
}

/** headline 最大展示长度，超出截断加省略号 */
const HEADLINE_MAX_LENGTH = 36

/** 去除 markdown 行内标记（粗体/行内代码/链接），只保留纯文本 */
function stripInlineMarkdown(line: string): string {
  return line
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .trim()
}

/**
 * 从版本更新正文提取一句话摘要，供「最新动态」列表展示。
 * 取第一个二级标题（`## `）文字；没有则取首个非空、非一级标题的正文行；
 * 都没有则返回空串（调用方自行兜底为 `vX.Y.Z 更新`）。
 */
export function extractReleaseHeadline(content: string): string {
  const lines = content.split('\n')
  let fallback = ''

  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('# ')) continue
    if (line.startsWith('## ')) {
      const headline = stripInlineMarkdown(line.slice(3))
      if (headline) return truncateHeadline(headline)
      continue
    }
    if (!fallback && !line.startsWith('#')) {
      fallback = stripInlineMarkdown(line.replace(/^[-*]\s*/, ''))
    }
  }

  return fallback ? truncateHeadline(fallback) : ''
}

function truncateHeadline(text: string): string {
  if (text.length <= HEADLINE_MAX_LENGTH) return text
  return `${text.slice(0, HEADLINE_MAX_LENGTH - 1)}…`
}
