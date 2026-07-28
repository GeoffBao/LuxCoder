/**
 * Tab 级前进/后退历史 Atoms
 *
 * 记录「最近激活的 Tab」序列，支持像浏览器一样后退/前进。
 * 仅存在内存（不持久化），App 关闭即清空，无迁移负担。
 *
 * 语义：
 * - 用户主动激活某个 Tab（点击 TabBar、新建、其他入口切 Tab）→ push 到 back 栈，清空 forward 栈
 * - 后退/前进动作本身引起的激活 → 不再入栈（由 `programmaticNavAtom` 标记抑制）
 * - 同一 Tab 连续激活去重；栈中已关闭的 tabId 在读取时惰性剔除
 */

import { atom } from 'jotai'
import { activeTabIdAtom, tabsAtom } from '@/atoms/tab-atoms'

/** 后退栈：栈顶是「当前 Tab 的上一个」 */
export const tabBackStackAtom = atom<string[]>([])

/** 前进栈：后退后压入，供前进恢复 */
export const tabForwardStackAtom = atom<string[]>([])

/**
 * 标记当前这次 activeTabId 变化是否由「后退/前进」动作触发。
 * 为 true 时，记录器跳过入栈，避免导航本身污染历史。
 */
export const programmaticNavAtom = atom(false)

/** 剔除栈中已不存在的 tabId，返回有效栈 */
function prune(stack: string[], aliveIds: Set<string>): string[] {
  return stack.filter((id) => aliveIds.has(id))
}

/** 当前可后退的 tabId（栈顶且仍存在），无则 null */
export const canGoBackAtom = atom((get) => {
  const alive = new Set(get(tabsAtom).map((t) => t.id))
  return prune(get(tabBackStackAtom), alive).length > 0
})

/** 当前可前进的 tabId，无则 null */
export const canGoForwardAtom = atom((get) => {
  const alive = new Set(get(tabsAtom).map((t) => t.id))
  return prune(get(tabForwardStackAtom), alive).length > 0
})

/**
 * 记录一次「用户主动激活」。在 activeTabIdAtom 变化后调用。
 * @param prev 激活前的 activeTabId（被压入 back 栈）
 * @param next 激活后的 activeTabId（用于去重）
 */
export const recordTabActivationAtom = atom(
  null,
  (get, set, payload: { prev: string | null; next: string | null }) => {
    const { prev, next } = payload
    // 后退/前进动作本身不记录
    if (get(programmaticNavAtom)) return
    // 没有「上一个」或原地激活（同 id）不入栈
    if (!prev || prev === next) return
    const alive = new Set(get(tabsAtom).map((t) => t.id))
    const back = prune(get(tabBackStackAtom), alive)
    // 连续重复（栈顶 === prev）不重复压栈
    if (back[back.length - 1] !== prev) {
      set(tabBackStackAtom, [...back, prev])
    }
    // 任何一次主动激活都使前进栈失效
    if (get(tabForwardStackAtom).length > 0) {
      set(tabForwardStackAtom, [])
    }
  },
)

/**
 * 后退：弹出 back 栈顶，把当前 Tab 压入 forward 栈。
 * 返回要切到的 tabId；不可后退返回 null。
 * 调用方负责随后把 activeTabIdAtom 设为该值（并回放激活副作用）。
 */
export const popBackAtom = atom(null, (get, set): string | null => {
  const alive = new Set(get(tabsAtom).map((t) => t.id))
  const back = prune(get(tabBackStackAtom), alive)
  const target = back[back.length - 1]
  if (!target) {
    set(tabBackStackAtom, back)
    return null
  }
  const current = get(activeTabIdAtom)
  set(tabBackStackAtom, back.slice(0, -1))
  if (current) {
    const fwd = prune(get(tabForwardStackAtom), alive)
    set(tabForwardStackAtom, [...fwd, current])
  }
  return target
})

/** 前进：弹出 forward 栈顶，把当前 Tab 压入 back 栈。不可前进返回 null。 */
export const popForwardAtom = atom(null, (get, set): string | null => {
  const alive = new Set(get(tabsAtom).map((t) => t.id))
  const fwd = prune(get(tabForwardStackAtom), alive)
  const target = fwd[fwd.length - 1]
  if (!target) {
    set(tabForwardStackAtom, fwd)
    return null
  }
  const current = get(activeTabIdAtom)
  set(tabForwardStackAtom, fwd.slice(0, -1))
  if (current) {
    const back = prune(get(tabBackStackAtom), alive)
    set(tabBackStackAtom, [...back, current])
  }
  return target
})
