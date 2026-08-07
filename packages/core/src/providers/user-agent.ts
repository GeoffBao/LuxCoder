const MYYODA_REPO_URL = 'https://github.com/GeoffBao/MyYoda'

let _appVersion = '0.0.0'

export function setAppVersion(version: string): void {
  _appVersion = version
}

export function getAppVersion(): string {
  return _appVersion
}

export function getAppUserAgent(version?: string): string {
  const v = version ?? _appVersion
  return `MyYoda/${v} (+${MYYODA_REPO_URL})`
}
