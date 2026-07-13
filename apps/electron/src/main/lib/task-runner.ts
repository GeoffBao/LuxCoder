/**
 * Conductor — 进程内 DAG 执行引擎（Tasks）
 *
 * task.yaml 描述了一个节点图；每个节点是一个子 session。
 * Conductor 调度就绪节点、发射子 session、监听完成、驱动看板状态。
 *
 * 参照 OSS: packages/server-core/src/tasks/TaskRunner.ts
 * 适配: @craft-agent/ → @luxagents/；CreateSessionOptions/SessionCompletionEvent 本地类型
 */
import {
  nodeTitle,
  DEFAULT_REPAIR_ATTEMPTS,
  MAX_REPAIR_ATTEMPTS_CAP,
  type TaskSpec,
  type TaskNode,
} from '@luxagents/shared/tasks/schema'
import { interpolateRefs, type NodeOutput } from '@luxagents/shared/tasks/refs'
import { materializeDeps } from '@luxagents/shared/tasks/validate'
import {
  appendRunLog,
  writeNodeOutput,
  readNodeOutput,
  readRunLog,
  readRunSpecSnapshot,
  loadTaskSpec,
  writeRunSpecSnapshot,
  type RunLogEntry,
  type NodeRunState,
} from '@luxagents/shared/tasks/storage'

// ---------------------------------------------------------------------------
// 本地类型（替代 OSS 的 protocol dto / SessionManager）
// ---------------------------------------------------------------------------

export interface SessionCompletionEvent {
  sessionId: string;
  workspaceId: string;
  reason: 'complete' | 'interrupted' | 'error' | 'timeout';
  finalMessageId?: string;
  finalText?: string;
  tokenUsage?: { inputTokens?: number; outputTokens?: number };
}

export interface CreateSessionOptions {
  name?: string;
  permissionMode?: string;
  workingDirectory?: string;
  model?: string;
  llmConnection?: string;
  sessionStatus?: string;
  labels?: string[];
  enabledSourceSlugs?: string[];
  projectId?: string;
  parentSessionId?: string;
  taskSlug?: string;
  taskRunId?: string;
  taskNodeId?: string;
  taskDraft?: boolean;
  applyTaskLabel?: boolean;
}

// ---------------------------------------------------------------------------
// Host 接口
// ---------------------------------------------------------------------------

export interface ConductorSessionHost {
  createSession(workspaceId: string, options: CreateSessionOptions): Promise<{ id: string }>;
  sendMessage(sessionId: string, message: string): Promise<void>;
  setSessionStatus(sessionId: string, status: string): Promise<void>;
  setKanbanColumn(sessionId: string, column: string | null): Promise<void>;
  setTaskNodeCount(sessionId: string, count: number): Promise<void>;
  cancelProcessing(sessionId: string, silent?: boolean): Promise<void>;
  onSessionComplete(listener: (evt: SessionCompletionEvent) => void): () => void;
  getSessionFinalText(sessionId: string): string | undefined;
  getSessionWorkingDirectory(sessionId: string): string | undefined;
}

export interface TaskRunnerDeps {
  host: ConductorSessionHost;
  workspaceId: string;
  workspaceRoot: string;
  /** 可选输出摘要器（call_llm/Haiku） */
  summarize?: (text: string) => Promise<string>;
  defaultMaxParallel?: number;
  now?: () => string;
  genRunId?: () => string;
}

export interface RunOptions {
  orchestratorSessionId?: string;
  params?: Record<string, unknown>;
  runId?: string;
  verifyOnComplete?: boolean;
}

export type RunStatus = 'running' | 'paused' | 'verifying' | 'stopped' | 'completed' | 'failed';

export interface NodeRunStatus {
  id: string;
  state: NodeRunState;
  sessionId?: string;
  attempt: number;
}

