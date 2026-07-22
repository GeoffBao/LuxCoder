import { describe, expect, test } from 'bun:test'
import { normalizeProjectPathForCompare, displayProjectPath } from '../project-path.ts'

describe('project-path', () => {
  test('比较用规范化：绝对化语义由调用方保证；统一斜杠并去尾斜杠', () => {
    expect(normalizeProjectPathForCompare('/Users/me/Repo/', 'posix')).toBe('/Users/me/Repo')
    expect(normalizeProjectPathForCompare('C:\\Users\\me\\Repo\\', 'posix')).toBe('C:/Users/me/Repo')
  })

  test('macOS/Linux 比较大小写敏感保留原大小写；Windows 比较小写化', () => {
    expect(normalizeProjectPathForCompare('/Users/Me/Repo', 'posix')).toBe('/Users/Me/Repo')
    expect(normalizeProjectPathForCompare('C:/Users/Me/Repo', 'win32')).toBe('c:/users/me/repo')
  })

  test('display 路径原样保留展示用输入（仅 trim）', () => {
    expect(displayProjectPath('  /Users/me/Repo  ')).toBe('/Users/me/Repo')
  })
})
