/** 标题生成 Prompt */
export const TITLE_PROMPT = '根据用户的第一条消息，生成一个简短的对话标题（10字以内）。只输出标题，不要有任何其他内容、标点符号或引号。如果消息内容过短或无明确主题，直接使用原始消息作为标题。\n\n用户消息：'

/** 短消息阈值：低于此长度直接使用原文作为标题 */
export const SHORT_MESSAGE_THRESHOLD = 4

/** 最大标题长度 */
export const MAX_TITLE_LENGTH = 20

const TITLE_PUNCTUATION = /^["'“”‘’「《]+|["'“”‘’」》]+$/g
const MARKDOWN_PREFIX = /^(?:[#>*\-\d.)]\s*)+/
const WHITESPACE = /\s+/g

// 附件列表 / 引用文件 / 引用上下文——渲染层在用户消息前拼接给模型看的 XML 样板块，
// 结构固定为「包装块 + \n\n + 用户真正手打的文字」。若不剥离，短消息很容易被这段
// 样板块本身（如 <attached_files> 开头一行，或 <quoted_context source=... label=...>）
// 当成标题原文，生成的标题看起来就是乱码或文件路径，而非用户实际想表达的内容。
const ATTACHED_FILES_BLOCK = /<attached_files>[\s\S]*?<\/attached_files>\n*/g
const QUOTED_FILE_BLOCK = /<quoted_file[^>]*>[\s\S]*?<\/quoted_file>\n*/g
const QUOTED_CONTEXT_BLOCK = /<quoted_context[^>]*>[\s\S]*?<\/quoted_context>\n*/g

/** 剥离用户消息里给模型看的上下文包装块，只留下用户真正手打的文字，供标题生成使用。 */
export function stripContextWrappersForTitle(userMessage: string): string {
  return userMessage
    .replace(ATTACHED_FILES_BLOCK, '')
    .replace(QUOTED_FILE_BLOCK, '')
    .replace(QUOTED_CONTEXT_BLOCK, '')
    .trim()
}

// 参考 craft-agents-oss（packages/shared/src/utils/title-generator.ts 的 validateTitle）：
// 模型有时不遵守"只输出标题"的指令，会在标题前加一句开场白（"标题：""好的，标题是："
// "Sure, here's the title:"…）。不剥离的话，这句开场白会原样混进最终展示的标题——
// 这正是"自动生成的标题偶尔不对"的一类根因，且不限于中文渠道，双语都要覆盖。
function isPreambleBeforeColon(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  // 中文开场白措辞不固定（"标题是""这个标题是"……），用包含关键字 + 长度上限判断，
  // 避免正文本身带"标题/主题"字样的合法标题被误伤（如 "XX 项目主题曲：xxx"）。
  if (trimmed.length <= 12 && /标题|主题/.test(trimmed)) return true
  if (/^(?:好的|当然|这是|以下是)/.test(trimmed)) return true
  const lower = trimmed.toLowerCase()
  if (/^(?:title|topic|sure|okay|ok)$/.test(lower)) return true
  if (/^(?:sure|okay|ok|here(?:'s| is))\b/.test(lower)) return true
  if (/^the\s+title\b/.test(lower)) return true
  return false
}

/** 反复剥离链式开场白（如"好的：标题：xxx"），直到冒号前不再匹配已知开场白模式。 */
function stripPreamble(title: string): string {
  let cleaned = title.trim()
  let prev = ''
  while (cleaned !== prev) {
    prev = cleaned
    const colonIndex = cleaned.search(/[:：]/)
    if (colonIndex > 0 && colonIndex < 40 && isPreambleBeforeColon(cleaned.slice(0, colonIndex))) {
      cleaned = cleaned.slice(colonIndex + 1).trim()
    }
  }
  return cleaned
}

const BOLD_WRAPPER = /^\*\*([\s\S]+)\*\*$/

/** 清理模型返回的标题。 */
export function sanitizeGeneratedTitle(title: string): string | null {
  let cleaned = stripPreamble(title)
  cleaned = cleaned.replace(TITLE_PUNCTUATION, '').trim()
  const boldMatch = cleaned.match(BOLD_WRAPPER)
  if (boldMatch) cleaned = boldMatch[1]!.trim()
  cleaned = cleaned.replace(MARKDOWN_PREFIX, '').trim()
  return cleaned.slice(0, MAX_TITLE_LENGTH) || null
}

/**
 * 无法调用标题模型时，基于首条用户消息生成一个稳定兜底标题。
 *
 * ChatGPT (Codex) OAuth 使用 Pi SDK 的 Codex Responses 协议，不适配当前
 * @luxcoder/core 的 Chat Completions / Messages 标题请求，因此需要本地兜底，
 * 避免会话长期停留在“新 Agent 会话”。
 */
export function createFallbackTitle(userMessage: string): string | null {
  const firstLine = userMessage
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
    ?? userMessage.trim()

  const cleaned = firstLine
    .replace(MARKDOWN_PREFIX, '')
    .replace(WHITESPACE, ' ')
    .trim()

  return cleaned.slice(0, MAX_TITLE_LENGTH) || null
}