export interface RunSnapshot {
  slug: string;
  runId: string;
  taskId: string;
  status: RunStatus;
  orchestratorSessionId?: string;
  nodes: NodeRunStatus[];
  tokensUsed: number;
}

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const DEFAULT_MAX_PARALLEL = 4;
const AUTONOMOUS_DEFAULT_MODE = 'allow-all' as const;
const RUNNING_STATUS = 'in-progress';
const DONE_STATUS = 'done';
const FAILED_STATUS = 'needs-review';
const MAX_UNPARSED_REASKS = 2;
const INPUTS_REF_RE = /\$\{\s*inputs\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\}/g;

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
type RunLogEntryInput = DistributiveOmit<RunLogEntry, 't'>;

interface NodeStateEntry {
  state: NodeRunState;
  sessionId?: string;
  attempt: number;
  lastFailure?: string;
}

// ---------------------------------------------------------------------------
// ActiveRun — 单次运行的状态机
// ---------------------------------------------------------------------------

class ActiveRun {
  private readonly state = new Map<string, NodeStateEntry>();
  private readonly sessionToNode = new Map<string, string>();
  private readonly outputs: Record<string, NodeOutput> = {};
  private readonly edges: Map<string, Set<string>>;
  private readonly maxParallel: number;
  private inFlight = 0;
  private tokensUsed = 0;
  private readonly sessionTokens = new Map<string, number>();
  private runStatus: RunStatus = 'running';
  private unsubscribe?: () => void;
  private verdictOff?: () => void;
  private repairsUsed = 0;
  private unparsedReAsks = 0;
  private readonly maxRepairs: number;
  private dependents?: Map<string, Set<string>>;
  private settled = false;
  private settleResolvers: ((s: RunSnapshot) => void)[] = [];

  constructor(
    private readonly spec: TaskSpec,
    private readonly slug: string,
    private readonly runId: string,
    private readonly opts: Required<Pick<RunOptions, 'verifyOnComplete'>> & RunOptions,
    private readonly deps: TaskRunnerDeps,
  ) {
    this.edges = materializeDeps(spec);
    this.maxParallel = spec.max_parallel ?? deps.defaultMaxParallel ?? DEFAULT_MAX_PARALLEL;
    this.maxRepairs = Math.min(spec.max_iterations ?? DEFAULT_REPAIR_ATTEMPTS, MAX_REPAIR_ATTEMPTS_CAP);
    for (const node of spec.nodes) this.state.set(node.id, { state: 'pending', attempt: 0 });
  }

  start(): void {
    this.unsubscribe = this.deps.host.onSessionComplete((evt) => this.onSessionComplete(evt));
    try {
      writeRunSpecSnapshot(this.deps.workspaceRoot, this.slug, this.runId, this.spec);
    } catch { /* ignore */ }
    this.log({ kind: 'run-started', taskId: this.spec.id, runId: this.runId, orchestratorSessionId: this.opts.orchestratorSessionId });
    this.runStatus = 'running';
    if (this.opts.orchestratorSessionId) {
      void this.deps.host.setKanbanColumn(this.opts.orchestratorSessionId, 'in-progress');
      void this.deps.host.setSessionStatus(this.opts.orchestratorSessionId, RUNNING_STATUS);
      void this.deps.host.setTaskNodeCount(this.opts.orchestratorSessionId, this.spec.nodes.length);
    }
    this.scheduleReady();
  }

  pause(): void {
    if (this.runStatus !== 'running') return;
    this.runStatus = 'paused';
    this.log({ kind: 'run-paused' });
  }

  resume(): void {
    if (this.runStatus !== 'paused') return;
    for (const [, st] of this.state) if (st.state === 'cancelled') st.state = 'pending';
    this.runStatus = 'running';
    this.log({ kind: 'run-resumed' });
    this.scheduleReady();
  }

