import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createExpert,
  createTeam,
  getExpert,
  getTeam,
  listExperts,
  resolveExpertOrTeamKind,
  seedBuiltinExperts,
  updateExpertFiles,
  updateExpertManifest,
  updateTeam,
} from '../expert-service'

describe('expert-service', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'experts-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  test('seed 后 list 含 5 个专家 + 2 个专家团', () => {
    seedBuiltinExperts(root)
    const list = listExperts(root)
    expect(list).toHaveLength(7)
    expect(list.map((expert) => expert.id).sort()).toContain('architect')
    expect(list.some((expert) => expert.kind === 'team')).toBe(true)
  })

  test('updateExpertManifest 可写 skillSlugs', () => {
    seedBuiltinExperts(root)
    updateExpertManifest(root, 'architect', { skillSlugs: ['pdf'] })
    const again = listExperts(root).find((expert) => expert.id === 'architect')
    expect(again?.skillSlugs).toEqual(['pdf'])
  })

  test('getExpert 读取单个专家包', () => {
    seedBuiltinExperts(root)
    const expert = getExpert(root, 'general')
    expect(expert?.label).toBe('通用软件专家')
    expect(expert?.identityMd).toContain('跨领域通用协作与问题拆解')
  })

  test('createExpert 可新建自定义专家', () => {
    seedBuiltinExperts(root)
    const created = createExpert(root, {
      id: 'media-expert',
      label: '多媒体专家',
      identitySummary: '音视频与多媒体管线',
    })
    expect(created.id).toBe('media-expert')
    expect(created.label).toBe('多媒体专家')
    expect(listExperts(root)).toHaveLength(8)
  })

  test('createExpert 拒绝非法 id 与重复', () => {
    seedBuiltinExperts(root)
    expect(() => createExpert(root, { id: 'Bad_Id', label: 'X' })).toThrow()
    expect(() => createExpert(root, { id: 'general', label: '重复' })).toThrow(/已存在/)
  })

  test('seed 将旧文案「通用专家」升级为「通用软件专家」', () => {
    seedBuiltinExperts(root)
    updateExpertManifest(root, 'general', { label: '通用专家' })
    seedBuiltinExperts(root)
    expect(getExpert(root, 'general')?.label).toBe('通用软件专家')
  })

  test('updateExpertFiles 可写 markdown 文本', () => {
    seedBuiltinExperts(root)
    updateExpertFiles(root, 'general', { soulMd: '# 自定义语气\n' })
    const expert = getExpert(root, 'general')
    expect(expert?.soulMd).toBe('# 自定义语气\n')
  })

  test('损坏包会被 listExperts 跳过', () => {
    seedBuiltinExperts(root)
    rmSync(join(root, 'general', 'expert.json'))
    const list = listExperts(root)
    expect(list).toHaveLength(6)
    expect(list.some((expert) => expert.id === 'general')).toBe(false)
  })
})

describe('expert-service teams', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'experts-team-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  test('seed 后内置团队带 team.json（新 squad 结构）', () => {
    seedBuiltinExperts(root)
    const team = getTeam(root, 'dev-team')
    expect(team).not.toBeNull()
    expect(team?.kind).toBe('team')
    expect(team?.leaderExpertId).toBe('delivery-manager')
    expect(team?.members.length).toBeGreaterThan(0)
    expect(team?.members.some((m) => m.expertId === 'architect')).toBe(true)
  })

  test('老团队目录（缺 team.json）seed 时补写迁移，且不覆盖已有 team.json', () => {
    // 构造老结构：只有 expert.json kind:'team'，无 team.json
    seedBuiltinExperts(root)
    const teamDir = join(root, 'dev-team')
    readFileSync(join(teamDir, 'expert.json'), 'utf-8')
    unlinkSync(join(teamDir, 'team.json'))
    // 迁移
    seedBuiltinExperts(root)
    const migrated = getTeam(root, 'dev-team')
    expect(migrated).not.toBeNull()
    // 用户自定义的 team.json 不被覆盖
    const custom = {
      id: 'dev-team', label: '自定义研发团', kind: 'team',
      leaderExpertId: 'architect', members: [{ expertId: 'general' }],
    }
    writeFileSync(join(teamDir, 'team.json'), JSON.stringify(custom), 'utf-8')
    seedBuiltinExperts(root)
    expect(getTeam(root, 'dev-team')?.label).toBe('自定义研发团')
  })

  test('createTeam 新建团队并写 team.json；拒绝非法 id 与重复', () => {
    seedBuiltinExperts(root)
    const team = createTeam(root, {
      id: 'squad-x',
      label: 'X 特遣队',
      leaderExpertId: 'architect',
      members: [{ expertId: 'general', role: '执行' }],
      instructions: '快速验证',
    })
    expect(team.id).toBe('squad-x')
    expect(getTeam(root, 'squad-x')?.instructions).toBe('快速验证')
    expect(() => createTeam(root, { id: 'squad-x', label: '重复', leaderExpertId: 'general' })).toThrow(/已存在/)
    expect(() => createTeam(root, { id: 'Bad_Id', label: 'X', leaderExpertId: 'general' })).toThrow()
  })

  test('updateTeam 可改团长/成员/协调策略', () => {
    seedBuiltinExperts(root)
    updateTeam(root, 'dev-team', {
      leaderExpertId: 'architect',
      members: [{ expertId: 'qa', role: '验收' }],
      instructions: '新策略',
    })
    const team = getTeam(root, 'dev-team')
    expect(team?.leaderExpertId).toBe('architect')
    expect(team?.members).toEqual([{ expertId: 'qa', role: '验收' }])
    expect(team?.instructions).toBe('新策略')
  })

  test('resolveExpertOrTeamKind 分流专家/团队/老团队包', () => {
    seedBuiltinExperts(root)
    expect(resolveExpertOrTeamKind(root, 'architect')).toBe('expert')
    expect(resolveExpertOrTeamKind(root, 'dev-team')).toBe('team')
    expect(resolveExpertOrTeamKind(root, 'ghost')).toBeNull()
  })

  test('updateExpertManifest 支持 description/avatar/默认渠道模型', () => {
    seedBuiltinExperts(root)
    updateExpertManifest(root, 'architect', {
      description: '架构决策',
      avatar: { icon: 'Layers', accent: 'primary' },
      defaultProviderChannelId: 'chan-1',
      defaultModel: 'deepseek-v4-flash',
    })
    const expert = getExpert(root, 'architect')
    expect(expert?.description).toBe('架构决策')
    expect(expert?.avatar).toEqual({ icon: 'Layers', accent: 'primary' })
    expect(expert?.defaultProviderChannelId).toBe('chan-1')
    expect(expert?.defaultModel).toBe('deepseek-v4-flash')
  })
})
