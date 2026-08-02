import { describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { diffOutputSnapshots, snapshotOutputFiles } from './agent-output-capture'

const tempRoot = '/tmp/luxcoder-agent-output-capture-test'

function reset(): void {
  rmSync(tempRoot, { recursive: true, force: true })
  mkdirSync(tempRoot, { recursive: true })
}

describe('Agent turn output capture', () => {
  test('captures new and modified files while excluding generated dependency trees', () => {
    reset()
    const project = join(tempRoot, 'project')
    mkdirSync(join(project, 'docs'), { recursive: true })
    mkdirSync(join(project, 'node_modules', 'pkg'), { recursive: true })
    writeFileSync(join(project, 'docs', 'before.md'), 'before')
    writeFileSync(join(project, 'node_modules', 'pkg', 'index.js'), 'ignored')

    const before = snapshotOutputFiles([{ root: project, scope: 'project' }])
    writeFileSync(join(project, 'docs', 'before.md'), 'after')
    writeFileSync(join(project, 'docs', 'new.md'), 'new')
    writeFileSync(join(project, 'node_modules', 'pkg', 'new.js'), 'ignored')
    utimesSync(join(project, 'docs', 'before.md'), new Date(), new Date(Date.now() + 1000))

    const after = snapshotOutputFiles([{ root: project, scope: 'project' }])
    const changes = diffOutputSnapshots(before, after)

    expect(changes.map((item) => item.relativePath).sort()).toEqual(['docs/before.md', 'docs/new.md'])
    expect(changes.every((item) => !item.path.includes('node_modules'))).toBe(true)
  })

  test('deduplicates overlapping roots and does not fail for missing roots', () => {
    reset()
    const outbox = join(tempRoot, 'Outbox', 'session-1')
    mkdirSync(outbox, { recursive: true })
    writeFileSync(join(outbox, 'report.md'), 'report')

    const snapshot = snapshotOutputFiles([
      { root: outbox, scope: 'outbox' },
      { root: outbox, scope: 'outbox' },
      { root: join(tempRoot, 'missing'), scope: 'project' },
    ])

    expect(snapshot.size).toBe(1)
    expect([...snapshot.values()][0]?.relativePath).toBe('report.md')
  })
})
