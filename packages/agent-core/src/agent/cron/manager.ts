/**
 * CronManager — 面向 Agent 的 cron 调度门面(facade)。
 *
 * 本层位于原始 `CronScheduler`(它完全不了解 agent)与 agent 运行时其余部分
 * (Agent / turn / 遥测 / 工具面)之间。职责小而关键:
 *
 *   - 持有本会话的 `SessionCronStore`;
 *   - 把 `() => store.list()` 交给调度器,使每次 tick 自动感知增删;
 *   - 用 `agent.turn.hasActiveTurn` 门控触发,而非维护重复的空闲标志——
 *     turn 机制本身已经知道是否空闲;
 *   - 把一次触发的 `CronTask` 翻译为携带 `CronJobOrigin` 的 `steer(...)` 调用,
 *     并发出 `cron_fired` 遥测事件;
 *   - 把每次 store 变更镜像到 `<sessionDir>/cron/<id>.json`
 *     (经 {@link addTask} / {@link removeTasks}),使 `byf resume` 可调用
 *     {@link loadFromDisk} 重新水合此前已排定的任务。未提供 `sessionDir` 时
 *     (subagent、测试、临时会话)管理器保持纯内存运行。
 *   - 提供 `handleMissed(...)` 入口,供未来的启动期错过任务通知调用。目前调度器的
 *     `coalescedCount` 语义已内联处理错过触发,因此框架不会调用此入口——它保持
 *     暴露,以便日后增加横幅提示时无需改动本文件 API。
 *
 * 管理器任何地方都不会直接读 `Date.now()`;所有墙钟读取都经由
 * `this.clocks.wallNow()`。`no-date-now.test.ts` 守卫未列出本文件(它覆盖
 * 调度器 / 抖动层),但同样的纪律在此有意为之,使 bench / 测试时钟注入
 * 端到端生效。
 *
 * 关于 `recurring` 语义的说明:规范的任务表示使用
 * `recurring: boolean | undefined`,`undefined` 表示循环(cron 任务默认重复)。
 * 一次性任务通过显式 `recurring === false` 退出。本文件中的每次检查都用
 * `task.recurring !== false`,使调用方省略该字段时仍保持默认行为。
 */
import type { ContentPart } from '@byfriends/kosong';

import { resolveClockSources, SYSTEM_CLOCKS, type ClockSources } from '../../tools/cron/clock';
import { cronToHuman, parseCronExpression } from '../../tools/cron/cron-expr';
import { renderCronFireXml } from '../../tools/cron/cron-fire-xml';
import { createCronPersistStore } from '../../tools/cron/persist';
import { createCronScheduler, type CronScheduler } from '../../tools/cron/scheduler';
import { SessionCronStore } from '../../tools/cron/session-store';
import type { SessionCronTaskInit } from '../../tools/cron/session-store';
import {
  CRON_DELETED,
  CRON_FIRED,
  CRON_MISSED,
  CRON_SCHEDULED,
} from '../../tools/cron/telemetry-events';
import type { CronTask } from '../../tools/cron/types';
import type { PerIdJsonStore } from '../../utils/per-id-json-store';
import type { CronJobOrigin, CronMissedOrigin } from '../context/types';
import type { Agent } from '../index';

/**
 * Threshold past which a recurring task is flagged `stale: true` on its
 * fire `origin`. One-shot tasks never carry the stale flag — they are
 * one-time, "we always fire at most once" by construction. Disabled by
 * `BYF_CRON_NO_STALE=1` (bench / acceptance tests).
 *
 * Seven days mirrors the wall-clock "this got forgotten about" window
 * we want the LLM to notice; the figure also matches the auto-expire
 * cadence documented in the user-facing schedule story.
 */
const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 已排定 cron 任务在某一时刻的快照,经 RPC 暴露,使宿主应用
 * (例如 `byf -p` 流程在退出前判断是否仍有待办工作)无需经由面向模型的
 * CronList 工具即可枚举已排定任务。
 */
