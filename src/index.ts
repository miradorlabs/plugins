/**
 * @miradorlabs/plugins
 * Shared plugin system for Mirador SDKs
 */

// Plugin system
export { Web3Plugin } from './web3-plugin';
export type { Web3PluginOptions, Web3Methods } from './web3-plugin';
export { SafePlugin } from './safe-plugin';
export type { SafeMethods } from './safe-plugin';
export type {
  MiradorPlugin,
  TraceContext,
  PluginSetupResult,
  FlushBuilder,
  MergedPluginMethods,
  PluginMethods,
} from './plugin';

// Hint types
export { HintType } from './hints';
export type { HintDataMap, HintTypeName } from './hints';

// Chain utilities
export { chainIdToName } from './chains';

// Shared types
export type {
  ChainName,
  EIP1193Provider,
  TxHintOptions,
  TransactionLike,
  TransactionRequest,
  TxHashHint,
  SafeMsgHintData,
  SafeTxHintData,
  Logger,
  AddEventOptions,
} from './types';
