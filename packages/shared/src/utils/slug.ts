/** 通用 slug 化：转小写、非字母数字折叠成单个连字符、去首尾连字符、限长 48 字符。 */
export function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
}
