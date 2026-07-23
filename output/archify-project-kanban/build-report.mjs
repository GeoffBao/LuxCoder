import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('.', import.meta.url).pathname
const diagrams = [
  { id: 'architecture', title: '01 · 系统架构图', file: 'project-kanban-architecture.html', height: 900, summary: '展示 Electron Renderer、Preload、Main Runtime、本地文件与 Teambition 的职责边界。' },
  { id: 'workflow', title: '02 · 工作流程图', file: 'project-kanban-workflow.html', height: 1040, summary: '展示任务创建/生成、验证、持久化、DAG 调度、子 Session 执行与异常路径。' },
  { id: 'sequence', title: '03 · 运行时序图', file: 'project-kanban-sequence.html', height: 1100, summary: '强调 tasks:run 很快返回 RunSnapshot，而真正的 Agent 执行与落盘异步继续。' },
  { id: 'dataflow', title: '04 · 数据流向图', file: 'project-kanban-dataflow.html', height: 940, summary: '区分 durable facts、renderer-only 派生模型和外部 Teambition 数据。' },
  { id: 'lifecycle', title: '05 · 生命周期状态图', file: 'project-kanban-lifecycle.html', height: 900, summary: '严格区分正式 RunStatus、暂停、验证、repair frontier、恢复和终态。' },
].map((diagram) => ({ ...diagram, html: readFileSync(join(root, diagram.file), 'utf8') }))

