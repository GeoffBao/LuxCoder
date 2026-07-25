import { describe, expect, test } from 'bun:test'
import {
  buildProjectUpdate,
  buildCreateProjectInput,
} from '../project-view-model'

describe('project detail model', () => {
  test('设置表单会 trim，并用 undefined 清空可选字段', () => {
    expect(buildProjectUpdate({
      name: '  新名称  ',
      description: ' ',
      details: '  细节 ',
      color: '',
      workingDirectory: '',
    })).toEqual({
      name: '新名称',
      description: undefined,
      details: '细节',
      color: undefined,
      workingDirectory: undefined,
      defaultExpertId: undefined,
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
      defaultExpertId: undefined,
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
