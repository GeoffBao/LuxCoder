import { describe, expect, test } from 'bun:test'
import type { AgentSessionMeta } from '@luxagents/shared'
import {
  buildProjectUpdate,
  buildCreateProjectInput,
  filterProjects,
  getProjectSessions,
} from '../project-view-model'
import type { KanbanProject } from '../../app-shell/kanban/types'

const projects: KanbanProject[] = [
  { id: 'a', slug: 'alpha', name: 'Alpha 发布', description: '桌面端', color: '#6366f1' },
  { id: 'b', slug: 'beta', name: 'Beta API', description: '服务端', archivedAt: 100 },
  { id: 'c', slug: 'gamma', name: 'Gamma', description: '移动端' },
]

function session(id: string, projectId?: string, archived?: boolean): AgentSessionMeta {
  return { id, title: id, projectId, archived, createdAt: 1, updatedAt: 1 }
}

describe('filterProjects', () => {
  test('默认隐藏归档项目，并按名称和描述搜索', () => {
    expect(filterProjects(projects, { query: '', showArchived: false }).map((project) => project.id)).toEqual(['a', 'c'])
    expect(filterProjects(projects, { query: '桌面', showArchived: false }).map((project) => project.id)).toEqual(['a'])
  })

  test('开启归档后可搜索归档项目', () => {
    expect(filterProjects(projects, { query: 'beta', showArchived: true }).map((project) => project.id)).toEqual(['b'])
  })
})

describe('project detail model', () => {
  test('Sessions 页只显示该项目的未归档顶层会话', () => {
    const sessions = [
      session('visible', 'a'),
      session('other', 'b'),
      session('archived', 'a', true),
      { ...session('child', 'a'), parentSessionId: 'visible' },
    ]

    expect(getProjectSessions(sessions, 'a').map((item) => item.id)).toEqual(['visible'])
  })

  test('设置表单会 trim，并用 undefined 清空可选字段', () => {
    expect(buildProjectUpdate({
      name: '  新名称  ',
      description: ' ',
      details: '  细节 ',
      color: '',
      workingDirectory: '',
      kanbanColumns: [],
    })).toEqual({
      name: '新名称',
      description: undefined,
      details: '细节',
      color: undefined,
      workingDirectory: undefined,
      kanbanColumns: undefined,
    })
  })
})

describe('buildCreateProjectInput', () => {
  test('name 必填 trim；空可选字段不写入', () => {
    expect(buildCreateProjectInput({
      name: '  Demo  ',
      description: ' ',
      workingDirectory: '',
      color: '',
    })).toEqual({ name: 'Demo' })
  })

  test('写入非空 description / workingDirectory / color', () => {
    expect(buildCreateProjectInput({
      name: 'Demo',
      description: '  desc ',
      workingDirectory: ' /repo/app ',
      color: '#ff0000',
    })).toEqual({
      name: 'Demo',
      description: 'desc',
      workingDirectory: '/repo/app',
      color: '#ff0000',
    })
  })
})

describe('buildProjectUpdate with defaultExpertId', () => {
  test('buildProjectUpdate 写入 defaultExpertId', () => {
    const patch = buildProjectUpdate({
      name: 'Demo',
      description: '',
      details: '',
      color: '',
      workingDirectory: '',
      defaultExpertId: 'architect',
    })
    expect(patch.defaultExpertId).toBe('architect')
  })

  test('buildProjectUpdate 空 defaultExpertId 清除为 undefined', () => {
    const patch = buildProjectUpdate({
      name: 'Demo',
      description: '',
      details: '',
      color: '',
      workingDirectory: '',
      defaultExpertId: '',
    })
    expect(patch.defaultExpertId).toBeUndefined()
  })
})

describe('buildProjectUpdate with workingDirectory', () => {
  test('可选 cwd trim 后写入或清空为 undefined', () => {
    expect(buildProjectUpdate({
      name: 'X',
      description: '',
      details: '',
      color: '',
      workingDirectory: ' /tmp/p ',
    })).toEqual({
      name: 'X',
      description: undefined,
      details: undefined,
      color: undefined,
      workingDirectory: '/tmp/p',
      kanbanColumns: undefined,
    })

    expect(buildProjectUpdate({
      name: 'X',
      description: '',
      details: '',
      color: '',
      workingDirectory: '   ',
    }).workingDirectory).toBeUndefined()
  })
})