  hydrate(log: RunLogEntry[], loadOutput: (nodeId: string) => NodeOutput | null): void {
    for (const e of log) {
      if (e.kind === 'node-spawned') {
        const st = this.state.get(e.nodeId);
        if (st) {
          st.sessionId = e.sessionId;
          st.state = 'running';
          this.sessionToNode.set(e.sessionId, e.nodeId);
        }
      } else if (e.kind === 'node-scheduled') {
        const st = this.state.get(e.nodeId);
        if (st) st.attempt += 1;
      } else if (e.kind === 'node-finished') {
        const st = this.state.get(e.nodeId);
        if (st) st.state = e.state;
      } else if (e.kind === 'verdict') {
        if (e.result === 'fail') this.repairsUsed += 1;
        else if (e.result === 'unparsed') this.unparsedReAsks += 1;
        else if (e.result === 'pass') this.unparsedReAsks = 0;
      }
    }
    for (const [nodeId, st] of this.state) {
      if (st.state === 'done') {
        const out = loadOutput(nodeId);
        if (out) this.outputs[nodeId] = out;
        else st.state = 'pending';
      } else if (st.state === 'cancelled') {
        st.state = 'pending';
      }
    }
    this.inFlight = [...this.state.values()].filter((st) => st.state === 'running').length;
  }

  resumeFromHydrated(): void {
    if (this.unsubscribe) return;
    this.runStatus = 'running';
    this.unsubscribe = this.deps.host.onSessionComplete((evt) => this.onSessionComplete(evt));
    this.log({ kind: 'run-resumed' });
    this.scheduleReady();
  }

  async stop(): Promise<void> {
    if (this.isTerminal()) return;
    this.runStatus = 'stopped';
    this.log({ kind: 'run-stopped' });
    for (const [nodeId, st] of this.state) {
      if (st.state === 'running') {
        st.state = 'cancelled';
        this.log({ kind: 'node-finished', nodeId, sessionId: st.sessionId ?? '', state: 'cancelled', reason: 'stopped' });
        if (st.sessionId) { void this.deps.host.cancelProcessing(st.sessionId, true); void this.deps.host.setKanbanColumn(st.sessionId, 'todo'); }
      }
    }
    this.inFlight = 0;
    this.finalize();
  }

  waitUntilSettled(): Promise<RunSnapshot> {
    if (this.settled) return Promise.resolve(this.snapshot());
    return new Promise((resolve) => this.settleResolvers.push(resolve));
  }

  snapshot(): RunSnapshot {
    return {
      slug: this.slug, runId: this.runId, taskId: this.spec.id,
      status: this.runStatus, orchestratorSessionId: this.opts.orchestratorSessionId,
      tokensUsed: this.tokensUsed,
      nodes: this.spec.nodes.map((n) => {
        const st = this.state.get(n.id)!;
        return { id: n.id, state: st.state, sessionId: st.sessionId, attempt: st.attempt };
      }),
    };
  }

  // --- 调度 ---

  private scheduleReady(): void {
    if (this.runStatus !== 'running') return;
    for (const node of this.spec.nodes) {
      if (this.inFlight >= this.maxParallel) break;
      if (!this.isReady(node)) continue;
      if (this.isOverBudget()) { this.pauseForBudget(); return; }
      this.markRunning(node);
      void this.dispatch(node);
    }
    this.maybeFinish();
  }

  private isReady(node: TaskNode): boolean {
    if (this.state.get(node.id)!.state !== 'pending') return false;
    for (const dep of this.edges.get(node.id) ?? []) {
      if (this.state.get(dep)?.state !== 'done') return false;
    }
    return true;
  }

  private markRunning(node: TaskNode): void {
    const st = this.state.get(node.id)!;
    st.state = 'running'; st.attempt += 1;
    this.inFlight += 1;
    this.log({ kind: 'node-scheduled', nodeId: node.id });
  }

