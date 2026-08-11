import { Agent } from '../../packages/agent-core/src/agent';
import { InMemoryAgentRecordPersistence } from '../../packages/agent-core/src/agent/records';
import { ProviderManager } from '../../packages/agent-core/src/providers/provider-manager';
import { localKaos } from '../../packages/kaos/src/index';
import { isContentPart } from '../../packages/kosong/src/index';
console.log(
  'ok',
  typeof Agent,
  typeof ProviderManager,
  typeof InMemoryAgentRecordPersistence,
  typeof localKaos,
  isContentPart,
);
