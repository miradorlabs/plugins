/**
 * Hint type constants and type-safe hint data map.
 * Centralizes hint type definitions so plugins and SDKs share the same keys.
 */
import type {
  EvmTxHint,
  SafeMsgHintData,
  SafeTxHintData,
  SolanaTxHint,
  RelayQuoteHintData,
  CantonTxHint,
} from './types';

/** Known hint type string constants */
export const HintType = {
  TX_HASH: 'tx_hash',
  SAFE_MSG: 'safe_msg',
  SAFE_TX: 'safe_tx',
  /** Solana transaction hint. Emitted on the wire as a TxHashHint with
   *  `chain_name = "solana"`. */
  SOLANA_TX: 'solana_tx',
  /** Relay (relay.link) intent quote hint. Backend wires it into the
   *  `relayHints` field of `FlushTraceData.Plugin`. */
  RELAY_QUOTE: 'relay_quote',
  /** Canton (Daml Ledger API) transaction hint. Emitted on the wire as a
   *  CantonTxHint carrying the ledger update id (chain implicit, "canton"). */
  CANTON_TX: 'canton_tx',
} as const;

/** The string literal union of all known hint types */
export type HintTypeName = (typeof HintType)[keyof typeof HintType];

/**
 * Maps each hint type to its typed payload shape.
 * Plugins use this for type-safe addHint() calls.
 * SDKs use this for type-safe serializer definitions.
 */
export interface HintDataMap {
  [HintType.TX_HASH]: EvmTxHint;
  [HintType.SAFE_MSG]: SafeMsgHintData;
  [HintType.SAFE_TX]: SafeTxHintData;
  [HintType.SOLANA_TX]: SolanaTxHint;
  [HintType.RELAY_QUOTE]: RelayQuoteHintData;
  [HintType.CANTON_TX]: CantonTxHint;
}