export interface CronTaskSnapshot {
  readonly id: string;
  readonly cron: string;
  /**
   * 由 {@link cron} 推导的人类可读调度描述。解析失败时回退到原始表达式
   * (store 注入的畸形数据 / 测试场景)。
   */
  readonly humanSchedule: string;
  /** 完整提示词字符串;宿主(如 `/cron` 列表)可按需截断显示。 */
  readonly prompt: string;
  readonly recurring: boolean;
  readonly createdAt: number;
  readonly lastFiredAt: number | undefined;
  /** 抖动后的下一次触发时间(epoch 毫秒);不存在未来触发时为 null。 */
  readonly nextFireAt: number | null;
}

export interface CronManagerOptions {
  /**
   * 测试 / bench 用覆盖。默认取
   * `resolveClockSources(process.env.BYF_CRON_CLOCK)`,使生产环境自动
   * 读取 `BYF_CRON_CLOCK=file:...`。未设置时回退到 {@link SYSTEM_CLOCKS}。
   */
  readonly clocks?: ClockSources;

  /**
   * 覆盖调度器轮询间隔。默认值由调度器处理
   * (1000ms;除非 `BYF_CRON_MANUAL_TICK=1`,此时此处强制为 `null`,
   * 使自动 tick 的 `setInterval` 永不安装)。`null` 或 `0`
   * 表示「无自动定时器——由调用方手动驱动 `tick()`」。
   */
  readonly pollIntervalMs?: number | null;
}

export class CronManager {
  /** 内存任务 store。构造时为空;由 {@link addTask}(及 resume 时的
   * {@link loadFromDisk})填充。 */
  readonly store: SessionCronStore;

  /**
   * 用于过期(stale)判断的时钟源。同样传给调度器,
   * 使整个调用栈共享同一个「当前时间」概念。
   */
  readonly clocks: ClockSources;

  private readonly scheduler: CronScheduler;
  private readonly agent: Agent;
  /**
   * Tracks whether `start()` has been called without a matching `stop()`.
   * Used to keep `start()` / `stop()` idempotent and — more importantly
   * for P1.8 — to gate SIGUSR1 binding so we don't accumulate handlers
   * across repeated start() calls.
   */
  private started = false;
  /**
   * Reference to the bound SIGUSR1 listener while the manager is
   * running. Held so `stop()` can call `process.off('SIGUSR1', handler)`
   * with the same function reference and not leak handlers across vitest
   * files. `null` whenever the manager is not started, or when running
   * on a platform that does not support SIGUSR1 (Windows).
   */
  private sigusr1Handler: NodeJS.SignalsListener | null = null;

  /**
   * File-backed mirror of {@link store}. `undefined` when no
   * `sessionDir` was supplied — the manager then behaves as pure
   * in-memory, matching pre-persistence semantics. When defined,
   * `addTask` / `removeTasks` schedule fire-and-forget writes so a
   * later `byf resume` can reload via {@link loadFromDisk}.
   */
  private readonly persistStore: PerIdJsonStore<CronTask> | undefined;

  /**
   * Per-id serializer for persistence writes. Prevents a fast
   * `add` → `remove` sequence on the same id from racing each other on
   * the rename — the rm must observe the prior write's renamed file.
   * Empty between bursts; entries are deleted once their tail promise
   * settles so the map cannot grow unboundedly with churn.
   */
  private readonly persistQueues: Map<string, Promise<void>> = new Map();

  constructor(agent: Agent, opts: CronManagerOptions = {}) {
    this.agent = agent;
    this.store = new SessionCronStore();
    this.clocks =
      opts.clocks ?? resolveClockSources(process.env['BYF_CRON_CLOCK']) ?? SYSTEM_CLOCKS;
    this.persistStore =
      agent.homedir === undefined ? undefined : createCronPersistStore(agent.homedir);

    this.scheduler = createCronScheduler({
      clocks: this.clocks,
      source: () => this.store.list(),
      isIdle: () => !agent.turn.hasActiveTurn,
      isKilled: () => process.env['BYF_DISABLE_CRON'] === '1',
      onFire: (task, ctx) => {
        this.handleFire(task, ctx);
      },
      removeOneShot: (id) => {
        this.removeTasks([id]);
      },
      onAdvanceCursor: (id, lastFiredAt) => {
        this.advanceCursor(id, lastFiredAt);
      },
      // P1.8: `BYF_CRON_MANUAL_TICK=1` forces the scheduler into
      // manual-drive mode (no setInterval), so bench / time-injected
      // tests can step time forward and call `tick()` explicitly without
      // racing a 1-second auto-tick. Explicit caller overrides
      // (`opts.pollIntervalMs`) lose to the env so a bench can flip the
      // switch from the outside without rebuilding the manager wiring.
      pollIntervalMs: process.env['BYF_CRON_MANUAL_TICK'] === '1' ? null : opts.pollIntervalMs,
    });

    this.start();
  }

