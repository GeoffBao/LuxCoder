import type { ChannelPlanQuotaResult } from '@luxcoder/shared'

interface KimiApiBalanceResponse {
  available_balance?: unknown
  voucher_balance?: unknown
  cash_balance?: unknown
}

function parseAmount(value: unknown): number | undefined {
  if (value == null || value === '') return undefined
  const amount = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(amount) ? amount : undefined
}

function formatAmount(amount: number): string {
  return `$${amount.toFixed(2)}`
}

export function getKimiApiBalanceUrl(baseUrl: string): string {
  try {
    const hostname = new URL(baseUrl).hostname
    if (hostname === 'api.moonshot.ai' || hostname.endsWith('.moonshot.ai')) {
      return 'https://api.moonshot.ai/v1/users/me/balance'
    }
  } catch {
    // 使用中国区默认地址
  }
  return 'https://api.moonshot.cn/v1/users/me/balance'
}

export function parseKimiApiBalanceResponse(data: unknown): ChannelPlanQuotaResult {
  const response = data as KimiApiBalanceResponse | null
  const available = parseAmount(response?.available_balance)
  if (available == null) {
    return {
      supported: false,
      provider: 'kimi-api',
      windows: [],
      updatedAt: Date.now(),
      message: 'Kimi API 未返回可用余额',
    }
  }

  const voucher = parseAmount(response?.voucher_balance)
  const cash = parseAmount(response?.cash_balance)
  return {
    supported: true,
    provider: 'kimi-api',
    planName: 'Kimi API',
    windows: [{
      type: 'custom',
      label: '可用余额',
      remainingPercent: 0,
      usedPercent: 0,
      remainingLabel: formatAmount(available),
      showProgress: false,
    }],
    updatedAt: Date.now(),
    ...(voucher != null || cash != null
      ? { message: `代金券 ${formatAmount(voucher ?? 0)}，现金 ${formatAmount(cash ?? 0)}` }
      : {}),
  }
}
