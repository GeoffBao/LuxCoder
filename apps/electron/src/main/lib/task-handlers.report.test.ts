/**
 * task-handlers 报告解析工具单测
 *
 * 覆盖 findReportInDir / findReportAtConvention：
 * - 约定路径（log/{shortId}/分析报告.md 优先于 .html）
 * - 兜底递归（兼容 diag_logs/qxdm_sim_analysis_report.md 等旧位置）
 * - 不存在的目录/无报告时返回空
 */
import { describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mockElectronModule } from './__tests__/electron-mock'

// task-handlers.ts 顶部 import { BrowserWindow, ipcMain } from 'electron'，
// bun test 无法加载 electron 真实模块，用项目既有 electron-mock 兜底（只测报告解析纯函数）。
mockElectronModule({
  ipcMain: { handle: () => {} },
})

const { findReportAtConvention, findReportInDir } = await import('./task-handlers')

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'tb-report-'))
}

describe('findReportInDir', () => {
  test('递归找到 log 目录下 qxdm 报告（旧位置兜底）', () => {
    const root = makeTempDir()
    try {
      const logDir = join(root, 'log', 'diag_logs')
      mkdirSync(logDir, { recursive: true })
      const report = join(logDir, 'qxdm_sim_analysis_report.md')
      writeFileSync(report, '# 分析报告\n')
      const hit = findReportInDir(root, /(analysis_report|分析报告|_SIM_Analysis_Report)\.(md|html|markdown)$/i)
      expect(hit).toBe(report)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('md 优先于 html（同层同名不同扩展名）', () => {
    const root = makeTempDir()
    try {
      writeFileSync(join(root, '分析报告.md'), '# md\n')
      writeFileSync(join(root, '分析报告.html'), '<h1>html</h1>\n')
      const hit = findReportInDir(root, /(analysis_report|分析报告)\.(md|html|markdown)$/i)
      expect(hit).toBe(join(root, '分析报告.md'))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('html 兜底：仅有 html 报告时返回 html', () => {
    const root = makeTempDir()
    try {
      writeFileSync(join(root, '分析报告.html'), '<h1>html</h1>\n')
      const hit = findReportInDir(root, /(analysis_report|分析报告)\.(md|html|markdown)$/i)
      expect(hit).toBe(join(root, '分析报告.html'))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('无报告返回 null', () => {
    const root = makeTempDir()
    try {
      writeFileSync(join(root, 'readme.txt'), 'x')
      expect(findReportInDir(root, /(analysis_report|分析报告)\.(md|html|markdown)$/i)).toBeNull()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('目录不存在返回 null（不抛异常）', () => {
    const root = join(tmpdir(), 'no-such-tb-report-dir-xyz')
    expect(findReportInDir(root, /(analysis_report|分析报告)\.(md|html|markdown)$/i)).toBeNull()
  })
})

describe('findReportAtConvention', () => {
  test('约定路径：log/{shortId}/分析报告.md 命中', async () => {
    const root = makeTempDir()
    try {
      const reportDir = join(root, 'log', 'abc123')
      mkdirSync(reportDir, { recursive: true })
      const report = join(reportDir, '分析报告.md')
      writeFileSync(report, '# 四段式报告\n')
      const candidates = await findReportAtConvention(root)
      expect(candidates).toContain(report)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('约定路径：log/分析报告.html 也收录（md 优先级更高）', async () => {
    const root = makeTempDir()
    try {
      mkdirSync(join(root, 'log'), { recursive: true })
      writeFileSync(join(root, 'log', '分析报告.html'), '<h1>x</h1>\n')
      writeFileSync(join(root, 'log', '分析报告.md'), '# md\n')
      const candidates = await findReportAtConvention(root)
      expect(candidates[0]).toBe(join(root, 'log', '分析报告.md'))
      expect(candidates[1]).toBe(join(root, 'log', '分析报告.html'))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('无报告返回空数组', async () => {
    const root = makeTempDir()
    try {
      writeFileSync(join(root, 'note.txt'), 'x')
      expect(await findReportAtConvention(root)).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('session 目录不存在返回空数组（不抛异常）', async () => {
    const root = join(tmpdir(), 'no-such-session-xyz')
    expect(await findReportAtConvention(root)).toEqual([])
  })
})