  /**
   * 向内存 store 添加一个新任务;启用持久化时,将新记录镜像到
   * `<sessionDir>/cron/<id>.json`。
   *
   * store 调用是同步的(CronCreate 的响应需要 id);落盘写入为
   * fire-and-forget,慢磁盘不会阻塞工具的回复。按 id 排队可串行化
   * 同一 id 上的并发写入(例如 add → 过期自动清理),避免 rm 与 rename 竞争。
   *
   * 持久化失败经 `agent.log.warn` 记录并吞掉——磁盘抖动会丢失跨 resume
   * 的持久性,但不能使 agent 循环崩溃。
   */
  addTask(init: SessionCronTaskInit): CronTask {
    const task = this.store.add(init, this.clocks.wallNow());
    this.persistEnqueue(task.id, () => this.persistStore!.write(task.id, task));
    return task;
  }

  /**
   * 从内存 store 移除一批任务,并(启用持久化时)把每次删除镜像到磁盘。
   * 返回实际存在的 id 子集,与 `SessionCronStore.remove` 的契约一致——
   * 调用方(CronDelete / 调度器一次性清理 / 过期自动清理)据此决定
   * 是否发遥测。
   *
   * 持久化失败被记录并吞掉;跨 resume 的最坏情况是残留一个幽灵条目,
   * 会在下一次 `list()` 的形状守卫中被丢弃。
   */
  removeTasks(ids: readonly string[]): readonly string[] {
    const removed = this.store.remove(ids);
    for (const id of removed) {
      this.persistEnqueue(id, () => this.persistStore!.remove(id));
    }
    return removed;
  }

  /**
   * Persist the scheduler's `lastFiredAt` cursor for a recurring task
   * so a `byf resume` does not coalesce-replay an already-delivered
   * fire. Called by the scheduler's `onAdvanceCursor` callback after a
   * successful recurring fire.
   *
   * No-op when the task has already been removed between fire and
   * callback (concurrent CronDelete is the canonical case). When
   * persistence is detached (subagent / ephemeral session) we still
   * update the in-memory record — same-session stale checks read off
   * the in-memory store. The on-disk write is fire-and-forget via
   * `persistEnqueue`; a flaky disk drops cross-resume durability but
   * never blocks the scheduler.
   */
  private advanceCursor(id: string, lastFiredAt: number): void {
    const updated = this.store.markFired(id, lastFiredAt);
    if (updated === undefined) return;
    if (this.persistStore === undefined) return;
    this.persistEnqueue(id, () => this.persistStore!.write(id, updated));
  }

  /**
   * `byf resume` 后从 `<sessionDir>/cron/` 重新水合内存 store。
   * 未启用持久化时为空操作。幂等:清空内存映射并重新插入磁盘上的每条记录。
   *
   * 任务经 {@link SessionCronStore.adopt} 插入,使原始 `id` 与 `createdAt`
   * 得以保留——`createdAt` 是调度器的循环基线和 7 天过期判断的输入,
   * 重新生成的值会同时破坏两者。
   */
  async loadFromDisk(): Promise<void> {
    if (this.persistStore === undefined) return;
    const tasks = await this.persistStore.list();
    this.store.clear();
    for (const task of tasks) {
      this.store.adopt(task);
    }
  }

