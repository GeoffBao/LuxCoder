import { describe, expect, test } from 'bun:test'
import { getKimiApiBalanceUrl, parseKimiApiBalanceResponse } from './kimi-api-balance'

describe('Kimi API balance parser', () => {
  test('根据中国区和国际站 Base URL 选择官方余额接口', () => {
    expect(getKimiApiBalanceUrl('https://api.moonshot.cn/v1')).toBe('https://api.moonshot.cn/v1/users/me/balance')
    expect(getKimiApiBalanceUrl('https://api.moonshot.ai/v1')).toBe('https://api.moonshot.ai/v1/users/me/balance')
  })
  test('解析可用余额、现金余额和代金券余额，不伪造百分比窗口', () => {
    const result = parseKimiApiBalanceResponse({
      available_balance: 12.5,
      voucher_balance: 2,
      cash_balance: 10.5,
    })

    expect(result.supported).toBe(true)
    expect(result.provider).toBe('kimi-api')
    expect(result.windows).toEqual([{
      type: 'custom',
      label: '账户余额',
      remainingPercent: 0,
      usedPercent: 0,
      remainingLabel: '¥12.50',
      showProgress: false,
    }])
    expect(result.planName).toBe('Kimi API 账户余额')
  })

  test('兼容字符串余额并拒绝缺少可用余额的响应', () => {
    expect(parseKimiApiBalanceResponse({ available_balance: '3.2' }).windows[0]?.remainingLabel).toBe('¥3.20')
    expect(parseKimiApiBalanceResponse({ cash_balance: 3 }).supported).toBe(false)
  })

  test('兼容 data 包裹格式（Kimi API v2）', () => {
    const result = parseKimiApiBalanceResponse({
      code: 0,
      data: {
        available_balance: 49.58,
        voucher_balance: 46.58,
        cash_balance: 3.0,
      },
      scode: '0x0',
      status: true,
    })
    expect(result.supported).toBe(true)
    expect(result.windows[0]?.remainingLabel).toBe('¥49.58')
    expect(result.message).toBe('代金券 ¥46.58 · 现金 ¥3.00')
  })
})
