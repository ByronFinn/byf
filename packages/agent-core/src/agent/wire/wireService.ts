/**
 * `wire` 域 —— `WireService`（reducer 引擎 + journal 协议的运行时拥有者）。
 *
 * 一个 Agent 的 wire 聚合（replayable model state + journal）的唯一运行时拥有者。
 * 它把 model reducer 引擎与 `wire.jsonl` journal 协议合为一个一致性边界：restore
 * 负责读、校验、迁移、重写、重放、跑 post-restore hook；live dispatch 负责应用一个
 * Op 并追加其 record。
 *
 * 与 kimi v2 的差异（PRD-0027 / ADR-0032）：
 * - **无 DI / Service / scope**：byf 不用 kimi 的 instantiation 框架；`WireService`
 *   是普通类，依赖通过构造参数注入（persistence + event sink + 错误回调）。
 * - **无 blob codec / rehydrate**：byf 的 offload 走 scratch 文件 + transient op。
 * - **无 MAX_DRAIN / CycleError / 重入队列**：grill 代码核查确认 byf 无 op→op 同步
 *   级联（toEvent 监听者保持「纯通知」），故初版不需要级联保护。dispatch 假定
 *   非重入。
 * - **静态注册表**：runtime 直接读 `OP_REGISTRY` / `MODEL_CROSS_REDUCERS`，无
 *   `WireModelContribution` fold。
 *
 * execute 引擎核心不变量（对标 kimi `wireService.ts`）：
 * - apply 拿到的 incoming state 已 freeze（测试守卫「apply 改 frozen state 抛错」）。
 * - cross-reducer 在 silent 分支之外，**总是运行** —— 让依赖其他域 op 的派生状态在
 *   restore 时也能正确重建。
 * - toEvent 拿 post-apply state，保证事件反映最新状态；restore（silent）时不派发。
 */

import {
  AGENT_WIRE_PROTOCOL_VERSION,
  isNewerWireVersion,
  migrateWireRecord,
  resolveWireMigrations,
  type WireMigration,
  type WireMigrationRecord,
} from '#/agent/records/migration';
import { WireError, WireErrorCodes } from '#/agent/wire/errors';
import type { DeepReadonly, ModelDef } from '#/agent/wire/model';
import { MODEL_CROSS_REDUCERS } from '#/agent/wire/model';
import { OP_REGISTRY } from '#/agent/wire/op';
import type { Op } from '#/agent/wire/op';
import {
  AGENT_WIRE_RECORD_KEY,
  createWireMetadataRecord,
  isWireMetadataRecord,
  isWireRecord,
  opToWireRecord,
  wireRecordToPayload,
  type WirePersistence,
  type WireRecord,
} from '#/agent/wire/record';

/** restore 完成后的一次性副作用钩子（如 normalizeAfterReplay、initializeBuiltinTools）。 */
export type RestoreHook = () => void | Promise<void>;

/**
 * 有序 hook 槽：按注册顺序运行，id 去重（后注册的同 id 覆盖先注册的）。
 * byf 的 onDidRestore hook 都是终端副作用（非中间件），无需 `next()` 链。
 */
export class OrderedHookSlot<Arg = void> {
  private readonly slots = new Map<string, (arg: Arg) => void | Promise<void>>();

  register(id: string, fn: (arg: Arg) => void | Promise<void>): void {
    this.slots.set(id, fn);
  }

  unregister(id: string): void {
    this.slots.delete(id);
  }

  async run(arg: Arg): Promise<void> {
    for (const fn of this.slots.values()) {
      await fn(arg);
    }
  }
}

type RestorePhase = 'new' | 'restoring' | 'ready' | 'failed';

interface OpGroup {
  readonly ops: readonly Op[];
  readonly silent: boolean;
}

interface ModelInstance {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: any;
}

