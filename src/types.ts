/**
 * Shared types for Mirador plugins
 */

/** EIP-1193 compatible provider interface */
export interface EIP1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

/** Options for addTxHint (extends current string details) */
export interface TxHintOptions {
  /** Transaction input data / calldata */
  input?: string;
  /** Additional details string */
  details?: string;
}

/** A transaction-like object (matches ethers/viem/raw RPC response shapes) */
export interface TransactionLike {
  hash: string;
  data?: string;
  input?: string;
  chainId?: number | bigint | string;
}

/** Transaction parameters for sendTransaction (EIP-1193 style) */
export interface TransactionRequest {
  from: string;
  to?: string;
  data?: string;
  value?: string | bigint;
  gas?: string | bigint;
  gasPrice?: string | bigint;
  maxFeePerGas?: string | bigint;
  maxPriorityFeePerGas?: string | bigint;
  nonce?: number | string;
  chainId?: number | string;
}

/**
 * Logger interface for configurable SDK logging.
 */
export interface Logger {
  debug(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/**
 * Supported EVM chains, keyed by chain ID.
 */
export enum Chain {
  Ethereum = 1,
  Optimism = 10,
  BSC = 56,
  Polygon = 137,
  Base = 8453,
  Arbitrum = 42161,
  HyperEVM = 999,
}

/**
 * Chain name strings (legacy / convenience).
 */
export type ChainName =
  | 'ethereum'
  | 'optimism'
  | 'bsc'
  | 'polygon'
  | 'base'
  | 'arbitrum'
  | 'hyperevm';

/**
 * Accepted chain input — callers can pass either a Chain enum value or a chain name string.
 */
export type ChainInput = Chain | ChainName;

/**
 * EVM transaction hint for blockchain correlation. The `txHash` field carries
 * the keccak256 transaction hash.
 */
export interface EvmTxHint {
  txHash: string;
  chain: Chain;
  details?: string;
  timestamp: Date;
}

/**
 * Safe message hint for Safe multisig message tracking
 */
export interface SafeMsgHintData {
  messageHash: string;
  chain: Chain;
  details?: string;
  timestamp: Date;
}

/**
 * Safe transaction hint for Safe multisig transaction tracking
 */
export interface SafeTxHintData {
  safeTxHash: string;
  chain: Chain;
  details?: string;
  timestamp: Date;
}

/**
 * Solana transaction hint. Solana lives outside the EVM `Chain` enum (no
 * numeric chain ID), so it carries no chain field — the chain identity is
 * implicit in the hint type itself and emitted on the wire as
 * `chain_name = "solana"`. The `signature` field carries the ed25519
 * transaction signature, which is Solana's unique transaction identifier.
 */
export interface SolanaTxHint {
  /** Solana transaction signature (base58, ~88 chars). */
  signature: string;
  /** Optional free-form note attached to the hint. */
  details?: string;
  timestamp: Date;
}

/**
 * Relay (relay.link) quote hint — submitted at quote time, before the user
 * has deposited. Ties a Relay intent (by `requestId`) to the current trace.
 * The relayhint processor on the platform side resolves the full quote
 * server-side using bridge-api and Relay's status feed, then emits the
 * full lifecycle (deposit, solver-committed, fill, refund, etc.) onto the
 * trace — the SDK never needs to ship the quote payload itself.
 *
 * `requestId` is required. `message` is an optional free-form note that
 * rides on the proto `RelayHint.details` field — useful for tagging a
 * hint with extra debugging context (e.g. which call site queued it).
 */
export interface RelayQuoteHintData {
  /** Relay protocol requestId — the API correlation key. Required. */
  requestId: string;
  /** Optional free-form note attached to the hint. */
  message?: string;
  /** When the hint was recorded (defaults to the addQuoteHint call time). */
  timestamp: Date;
}

/**
 * Canton (Daml Ledger API v2) transaction hint. Like Solana, Canton lives
 * outside the EVM `Chain` enum (no numeric chain ID), so it carries no chain
 * field — the chain identity is implicit in the hint type and emitted on the
 * wire as `chain_name = "canton"`. The `updateId` is the Canton ledger update
 * id (a transaction's unique identifier).
 *
 * `partyId` is optional: include it to scope the update to a specific party,
 * or omit it when the participant only co-hosts the contract as an observer
 * (the backend can still resolve the update from the `updateId` alone).
 */
export interface CantonTxHint {
  /** Canton ledger update id (the transaction's unique identifier). Required. */
  updateId: string;
  /** Optional party id to scope the update to. Omit for observer co-hosts. */
  partyId?: string;
  /** Optional free-form note attached to the hint. */
  details?: string;
  timestamp: Date;
}

/**
 * Event severity levels.
 */
export enum Severity {
  Info = 1,
  Warn = 2,
  Error = 3,
}

/**
 * Options for adding an event
 */
export interface AddEventOptions {
  /** Capture stack trace at the point where addEvent is called */
  captureStackTrace?: boolean;
  /** Event severity (defaults to Info) */
  severity?: Severity;
  /** Timestamp for the event (defaults to current date) */
  timestamp?: Date;
}
