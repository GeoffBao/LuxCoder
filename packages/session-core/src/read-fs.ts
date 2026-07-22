/**
 * 文件 IO 层 — 仅供 Node 侧（luxcodex CLI / Electron 主进程）使用。
 *
 * 本文件 import 'node:fs'，因此**不能**进入浏览器可达的主 barrel（'@luxcodex/session-core'）。
 * 它只通过子路径 '@luxcodex/session-core/node' 暴露，避免 Vite 把 node:fs 打进渲染层 bundle。
 */
import { closeSync, openSync, readFileSync, readSync, statSync } from 'node:fs'
import type { SDKMessage } from '@luxcodex/shared'
import { readSessionMessagesFromString } from './read'

/** 默认单次读取上限：超过则只读尾部，避免大会话 OOM */
export const DEFAULT_SESSION_READ_MAX_BYTES = 8 * 1024 * 1024

/**
 * 读取文件 UTF-8 内容；超过 maxBytes 时只读尾部，并丢掉可能被截断的首行。
 */
export function readFileUtf8Tail(filePath: string, maxBytes: number): string {
  const size = statSync(filePath).size
  if (size <= maxBytes) {
    return readFileSync(filePath, 'utf-8')
  }

  const fd = openSync(filePath, 'r')
  try {
    const buf = Buffer.alloc(maxBytes)
    readSync(fd, buf, 0, maxBytes, size - maxBytes)
    const text = buf.toString('utf-8')
    const newline = text.indexOf('\n')
    return newline >= 0 ? text.slice(newline + 1) : text
  } finally {
    closeSync(fd)
  }
}

export interface ReadSessionMessagesOptions {
  /** 最大读取字节数；默认 DEFAULT_SESSION_READ_MAX_BYTES */
  maxBytes?: number
}

/**
 * 从磁盘读取一份会话 JSONL 并解析为 SDKMessage[]。
 * 大文件只解析尾部，避免 CLI/主进程整文件吃进内存。
 */
export function readSessionMessages(
  filePath: string,
  options?: ReadSessionMessagesOptions,
): SDKMessage[] {
  const maxBytes = options?.maxBytes ?? DEFAULT_SESSION_READ_MAX_BYTES
  const raw = readFileUtf8Tail(filePath, maxBytes)
  return readSessionMessagesFromString(raw)
}