export interface WireServiceOptions {
  /** journal 持久化（与 records 层同协议，但按宽松的 WireRecord 类型存取）。 */
  readonly persistence: WirePersistence;
  /** live dispatch 时 toEvent 派生出的事件的出站 sink（Phase 1 接 Agent.emitEvent）。 */
  readonly publishEvent?: (event: unknown) => void;
  /** restore 时遇到未知 / 损坏 record 的回调（replay tolerance，AC5）。默认无操作。 */
  readonly onSkippedRecord?: (error: WireError) => void;
  /**
   * restore 时 type 不在 OP_REGISTRY 的 record 的兜底路由（Phase 1 的 context
   * legacy adapter 走这里 → context.restoreRecord）。未提供时按 replay tolerance
   * 跳过并计数。提供时视为已处理（不报 skipped）。
   */
  readonly legacyRoute?: (record: WireRecord) => void;
  /**
   * 每条非 metadata record 重放后的回调（Phase 1：config.update 的 replayBuilder
   * config_updated 派生 —— 纯 reducer 不跑 update()，旧路径的 push 丢失）。执行于
   * restoring 相位（replayBuilder.push 依赖 restoring=true）。
   */
  readonly onReplayRecord?: (record: WireRecord) => void;
}

export class WireService {
  readonly hooks = {
    /** restore 完成后同步跑完（在 restore 返回前）。 */
    onDidRestore: new OrderedHookSlot(),
  };

  private readonly models = new Map<ModelDef<unknown>, ModelInstance>();
  private readonly persistence: WirePersistence;
  private readonly publishEvent?: (event: unknown) => void;
  private readonly onSkippedRecord?: (error: WireError) => void;
  private readonly legacyRoute?: (record: WireRecord) => void;
  private readonly onReplayRecord?: (record: WireRecord) => void;

  private restorePhase: RestorePhase = 'new';
  /** 是否已写入 / 见过 metadata 信封（复刻 records/index.ts 的 metadataInitialized）。 */
  private metadataInitialized = false;

  constructor(opts: WireServiceOptions) {
    this.persistence = opts.persistence;
    this.publishEvent = opts.publishEvent;
    this.onSkippedRecord = opts.onSkippedRecord;
    this.legacyRoute = opts.legacyRoute;
    this.onReplayRecord = opts.onReplayRecord;
  }

  /** 当前 restore 相位（供 AgentRecords.restoring 等外部读取）。 */
  get phase(): RestorePhase {
    return this.restorePhase;
  }

  /**
   * 在 `restoring` 相位下运行 `fn`（测试 harness 的单条 restore 用）。
   * 生产 restore 在 `wire.restore()` 内已有该相位（legacyRoute 在 replay 循环中执行）。
   * 相位期间 logRecord/emitEvent 被抑制、replayBuilder.push 启用——与完整 restore
   * 的 legacy 路由语义一致。
   */
  withRestoringPhase<T>(fn: () => T): T {
    const prev = this.restorePhase;
    this.restorePhase = 'restoring';
    try {
      return fn();
    } finally {
      this.restorePhase = prev;
    }
  }

  /**
   * 直接落盘一条 record（绕过 dispatch/apply，metadata 信封行为保留）。
   * Phase 1 供 context legacy 子系统在 live 路径持久化用（context 无纯 reducer，
   * 不走 dispatch 以避免 apply 双重作用）。
   */
  persistRaw(record: WireRecord): void {
    if (this.restorePhase === 'restoring') {
      throw new WireError(
        WireErrorCodes.WIRE_PHASE_VIOLATION,
        `Wire persistRaw called while restore phase is ${this.restorePhase}`,
        { phase: this.restorePhase },
      );
    }
    this.appendToJournal(record);
  }

  getModel<S>(model: ModelDef<S>): DeepReadonly<S> {
    return this.ensureModel(model).state as DeepReadonly<S>;
  }

  /**
   * 以调用方提供的初始状态挂载 model（Phase 5 context 用）：把该 model 的实例状态
   * 替换为调用方持有的 fold 视图容器，使 apply 的原地变更直接作用在调用方的嵌套
   * 结构上（单次 fold、无内存双份）。须在第一次 dispatch/getModel 语义消费前调用
   * （context 子系统在构造时挂载，早于 restore/首次 dispatch）。
   */
  mountModel<S>(model: ModelDef<S>, state: S): void {
    const inst = this.ensureModel(model);
    inst.state = state;
  }

