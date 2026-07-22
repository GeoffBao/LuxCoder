export type PathPlatform = 'posix' | 'win32'

export function displayProjectPath(filePath: string): string {
  return filePath.trim()
}

/** 仅用于同一 Workspace 内路径唯一性比较；不做 realpath（那是主进程职责）。 */
export function normalizeProjectPathForCompare(
  filePath: string,
  platform: PathPlatform = process.platform === 'win32' ? 'win32' : 'posix',
): string {
  let p = filePath.trim().replace(/\\/g, '/').replace(/\/+$/, '')
  if (platform === 'win32') p = p.toLowerCase()
  return p
}