  private async dispatch(node: TaskNode): Promise<void> {
    try {
      const prompt = skillsPreamble(this.spec.skills) + (await this.buildPrompt(node));
      const cwd = (this.opts.orchestratorSessionId ? this.deps.host.getSessionWorkingDirectory(this.opts.orchestratorSessionId) : undefined) ?? this.spec.cwd;
      const options: CreateSessionOptions = {
        parentSessionId: this.opts.orchestratorSessionId,
        taskSlug: this.slug, taskRunId: this.runId, taskNodeId: node.id,
        name: nodeTitle(node),
        model: node.model ?? this.spec.defaults?.model,
        llmConnection: node.llmConnection ?? this.spec.defaults?.llmConnection,
        permissionMode: node.permissionMode ?? this.spec.defaults?.permissionMode ?? AUTONOMOUS_DEFAULT_MODE,
        labels: node.labels,
        applyTaskLabel: true,
        ...(this.spec.sources?.length ? { enabledSourceSlugs: this.spec.sources } : {}),
        projectId: this.spec.project,
        ...(cwd ? { workingDirectory: cwd } : {}),
        sessionStatus: RUNNING_STATUS,
      };
      const child = await this.deps.host.createSession(this.deps.workspaceId, options);
      const st = this.state.get(node.id)!;
      st.sessionId = child.id;
      this.sessionToNode.set(child.id, node.id);
      this.log({ kind: 'node-spawned', nodeId: node.id, sessionId: child.id });
      await this.deps.host.setKanbanColumn(child.id, 'in-progress');
      await this.deps.host.sendMessage(child.id, prompt);
    } catch (err) {
      this.failNode(node.id, `dispatch 失败: ${(err as Error).message}`);
    }
  }

  private async buildPrompt(node: TaskNode): Promise<string> {
    const inputValues: Record<string, unknown> = {};
    for (const [name, ref] of Object.entries(node.inputs ?? {})) {
      const fromExpr = typeof ref === 'string' ? ref : ref.from;
      const summarize = typeof ref === 'string' ? false : !!ref.summarize;
      let resolved = interpolateRefs(fromExpr, { nodeOutputs: this.outputs, params: this.opts.params });
      if (summarize && this.deps.summarize) resolved = await this.deps.summarize(resolved);
      inputValues[name] = resolved;
    }
    let text = interpolateRefs(node.prompt ?? '', { nodeOutputs: this.outputs, params: this.opts.params });
    text = text.replace(INPUTS_REF_RE, (raw, name: string) => (name in inputValues ? String(inputValues[name]) : raw));
    const st = this.state.get(node.id)!;
    if (st.attempt > 1 && st.lastFailure) text = `${st.lastFailure}\n\n${text}`;
    return text;
  }

  // --- 完成处理 ---

  private onSessionComplete(evt: SessionCompletionEvent): void {
    const nodeId = this.sessionToNode.get(evt.sessionId);
    if (!nodeId) return;
    const st = this.state.get(nodeId);
    if (!st || st.state !== 'running') return;

    if (evt.tokenUsage) {
      const cumulative = (evt.tokenUsage.inputTokens ?? 0) + (evt.tokenUsage.outputTokens ?? 0);
      const prev = this.sessionTokens.get(evt.sessionId) ?? 0;
      this.tokensUsed += Math.max(0, cumulative - prev);
      this.sessionTokens.set(evt.sessionId, cumulative);
    }

    if (this.isOverBudget() && this.runStatus === 'running' && this.hasPendingNodes()) this.pauseForBudget();

    if (evt.reason === 'complete') {
      const text = evt.finalText ?? this.deps.host.getSessionFinalText(evt.sessionId) ?? '';
      const node = this.spec.nodes.find((n) => n.id === nodeId);
      if ((node?.outputs?.length ?? 0) > 0 && text.trim() === '') {
        this.failNode(nodeId, 'completed without producing declared output', evt.sessionId);
        return;
      }
      const output: NodeOutput = { text };
      this.outputs[nodeId] = output;
      st.state = 'done';
      this.inFlight = Math.max(0, this.inFlight - 1);
      writeNodeOutput(this.deps.workspaceRoot, this.slug, this.runId, nodeId, output);
      this.log({ kind: 'node-finished', nodeId, sessionId: evt.sessionId, state: 'done' });
      void this.deps.host.setSessionStatus(evt.sessionId, DONE_STATUS);
      void this.deps.host.setKanbanColumn(evt.sessionId, 'done');
      this.scheduleReady();
    } else if (evt.reason === 'interrupted') {
      st.state = 'cancelled';
      this.inFlight = Math.max(0, this.inFlight - 1);
      this.log({ kind: 'node-finished', nodeId, sessionId: evt.sessionId, state: 'cancelled', reason: 'interrupted' });
      void this.deps.host.setKanbanColumn(evt.sessionId, 'todo');
      this.scheduleReady();
    } else {
      this.failNode(nodeId, evt.reason, evt.sessionId);
    }
  }