  dispatch(...ops: Op[]): void {
    if (ops.length === 0) return;
    if (this.restorePhase === 'restoring') {
      throw new WireError(
        WireErrorCodes.WIRE_PHASE_VIOLATION,
        `Wire dispatch called while restore phase is ${this.restorePhase}`,
        { phase: this.restorePhase },
      );
    }
    this.execute({ ops, silent: false });
  }

  /** 给空 journal 写 metadata 信封；非空 no-op。幂等。 */
  async seal(): Promise<void> {
    for await (const _record of this.persistence.read()) {
      void _record;
      return;
    }
    this.appendRecord(createWireMetadataRecord());
    this.metadataInitialized = true;
  }

  /**
   * 读 journal → 迁移 → 逐条静默重放 → 跑 onDidRestore hooks。
   * silent 时无 persist、无 toEvent，但 cross-reducer 总是运行。
   *
   * 返回 `{ warning }`（journal 协议版本比当前新时的提示，复刻
   * records/index.ts:121-123 的 Agent.resume 契约）。
   */
  async restore(): Promise<{ warning?: string }> {
    if (this.restorePhase !== 'new') {
      throw new WireError(
        WireErrorCodes.WIRE_PHASE_VIOLATION,
        `Wire restore called while phase is ${this.restorePhase}`,
        { phase: this.restorePhase },
      );
    }
    this.restorePhase = 'restoring';
    let warning: string | undefined;
    try {
      let migrations: readonly WireMigration[] = [];
      let rewrittenRecords: WireRecord[] | undefined;
      let hasRecords = false;
      let newerWireVersion = false;
      let recordIndex = 0;

      for await (const candidate of this.persistence.read()) {
        if (!isWireRecord(candidate)) {
          this.reportSkippedRecord(undefined, recordIndex, true);
          recordIndex++;
          continue;
        }
        if (!hasRecords) {
          hasRecords = true;
          if (candidate.type !== 'metadata') {
            // 无 metadata 信封 —— 合成一条并按最旧版本跑迁移（kimi 式容错）。
            rewrittenRecords = [createWireMetadataRecord()];
            migrations = resolveWireMigrations('1.0');
          } else if (!isWireMetadataRecord(candidate)) {
            throw new WireError(
              WireErrorCodes.WIRE_UNKNOWN_RECORD,
              'Agent wire metadata is malformed',
              { scope: AGENT_WIRE_RECORD_KEY },
            );
          } else if (isNewerWireVersion(candidate.protocol_version)) {
            // 更新版本：原样重放，不迁移、不重写。
            newerWireVersion = true;
            warning = `Session wire protocol version ${candidate.protocol_version} is newer than the current version ${AGENT_WIRE_PROTOCOL_VERSION}. Records will be replayed without migration.`;
            migrations = [];
          } else {
            migrations = resolveWireMigrations(candidate.protocol_version);
            if (candidate.protocol_version !== AGENT_WIRE_PROTOCOL_VERSION) {
              rewrittenRecords = [];
            }
          }
        }

        const migratedRecord = migrateWireRecord(candidate as WireMigrationRecord, migrations);
        // 只在非「更新版本」时把 metadata 的 protocol_version 归一为当前版本；
        // 更新版本的 journal 原样保留（对标 kimi wireService.ts:212-215）。
        const record =
          !newerWireVersion && migratedRecord.type === 'metadata'
            ? { ...migratedRecord, protocol_version: AGENT_WIRE_PROTOCOL_VERSION }
            : migratedRecord;
        rewrittenRecords?.push(record);
        if (record.type === 'metadata') continue;

        this.replayRecord(record, recordIndex);
        recordIndex++;
      }

      if (!hasRecords) {
        // 空 journal —— 补 metadata 信封。
        rewrittenRecords = [createWireMetadataRecord()];
      }
      if (rewrittenRecords !== undefined) {
        this.persistence.rewrite(rewrittenRecords);
        await this.persistence.flush();
      }

      // restore 成功后 journal 必含 metadata 信封（已找到 / 合成 / 补写），
      // 置位以阻止后续 dispatch 再补一条（复刻 records/index.ts:119）。
      this.metadataInitialized = true;
      this.restorePhase = 'ready';
      await this.hooks.onDidRestore.run(undefined);
      return { warning };
    } catch (error) {
      this.restorePhase = 'failed';
      throw error;
    }
  }

