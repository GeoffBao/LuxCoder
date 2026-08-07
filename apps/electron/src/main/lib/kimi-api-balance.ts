import type { ChannelPlanQuotaResult } from '@myyoda/shared'

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
  return `¥${amount.toFixed(2)}`
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
  const root = data as Record<string, unknown> | null
  // Kimi API v2 把余额字段包在 data 节点下（{ code, data: { available_balance, ... }, status }），
  // v1 直接平铺（{ available_balance, ... }），兼容两种格式。
  const body = (root?.data as KimiApiBalanceResponse | undefined) ?? (root as KimiApiBalanceResponse | null)
  const response = body as KimiApiBalanceResponse | null
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
    planName: 'Kimi API 账户余额',
    windows: [{
      type: 'custom',
      label: '账户余额',
      remainingPercent: 0,
      usedPercent: 0,
      remainingLabel: formatAmount(available),
      showProgress: false,
    }],
    updatedAt: Date.now(),
    ...(voucher != null || cash != null
      ? { message: `代金券 ${formatAmount(voucher ?? 0)} · 现金 ${formatAmount(cash ?? 0)}` }
      : {}),
  }
}