  /**
   * Serialize per-id persistence writes. Concurrent mutations on the
   * same id (uncommon but reachable via `add` immediately followed by
   * stale auto-expire) would otherwise race on the rename — atomicWrite
   * is per-call atomic, not per-id ordered. Each id's chain is dropped
   * from the map once it settles so the map size tracks live in-flight
   * writes, not lifetime churn.
   */
  private persistEnqueue(id: string, work: () => Promise<void>): void {
    if (this.persistStore === undefined) return;
    const prev = this.persistQueues.get(id) ?? Promise.resolve();
    const next = prev
      .catch(() => {})
      .then(() => work())
      .catch((error: unknown) => {
        this.agent.log.warn('cron persist failed', { error });
      })
      .finally(() => {
        if (this.persistQueues.get(id) === next) {
          this.persistQueues.delete(id);
        }
      });
    this.persistQueues.set(id, next);
  }

  /**
   * 等待经 {@link addTask} / {@link removeTasks} 排入的所有待写 / 待删
   * 持久化操作完成。{@link stop} 在优雅关停会话时调用它;它公开暴露,
   * 使测试无需轮询即可同步到磁盘可见状态。
   *
   * 错误已被 `persistEnqueue` 吞掉,因此该方法永不 reject。
   */
  async flushPersist(): Promise<void> {
    // Snapshot the chain promises rather than the map itself — the
    // `.finally` cleanup deletes entries while we await, and a live
    // map iteration would observe the deletions and miss tails.
    const inFlight = Array.from(this.persistQueues.values());
    await Promise.allSettled(inFlight);
  }

