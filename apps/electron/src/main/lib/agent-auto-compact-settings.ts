export function removeLuxCoderAutoCompactSettings(settings: Record<string, unknown>): boolean {
  let changed = false

  if ('autoCompactWindow' in settings) {
    delete settings.autoCompactWindow
    changed = true
  }

  if ('autoCompactEnabled' in settings) {
    delete settings.autoCompactEnabled
    changed = true
  }

  return changed
}

/** @deprecated 兼容旧测试名 */
export const removePromaAutoCompactSettings = removeLuxCoderAutoCompactSettings
