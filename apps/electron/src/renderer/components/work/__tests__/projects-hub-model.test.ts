import { describe, expect, test } from 'bun:test'
import {
  resolveExpertLabel,
  shouldOpenProjectsHub,
  type ExpertOption,
} from '../projects-hub-model'

const EXPERTS: ExpertOption[] = [
  { id: 'general', label: '通用专家' },
  { id: 'architect', label: '软件架构师' },
]

describe('projects-hub-model', () => {
  test('shouldOpenProjectsHub 仅 agent 模式', () => {
    expect(shouldOpenProjectsHub('agent')).toBe(true)
    expect(shouldOpenProjectsHub('chat')).toBe(false)
    expect(shouldOpenProjectsHub('cowork')).toBe(true)
  })

  test('resolveExpertLabel 缺失回退未设置', () => {
    expect(resolveExpertLabel('architect', EXPERTS)).toBe('软件架构师')
    expect(resolveExpertLabel('missing', EXPERTS)).toBe('未设置')
    expect(resolveExpertLabel(undefined, EXPERTS)).toBe('未设置')
  })
})