  private failNode(nodeId: string, reason: string, sessionId?: string): void {
    const st = this.state.get(nodeId)!;
    const wasRunning = st.state === 'running';
    if (wasRunning) this.inFlight = Math.max(0, this.inFlight - 1);
    const node = this.spec.nodes.find((n) => n.id === nodeId);
    const retry = node?.retry;
    if (retry && st.attempt <= retry.limit && retryMatches(retry.when, 'error')) {
      st.lastFailure = `Previous attempt failed: ${reason}. Address the cause before retrying.`;
      st.state = 'pending';
      const sid = sessionId ?? st.sessionId;
      if (sid) void this.deps.host.setKanbanColumn(sid, 'todo');
      this.log({ kind: 'node-retry', nodeId, attempt: st.attempt, reason });
      this.scheduleReady();
      return;
    }
    st.state = 'failed';
    const sid = sessionId ?? st.sessionId;
    this.log({ kind: 'node-finished', nodeId, sessionId: sid ?? '', state: 'failed', reason });
    if (sid) void this.deps.host.setSessionStatus(sid, FAILED_STATUS);
    this.scheduleReady();
  }

  // --- 完成/验证 ---

  private maybeFinish(): void {
    if (this.runStatus !== 'running') return;
    if (this.inFlight > 0) return;
    if (this.spec.nodes.some((n) => this.isReady(n))) return;
    const allGood = this.spec.nodes.every((n) => {
      const s = this.state.get(n.id)!.state;
      return s === 'done' || s === 'skipped';
    });
    if (!allGood) { this.finish('failed'); return; }
    if (this.opts.verifyOnComplete && this.opts.orchestratorSessionId) {
      this.enterVerifying();
    } else {
      this.finish('completed');
    }
  }

  private enterVerifying(): void {
    this.runStatus = 'verifying';
    this.log({ kind: 'run-verifying' });
    void this.sendVerification();
  }

  private finish(status: RunStatus): void {
    this.runStatus = status;
    this.log({ kind: status === 'completed' ? 'run-completed' : 'run-failed' });
    const orchestrator = this.opts.orchestratorSessionId;
    if (orchestrator) {
      if (status === 'completed') {
        void this.deps.host.setKanbanColumn(orchestrator, 'done');
        void this.deps.host.setSessionStatus(orchestrator, DONE_STATUS);
      } else {
        void this.deps.host.setSessionStatus(orchestrator, FAILED_STATUS);
      }
    }
    this.finalize();
  }

  private finalize(): void {
    this.unsubscribe?.(); this.unsubscribe = undefined;
    this.verdictOff?.(); this.verdictOff = undefined;
    if (this.settled) return;
    this.settled = true;
    const snap = this.snapshot();
    for (const resolve of this.settleResolvers) resolve(snap);
    this.settleResolvers = [];
  }

