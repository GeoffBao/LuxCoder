/**
 * 社区市场服务依赖的类型声明
 *
 * decompress / decompress-targz / js-yaml 用于解压社区市场 Skill 仓库。
 * 这些包没有自带或官方类型声明，这里给出使用面最小的声明。
 */

declare module 'decompress' {
  interface DecompressFile {
    path: string
    data: Buffer
    type?: string
  }
  interface DecompressOptions {
    strip?: number
    filter?: (file: DecompressFile) => boolean
    map?: (file: DecompressFile) => DecompressFile
    plugins?: unknown[]
  }
  export default function decompress(input: string | Buffer, output?: string, options?: DecompressOptions): Promise<DecompressFile[]>
}

declare module 'decompress-targz' {
  /** 返回一个可传给 decompress 的插件（调用时无需参数） */
  function createTargzPlugin(): {
    (input: Buffer | Uint8Array): Buffer
    [key: string]: unknown
  }
  export default createTargzPlugin
}

declare module 'js-yaml' {
  export function load(input: string, options?: { filename?: string; schema?: unknown; json?: boolean }): unknown
  export function loadAll(input: string, iterator?: (doc: unknown) => void, options?: { filename?: string; schema?: unknown; json?: boolean }): unknown[]
  export function dump(obj: unknown, options?: Record<string, unknown>): string
}
