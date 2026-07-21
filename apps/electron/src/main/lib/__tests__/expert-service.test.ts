import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createExpert,
  getExpert,
  listExperts,
  seedBuiltinExperts,
  updateExpertFiles,
  updateExpertManifest,
} from '../expert-service'

describe('expert-service', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'experts-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  test('seed 后 list 含 10 个专家', () => {
    seedBuiltinExperts(root)
    const list = listExperts(root)
    expect(list).toHaveLength(10)
    expect(list.map((expert) => expert.id).sort()).toContain('architect')
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
    expect(listExperts(root)).toHaveLength(11)
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
    expect(list).toHaveLength(9)
    expect(list.some((expert) => expert.id === 'general')).toBe(false)
  })
})
