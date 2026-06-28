const LUXAGENTS_REPO_URL = 'https://github.com/GeoffBao/LuxAgents'

let _appVersion = '0.0.0'

export function setAppVersion(version: string): void {
  _appVersion = version
}

export function getAppVersion(): string {
  return _appVersion
}

export function getAppUserAgent(version?: string): string {
  const v = version ?? _appVersion
  return `LuxAgents/${v} (+${LUXAGENTS_REPO_URL})`
}
