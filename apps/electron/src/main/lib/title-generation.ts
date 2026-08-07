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

/**
 * 从模型返回的原始标题内容中提取文本。
 *
 * OpenAI 兼容端点（如 OpenCode Go）对推理模型可能把 `message.content` 返回为
 * 字符串、内容块数组（`[{ type: 'text', text: '...' }]`）或空值。逐个归一为
 * 纯文本，避免 `.trim()` 在非字符串上抛异常，导致整个标题生成在 catch 里静默丢弃。
 */
function extractTitleText(title: unknown): string {
  if (typeof title === 'string') return title
  if (Array.isArray(title)) {
    return title
      .map((block) => {
        if (block && typeof block === 'object' && typeof (block as { text?: unknown }).text === 'string') {
          return (block as { text: string }).text
        }
        return ''
      })
      .join('')
      .trim()
  }
  if (title && typeof title === 'object' && typeof (title as { text?: unknown }).text === 'string') {
    return (title as { text: string }).text
  }
  return ''
}

/** 清理模型返回的标题。兼容字符串与内容块数组，非文本内容返回 null。 */
export function sanitizeGeneratedTitle(title: string | unknown): string | null {
  const text = extractTitleText(title)
  let cleaned = stripPreamble(text)
  cleaned = cleaned.replace(TITLE_PUNCTUATION, '').trim()
  const boldMatch = cleaned.match(BOLD_WRAPPER)
  if (boldMatch) cleaned = boldMatch[1]!.trim()
  cleaned = cleaned.replace(MARKDOWN_PREFIX, '').trim()
  return cleaned.slice(0, MAX_TITLE_LENGTH) || null
}

// 参考 craft-agents-oss（packages/shared/src/utils/title-generator.ts）：会话进行到中段后，
// 仅靠第一条消息生成的标题往往已经跑题（用户提了个引子，实际聊的是完全不同的方向）。
// 这里移植其"挑首/中/尾几条消息 + 最新回复"重新生成标题的机制。

// 判断一条消息是否是低信息量的简短确认语（"好的""谢谢""继续"），不代表会话主题。
// craft-agents-oss 原版按"字符数 + 空格分词数"判断，对英文成立（12 字符 ≈ 2 个单词）；
// 但中文按字符数编码信息密度更高，同样 12 字符可能是一句完整的实质性提问，且中文不靠
// 空格分词导致"分词数"这条约束对中文永远满足。因此中文用更短的字符数阈值单独判断。
const LOW_SIGNAL_MAX_CHARS_CJK = 5
const LOW_SIGNAL_MAX_CHARS_LATIN = 12
const LOW_SIGNAL_MAX_WORDS = 2
const CJK_PATTERN = /[一-鿿぀-ヿ가-힯]/

export function isLowSignalMessage(message: string): boolean {
  const trimmed = message.trim()
  if (trimmed.includes('?') || trimmed.includes('？')) return false
  const maxChars = CJK_PATTERN.test(trimmed) ? LOW_SIGNAL_MAX_CHARS_CJK : LOW_SIGNAL_MAX_CHARS_LATIN
  if (trimmed.length > maxChars) return false
  if (trimmed.split(/\s+/).length > LOW_SIGNAL_MAX_WORDS) return false
  return true
}

/**
 * 从全部用户消息中挑出能代表会话主题演进的一个子集：首条（最初意图）+ 偏后段的一条
 * （话题实际走向）+ 末条（当前状态）。生成前先剥离末尾的低信息量确认语，避免"标题：好的"
 * 这类消息掩盖真正的主题；若全部消息都是低信息量的，则不过滤，原样使用。
 */
export function selectSpreadMessages(allUserMessages: string[]): string[] {
  const count = allUserMessages.length
  if (count === 0) return []

  let filtered = allUserMessages
  let trimEnd = allUserMessages.length
  while (trimEnd > 0 && isLowSignalMessage(allUserMessages[trimEnd - 1]!)) trimEnd--
  if (trimEnd > 0) filtered = allUserMessages.slice(0, trimEnd)

  const n = filtered.length
  if (n <= 3) return filtered

  const midIndex = Math.floor((n * 2) / 3)
  return [filtered[0]!, filtered[midIndex]!, filtered[n - 1]!]
}

