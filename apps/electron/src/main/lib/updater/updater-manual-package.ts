/**
 * 未签名 macOS：静默下载安装包并本地打开
 *
 * 不弹浏览器、不展示 GitHub Releases URL。
 * 用户只需「打开安装包」→ 系统挂载 DMG → 拖到应用程序。
 */

import { createWriteStream, existsSync, promises as fsp } from 'node:fs'
import { get as httpsGet } from 'node:https'
import { get as httpGet, type IncomingMessage } from 'node:http'
import path from 'node:path'
import { URL } from 'node:url'
import { app, shell } from 'electron'
import { pickManualInstallerAsset } from './updater-manual-package-select'

export { pickManualInstallerAsset }

export interface ManualPackageProgress {
  percent: number
  transferred: number
  total: number
  bytesPerSecond: number
}

function getUpdatePackageDir(): string {
  return path.join(app.getPath('userData'), 'update-packages')
}

/** 若本地已有同名完整文件则复用 */
export async function resolveCachedPackagePath(filename: string, expectedSize?: number): Promise<string | null> {
  const filePath = path.join(getUpdatePackageDir(), filename)
  if (!existsSync(filePath)) return null
  if (expectedSize && expectedSize > 0) {
    const stat = await fsp.stat(filePath)
    if (stat.size !== expectedSize) return null
  }
  return filePath
}

/**
 * 下载安装包到 userData/update-packages/
 * URL 仅在主进程使用，不回传渲染进程。
 */
export async function downloadManualPackage(input: {
  url: string
  filename: string
  expectedSize?: number
  onProgress?: (progress: ManualPackageProgress) => void
  signal?: AbortSignal
}): Promise<string> {
  const dir = getUpdatePackageDir()
  await fsp.mkdir(dir, { recursive: true })
  const filePath = path.join(dir, input.filename)

  const cached = await resolveCachedPackagePath(input.filename, input.expectedSize)
  if (cached) {
    input.onProgress?.({
      percent: 100,
      transferred: input.expectedSize ?? 0,
      total: input.expectedSize ?? 0,
      bytesPerSecond: 0,
    })
    return cached
  }

  await downloadToFile(input.url, filePath, input.onProgress, input.signal)
  return filePath
}

/** 用系统默认方式打开本地安装包（DMG / EXE），不打开浏览器 */
export async function openManualPackage(filePath: string): Promise<void> {
  if (!existsSync(filePath)) {
    throw new Error('安装包不存在，请重新检查更新')
  }
  const err = await shell.openPath(filePath)
  if (err) {
    throw new Error(err)
  }
}

function downloadToFile(
  url: string,
  filePath: string,
  onProgress?: (progress: ManualPackageProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tmpPath = `${filePath}.part`
    const fileStream = createWriteStream(tmpPath)
    let settled = false

    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      fileStream.destroy()
      void fsp.unlink(tmpPath).catch(() => {})
      reject(error instanceof Error ? error : new Error(String(error)))
    }

    const succeed = async () => {
      if (settled) return
      settled = true
      try {
        await fsp.rename(tmpPath, filePath)
        resolve()
      } catch (error) {
        fail(error)
      }
    }

    const onAbort = () => fail(new Error('cancelled'))
    signal?.addEventListener('abort', onAbort, { once: true })

    const getModule = (u: URL) => (u.protocol === 'http:' ? httpGet : httpsGet)

    const doGet = (targetUrl: string, redirectsLeft: number) => {
      let parsed: URL
      try {
        parsed = new URL(targetUrl)
      } catch (error) {
        fail(error)
        return
      }

      const request = getModule(parsed)(targetUrl, (res: IncomingMessage) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume()
          if (redirectsLeft <= 0) {
            fail(new Error('重定向次数过多'))
            return
          }
          doGet(new URL(res.headers.location, parsed).toString(), redirectsLeft - 1)
          return
        }

        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume()
          fail(new Error(`下载失败 HTTP ${res.statusCode ?? '?'}`))
          return
        }

        const total = Number(res.headers['content-length'] ?? 0)
        let transferred = 0
        let lastEmit = Date.now()
        let lastBytes = 0

        res.on('data', (chunk: Buffer) => {
          transferred += chunk.length
          const now = Date.now()
          if (now - lastEmit >= 250 || (total > 0 && transferred >= total)) {
            const elapsed = Math.max(0.001, (now - lastEmit) / 1000)
            const bytesPerSecond = Math.round((transferred - lastBytes) / elapsed)
            lastEmit = now
            lastBytes = transferred
            onProgress?.({
              percent: total > 0 ? Math.min(100, (transferred / total) * 100) : 0,
              transferred,
              total,
              bytesPerSecond,
            })
          }
        })

        res.pipe(fileStream)
        fileStream.on('finish', () => {
          fileStream.close(() => {
            void succeed()
          })
        })
        fileStream.on('error', fail)
        res.on('error', fail)
      })

      request.on('error', fail)
      signal?.addEventListener(
        'abort',
        () => {
          request.destroy(new Error('cancelled'))
        },
        { once: true },
      )
    }

    doGet(url, 5)
  })
}