function escapeAttribute(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

const diagramSections = diagrams.map((diagram) => `
  <section class="diagram-section" id="${diagram.id}">
    <div class="section-heading">
      <div><span class="eyebrow">ARCHIFY DIAGRAM</span><h2>${diagram.title}</h2><p>${diagram.summary}</p></div>
      <a class="anchor" href="#top">返回顶部 ↑</a>
    </div>
    <div class="diagram-shell">
      <iframe title="${diagram.title}" style="height:${diagram.height}px" srcdoc="${escapeAttribute(diagram.html)}"></iframe>
    </div>
  </section>`).join('\n')

const report = `<!doctype html>
<html lang="zh-CN" data-theme="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LuxAgents Project & Kanban 架构手册</title>
  <style>
    :root{--bg:#081018;--panel:#0e1722;--panel2:#121e2b;--text:#e8f0f7;--muted:#8fa2b4;--line:#263748;--cyan:#22d3ee;--emerald:#34d399;--amber:#fbbf24;--rose:#fb7185;--violet:#a78bfa;--shadow:0 22px 60px rgba(0,0,0,.28)}
    [data-theme="light"]{--bg:#f4f7fa;--panel:#fff;--panel2:#eef3f7;--text:#13202c;--muted:#5c7184;--line:#d7e0e8;--shadow:0 20px 55px rgba(23,45,66,.12)}
    *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:radial-gradient(circle at 85% 0%,rgba(34,211,238,.1),transparent 28%),var(--bg);color:var(--text);font:15px/1.7 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace}a{color:inherit}.wrap{width:min(1440px,calc(100% - 40px));margin:auto}.topbar{position:sticky;top:0;z-index:20;border-bottom:1px solid var(--line);background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(18px)}.topbar-inner{display:flex;align-items:center;justify-content:space-between;gap:24px;min-height:64px}.brand{display:flex;align-items:center;gap:12px;font-weight:800}.brand-dot{width:12px;height:12px;border-radius:50%;background:var(--cyan);box-shadow:0 0 22px var(--cyan)}nav{display:flex;gap:8px;overflow:auto}nav a,.theme{border:1px solid var(--line);border-radius:999px;padding:7px 11px;text-decoration:none;color:var(--muted);background:var(--panel);white-space:nowrap;font:inherit;font-size:12px;cursor:pointer}nav a:hover,.theme:hover{color:var(--text);border-color:var(--cyan)}.hero{padding:88px 0 48px}.kicker,.eyebrow{letter-spacing:.16em;font-size:11px;font-weight:800;color:var(--cyan)}h1{font-size:clamp(36px,6vw,76px);line-height:1.02;letter-spacing:-.06em;margin:18px 0 24px;max-width:1100px}.lead{max-width:940px;color:var(--muted);font-size:17px}.badges{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px}.badge{border:1px solid var(--line);background:var(--panel);padding:8px 12px;border-radius:10px;font-size:12px}.badge.ok{color:var(--emerald)}.badge.warn{color:var(--amber)}.badge.gap{color:var(--rose)}.grid{display:grid;gap:18px}.summary-grid{grid-template-columns:repeat(4,1fr);margin:22px 0 64px}.card{background:linear-gradient(145deg,var(--panel),var(--panel2));border:1px solid var(--line);border-radius:18px;padding:22px;box-shadow:var(--shadow)}.metric{font-size:34px;font-weight:900;letter-spacing:-.05em}.metric.cyan{color:var(--cyan)}.metric.green{color:var(--emerald)}.metric.amber{color:var(--amber)}.metric.rose{color:var(--rose)}.card h3{margin:8px 0 5px;font-size:14px}.card p,.card li{color:var(--muted);font-size:13px}.section{padding:44px 0}.section h2,.diagram-section h2{font-size:28px;letter-spacing:-.04em;margin:5px 0}.section-heading{display:flex;justify-content:space-between;align-items:end;gap:20px;margin-bottom:18px}.section-heading p{margin:0;color:var(--muted);max-width:900px}.anchor{font-size:12px;color:var(--muted);text-decoration:none}.two-col{grid-template-columns:1.1fr .9fr}.callout{border-left:3px solid var(--cyan);padding:16px 18px;background:var(--panel);border-radius:0 14px 14px 0}.callout.warn{border-color:var(--amber)}.callout.danger{border-color:var(--rose)}.callout h3{margin:0 0 6px}.callout p{margin:0;color:var(--muted)}pre{white-space:pre-wrap;background:#050a0f;color:#cde7f5;border-radius:14px;padding:20px;overflow:auto;border:1px solid var(--line)}table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--line);border-radius:16px;overflow:hidden;display:table}th,td{text-align:left;vertical-align:top;border-bottom:1px solid var(--line);padding:13px 15px;font-size:12px}th{color:var(--cyan);background:var(--panel2)}td{color:var(--muted)}td strong{color:var(--text)}code{color:var(--violet);word-break:break-word}.diagram-section{padding:52px 0}.diagram-shell{border:1px solid var(--line);border-radius:20px;background:var(--panel);padding:10px;box-shadow:var(--shadow);overflow:hidden}.diagram-shell iframe{display:block;width:100%;border:0;border-radius:14px;background:#071019}.maturity{display:grid;grid-template-columns:160px 1fr 92px;gap:12px;align-items:center;padding:12px 0;border-bottom:1px solid var(--line)}.bar{height:8px;background:var(--panel2);border-radius:999px;overflow:hidden}.bar span{height:100%;display:block;background:linear-gradient(90deg,var(--cyan),var(--emerald));border-radius:inherit}.maturity small{color:var(--muted)}footer{padding:64px 0 90px;color:var(--muted);border-top:1px solid var(--line);margin-top:40px}.note{font-size:12px;color:var(--muted)}
    @media(max-width:900px){.summary-grid,.two-col{grid-template-columns:1fr 1fr}.topbar nav{display:none}.maturity{grid-template-columns:120px 1fr 70px}}
    @media(max-width:640px){.wrap{width:min(100% - 22px,1440px)}.summary-grid,.two-col{grid-template-columns:1fr}.hero{padding-top:55px}.section-heading{align-items:start;flex-direction:column}.diagram-shell{padding:4px}.diagram-shell iframe{min-width:980px}.diagram-shell{overflow:auto}}
  </style>
</head>
<body>
<header class="topbar" id="top"><div class="wrap topbar-inner"><div class="brand"><span class="brand-dot"></span>LuxAgents / Project & Kanban</div><nav><a href="#overview">概览</a><a href="#architecture">架构</a><a href="#workflow">流程</a><a href="#sequence">时序</a><a href="#dataflow">数据</a><a href="#lifecycle">状态</a></nav><button class="theme" id="theme">切换主题</button></div></header>
<main class="wrap">
  <section class="hero">
    <div class="kicker">REPOSITORY-GROUNDED · ARCHIFY 2.10 · 2026-07-14</div>
    <h1>Project & Kanban<br/>系统架构手册</h1>
    <p class="lead">这不是未来愿景图，而是基于当前 <code>feature/work-mode-kanban</code> 工作树、实现代码与行为测试整理的系统切片。图中把“已验证运行时”“迁移中的 UI”“未完成的 Teambition 真实集成”明确分层，避免把批准设计误当成已交付功能。</p>
    <div class="badges"><span class="badge ok">✓ 56 个相关测试通过</span><span class="badge ok">✓ 5/5 Archify 图通过 validate + check</span><span class="badge warn">△ UI 双轨迁移中</span><span class="badge gap">! Teambition 默认 Mock</span></div>
  </section>

  <section id="overview" class="section">
    <div class="summary-grid grid">
      <article class="card"><div class="metric cyan">4</div><h3>架构层</h3><p>Shared contracts、Main runtime、Preload bridge、Renderer/Jotai。</p></article>
      <article class="card"><div class="metric green">3</div><h3>本地事实域</h3><p>Project files、Task artifacts、Agent Session metadata。</p></article>
      <article class="card"><div class="metric amber">6</div><h3>RunStatus</h3><p>running / paused / verifying / stopped / completed / failed。</p></article>
      <article class="card"><div class="metric rose">1</div><h3>主要外部边界</h3><p>Teambition user-mcp；当前由 Mock adapter 兜底。</p></article>
    </div>

    <div class="grid two-col">
      <div class="card">
        <span class="eyebrow">SYSTEM THESIS</span><h2>系统的核心不是“看板组件”</h2>
        <p>当前实现的真正核心是：<strong>Project 组织上下文，Session 充当卡片事实源，TaskSpec 描述 DAG，TaskRunner 把节点映射成 child Agent Session</strong>。看板只是把 Project、Session、Run 和 Teambition binding 做纯派生 join 后呈现出来。</p>
        <div class="callout"><h3>本地优先</h3><p>Project 与 Task 写入本地文件；Session metadata 独立持久化。远端 Teambition 失败不应破坏本地事务。</p></div>
      </div>
      <div class="card">
        <span class="eyebrow">MATURITY</span><h2>当前成熟度</h2>
        <div class="maturity"><strong>Shared contracts</strong><div class="bar"><span style="width:88%"></span></div><small>较完整</small></div>
        <div class="maturity"><strong>Main runtime</strong><div class="bar"><span style="width:82%"></span></div><small>已接通</small></div>
        <div class="maturity"><strong>Recovery/tests</strong><div class="bar"><span style="width:82%"></span></div><small>有覆盖</small></div>
        <div class="maturity"><strong>Kanban UI</strong><div class="bar"><span style="width:52%"></span></div><small>迁移中</small></div>
        <div class="maturity"><strong>Teambition</strong><div class="bar"><span style="width:28%"></span></div><small>Mock-first</small></div>
        <p class="note">百分比是架构阅读辅助，不是项目管理完成率。</p>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="section-heading"><div><span class="eyebrow">BOUNDARIES</span><h2>事实、派生模型与目标设计</h2></div></div>
    <div class="grid two-col">
      <div class="callout"><h3>当前已验证</h3><p>IPC 注册、Project/Task 文件存储、DAG 调度、并发限制、pause/resume/stop、预算暂停、verdict/repair、日志恢复、Kanban 纯 ViewModel 与乐观移动回滚。</p></div>
      <div class="callout warn"><h3>迁移中</h3><p>WorkBoardView 仍使用三列任务视图与兼容 atoms；session-first Kanban atoms/ViewModel 已存在，但完整 Board/List、Project 详情、TaskEditor 等尚未成为唯一 UI。</p></div>
      <div class="callout danger"><h3>尚未完成</h3><p>Teambition 真实工具能力探测、字段映射、binding 持久化、claim 幂等、pending/conflict/stale/reauth 完整 UI 与同步闭环。</p></div>
      <div class="callout"><h3>批准目标，不等于现状</h3><p><code>2026-07-13-project-kanban-migration-design.md</code> 描述最终迁移标准；本手册只把它用于解释方向，所有“已实现”判断均回到当前代码和测试。</p></div>
    </div>
  </section>

  <section class="section">
    <div class="section-heading"><div><span class="eyebrow">LOCAL STORAGE</span><h2>Workspace 内的持久化模型</h2><p>Project 和 Task 均以可读文件保存，无本地数据库；Kanban 卡片不单独建立第二套事实表。</p></div></div>
    <pre>Agent Workspace
├── projects/&lt;project-slug&gt;/
│   ├── config.json               # ProjectConfig + optional kanbanColumns
│   ├── assets/                   # project-scoped files
│   └── MEMORY.md                 # project knowledge/context
├── tasks/&lt;task-slug&gt;/
│   ├── task.yaml                 # validated TaskSpec / DAG
│   └── runs/&lt;run-id&gt;/
│       ├── task-snapshot.yaml    # protects recovery from live spec drift
│       ├── run-log.jsonl         # append-only lifecycle events
│       └── outputs/&lt;node-id&gt;.*   # downstream inputs + audit result
└── Agent Session metadata
    ├── projectId / kanbanColumn
    ├── parentSessionId
    └── taskSlug / taskRunId / taskNodeId / taskNodeCount</pre>
  </section>

  ${diagramSections}

  <section class="section">
    <div class="section-heading"><div><span class="eyebrow">INVARIANTS</span><h2>关键架构约束</h2></div></div>
    <table><thead><tr><th>约束</th><th>当前实现语义</th><th>为什么重要</th></tr></thead><tbody>
      <tr><td><strong>Session 是卡片事实源</strong></td><td><code>projectId</code>、<code>kanbanColumn</code>、task linkage 写入 AgentSessionMeta；KanbanItem 只派生。</td><td>避免 UI 模型和会话运行态形成双写。</td></tr>
      <tr><td><strong>TaskSpec 先验证再写</strong></td><td>YAML 经过 schema、依赖引用、循环与图约束检查，随后原子替换。</td><td>TaskRunner 不接收结构上不可信的 DAG。</td></tr>
      <tr><td><strong>节点即 child Session</strong></td><td>每个 ready node 由 ConductorSessionHost 创建独立会话，记录 parent/run/node 关系。</td><td>复用现有 Agent 编排、权限、消息和取消机制。</td></tr>
      <tr><td><strong>暂停不等于取消</strong></td><td>pause 阻止新节点派发；已经 running 的节点可以结束。stop 才取消活跃 child sessions。</td><td>保持运行语义可预测，避免丢失已在进行的工作。</td></tr>
      <tr><td><strong>恢复以运行快照为先</strong></td><td>rehydrate 优先读取 run-scoped snapshot；JSONL 重建 node state，缺失 output 的 done 回退 pending。</td><td>防止运行期间编辑 live task.yaml 导致历史运行漂移。</td></tr>
      <tr><td><strong>Teambition 非事务前提</strong></td><td>Adapter 独立；真实 schema 未验证时保留 raw payload，主进程当前使用 Mock fallback。</td><td>远端能力不稳定时，本地 Project/Kanban 仍可工作。</td></tr>
    </tbody></table>
  </section>

  <section class="section">
    <div class="section-heading"><div><span class="eyebrow">EVIDENCE</span><h2>代码与测试证据索引</h2><p>这些文件是本手册判断“当前系统是什么”的主要依据。</p></div></div>
    <table><thead><tr><th>证据</th><th>覆盖内容</th><th>结论</th></tr></thead><tbody>
      <tr><td><code>apps/electron/src/main/lib/task-handlers.ts</code></td><td>Projects / Tasks / Session / Teambition IPC 注册</td><td><strong>主链已接通</strong>，窗口重建时只更新推送目标。</td></tr>
      <tr><td><code>apps/electron/src/main/lib/task-runner.ts</code></td><td>DAG、并发、预算、retry、verdict、repair、rehydrate</td><td><strong>运行时核心已实现</strong>；repair 不是独立 RunStatus。</td></tr>
      <tr><td><code>packages/shared/src/projects/storage.ts</code></td><td>Project config/assets/memory 本地文件 CRUD</td><td><strong>本地 Project 事实源已实现</strong>。</td></tr>
      <tr><td><code>packages/shared/src/tasks/storage.ts</code></td><td>task.yaml、snapshot、JSONL、node outputs</td><td><strong>运行持久化与恢复素材已实现</strong>。</td></tr>
      <tr><td><code>apps/electron/src/renderer/atoms/kanban-atoms.ts</code></td><td>Jotai snapshots、纯派生 cards、optimistic move</td><td><strong>新状态层已存在</strong>，带乱序保护与失败回滚。</td></tr>
      <tr><td><code>apps/electron/src/renderer/components/work/WorkBoardView.tsx</code></td><td>当前 Work UI</td><td><strong>仍是三列轻量界面</strong>，使用部分 flat compatibility API。</td></tr>
      <tr><td><code>apps/electron/src/main/lib/teambition-adapter.ts</code></td><td>MCP adapter + Mock adapter</td><td><strong>边界已抽象</strong>，真实 tool names/schema 仍需探测。</td></tr>
      <tr><td><code>docs/superpowers/specs/2026-07-13-project-kanban-migration-design.md</code></td><td>批准的迁移目标与完成标准</td><td><strong>目标架构</strong>，不是当前交付证明。</td></tr>
    </tbody></table>
  </section>

  <section class="section">
    <div class="section-heading"><div><span class="eyebrow">VERIFICATION</span><h2>本次验证记录</h2></div></div>
    <div class="grid two-col">
      <article class="card"><h3>行为测试</h3><p><strong style="color:var(--emerald)">56 pass / 0 fail / 154 expect</strong></p><p>覆盖 Project/Task repositories、Project/Task storage、TaskRunner、Task handlers、Teambition adapters、Kanban ViewModel、optimistic drag rollback。</p></article>
      <article class="card"><h3>图表校验</h3><p><strong style="color:var(--emerald)">5 validate + 5 artifact checks passed</strong></p><p>每张图均通过 single SVG、finite values、orthogonal arrows 和 legend clearance 检查；渲染器布局检查也无碰撞和越界。</p></article>
    </div>
    <p class="note">Archify 渲染器环境未安装可选的 AJV，因此 JSON Schema 的 AJV 步骤被跳过；五个 typed renderer 自带的结构与布局检查、以及最终 HTML artifact check 均已通过。</p>
  </section>
</main>
<footer><div class="wrap"><strong>LuxAgents Project & Kanban Architecture Manual</strong><br/>Generated from the local repository on 2026-07-14. Each embedded Archify diagram contains its own dark/light toggle and PNG/JPEG/WebP/SVG export menu.</div></footer>
<script>
  const root=document.documentElement;const button=document.getElementById('theme');
  const saved=localStorage.getItem('luxagents-arch-theme');if(saved)root.dataset.theme=saved;
  button.addEventListener('click',()=>{root.dataset.theme=root.dataset.theme==='dark'?'light':'dark';localStorage.setItem('luxagents-arch-theme',root.dataset.theme)});
</script>
</body></html>`

writeFileSync(join(root, 'luxagents-project-kanban-architecture.html'), report, 'utf8')
console.log(join(root, 'luxagents-project-kanban-architecture.html'))
