/**
 * WelcomeEmptyState — 对话/会话空状态引导
 *
 * 安静空态（对齐 Cursor / Codex）：
 * 1. 企业版品牌 Mascot / OpenMoji 吉祥物插图
 * 2. 个性化时段问候（大字号 + regular 字重）
 * 3. 一行弱化的平台感知 Tip
 *
 * 不再保留 Chat/Code 切换按钮——侧边栏 ModeSwitcher 提供唯一出入口，
 * 空态页聚焦于「开始打字」一个 CTA。
 */

import * as React from 'react'
import { useAtomValue } from 'jotai'
import { cn } from '@/lib/utils'
import { userProfileAtom } from '@/atoms/user-profile'
import { appModeAtom } from '@/atoms/app-mode'
import { normalizeAppModeForUi } from '@/components/app-shell/code-main-view-model'
import { getRandomTip, getPlatform, type Tip } from '@/lib/tips'
import luxshareIctMascotUrl from '@/assets/brand/luxshare-ict-mascot.png'

/** 根据小时返回时段问候 */
function getGreeting(hour: number): string {
  if (hour < 6) return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

/**
 * OpenMoji Woman Singer (1F469-200D-1F3A4) — Chat 模式吉祥物
 */
function MascotSinger({ className }: { className?: string }): React.ReactElement {
  return (
    <svg viewBox="0 0 72 72" xmlns="http://www.w3.org/2000/svg"
      className={cn('drop-shadow-sm', 'dark:[&_[stroke]]:stroke-foreground', className)}
      aria-hidden="true"
    >
      <g id="color">
        <path fill="#3F3F3F" d="M45.3045,45.6162c2.4514,0,3.7516,0.5425,5.1709,1.4059l0.0148-0.0244v11.9008h-28.983V46.9977 l-0.0826-0.1495c1.3796-0.7617,2.5886-1.232,4.871-1.232l0.0885-0.0119c0,0,0.2787,11.8441,8.9179,12.9588h0.8504 c8.6392-1.1147,8.9179-12.9588,8.9179-12.9588"/>
        <rect x="58.3468" y="37.906" width="4" height="10.4297" transform="rotate(-45 60.347 43.12)" fill="#9B9B9A"/>
        <ellipse cx="53.622" cy="36.5859" rx="4" ry="4" fill="#D0CFCE"/>
      </g>
      <g id="hair">
        <path fill="#A57939" d="M58.0265,42.7938c-1.3223-0.3647-1.8445-1.8761-1.7502-3.2374c-1.5707,1.4034-3.9748,1.3658-5.4827-0.1422 c-1.5621-1.5621-1.5621-4.0947,0-5.6568c0.8289-0.8289,1.9303-1.2045,3.0157-1.1536c-0.4639-0.8731-0.395-2.3412-0.778-3.8458 c0,0-0.4278-0.3276-0.506-0.7819c-0.0687-0.3989-0.1467-0.8118-0.2523-1.2263c-0.5676-2.2302-1.2861-7.7974-8.3534-12.6925 c-2.4218-1.6774-4.865,0.5316-4.865,0.5316l-0.3099-0.2285c0,0-3.767-6.1694-10.4646-0.815 c-6.6976,5.3544-7.7859,10.4623-8.3535,12.6925c-0.5676,2.2302-0.3391,4.4139-2.1568,4.6323 c-1.8178,0.2183-2.7274,3.125-1.8178,4.5105c0.9096,1.3854,0.6826,4.3608-1.2472,4.893c-1.9299,0.5323-2.8215,4.2902-1.8727,5.8823 c0.5701,1.1254,2.2085,2.8893,4.9567,4.5168c1.2208-3.0382,3.7885-5.7533,9.0735-5.7533c3.17,2.1047,5.8896,3.5601,8.9375,3.5739 c3.048-0.0138,5.7676-1.4692,8.9375-3.5739c5.4276,0,7.9862,2.8235,9.1662,5.9154c1.8039-0.6282,3.663-1.3354,5.5985-2.1588 C62.3662,47.4578,59.9563,43.3261,58.0265,42.7938z"/>
      </g>
      <g id="skin">
        <path fill="#FCEA2B" d="M24.8142,26.0388c-0.9299,0.096,1.3287,2.7283,1.3287,3.7068c0,1.1735-1.4449,1.4633-1.2299,2.5538 c1.2196,6.1835,5.6861,10.769,11.0095,10.769c6.2621,0,11.3385-6.3455,11.3385-14.1732c0-0.9784-0.0793-1.9337-0.2303-2.8564 c0,0-6.737-3.4848-8.3708-6.8039V18.668c0,0-0.8335,2.2193-2.3769,2.7968l0,0l-0.7643-4.8041l0,0 C35.5187,16.6607,29.7645,25.5277,24.8142,26.0388z"/>
        <path fill="#FCEA2B" d="M44.7375,44.9195c-3.1699,2.1047-5.8895,3.5601-8.9375,3.5739c-3.0479-0.0138-5.7675-1.4692-8.9375-3.5739 c-12,0-10,13.9957-10,13.9957l4.6447-0.0244V46.9977l-0.0826-0.1495c1.3796-0.7617,2.5886-1.232,4.871-1.232l0.0885-0.0119 c0,0,0.2787,11.8441,8.9179,12.9588h0.8504c8.6392-1.1147,8.9179-12.9588,8.9179-12.9588l0.2342,0.0119 c2.4514,0,3.7516,0.5425,5.1709,1.4059l0.0148-0.0244v11.7414l4.2473-0.0223C54.7375,58.7168,56.7375,44.9195,44.7375,44.9195z"/>
      </g>
      <g id="line">
        <path d="M41.9226,27.0667c0,1.1045-0.8965,2-2,2s-2-0.8955-2-2c0-1.1035,0.8965-2,2-2S41.9226,25.9632,41.9226,27.0667"/>
        <path d="M33.9226,27.0667c0,1.1045-0.8965,2-2,2s-2-0.8955-2-2c0-1.1035,0.8965-2,2-2S33.9226,25.9632,33.9226,27.0667"/>
        <path d="M35.9225,37.0691c-1.1519,0-2.3037-0.2861-3.4473-0.8579c-0.4941-0.2471-0.6943-0.8477-0.4473-1.3418 c0.2466-0.4937,0.8462-0.6943,1.3418-0.4473c1.7178,0.8594,3.3877,0.8594,5.1055,0c0.4946-0.247,1.0947-0.0464,1.3418,0.4473 c0.2471,0.4941,0.0469,1.0947-0.4473,1.3418C38.2262,36.783,37.0743,37.0691,35.9225,37.0691z"/>
        <path fill="none" stroke="#000" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M25.0079,32.2806c1.3428,5.9552,5.7209,10.3201,10.9146,10.3201c4.9713,0,9.1954-3.9992,10.7256-9.5644"/>
        <path fill="none" stroke="#000" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M54.7375,57.9195c0,0,2-13-10-13c-3.1918,2.1279-5.9263,3.5984-9,3.5921h0.125c-3.0736,0.0063-5.8081-1.4642-9-3.5921 c-12,0-10,13-10,13"/>
        <rect x="58.3468" y="37.906" width="4" height="10.4297" transform="rotate(-45 60.347 43.12)" fill="none" stroke="#000" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
        <ellipse cx="53.622" cy="36.5859" rx="4" ry="4" fill="none" stroke="#000" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
        <line x1="64.2518" x2="67.0979" y1="46.9923" y2="49.8384" fill="none" stroke="#000" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
        <line x1="58.8529" x2="58.8529" y1="44.7887" y2="58.7887" fill="none" stroke="#000" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
        <path fill="none" stroke="#000" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M38.6599,14.6725c0,0-3.6231-6.1695-10.065-0.8151s-7.4886,10.4623-8.0345,12.6925c-0.5459,2.2303-0.3262,4.414-2.0745,4.6323 c-1.7484,0.2184-2.6232,3.1251-1.7484,4.5105c0.8749,1.3855,0.6565,4.3608-1.1996,4.8931 c-1.8561,0.5322-3.4939,3.6986-1.4194,5.8823"/>
        <path fill="none" stroke="#000" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M38.958,14.389c0,0,2.3499-2.209,4.6792-0.5316c6.7975,4.8951,7.4886,10.4623,8.0345,12.6925 c0.1015,0.4145,0.1765,0.8274,0.2426,1.2263c0.0753,0.4543,0.1391,0.8905,0.2172,1.2905"/>
        <path fill="none" stroke="#000" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M47.2014,33.4751c-1.9653-1.5286-0.0438-6.9252-0.0438-6.9252c-2.2275-0.4832-8.2142-8.1654-8.2142-8.1654 s-0.6951,2.2068-2.6604,3.0803l-0.7643-4.8041c0,0-6.2493,8.9692-11.0405,9.8892c0,0,3.6159,4.3048,0.122,6.0517 c-3.4939,1.747-2.5532,4.9133-1.0246,5.2409"/>
        <path fill="none" stroke="#000" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M45.0703,44.9076c0,0-0.2787,11.844-8.9179,12.9588H35.302c-8.6392-1.1148-8.9179-12.9588-8.9179-12.9588"/>
        <line x1="21.5072" x2="21.5072" y1="46.301" y2="57.9183" fill="none" stroke="#000" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
        <line x1="50.4902" x2="50.4902" y1="46.301" y2="57.975" fill="none" stroke="#000" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
      </g>
    </svg>
  )
}

/**
 * OpenMoji Man Farmer (1F468-200D-1F33E) — Code 模式吉祥物
 */
function MascotFarmer({ className }: { className?: string }): React.ReactElement {
  return (
    <svg viewBox="0 0 72 72" xmlns="http://www.w3.org/2000/svg"
      className={cn('drop-shadow-sm', 'dark:[&_[stroke]]:stroke-foreground', className)}
      aria-hidden="true"
    >
      <g id="color">
        <path fill="#B1CC33" d="M54.9702,59.0416c0,0,2-13.9922-10-13.9922c-3.1919,2.1279-5.9264,3.5985-9,3.5922h0.125 c-3.0736,0.0063-5.8082-1.4643-9-3.5922c-12,0-10,13.9922-10,13.9922"/>
        <polyline fill="#5C9E31" points="27.0327,45.0494 32.8364,53.9364 36.0327,48.6416"/>
        <polyline fill="#5C9E31" points="45.0327,45.0494 39.2289,53.9364 36.0327,48.6416"/>
        <rect x="57.9121" y="39.4534" width="5.4802" height="4.2448" fill="#9B9B9A"/>
        <polygon fill="#A57939" points="62.6522,54.8388 62.6522,43.7392 58.6522,43.7392 58.6522,54.8388 58.6522,58.0592 58.6522,59.0416 62.855,59.0416 62.855,54.8388"/>
        <rect x="22.1623" y="45.0897" width="4.2883" height="13.9706" fill="#61B2E4"/>
        <polygon fill="#61B2E4" points="49.653,58.2054 22.1623,58.0353 22.1623,59.0132 49.653,59.0132"/>
        <polygon fill="#61B2E4" points="48.9196,45.0897 44.6313,45.0897 44.6313,50.7728 44.6313,59.032 48.9196,59.032"/>
        <polyline fill="#F4AA41" points="27.185,16.2702 27.185,8.0684 35.9702,9.4857 44.7553,8.0684 44.7553,16.2702"/>
        <rect x="27.185" y="12.8535" width="17.4463" height="2.6585" fill="#E27022"/>
      </g>
      <g id="hair">
        <path fill="#6A462F" d="M24.724,24.9937c-0.2098,1.0778-0.321,2.2038-0.321,3.3623c0,0.7929,0.0521,1.5707,0.1523,2.3282 l-0.4737-0.5234c0,0-4.6525-6.8512,2.5534-13.8906h18.2132c7.206,7.0394,2.5535,13.8906,2.5535,13.8906l-5.6599-12.6244 c0,0-1.4782,3.8056-5.6542,3.4931c0,0,1.0645-4.7593-0.2835-4.7593c0,0-5.1834,6.2171-11.0729,8.7249"/>
      </g>
      <g id="skin">
        <path fill="#FCEA2B" d="M41.7418,17.5364c0,0-1.4782,3.8056-5.6542,3.4931c0,0,1.0645-4.7593-0.2835-4.7593 c0,0-5.1794,6.2122-11.0663,8.7219c-0.0145,0.0745-0.0322,0.1473-0.0458,0.2222c-0.0624,0.3441-0.1099,0.6948-0.1518,1.0479 c-0.0198,0.1668-0.0459,0.3309-0.061,0.4996c-0.047,0.5239-0.0762,1.0546-0.0762,1.5942c0,0.4494,0.0211,0.8925,0.0538,1.3311 c0.0104,0.1393,0.0273,0.2761,0.0409,0.4142c0.6894,7.0025,5.4556,12.428,11.2439,12.428c5.9927,0,10.8871-5.8153,11.2983-13.1756 L41.7418,17.5364z"/>
      </g>
      <g id="line">
        <path d="M41.9703,26.9951c0,1.1045-0.8965,2-2,2s-2-0.8955-2-2c0-1.1035,0.8965-2,2-2S41.9703,25.8916,41.9703,26.9951"/>
        <path d="M33.9703,26.9951c0,1.1045-0.8965,2-2,2s-2-0.8955-2-2c0-1.1035,0.8965-2,2-2S33.9703,25.8916,33.9703,26.9951"/>
        <path d="M35.9702,36.9976c-1.1519,0-2.3038-0.2862-3.4473-0.8579c-0.4942-0.2471-0.6943-0.8477-0.4473-1.3418 c0.2466-0.4937,0.8462-0.6944,1.3418-0.4473c1.7178,0.8594,3.3877,0.8594,5.1055,0c0.4946-0.2471,1.0947-0.0464,1.3418,0.4473 c0.2471,0.4941,0.0469,1.0947-0.4473,1.3418C38.2739,36.7114,37.122,36.9976,35.9702,36.9976z"/>
        <polyline fill="none" stroke="#000" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" points="27.0327,45.0494 32.8364,53.9364 36.0327,48.6416"/>
        <polyline fill="none" stroke="#000" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" points="45.0327,45.0494 39.2289,53.9364 36.0327,48.6416"/>
        <path fill="none" stroke="#000" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M53.4805,23.7951c0,0-2.3766,15.4155,7.0845,15.6583V23.7951"/>
        <path fill="none" stroke="#000" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M67.6495,23.7951c0,0,2.3767,15.4155-7.0845,15.6583V23.7951"/>
        <rect x="57.9121" y="39.4534" width="5.4802" height="4.2448" fill="none" stroke="#000" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
        <polyline fill="none" stroke="#000" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" points="62.6522,58.0692 62.6522,43.7392 58.6522,43.7392 58.6522,58.0592"/>
        <path fill="none" stroke="#000" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M54.9702,58.0494c0,0,2-13-10-13c-3.1919,2.1279-5.9264,3.5985-9,3.5922h0.125c-3.0736,0.0063-5.8082-1.4643-9-3.5922 c-12,0-10,13-10,13"/>
        <line x1="22.1623" x2="22.1623" y1="46.0014" y2="58.0353" fill="none" stroke="#000" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
        <line x1="49.653" x2="49.653" y1="46.0014" y2="58.0637" fill="none" stroke="#000" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
        <polyline fill="none" stroke="#000" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" points="27.301,45.3046 27.301,58.0353 44.7492,58.0211 44.7492,45.2839"/>
        <path fill="none" stroke="#000" d="M24.724,24.9937c-0.2098,1.0778-0.321,2.2038-0.321,3.3623 c0,0.7929,0.0521,1.5707,0.1523,2.3282l-0.4737-0.5234c0,0-4.6525-6.8512,2.5534-13.8906h18.2132 c7.206,7.0394,2.5535,13.8906,2.5535,13.8906l-5.6599-12.6244c0,0-1.4782,3.8056-5.6542,3.4931c0,0,1.0645-4.7593-0.2835-4.7593 c0,0-5.1834,6.2171-11.0729,8.7249"/>
        <path fill="none" stroke="#000" strokeWidth="2" d="M24.9525,24.9937 c-0.2097,1.0778-0.3209,2.2038-0.3209,3.3623c0,7.8276,5.0764,14.1732,11.3386,14.1732c5.9698,0,10.8621-5.7671,11.3058-13.0874"/>
        <path fill="none" stroke="#000" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M45.0768,16.2702c7.2059,7.0394,2.5534,13.8906,2.5534,13.8906l-5.6599-12.6244c0,0-1.4782,3.8056-5.6542,3.4931 c0,0,1.0646-4.7593-0.2834-4.7593c0,0-5.1834,6.2171-11.0729,8.7249"/>
        <path fill="none" stroke="#000" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M24.3101,30.1608c0,0-4.6525-6.8512,2.5534-13.8906"/>
        <polyline fill="none" stroke="#000" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" points="27.185,16.2702 27.185,8.0684 35.9702,9.4857 44.7553,8.0684 44.7553,16.2702"/>
        <line x1="27.185" x2="44.7553" y1="12.7654" y2="12.7654" fill="none" stroke="#000" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
        <line x1="19.5127" x2="52.0809" y1="16.2702" y2="16.2702" fill="none" stroke="#000" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
      </g>
    </svg>
  )
}

function EnterpriseMascot({ className }: { className?: string }): React.ReactElement {
  return (
    <img
      src={luxshareIctMascotUrl}
      className={cn(
        'rounded-full object-cover shadow-[0_12px_40px_rgba(28,82,180,0.18)] ring-1 ring-blue-500/15',
        className,
      )}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  )
}

export function WelcomeEmptyState(): React.ReactElement {
  const userProfile = useAtomValue(userProfileAtom)
  const mode = useAtomValue(appModeAtom)

  // 稳定的随机 Tip（组件挂载时选一条）
  const [tip] = React.useState<Tip>(() => getRandomTip(getPlatform()))

  const hour = new Date().getHours()
  const greeting = getGreeting(hour)
  const displayName = userProfile.userName || '用户'
  const uiMode = normalizeAppModeForUi(mode)

  return (
    <div className="welcome-empty-state flex h-full flex-col items-center justify-center gap-5 px-4">
      {/* 吉祥物：企业版 Code 空态优先展示 LuxshareICT Mascot；其他模式保留原轻量插图。 */}
      {uiMode === 'chat'
        ? <MascotSinger className="size-28 opacity-85" />
        : uiMode === 'agent'
          ? <EnterpriseMascot className="size-32 opacity-95" />
          : <MascotFarmer className="size-28 opacity-85" />
      }

      {/* 问候语 */}
      <h1 className="text-[28px] font-normal tracking-tight text-foreground/90">
        {displayName}，{greeting}
      </h1>

      {/* Tip */}
      <p className="max-w-[52ch] text-center text-[13px] leading-relaxed text-foreground/40">
        {tip.text}
      </p>
    </div>
  )
}