  private async sendVerification(): Promise<void> {
    const orchestrator = this.opts.orchestratorSessionId;
    if (!orchestrator) { this.finish('completed'); return; }
    this.attachVerdictListener(orchestrator);
    const sections = this.spec.nodes.map((n) => {
      const out = this.outputs[n.id];
      return `### ${nodeTitle(n)} (${n.id})\n${out ? out.text : '(no output)'}`;
    });
    const rubric = this.spec.acceptance_criteria ? `Acceptance criteria:\n${this.spec.acceptance_criteria}` : `Goal: ${this.spec.goal}`;
    const message = [
      `The task "${this.spec.title}" has finished running.`, '', rubric, '',
      'Node outputs:', ...sections, '',
      'Verify the final result against the criteria above and summarize the outcome.',
      'End your reply with a verdict line, on its own line, in exactly one of these forms:',
      'VERDICT: PASS',
      'VERDICT: FAIL — <one-line reason>',
      'If only some subtasks need redoing, name them so only those (and their dependents) re-run:',
      'VERDICT: FAIL — nodes=<id>,<id> — <one-line reason>',
    ].join('\n');
    await this.sendToOrchestrator(orchestrator, message);
  }

  private attachVerdictListener(orchestrator: string): void {
    this.verdictOff?.();
    this.verdictOff = this.deps.host.onSessionComplete((evt) => {
      if (evt.sessionId !== orchestrator) return;
      this.verdictOff?.(); this.verdictOff = undefined;
      const text = evt.finalText ?? this.deps.host.getSessionFinalText(orchestrator) ?? '';
      this.handleVerdict(text);
    });
  }

  private async sendToOrchestrator(orchestrator: string, message: string): Promise<void> {
    try { await this.deps.host.sendMessage(orchestrator, message); }
    catch { this.verdictOff?.(); this.verdictOff = undefined; this.finish('failed'); }
  }

  private handleVerdict(text: string): void {
    if (this.runStatus !== 'verifying') return;
    writeNodeOutput(this.deps.workspaceRoot, this.slug, this.runId, '__verdict__', { text });
    const verdict = parseVerdict(text);
    this.log({ kind: 'verdict', result: verdict.result, reason: verdict.reason, nodes: verdict.nodes });

    if (verdict.result === 'pass') { this.unparsedReAsks = 0; this.finish('completed'); return; }

    if (verdict.result === 'unparsed') {
      if (this.unparsedReAsks < MAX_UNPARSED_REASKS) { this.unparsedReAsks += 1; void this.reAskVerdict(); return; }
      this.finish('failed'); return;
    }

    if (this.repairsUsed >= this.maxRepairs) {
      this.log({ kind: 'budget-breach', metric: 'iterations', value: this.repairsUsed, limit: this.maxRepairs });
      this.finish('failed'); return;
    }
    if (this.isOverBudget()) {
      this.log({ kind: 'budget-breach', metric: 'tokens', value: this.tokensUsed, limit: this.spec.token_budget! });
      this.finish('failed'); return;
    }
    this.repairsUsed += 1;
    this.repairForVerdict(verdict.reason, verdict.nodes);
  }

  private async reAskVerdict(): Promise<void> {
    const orchestrator = this.opts.orchestratorSessionId;
    if (!orchestrator) { this.finish('completed'); return; }
    this.attachVerdictListener(orchestrator);
    await this.sendToOrchestrator(orchestrator, [
      'Your previous reply did not include a parseable verdict line.',
      'Reply with the verdict line only, on its own line, in exactly one of these forms:',
      'VERDICT: PASS', 'VERDICT: FAIL — <one-line reason>', 'VERDICT: FAIL — nodes=<id>,<id> — <one-line reason>',
    ].join('\n'));
  }

