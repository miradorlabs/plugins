/**
 * @miradorlabs/plugins
 * Shared plugin system for Mirador SDKs
 */

// Plugin system
export { Web3Plugin } from './web3-plugin';
export type {
  Web3PluginOptions,
  Web3Methods,
  EvmMethods,
  SafeNamespaceMethods,
  RelayNamespaceMethods,
} from './web3-plugin';
export type {
  MiradorPlugin,
  TraceContext,
  PluginSetupResult,
  FlushBuilder,
  MergedPluginMethods,
  PluginMethods,
  DeepPartial,
} from './plugin';

// Hint types
export { HintType } from './hints';
export type { HintDataMap, HintTypeName } from './hints';

// Chain utilities
export { toChain, resolveChainInput } from './chains';

// Shared types
export {
  Chain,
  Severity,
  type ChainName,
  type ChainInput,
  type EIP1193Provider,
  type TxHintOptions,
  type TransactionLike,
  type TransactionRequest,
  type TxHashHint,
  type SafeMsgHintData,
  type SafeTxHintData,
  type RelayQuoteHintData,
  type Logger,
  type AddEventOptions,
} from './types';
