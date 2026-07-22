#!/usr/bin/env bun
/**
 * Proma → LuxCodex 周更自动 sync。
 *
 * 从 LAST_SYNCED_UPSTREAM 之后，按 first-parent 顺序 cherry-pick upstream/main，
 * 每挑成功后跑 apply-renames --write；遇冲突即停，推送新 origin/sync 分支供人工收尾。
 *
 *   bun run sync:weekly                 # dry-run：只打印将要 pick 的 commits
 *   bun run sync:weekly -- --apply      # 本地建分支并 cherry-pick（不推送）
 *   bun run sync:weekly -- --apply --push
 *   bun run sync:weekly -- --apply --push --pr
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { $ } from 'bun'
import { repoRoot } from './shared.ts'

interface CliOptions {
  apply: boolean
  push: boolean
  pr: boolean
  maxPicks: number
  baseRef?: string
}

interface PickResult {
  sha: string
  subject: string
  ok: boolean
  conflict?: boolean
  empty?: boolean
  error?: string
}

const ROOT = repoRoot()
const MARKER_PATH = join(ROOT, 'scripts/upstream-sync/LAST_SYNCED_UPSTREAM')
const STATUS_PATH = join(ROOT, 'scripts/upstream-sync/last-weekly-run.json')
const UPSTREAM_URL = 'https://github.com/proma-ai/Proma.git'
const BRANCH_PREFIX = 'sync/proma-'

function parseArgs(argv: string[]): CliOptions {
  const getNum = (flag: string, fallback: number): number => {
    const idx = argv.indexOf(flag)
    if (idx === -1) return fallback
    const raw = argv[idx + 1]
    const n = Number.parseInt(raw ?? '', 10)
    return Number.isFinite(n) && n > 0 ? n : fallback
  }
  const getStr = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag)
    if (idx === -1) return undefined
    return argv[idx + 1]
  }
  return {
    apply: argv.includes('--apply'),
    push: argv.includes('--push'),
    pr: argv.includes('--pr'),
    maxPicks: getNum('--max-picks', 80),
    baseRef: getStr('--base'),
  }
}

async function gitText(args: string[]): Promise<string> {
  const proc = Bun.spawn(['git', ...args], {
    cwd: ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (code !== 0) {
    throw new Error(`git ${args.join(' ')} failed (${code}): ${stderr.trim() || stdout.trim()}`)
  }
  return stdout
}

async function gitTextAllowFail(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(['git', ...args], {
    cwd: ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { code, stdout, stderr }
}

async function ensureUpstreamRemote(): Promise<void> {
  const remotes = await $`git remote`.quiet().text()
  const names = remotes.split('\n').map((s) => s.trim()).filter(Boolean)
  if (!names.includes('upstream')) {
    await $`git remote add upstream ${UPSTREAM_URL}`
    console.log(`[weekly-sync] 已添加 remote upstream → ${UPSTREAM_URL}`)
  }
}

async function resolveBaseRef(explicit?: string): Promise<string> {
  if (explicit) {
    console.log(`[weekly-sync] base = ${explicit}（--base）`)
    return explicit
  }
  // 新 sync 分支一律从最新 origin/main 开出，继承 main 上已合入的 Lux 改动
  console.log('[weekly-sync] base = origin/main')
  return 'origin/main'
}

function readMarker(): string | null {
  if (!existsSync(MARKER_PATH)) return null
  const raw = readFileSync(MARKER_PATH, 'utf-8').trim()
  const sha = raw.split(/\s+/)[0] ?? ''
  return /^[0-9a-f]{7,40}$/i.test(sha) ? sha : null
}

async function resolveLastSynced(baseRef: string): Promise<string> {
  const fromFile = readMarker()
  if (fromFile) {
    console.log(`[weekly-sync] LAST_SYNCED_UPSTREAM = ${fromFile}`)
    return fromFile
  }

  const body = await $`git log ${baseRef} --grep=cherry\ picked\ from\ commit -n 30 --format=%b`
    .nothrow()
    .quiet()
    .text()
  const matches = [...body.matchAll(/cherry picked from commit ([0-9a-f]{7,40})/gi)]
  if (matches.length > 0) {
    // git log 是新→旧；第一条即最近一次成功 pick
    const sha = matches[0]![1]!
    console.log(`[weekly-sync] 从 ${baseRef} cherry-pick trailer 推断 last = ${sha}`)
    return sha
  }

  throw new Error(
    '无法确定上次已同步的 upstream SHA。请写入 scripts/upstream-sync/LAST_SYNCED_UPSTREAM',
  )
}

async function listPendingUpstream(lastSynced: string): Promise<Array<{ sha: string; subject: string }>> {
  const out = await $`git rev-list --first-parent --reverse ${lastSynced}..upstream/main`.text()
  const shas = out.split('\n').map((s) => s.trim()).filter(Boolean)
  const rows: Array<{ sha: string; subject: string }> = []
  for (const sha of shas) {
    const subject = (await $`git log -1 --format=%s ${sha}`.quiet().text()).trim()
    rows.push({ sha, subject })
  }
  return rows
}

function shanghaiStamp(): string {
  // en-CA → YYYY-MM-DD；再拼紧凑时分避免同日二次跑撞名
  const d = new Date()
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
  const hm = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d).replace(':', '')
  return `${date.replace(/-/g, '')}-${hm}`
}

async function workingTreeClean(): Promise<boolean> {
  const status = await $`git status --porcelain`.quiet().text()
  return status.trim().length === 0
}

async function applyRenamesWrite(): Promise<boolean> {
  const result = await $`bun run sync:apply-renames -- --write`.nothrow()
  if (result.exitCode !== 0) {
    console.warn('[weekly-sync] apply-renames 失败，继续（人工收尾）')
    return false
  }
  const dirty = !(await workingTreeClean())
  if (!dirty) return false
  await $`git add -u`
  await $`git commit -m ${'fix(sync): apply Lux renames after cherry-pick'}`.nothrow()
  return true
}

async function cherryPickOne(sha: string): Promise<PickResult> {
  const subject = (await $`git log -1 --format=%s ${sha}`.quiet().text()).trim()
  const result = await $`git cherry-pick -x ${sha}`.nothrow()
  const combined = `${result.stdout.toString()}\n${result.stderr.toString()}`

  if (result.exitCode === 0) {
    return { sha, subject, ok: true }
  }

  if (/The previous cherry-pick is now empty|nothing to commit/i.test(combined)) {
    await $`git cherry-pick --skip`.nothrow()
    return { sha, subject, ok: true, empty: true }
  }

  if (/conflict|Could not apply|CONFLICT/i.test(combined)) {
    return { sha, subject, ok: false, conflict: true, error: combined.slice(0, 2000) }
  }

  return { sha, subject, ok: false, error: combined.slice(0, 2000) }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2))
  process.chdir(ROOT)

  console.log('[weekly-sync] fetch origin + upstream …')
  await ensureUpstreamRemote()
  await $`git fetch origin`
  await $`git fetch upstream`

  const baseRef = await resolveBaseRef(opts.baseRef)
  const lastSynced = await resolveLastSynced(baseRef)
  const pending = await listPendingUpstream(lastSynced)

  if (pending.length === 0) {
    console.log('[weekly-sync] upstream/main 无新的 first-parent commits，退出。')
    if (opts.apply) {
      writeFileSync(
        STATUS_PATH,
        JSON.stringify(
          {
            ranAt: new Date().toISOString(),
            baseRef,
            lastSynced,
            upstreamMain: (await $`git rev-parse upstream/main`.quiet().text()).trim(),
            pending: 0,
            branch: null,
            picks: [],
            stoppedOnConflict: false,
          },
          null,
          2,
        ) + '\n',
      )
    }
    return
  }

  const toPick = pending.slice(0, opts.maxPicks)
  console.log(`[weekly-sync] pending ${pending.length}，本轮最多 pick ${toPick.length}：`)
  for (const row of toPick) {
    console.log(`  - ${row.sha.slice(0, 8)} ${row.subject}`)
  }
  if (pending.length > toPick.length) {
    console.log(`  … 另有 ${pending.length - toPick.length} 条留待下轮`)
  }

  if (!opts.apply) {
    console.log('[weekly-sync] dry-run 结束。加 --apply 才会建分支 cherry-pick。')
    return
  }

  if (!(await workingTreeClean())) {
    throw new Error('工作区不干净，拒绝 --apply。请先提交或 stash。')
  }

  const branchName = `${BRANCH_PREFIX}${shanghaiStamp()}-auto`
  console.log(`[weekly-sync] 创建分支 ${branchName} ← ${baseRef}`)
  await $`git checkout -B ${branchName} ${baseRef}`

  const picks: PickResult[] = []
  let stoppedOnConflict = false
  let lastOkUpstream: string | null = null

  for (const row of toPick) {
    console.log(`[weekly-sync] cherry-pick ${row.sha.slice(0, 8)} ${row.subject}`)
    const pick = await cherryPickOne(row.sha)
    picks.push(pick)

    if (pick.conflict) {
      stoppedOnConflict = true
      console.error(
        `[weekly-sync] 冲突停在 ${row.sha.slice(0, 8)}。将带 conflict marker 提交，便于推远端人工收尾。`,
      )
      break
    }

    if (!pick.ok) {
      console.error(`[weekly-sync] cherry-pick 失败：${pick.error ?? 'unknown'}`)
      await $`git cherry-pick --abort`.nothrow()
      break
    }

    if (!pick.empty) {
      await applyRenamesWrite()
    }
    lastOkUpstream = row.sha
  }

  const status = {
    ranAt: new Date().toISOString(),
    baseRef,
    lastSyncedBefore: lastSynced,
    lastSyncedAfter: lastOkUpstream ?? lastSynced,
    upstreamMain: (await $`git rev-parse upstream/main`.quiet().text()).trim(),
    pendingTotal: pending.length,
    branch: branchName,
    picks: picks.map((p) => ({
      sha: p.sha,
      subject: p.subject,
      ok: p.ok,
      empty: !!p.empty,
      conflict: !!p.conflict,
    })),
    stoppedOnConflict,
    pushed: false,
    prUrl: null as string | null,
  }

  mkdirSync(join(ROOT, 'scripts/upstream-sync'), { recursive: true })
  if (lastOkUpstream) {
    writeFileSync(MARKER_PATH, `${lastOkUpstream}\n`)
  }
  writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2) + '\n')

  if (stoppedOnConflict) {
    const conflictSha = picks.find((p) => p.conflict)?.sha ?? 'unknown'
    // 把冲突文件 + marker/status 一并纳入 cherry-pick 提交，远端可拉下来解
    await $`git add -A`
    await $`git -c core.editor=true cherry-pick --continue`.nothrow()
    // 若 continue 失败（无已暂存变更），退化为普通 commit
    if (!(await workingTreeClean())) {
      await $`git add -A`
      await $`git commit --no-edit -m ${`wip(sync): conflict cherry-picking ${conflictSha.slice(0, 8)} — resolve manually`}`.nothrow()
    }
  } else if (lastOkUpstream) {
    await $`git add ${MARKER_PATH} ${STATUS_PATH}`
    await $`git commit -m ${`chore(sync): weekly run — LAST_SYNCED → ${lastOkUpstream.slice(0, 8)}`}`.nothrow()
  }

  if (opts.push) {
    await $`git push -u origin HEAD`
    status.pushed = true
    writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2) + '\n')
    console.log(`[weekly-sync] 已推送 origin/${branchName}`)
  }

  if (opts.pr && opts.push) {
    const stamp = shanghaiStamp()
    const conflictShort = picks.find((p) => p.conflict)?.sha.slice(0, 8)
    const title = stoppedOnConflict
      ? `sync(proma): weekly auto ${stamp} (冲突待收尾)`
      : `sync(proma): weekly auto ${stamp}`
    const body = [
      '## Summary',
      `- 自动 cherry-pick Proma \`upstream/main\` first-parent（自 \`${lastSynced.slice(0, 8)}\`）`,
      `- 成功：${picks.filter((p) => p.ok).length}；冲突停：${stoppedOnConflict ? conflictShort : '无'}`,
      '- 详情：`scripts/upstream-sync/last-weekly-run.json`',
      '',
      '## 注意',
      '- 冲突需人工按 Lux 结构优先策略收尾，再 `bun run sync:check`',
      '- 勿 squash 丢掉 cherry-pick trailer（便于下次续 pick）',
      '',
      '## Test plan',
      '- [ ] bun run sync:check',
      '- [ ] 冲突文件人工 review',
      '- [ ] 烟雾：默认 Pi 会话 / Codex（如本轮有关）',
    ].join('\n')

    const pr = await $`gh pr create --base main --head ${branchName} --title ${title} --body ${body} --draft`
      .nothrow()
    if (pr.exitCode === 0) {
      status.prUrl = pr.stdout.toString().trim()
      console.log(`[weekly-sync] Draft PR: ${status.prUrl}`)
    } else {
      console.warn('[weekly-sync] gh pr create 失败：', pr.stderr.toString())
    }
    writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2) + '\n')
  }

  console.log(`[weekly-sync] 完成。stoppedOnConflict=${stoppedOnConflict}`)
  if (stoppedOnConflict) process.exit(2)
}

main().catch((err) => {
  console.error('[weekly-sync] 失败:', err)
  process.exit(1)
})
