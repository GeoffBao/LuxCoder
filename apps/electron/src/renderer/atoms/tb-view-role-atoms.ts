import { atomWithStorage } from 'jotai/utils'
import type { TbViewRole } from '@yoda/shared/teambition-defect'

/** TB 看板当前视图角色（研发/测试），持久化用户选择 */
export const tbViewRoleAtom = atomWithStorage<TbViewRole>('yoda-tb-view-role', 'developer')