  async flush(): Promise<void> {
    await this.persistence.flush();
  }

  private replayRecord(record: WireRecord, index: number): void {
    const descriptor = OP_REGISTRY.get(record.type);
    if (descriptor === undefined) {
      if (this.legacyRoute !== undefined) {
        // legacy adapter（Phase 1 的 context）：交由调用方路由，不报 skipped。
        this.legacyRoute(record);
      } else {
        this.reportSkippedRecord(record.type, index);
        return;
      }
    } else {
      const payload = descriptor.schema.safeParse(wireRecordToPayload(record));
      if (!payload.success) {
        this.reportSkippedRecord(record.type, index, true);
        return;
      }
      this.execute({
        ops: [{ type: record.type, payload: payload.data, descriptor }],
        silent: true,
      });
    }
    this.onReplayRecord?.(record);
  }

  private reportSkippedRecord(type: string | undefined, index: number, malformed = false): void {
    const error = new WireError(
      WireErrorCodes.WIRE_UNKNOWN_RECORD,
      type === undefined
        ? 'Malformed wire record skipped during restore'
        : malformed
          ? `Malformed wire record type '${type}' skipped during restore`
          : `Unknown wire record type '${type}' skipped during restore`,
      { type, index },
    );
    this.onSkippedRecord?.(error);
  }

  private execute(group: OpGroup): void {
    for (const op of group.ops) {
      const inst = this.ensureModel(op.descriptor.model);
      const prev = inst.state;
      inst.state = Object.freeze(op.descriptor.apply(prev, op.payload));
      if (!group.silent) {
        if (op.descriptor.persist !== false) {
          this.appendToJournal(opToWireRecord(op));
        }
        const event = op.descriptor.toEvent?.(op.payload, inst.state);
        if (event !== undefined) {
          this.publishEvent?.(event);
        }
      }
      const crossReducers = MODEL_CROSS_REDUCERS.get(op.type);
      if (crossReducers !== undefined) {
        for (const entry of crossReducers) {
          if (entry.model === op.descriptor.model) continue;
          const crossInst = this.ensureModel(entry.model);
          crossInst.state = Object.freeze(entry.reducer(crossInst.state, op.payload));
        }
      }
    }
  }

  private ensureModel<S>(def: ModelDef<S>): ModelInstance {
    let inst = this.models.get(def as ModelDef<unknown>);
    if (inst === undefined) {
      inst = { state: Object.freeze(def.initial()) };
      this.models.set(def as ModelDef<unknown>, inst);
    }
    return inst;
  }

  /**
   * 追加一条 record 到 journal，复刻 records/index.ts:39-56：
   * - time 缺失时补 `Date.now()`（:39-40，字节兼容 AC6）。
   * - 首条非 metadata record 前自动补 metadata 信封（:41-52）。
   */
  private appendToJournal(record: WireRecord): void {
    if (!this.metadataInitialized && record.type !== 'metadata') {
      this.appendRecord(createWireMetadataRecord());
      this.metadataInitialized = true;
    }
    if (record.type === 'metadata') {
      this.metadataInitialized = true;
    }
    const stamped: WireRecord =
      record.time !== undefined ? record : { ...record, time: Date.now() };
    this.appendRecord(stamped);
  }

  private appendRecord(record: WireRecord): void {
    this.persistence.append(record);
  }
}