  private repairForVerdict(reason: string | undefined, named?: string[]): void {
    const detail = reason ?? 'the result did not meet the acceptance criteria';
    let reset = 0;
    for (const id of this.computeFrontier(named)) {
      const st = this.state.get(id);
      if (!st || st.state !== 'done') continue;
      st.state = 'pending';
      st.lastFailure = `The previous result was rejected on verification: ${detail}. Revise your output to meet the acceptance criteria.`;
      this.log({ kind: 'node-retry', nodeId: id, attempt: st.attempt, reason: `verdict-fail: ${detail}` });
      reset += 1;
    }
    if (reset === 0) { this.finish('failed'); return; }
    this.runStatus = 'running';
    this.scheduleReady();
  }

  private computeFrontier(named?: string[]): Set<string> {
    const valid = (named ?? []).filter((id) => this.state.has(id));
    if (valid.length === 0) return new Set(this.spec.nodes.map((n) => n.id));
    const dependents = this.dependentsMap();
    const frontier = new Set<string>();
    const queue = [...valid];
    while (queue.length) {
      const id = queue.shift()!;
      if (frontier.has(id)) continue;
      frontier.add(id);
      for (const d of dependents.get(id) ?? []) if (!frontier.has(d)) queue.push(d);
    }
    return frontier;
  }

  private dependentsMap(): Map<string, Set<string>> {
    if (this.dependents) return this.dependents;
    const map = new Map<string, Set<string>>();
    for (const n of this.spec.nodes) map.set(n.id, new Set());
    for (const [node, upstreams] of this.edges) {
      for (const u of upstreams) map.get(u)?.add(node);
    }
    this.dependents = map;
    return map;
  }

  private isOverBudget(): boolean { return this.spec.token_budget !== undefined && this.tokensUsed >= this.spec.token_budget; }
  private pauseForBudget(): void { this.log({ kind: 'budget-breach', metric: 'tokens', value: this.tokensUsed, limit: this.spec.token_budget! }); this.pause(); }
  private hasPendingNodes(): boolean { for (const st of this.state.values()) if (st.state === 'pending') return true; return false; }
  private isTerminal(): boolean { return this.runStatus === 'completed' || this.runStatus === 'failed' || this.runStatus === 'stopped'; }

  private log(entry: RunLogEntryInput): void {
    const t = this.deps.now ? this.deps.now() : new Date().toISOString();
    appendRunLog(this.deps.workspaceRoot, this.slug, this.runId, { ...entry, t } as RunLogEntry);
  }
}

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

function skillsPreamble(skills: string[] | undefined): string {
  if (!skills?.length) return '';
  return `Apply these skills: ${skills.map((s) => `[skill:${s}]`).join(' ')}\n\n`;
}

function retryMatches(when: 'error' | 'empty' | 'invalid' | undefined, failure: 'error'): boolean {
  return (when ?? 'error') === failure;
}

function parseVerdict(text: string): { result: 'pass' | 'fail' | 'unparsed'; reason?: string; nodes?: string[] } {
  const matches = [...text.matchAll(/VERDICT:\s*(PASS|FAIL)\b[ \t]*(?:[—:-]+[ \t]*([^\n]*))?/gi)];
  const last = matches.at(-1);
  if (!last) return { result: 'unparsed' };
  const result = last[1]!.toUpperCase() === 'PASS' ? 'pass' : 'fail';
  let rest = last[2]?.trim() || undefined;
  let nodes: string[] | undefined;
  if (rest) {
    const m = rest.match(/^nodes=([a-z0-9,\- ]+?)\s*(?:[—:]+\s*(.*))?$/i);
    if (m) { nodes = m[1]!.split(',').map((s) => s.trim()).filter(Boolean); rest = m[2]?.trim() || undefined; }
  }
  const out: { result: 'pass' | 'fail' | 'unparsed'; reason?: string; nodes?: string[] } = { result };
  if (rest) out.reason = rest;
  if (nodes && nodes.length) out.nodes = nodes;
  return out;
}

function resolveParams(spec: TaskSpec, provided?: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of spec.params ?? []) if (p.default !== undefined) out[p.name] = p.default;
  return { ...out, ...(provided ?? {}) };
}

