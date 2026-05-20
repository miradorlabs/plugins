/**
 * Hint type constants and type-safe hint data map.
 * Centralizes hint type definitions so plugins and SDKs share the same keys.
 */
import type {
  TxHashHint,
  SafeMsgHintData,
  SafeTxHintData,
  RelayQuoteHintData,
} from './types';

/** Known hint type string constants */
export const HintType = {
  TX_HASH: 'tx_hash',
  SAFE_MSG: 'safe_msg',
  SAFE_TX: 'safe_tx',
  /** Relay (relay.link) intent quote hint. Backend wires it into the
   *  `relayHints` field of `FlushTraceData.Plugin`. */
  RELAY_QUOTE: 'relay_quote',
} as const;

/** The string literal union of all known hint types */
export type HintTypeName = (typeof HintType)[keyof typeof HintType];

/**
 * Maps each hint type to its typed payload shape.
 * Plugins use this for type-safe addHint() calls.
 * SDKs use this for type-safe serializer definitions.
 */
export interface HintDataMap {
  [HintType.TX_HASH]: TxHashHint;
  [HintType.SAFE_MSG]: SafeMsgHintData;
  [HintType.SAFE_TX]: SafeTxHintData;
  [HintType.RELAY_QUOTE]: RelayQuoteHintData;
}