  /**
   * 启动调度器的自动 tick 循环,并绑定 SIGUSR1 手动 tick 钩子(P1.8)。
   * 幂等:重复调用为空操作,启动序列与测试无需记账即可「确保已启动」。
   */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.scheduler.start();
    this.bindSigusr1();
  }

  /**
   * 停止调度器,排空待写持久化,清理进行中的记账,并解绑 SIGUSR1 处理器。
   * 幂等且信号处理器安全——多个运行管理器的 vitest 文件不得在共享进程上
   * 留下悬空的 SIGUSR1 监听器。
   *
   * 关停时排空持久化对生产环境很重要:否则 CronCreate 之后紧接着的会话
   * `close()` 会在 JSON 文件落盘前拆掉进程,任务将缺失于 resume 的
   * `loadFromDisk()`。
   */
  async stop(): Promise<void> {
    this.unbindSigusr1();
    await this.scheduler.stop();
    await this.flushPersist();
    this.started = false;
  }

  /** 同步驱动一次调度器 tick。供测试与 P1.8 SIGUSR1 使用。 */
  tick(): void {
    this.scheduler.tick();
  }

  /**
   * 所有任务中最早的(抖动后)理论下一次触发时间;没有任务或均无未来触发
   * 时为 null。供 `/cron` 斜杠命令与外部监控使用。
   */
  getNextFireTime(): number | null {
    return this.scheduler.getNextFireTime();
  }

  /**
   * 单个任务抖动后的下一次触发时间。转发给调度器,使 CronList 渲染出
   * 调度器实际触发的同一时刻——即使理想时刻已过、当期仍有待投递的
   * 抖动交付。
   */
  getNextFireForTask(taskId: string): number | null {
    return this.scheduler.getNextFireForTask(taskId);
  }

  /**
   * 枚举每个已排定任务及其抖动后的下一次触发时间。与面向模型的 CronList
   * 工具不同,此方法为轮询待办工作的宿主应用返回结构化数据。
   */
  listTaskSnapshots(): readonly CronTaskSnapshot[] {
    return this.store.list().map((task) => {
      let humanSchedule = task.cron;
      try {
        humanSchedule = cronToHuman(parseCronExpression(task.cron));
      } catch {
        // Malformed expression — keep raw cron (defends direct store injects).
      }
      return {
        id: task.id,
        cron: task.cron,
        humanSchedule,
        prompt: task.prompt,
        recurring: task.recurring !== false,
        createdAt: task.createdAt,
        lastFiredAt: task.lastFiredAt,
        nextFireAt: this.scheduler.getNextFireForTask(task.id),
      };
    });
  }

  /**
   * 宿主路径删除(PRD-0024 / ADR-0030)。不是工具——不询问权限。
   * 返回任务是否真的被移除。无效 id 按「未找到」处理(`deleted: false`),
   * 使宿主可以呈现统一的错误。
   */
  deleteCronTask(id: string): { deleted: boolean } {
    if (!/^[0-9a-f]{8}$/.test(id)) {
      return { deleted: false };
    }
    const removed = this.removeTasks([id]);
    if (removed.length === 0) {
      return { deleted: false };
    }
    this.emitDeleted(id);
    return { deleted: true };
  }

  /**
   * 过期(stale)判断。
   *
   *   - `BYF_CRON_NO_STALE=1` 直接短路为 false(bench)。
   *   - 一次性任务(`recurring === false`)永不过期——它们构造上最多触发一次;
   *     标记其过期会在每次积压唤醒时产生嘈杂的误报。
   *   - 其他情况:`wallNow() - createdAt >= 7 天`。
   *
   * `Number.isFinite` 防御墙钟损坏(例如错误设置的 bench 环境返回 `NaN`);
   * 非有限年龄按「不知道,不声称过期」处理。
   */
  isStale(task: CronTask): boolean {
    if (process.env['BYF_CRON_NO_STALE'] === '1') return false;
    if (task.recurring === false) return false;
    const age = this.clocks.wallNow() - task.createdAt;
    return Number.isFinite(age) && age >= STALE_THRESHOLD_MS;
  }

  /**
   * Translate a scheduler fire into a steer + telemetry event.
   *
   * `agent.turn.steer` returns the new turnId, or `null` when the input
   * was buffered because a turn is in flight (see turn/index.ts:84).
   * We propagate that as `buffered` on the telemetry props so dashboards
   * can distinguish "fired into a fresh turn" from "fired into a steer
   * buffer that may not run until the user's turn ends".
   *
   * Honours the documented 7-day auto-expire contract for recurring
   * tasks: a stale recurring task gets exactly one final delivery
   * (already issued above) and is then removed from the store. The
   * scheduler picks up the deletion on its next tick via `source()`
   * and stops re-firing the task. One-shots are not affected — they
   * are deleted by the scheduler immediately after delivery via the
   * `removeOneShot` callback.
   */
  private handleFire(task: CronTask, ctx: { readonly coalescedCount: number }): void {
    const stale = this.isStale(task);
    const origin: CronJobOrigin = {
      kind: 'cron_job',
      jobId: task.id,
      cron: task.cron,
      recurring: task.recurring !== false,
      coalescedCount: ctx.coalescedCount,
      stale,
    };
    const content: ContentPart[] = [
      {
        type: 'text',
        text: renderCronFireXml(origin, task.prompt),
      },
    ];
    this.agent.emitEvent({
      type: 'cron.fired',
      origin,
      prompt: task.prompt,
    });
    const turnId = this.agent.turn.steer(content, origin);
    this.agent.telemetry.track(CRON_FIRED, {
      recurring: task.recurring !== false,
      coalesced_count: ctx.coalescedCount,
      stale,
      buffered: turnId === null,
    });

    // 7-day auto-expire — the recurring branch of CronCreate's tool
    // description promises this contract to the model. Without the
    // removal a long-lived session keeps re-injecting a multi-day-old
    // cron prompt forever; with it, the task fires one last time
    // (above) and is then dropped. Emit `cron_deleted` symmetrically
    // with manual deletion so dashboards see the lifecycle close.
    if (stale && task.recurring !== false) {
      this.removeTasks([task.id]);
      this.emitDeleted(task.id);
    }
  }

  /**
   * 显式「离线期间错过了 N 次触发」横幅的保留钩子。目前调度器的
   * `coalescedCount` 语义已在 `cron_job` 信封内传达错过触发(超过 7 天的
   * 循环任务会以 `stale: true` 到达),因此 resume 路径不会从框架调用此方法。
   * 它保持暴露,因为日后增加独立的用户可见横幅——例如为触发时间全部落在
   * 长时间中断内的一次性任务——不应要求此处改 API。
   *
   * `renderMissedNotification` 回调由调用方提供(而非在此导入),
   * 使本模块不耦合 UI / 文案;同一个管理器也能服务于想注入简单渲染器的测试。
   *
   * `count: 0` 为空操作——调度器侧的错过任务检测器在调用我们之前已过滤
   * 空集,但在此防御可使契约保持简单(「任何输入都可安全调用,空时无操作」)。
   */
  handleMissed(
    tasks: readonly CronTask[],
    renderMissedNotification: (tasks: readonly CronTask[]) => readonly ContentPart[],
  ): void {
    if (tasks.length === 0) return;
    const content = renderMissedNotification(tasks);
    const origin: CronMissedOrigin = {
      kind: 'cron_missed',
      count: tasks.length,
    };
    this.agent.turn.steer(content, origin);
    this.agent.telemetry.track(CRON_MISSED, { count: tasks.length });
  }

  /**
   * 为新添加的任务发出 `cron_scheduled`。由 `CronCreate` 在成功
   * `store.add(...)` 后调用。作为显式方法保留,使工具层永远不直接触碰
   * `manager.agent.telemetry`——保持「工具只见管理器、管理器只见 agent」
   * 的分层,并与 `CronDelete` 使用的对称 `emitDeleted` 一致(P1.6)。
   */
  emitScheduled(task: CronTask): void {
    this.agent.telemetry.track(CRON_SCHEDULED, {
      recurring: task.recurring !== false,
    });
  }

  /**
   * 为已移除的任务发出 `cron_deleted`。在此接线,使 P1.6 无需再次改动本文件。
   * `task_id` 与遥测面其他位置的字段命名一致(snake_case)。
   */
  emitDeleted(taskId: string): void {
    this.agent.telemetry.track(CRON_DELETED, { task_id: taskId });
  }

  /**
   * Wire `SIGUSR1` to a manual `tick()` so bench scripts can advance the
   * scheduler with `kill -USR1 <pid>` without a custom RPC.
   *
   * Gated on `BYF_CRON_MANUAL_TICK=1` for two reasons:
   *
   *   1. SIGUSR1 only makes sense when auto-tick is off. When the 1s
   *      interval is running, it already advances the scheduler — a
   *      manual signal is redundant.
   *   2. In production a single CLI process can host one main agent plus
   *      many subagents. Each Agent unconditionally binding a SIGUSR1
   *      listener would put us over Node's 10-listener default cap and
   *      print a `MaxListenersExceededWarning`. Coupling the binding to
   *      the same env that disables auto-tick keeps the production path
   *      at zero listeners while still giving benches the affordance.
   *
   * Skipped on Windows because Node's signal layer does not deliver
   * POSIX signals there; attempting to `process.on('SIGUSR1', ...)` is a
   * silent no-op but we avoid the call entirely so the bookkeeping
   * (`sigusr1Handler !== null` means "we did bind") stays accurate.
   *
   * Idempotent — repeated calls keep the same listener registered once,
   * so `start() → start()` does not stack handlers.
   *
   * The handler swallows any throw from `tick()` because a signal-driven
   * bench tool must never crash the host process; the tick failure mode
   * is already surfaced via telemetry / logs inside the scheduler.
   * Set `BYF_CRON_DEBUG=1` to surface the swallowed error to stderr —
   * mirrors `scheduler.ts`'s debugLog pattern so bench debugging can
   * see a bad tick.
   */
  private bindSigusr1(): void {
    if (process.platform === 'win32') return;
    if (process.env['BYF_CRON_MANUAL_TICK'] !== '1') return;
    if (this.sigusr1Handler !== null) return;
    const handler: NodeJS.SignalsListener = () => {
      try {
        this.tick();
      } catch (error) {
        if (process.env['BYF_CRON_DEBUG'] === '1') {
          const msg = error instanceof Error ? error.message : String(error);
          process.stderr.write(`[cron/manager] SIGUSR1 tick threw: ${msg}\n`);
        }
      }
    };
    this.sigusr1Handler = handler;
    process.on('SIGUSR1', handler);
  }

  /**
   * Detach the SIGUSR1 listener registered by `bindSigusr1`. Safe to
   * call when nothing is bound (no-op). Pair this with `stop()` so
   * vitest files don't leak signal handlers across the shared process —
   * `process.listenerCount('SIGUSR1')` should return to its pre-`start()`
   * value once `stop()` resolves.
   */
  private unbindSigusr1(): void {
    if (this.sigusr1Handler === null) return;
    process.off('SIGUSR1', this.sigusr1Handler);
    this.sigusr1Handler = null;
  }
}