// ---------------------------------------------------------------------------
// TaskRunner — 注册表/服务
// ---------------------------------------------------------------------------

export class TaskRunner {
  private readonly runs = new Map<string, ActiveRun>();

  constructor(private readonly deps: TaskRunnerDeps) {}

  private key(slug: string, runId: string): string { return `${slug}:${runId}`; }

  run(slug: string, opts: RunOptions = {}): RunSnapshot {
    const loaded = loadTaskSpec(this.deps.workspaceRoot, slug);
    if (!loaded?.spec) throw new Error(`任务 "${slug}" 不存在或没有有效的 task.yaml`);
    if (!loaded.valid) throw new Error(`拒绝运行无效任务 "${slug}": ${loaded.errors.map((e) => e.message).join('; ')}`);
    const orchestrator = opts.orchestratorSessionId;
    if (orchestrator) {
      for (const existing of this.runs.values()) {
        const snap = existing.snapshot();
        if (snap.orchestratorSessionId === orchestrator && !isTerminalRunStatus(snap.status)) {
          throw new Error(`任务 "${slug}" 在该 orchestrator 上已有活跃运行 (${snap.runId})`);
        }
      }
    }
    const runId = opts.runId ?? (this.deps.genRunId ? this.deps.genRunId() : `run-${Date.now()}`);
    const run = new ActiveRun(
      loaded.spec, slug, runId,
      { ...opts, params: resolveParams(loaded.spec, opts.params), verifyOnComplete: opts.verifyOnComplete ?? true },
      this.deps,
    );
    this.runs.set(this.key(slug, runId), run);
    run.start();
    return run.snapshot();
  }

  pause(slug: string, runId: string): void { this.runs.get(this.key(slug, runId))?.pause(); }

  resume(slug: string, runId: string): void {
    const existing = this.runs.get(this.key(slug, runId));
    if (existing) { existing.resume(); return; }
    this.rehydrate(slug, runId);
  }

  private rehydrate(slug: string, runId: string): RunSnapshot {
    const snapshotSpec = readRunSpecSnapshot(this.deps.workspaceRoot, slug, runId);
    const spec = snapshotSpec ?? (() => {
      const loaded = loadTaskSpec(this.deps.workspaceRoot, slug);
      if (!loaded?.spec || !loaded.valid) throw new Error(`无法恢复 "${slug}:${runId}"：task.yaml 无效或缺失`);
      return loaded.spec;
    })();
    const log = readRunLog(this.deps.workspaceRoot, slug, runId);
    if (log.length === 0) throw new Error(`无法恢复 "${slug}:${runId}"：没有运行日志`);
    const started = log.find((e) => e.kind === 'run-started');
    const orchestratorSessionId = started && started.kind === 'run-started' ? started.orchestratorSessionId : undefined;
    const run = new ActiveRun(
      spec, slug, runId,
      { orchestratorSessionId, params: resolveParams(spec), verifyOnComplete: true },
      this.deps,
    );
    run.hydrate(log, (nodeId) => readNodeOutput(this.deps.workspaceRoot, slug, runId, nodeId));
    this.runs.set(this.key(slug, runId), run);
    run.resumeFromHydrated();
    return run.snapshot();
  }

  async stop(slug: string, runId: string): Promise<void> { await this.runs.get(this.key(slug, runId))?.stop(); }
  getRunState(slug: string, runId: string): RunSnapshot | null { return this.runs.get(this.key(slug, runId))?.snapshot() ?? null; }

  waitUntilSettled(slug: string, runId: string): Promise<RunSnapshot> {
    const run = this.runs.get(this.key(slug, runId));
    if (!run) return Promise.reject(new Error(`没有活跃的运行 ${slug}:${runId}`));
    return run.waitUntilSettled();
  }
}

function isTerminalRunStatus(status: RunStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'stopped';
}