function sliceAtWord(text: string, max: number): string {
  if (text.length <= max) return text
  const lastSpace = text.lastIndexOf(' ', max)
  return lastSpace > 0 ? text.slice(0, lastSpace) : text.slice(0, max)
}

/** 用于中途重新生成标题的 Prompt：给模型看首/中/尾用户消息 + 最新一次回复，而非只看第一条。 */
/**
 * 自动重命名触发点。
 * - 1：首轮完成后已有助手回复，单问答会话也能从"截图/如图/帮我看看"纠偏成真实主题。
 * - 4/8/15/26：随着会话推进逐步放宽间隔，纠正中长会话主题漂移。
 */
export const TITLE_REGENERATION_USER_MESSAGE_COUNTS = new Set([1, 4, 8, 15, 26])

export function shouldRegenerateTitleAtUserMessageCount(count: number): boolean {
  return TITLE_REGENERATION_USER_MESSAGE_COUNTS.has(count)
}

export function buildRegenerateTitlePrompt(recentUserMessages: string[], lastAssistantResponse: string): string {
  const userContext = recentUserMessages.map((message) => sliceAtWord(message, 500)).join('\n\n')
  const assistantSnippet = sliceAtWord(lastAssistantResponse, 500)

  return [
    '根据以下对话内容判断这个会话真正的主题，生成一个简短的标题（10字以内）。',
    '忽略"好的""谢谢""继续"等无实质信息的简短确认语，标题应反映对话实际讨论的内容而非最初的引子。',
    '只输出标题，不要有任何其他内容、标点符号或引号。',
    '',
    '用户消息（按对话顺序）：',
    userContext,
    '',
    '最新一次回复：',
    assistantSnippet,
    '',
    '标题：',
  ].join('\n')
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : undefined
}

function extractTextBlocks(content: unknown): string | null {
  if (!Array.isArray(content)) return null
  const text = content
    .map((block) => {
      const record = asRecord(block)
      return record?.type === 'text' && typeof record.text === 'string' ? record.text : ''
    })
    .filter(Boolean)
    .join('\n')
  return text || null
}

// 会话消息持久化存在新旧两种格式并存（见 agent-session-manager.ts persistSDKMessages 注释）：
// 旧格式是扁平的 { role, content: string }；Phase 4 起改为直接存储原始 SDKMessage
// { type, message: { content: [...] } }。maybeRegenerateTitle 此前按旧格式的 `.role` 取值，
// 但 Phase 4 消息只有 `.type`、没有顶层 `.role`，导致 userMessages 恒为空数组、count 恒为 0，
// TITLE_REGENERATION_USER_MESSAGE_COUNTS 永远命中不了——"中段重新生成标题"功能实际从未生效过。

/**
 * 从持久化消息中提取"真正由用户手打"的文本，兼容新旧存储格式。
 *
 * Anthropic Messages API 用 user role 承载 tool_result（工具调用结果），Phase 4 格式下
 * 这类消息同样是 `type: 'user'`，必须靠 content 块里是否含 tool_result 类型来排除，
 * 否则会把工具结果误判成用户消息，用户消息计数远超真实值。
 */
export function extractGenuineUserMessageText(message: unknown): string | null {
  const raw = asRecord(message)
  if (!raw) return null
  if (raw.role === 'user' && typeof raw.content === 'string') return raw.content
  if (raw.type !== 'user') return null

  const blocks = asRecord(raw.message)?.content
  if (Array.isArray(blocks) && blocks.some((block) => asRecord(block)?.type === 'tool_result')) return null
  return extractTextBlocks(blocks)
}

/** 从持久化消息中提取 assistant 回复文本，兼容新旧存储格式。 */
export function extractAssistantMessageText(message: unknown): string | null {
  const raw = asRecord(message)
  if (!raw) return null
  if (raw.role === 'assistant' && typeof raw.content === 'string') return raw.content
  if (raw.type !== 'assistant') return null

  return extractTextBlocks(asRecord(raw.message)?.content)
}

/**
 * 无法调用标题模型时，基于首条用户消息生成一个稳定兜底标题。
 *
 * ChatGPT (Codex) OAuth 使用 Pi SDK 的 Codex Responses 协议，不适配当前
 * @myyoda/core 的 Chat Completions / Messages 标题请求，因此需要本地兜底，
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
