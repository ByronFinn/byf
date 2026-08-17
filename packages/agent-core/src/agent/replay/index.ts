import type { Agent } from '..';
import type { AgentReplayRecord } from '../..';

export class ReplayBuilder {
  protected readonly records: AgentReplayRecord[] = [];

  constructor(public readonly agent: Agent) {}

  /**
   * restore 期(冷启动磁盘重放)与 live 期(进程内实时对话)都累积:
   * live 期累积的是本次运行的实时投影,供常驻进程(web-server)内 resume 返回
   * 最新 replay —— 否则 live 会话的 buildResult 恒空,刷新页面 Chat 恢复不到
   * 内容(PRD-0035 Chat 空回归)。两个阶段互斥,不会双计数。
   */
  push(record: AgentReplayRecord): void {
    this.records.push(record);
  }

  buildResult(): readonly AgentReplayRecord[] {
    return this.records;
  }
}
